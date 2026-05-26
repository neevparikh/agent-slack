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
 * Two markers exist so the attribution is accurate to what actually
 * happened:
 *   - "sent via agent-slack"   — chat.postMessage, files.completeUploadExternal
 *   - "edited by agent-slack"  — chat.update
 *
 * When editing a message the agent (or a previous agent) originally
 * sent, the existing "sent via" marker is stripped and replaced with
 * "edited by" — we don't stack both, because the message ceases to be
 * something agent-slack *sent* once it's been modified.
 *
 * The suffix is intentionally **not** configurable at runtime: there is
 * no env var override and no per-message CLI flag. Allowing an override
 * would make the attribution skippable inside automated pipelines, which
 * defeats the purpose. Changing the marker text requires changing this
 * file (and getting a code review for the change).
 */

export const AGENT_SLACK_SEND_SUFFIX = "\n\n_(sent via agent-slack)_";
export const AGENT_SLACK_EDIT_SUFFIX = "\n\n_(edited by agent-slack)_";

/**
 * Trimmed forms of every marker the wire layer might find at the tail
 * of a previous send/edit. Used by `stripKnownMarker` so that
 * re-applying a suffix replaces rather than stacks.
 */
const KNOWN_MARKERS_TRIMMED = [AGENT_SLACK_SEND_SUFFIX.trim(), AGENT_SLACK_EDIT_SUFFIX.trim()];

function stripKnownMarker(text: string): string {
  const trimmed = text.trimEnd();
  for (const marker of KNOWN_MARKERS_TRIMMED) {
    if (trimmed.endsWith(marker)) {
      return trimmed.slice(0, -marker.length).trimEnd();
    }
  }
  return text;
}

/**
 * Append the suffix to a Slack message body. If the body already ends
 * with any known agent-slack marker (sent or edited), that marker is
 * stripped first and replaced with the new suffix. This makes the
 * function safe for round-trips (chat.update re-fetches, draft editor
 * edit-then-resend) AND correct when the marker should change because
 * the operation changed (send → edit).
 */
export function appendSuffixToText(text: string | undefined, suffix: string): string {
  const trimmedSuffix = suffix.trim();
  if (!trimmedSuffix) {
    return text ?? "";
  }
  const base = stripKnownMarker(text ?? "");
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
 * array. If the trailing block is already a context block containing
 * any known agent-slack marker (sent or edited), it is stripped first
 * and replaced — same replace-not-stack policy as `appendSuffixToText`.
 */
export function appendSuffixToBlocks(blocks: unknown[], suffix: string): unknown[] {
  const trimmedSuffix = suffix.trim();
  if (!trimmedSuffix) {
    return blocks;
  }
  const stripped = isContextBlockWithKnownMarker(blocks.at(-1)) ? blocks.slice(0, -1) : blocks;
  const marker: ContextBlock = {
    type: "context",
    elements: [{ type: "mrkdwn", text: trimmedSuffix }],
  };
  return [...stripped, marker];
}

function isContextBlockWithKnownMarker(block: unknown): boolean {
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
    return typeof e.text === "string" && KNOWN_MARKERS_TRIMMED.includes(e.text.trim());
  });
}

/**
 * Pick the right suffix for a Slack API method.
 *  - chat.update                      → "edited by agent-slack"
 *  - chat.postMessage                 → "sent via agent-slack"
 *  - files.completeUploadExternal     → "sent via agent-slack"
 */
function suffixForMethod(method: string): string {
  if (method === "chat.update") {
    return AGENT_SLACK_EDIT_SUFFIX;
  }
  return AGENT_SLACK_SEND_SUFFIX;
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
  const suffix = suffixForMethod(method);
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
