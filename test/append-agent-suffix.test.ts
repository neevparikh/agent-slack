import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  appendSuffixToBlocks,
  appendSuffixToText,
  applyAgentSuffixToParams,
  resolveAgentSuffix,
} from "../src/slack/append-agent-suffix.ts";

const DEFAULT_SUFFIX = "\n\n_(sent via agent-slack)_";

describe("resolveAgentSuffix", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.AGENT_SLACK_MESSAGE_SUFFIX;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AGENT_SLACK_MESSAGE_SUFFIX;
    } else {
      process.env.AGENT_SLACK_MESSAGE_SUFFIX = originalEnv;
    }
  });

  test("returns the default suffix when the env var is unset", () => {
    delete process.env.AGENT_SLACK_MESSAGE_SUFFIX;
    expect(resolveAgentSuffix()).toBe(DEFAULT_SUFFIX);
  });

  test("respects an env override", () => {
    process.env.AGENT_SLACK_MESSAGE_SUFFIX = "\n— via my-agent";
    expect(resolveAgentSuffix()).toBe("\n— via my-agent");
  });

  test("treats an explicitly empty env var as 'no suffix'", () => {
    process.env.AGENT_SLACK_MESSAGE_SUFFIX = "";
    expect(resolveAgentSuffix()).toBe("");
  });
});

describe("appendSuffixToText", () => {
  test("appends the suffix to a normal message body", () => {
    expect(appendSuffixToText("hello", DEFAULT_SUFFIX)).toBe("hello\n\n_(sent via agent-slack)_");
  });

  test("is idempotent — does not double-append the suffix", () => {
    const once = appendSuffixToText("hello", DEFAULT_SUFFIX);
    expect(appendSuffixToText(once, DEFAULT_SUFFIX)).toBe(once);
  });

  test("idempotency holds even if trailing whitespace differs", () => {
    const withTrailingNewlines = "hello\n\n_(sent via agent-slack)_\n\n";
    expect(appendSuffixToText(withTrailingNewlines, DEFAULT_SUFFIX)).toBe(withTrailingNewlines);
  });

  test("returns the trimmed suffix when the body is empty", () => {
    expect(appendSuffixToText("", DEFAULT_SUFFIX)).toBe("_(sent via agent-slack)_");
  });

  test("returns the trimmed suffix when the body is undefined", () => {
    expect(appendSuffixToText(undefined, DEFAULT_SUFFIX)).toBe("_(sent via agent-slack)_");
  });

  test("returns the body unchanged when the suffix is empty", () => {
    expect(appendSuffixToText("hello", "")).toBe("hello");
  });

  test("returns the body unchanged when the suffix is only whitespace", () => {
    expect(appendSuffixToText("hello", "   \n\n  ")).toBe("hello");
  });
});

describe("appendSuffixToBlocks", () => {
  test("appends a context block carrying the suffix", () => {
    const blocks = [{ type: "section", text: { type: "mrkdwn", text: "hi" } }];
    expect(appendSuffixToBlocks(blocks, DEFAULT_SUFFIX)).toEqual([
      ...blocks,
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "_(sent via agent-slack)_" }],
      },
    ]);
  });

  test("is idempotent — does not append a second context block", () => {
    const blocks = [{ type: "section", text: { type: "mrkdwn", text: "hi" } }];
    const once = appendSuffixToBlocks(blocks, DEFAULT_SUFFIX);
    expect(appendSuffixToBlocks(once, DEFAULT_SUFFIX)).toEqual(once);
  });

  test("returns the array unchanged when the suffix is empty", () => {
    const blocks = [{ type: "divider" }];
    expect(appendSuffixToBlocks(blocks, "")).toEqual(blocks);
  });
});

describe("applyAgentSuffixToParams", () => {
  test("injects the suffix into chat.postMessage text", () => {
    const out = applyAgentSuffixToParams(
      "chat.postMessage",
      { channel: "C1", text: "hello" },
      DEFAULT_SUFFIX,
    );
    expect(out).toEqual({
      channel: "C1",
      text: "hello\n\n_(sent via agent-slack)_",
    });
  });

  test("injects the suffix into chat.update text", () => {
    const out = applyAgentSuffixToParams(
      "chat.update",
      { channel: "C1", ts: "1.2", text: "edited" },
      DEFAULT_SUFFIX,
    );
    expect(out.text).toBe("edited\n\n_(sent via agent-slack)_");
  });

  test("appends a context block to chat.postMessage when blocks are present", () => {
    const blocks = [{ type: "divider" }];
    const out = applyAgentSuffixToParams(
      "chat.postMessage",
      { channel: "C1", text: "fallback", blocks },
      DEFAULT_SUFFIX,
    );
    expect(out.text).toBe("fallback\n\n_(sent via agent-slack)_");
    expect(out.blocks).toEqual([
      { type: "divider" },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "_(sent via agent-slack)_" }],
      },
    ]);
  });

  test("injects an initial_comment when files.completeUploadExternal has none", () => {
    const out = applyAgentSuffixToParams(
      "files.completeUploadExternal",
      { files: [{ id: "F1", title: "x.md" }], channel_id: "C1" },
      DEFAULT_SUFFIX,
    );
    expect(out.initial_comment).toBe("_(sent via agent-slack)_");
  });

  test("appends to existing initial_comment on files.completeUploadExternal", () => {
    const out = applyAgentSuffixToParams(
      "files.completeUploadExternal",
      { files: [{ id: "F1" }], channel_id: "C1", initial_comment: "here's the report" },
      DEFAULT_SUFFIX,
    );
    expect(out.initial_comment).toBe("here's the report\n\n_(sent via agent-slack)_");
  });

  test("passes unrelated methods through unchanged", () => {
    const params = { channel: "C1", timestamp: "1.2", name: "rocket" };
    const out = applyAgentSuffixToParams("reactions.add", params, DEFAULT_SUFFIX);
    expect(out).toBe(params);
  });

  test("is a no-op when the suffix is empty", () => {
    const params = { channel: "C1", text: "hello" };
    const out = applyAgentSuffixToParams("chat.postMessage", params, "");
    expect(out).toBe(params);
  });

  test("does not mutate the input params object", () => {
    const params: Record<string, unknown> = { channel: "C1", text: "hello" };
    applyAgentSuffixToParams("chat.postMessage", params, DEFAULT_SUFFIX);
    expect(params).toEqual({ channel: "C1", text: "hello" });
  });
});
