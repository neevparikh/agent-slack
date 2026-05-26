/**
 * Mandatory attribution suffix appended to every outbound message body
 * (chat.postMessage / chat.update / files.completeUploadExternal).
 *
 * Why: when agent-slack is wired to a user token (xoxp or xoxc), every
 * message it sends posts as the authenticated human. Without an explicit
 * marker, recipients have no way to tell that an LLM agent — not the
 * person — wrote the text. The suffix is applied at the SlackApiClient
 * boundary so no CLI path (send / edit / draft / attach / blocks) can
 * bypass it.
 *
 * The suffix is intentionally **not** configurable at runtime: there is
 * no env var override and no per-message CLI flag. Allowing an override
 * would make the attribution skippable inside automated pipelines, which
 * defeats the purpose. Changing the marker text requires changing this
 * file (and getting a code review for the change).
 */

export const AGENT_SLACK_SUFFIX = "\n\n_(sent via agent-slack)_";

/**
 * Append the suffix to a Slack message body. Idempotent: a body that
 * already ends with the suffix (after trimming) is returned unchanged,
 * which matters for chat.update round-trips and the draft editor's
 * edit-then-resend loop.
 */
export function appendSuffixToText(text: string | undefined, suffix: string): string {
  const base = text ?? "";
  const trimmedSuffix = suffix.trim();
  if (!trimmedSuffix) {
    return base;
  }
  if (base.trimEnd().endsWith(trimmedSuffix)) {
    return base;
  }
  if (!base) {
    // Strip leading whitespace from the suffix so a standalone marker
    // doesn't render with a blank line at the top of the message.
    return suffix.replace(/^\s+/, "");
  }
  return `${base}${suffix}`;
}

type ContextBlock = {
  type: "context";
  elements: { type: "mrkdwn"; text: string }[];
};

/**
 * Append a `context` block carrying the suffix to a Block Kit blocks
 * array. Block Kit messages don't render the `text` fallback in the
 * channel, so a visible marker has to be a block. Idempotent: if the
 * trailing block is already a context block containing the suffix, the
 * array is returned unchanged.
 */
export function appendSuffixToBlocks(blocks: unknown[], suffix: string): unknown[] {
  const trimmedSuffix = suffix.trim();
  if (!trimmedSuffix) {
    return blocks;
  }
  const last = blocks.at(-1);
  if (isContextBlockWithSuffix(last, trimmedSuffix)) {
    return blocks;
  }
  const marker: ContextBlock = {
    type: "context",
    elements: [{ type: "mrkdwn", text: trimmedSuffix }],
  };
  return [...blocks, marker];
}

function isContextBlockWithSuffix(block: unknown, trimmedSuffix: string): boolean {
  if (!block || typeof block !== "object") {
    return false;
  }
  const b = block as { type?: unknown; elements?: unknown };
  if (b.type !== "context" || !Array.isArray(b.elements)) {
    return false;
  }
  return b.elements.some((el) => {
    if (!el || typeof el !== "object") {
      return false;
    }
    const e = el as { text?: unknown };
    return typeof e.text === "string" && e.text.trim() === trimmedSuffix;
  });
}

/**
 * Mutate the params of a Slack API call to inject the suffix when the
 * method is one that posts user-visible text. Returns a new object;
 * never mutates the input. Unknown methods pass through unchanged.
 */
export function applyAgentSuffixToParams(
  method: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const suffix = AGENT_SLACK_SUFFIX;
  if (method === "chat.postMessage" || method === "chat.update") {
    const out: Record<string, unknown> = { ...params };
    const hasBlocks = Array.isArray(params.blocks);
    if (typeof params.text === "string") {
      out.text = appendSuffixToText(params.text, suffix);
    } else if (params.text === undefined) {
      // No text supplied. Inject the suffix as text so the fallback
      // (push notifications, screen readers, no-block-kit clients) still
      // carries the attribution.
      out.text = appendSuffixToText("", suffix);
    }
    if (hasBlocks) {
      out.blocks = appendSuffixToBlocks(params.blocks as unknown[], suffix);
    }
    return out;
  }
  if (method === "files.completeUploadExternal") {
    const out: Record<string, unknown> = { ...params };
    if (typeof params.initial_comment === "string" && params.initial_comment.trim() !== "") {
      out.initial_comment = appendSuffixToText(params.initial_comment, suffix);
    } else {
      // Bare file uploads still post as the user; ensure attribution.
      out.initial_comment = appendSuffixToText("", suffix);
    }
    return out;
  }
  return params;
}
