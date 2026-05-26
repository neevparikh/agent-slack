import { describe, expect, test } from "bun:test";
import {
  AGENT_SLACK_SUFFIX,
  appendSuffixToBlocks,
  appendSuffixToText,
  applyAgentSuffixToParams,
} from "../src/slack/append-agent-suffix.ts";

describe("AGENT_SLACK_SUFFIX", () => {
  test("is the hardcoded marker — there is no runtime override", () => {
    expect(AGENT_SLACK_SUFFIX).toBe("\n\n_(sent via agent-slack)_");
  });
});

describe("appendSuffixToText", () => {
  test("appends the suffix to a normal message body", () => {
    expect(appendSuffixToText("hello", AGENT_SLACK_SUFFIX)).toBe(
      "hello\n\n_(sent via agent-slack)_",
    );
  });

  test("is idempotent — does not double-append the suffix", () => {
    const once = appendSuffixToText("hello", AGENT_SLACK_SUFFIX);
    expect(appendSuffixToText(once, AGENT_SLACK_SUFFIX)).toBe(once);
  });

  test("idempotency holds even if trailing whitespace differs", () => {
    const withTrailingNewlines = "hello\n\n_(sent via agent-slack)_\n\n";
    expect(appendSuffixToText(withTrailingNewlines, AGENT_SLACK_SUFFIX)).toBe(withTrailingNewlines);
  });

  test("returns the trimmed suffix when the body is empty", () => {
    expect(appendSuffixToText("", AGENT_SLACK_SUFFIX)).toBe("_(sent via agent-slack)_");
  });

  test("returns the trimmed suffix when the body is undefined", () => {
    expect(appendSuffixToText(undefined, AGENT_SLACK_SUFFIX)).toBe("_(sent via agent-slack)_");
  });
});

describe("appendSuffixToBlocks", () => {
  test("appends a context block carrying the suffix", () => {
    const blocks = [{ type: "section", text: { type: "mrkdwn", text: "hi" } }];
    expect(appendSuffixToBlocks(blocks, AGENT_SLACK_SUFFIX)).toEqual([
      ...blocks,
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "_(sent via agent-slack)_" }],
      },
    ]);
  });

  test("is idempotent — does not append a second context block", () => {
    const blocks = [{ type: "section", text: { type: "mrkdwn", text: "hi" } }];
    const once = appendSuffixToBlocks(blocks, AGENT_SLACK_SUFFIX);
    expect(appendSuffixToBlocks(once, AGENT_SLACK_SUFFIX)).toEqual(once);
  });
});

describe("applyAgentSuffixToParams", () => {
  test("injects the suffix into chat.postMessage text", () => {
    const out = applyAgentSuffixToParams("chat.postMessage", { channel: "C1", text: "hello" });
    expect(out).toEqual({
      channel: "C1",
      text: "hello\n\n_(sent via agent-slack)_",
    });
  });

  test("injects the suffix into chat.update text", () => {
    const out = applyAgentSuffixToParams("chat.update", {
      channel: "C1",
      ts: "1.2",
      text: "edited",
    });
    expect(out.text).toBe("edited\n\n_(sent via agent-slack)_");
  });

  test("appends a context block to chat.postMessage when blocks are present", () => {
    const blocks = [{ type: "divider" }];
    const out = applyAgentSuffixToParams("chat.postMessage", {
      channel: "C1",
      text: "fallback",
      blocks,
    });
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
    const out = applyAgentSuffixToParams("files.completeUploadExternal", {
      files: [{ id: "F1", title: "x.md" }],
      channel_id: "C1",
    });
    expect(out.initial_comment).toBe("_(sent via agent-slack)_");
  });

  test("appends to existing initial_comment on files.completeUploadExternal", () => {
    const out = applyAgentSuffixToParams("files.completeUploadExternal", {
      files: [{ id: "F1" }],
      channel_id: "C1",
      initial_comment: "here's the report",
    });
    expect(out.initial_comment).toBe("here's the report\n\n_(sent via agent-slack)_");
  });

  test("passes unrelated methods through unchanged", () => {
    const params = { channel: "C1", timestamp: "1.2", name: "rocket" };
    const out = applyAgentSuffixToParams("reactions.add", params);
    expect(out).toBe(params);
  });

  test("does not mutate the input params object", () => {
    const params: Record<string, unknown> = { channel: "C1", text: "hello" };
    applyAgentSuffixToParams("chat.postMessage", params);
    expect(params).toEqual({ channel: "C1", text: "hello" });
  });
});
