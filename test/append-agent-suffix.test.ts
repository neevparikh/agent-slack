import { describe, expect, test } from "bun:test";
import {
  AGENT_SLACK_EDIT_SUFFIX,
  AGENT_SLACK_SEND_SUFFIX,
  appendSuffixToBlocks,
  appendSuffixToText,
  applyAgentSuffixToParams,
} from "../src/slack/append-agent-suffix.ts";

describe("marker constants", () => {
  test("send marker is the hardcoded 'sent via' string", () => {
    expect(AGENT_SLACK_SEND_SUFFIX).toBe("\n\n_(sent via agent-slack)_");
  });

  test("edit marker is the hardcoded 'edited by' string", () => {
    expect(AGENT_SLACK_EDIT_SUFFIX).toBe("\n\n_(edited by agent-slack)_");
  });
});

describe("appendSuffixToText", () => {
  test("appends the send marker to a normal message body", () => {
    expect(appendSuffixToText("hello", AGENT_SLACK_SEND_SUFFIX)).toBe(
      "hello\n\n_(sent via agent-slack)_",
    );
  });

  test("appends the edit marker to a normal message body", () => {
    expect(appendSuffixToText("hello", AGENT_SLACK_EDIT_SUFFIX)).toBe(
      "hello\n\n_(edited by agent-slack)_",
    );
  });

  test("idempotent: re-applying the send marker keeps a single send marker", () => {
    const once = appendSuffixToText("hello", AGENT_SLACK_SEND_SUFFIX);
    expect(appendSuffixToText(once, AGENT_SLACK_SEND_SUFFIX)).toBe(once);
  });

  test("idempotent: re-applying the edit marker keeps a single edit marker", () => {
    const once = appendSuffixToText("hello", AGENT_SLACK_EDIT_SUFFIX);
    expect(appendSuffixToText(once, AGENT_SLACK_EDIT_SUFFIX)).toBe(once);
  });

  test("swaps send marker to edit marker when re-applying the other suffix", () => {
    const sent = appendSuffixToText("hello", AGENT_SLACK_SEND_SUFFIX);
    expect(appendSuffixToText(sent, AGENT_SLACK_EDIT_SUFFIX)).toBe(
      "hello\n\n_(edited by agent-slack)_",
    );
  });

  test("swaps edit marker back to send marker if asked", () => {
    const edited = appendSuffixToText("hello", AGENT_SLACK_EDIT_SUFFIX);
    expect(appendSuffixToText(edited, AGENT_SLACK_SEND_SUFFIX)).toBe(
      "hello\n\n_(sent via agent-slack)_",
    );
  });

  test("never stacks the two markers", () => {
    const sent = appendSuffixToText("hello", AGENT_SLACK_SEND_SUFFIX);
    const edited = appendSuffixToText(sent, AGENT_SLACK_EDIT_SUFFIX);
    // Result should contain exactly one marker, not both.
    expect(edited).toBe("hello\n\n_(edited by agent-slack)_");
    expect(edited.includes("sent via")).toBe(false);
  });

  test("returns the trimmed suffix when the body is empty", () => {
    expect(appendSuffixToText("", AGENT_SLACK_SEND_SUFFIX)).toBe("_(sent via agent-slack)_");
    expect(appendSuffixToText("", AGENT_SLACK_EDIT_SUFFIX)).toBe("_(edited by agent-slack)_");
  });

  test("returns the trimmed suffix when the body is undefined", () => {
    expect(appendSuffixToText(undefined, AGENT_SLACK_SEND_SUFFIX)).toBe("_(sent via agent-slack)_");
  });
});

describe("appendSuffixToBlocks", () => {
  test("appends a context block carrying the send marker", () => {
    const blocks = [{ type: "section", text: { type: "mrkdwn", text: "hi" } }];
    expect(appendSuffixToBlocks(blocks, AGENT_SLACK_SEND_SUFFIX)).toEqual([
      ...blocks,
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "_(sent via agent-slack)_" }],
      },
    ]);
  });

  test("appends a context block carrying the edit marker", () => {
    const blocks = [{ type: "section", text: { type: "mrkdwn", text: "hi" } }];
    expect(appendSuffixToBlocks(blocks, AGENT_SLACK_EDIT_SUFFIX)).toEqual([
      ...blocks,
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "_(edited by agent-slack)_" }],
      },
    ]);
  });

  test("idempotent: re-applying the same marker does not stack context blocks", () => {
    const blocks = [{ type: "section", text: { type: "mrkdwn", text: "hi" } }];
    const once = appendSuffixToBlocks(blocks, AGENT_SLACK_SEND_SUFFIX);
    expect(appendSuffixToBlocks(once, AGENT_SLACK_SEND_SUFFIX)).toEqual(once);
  });

  test("swaps the trailing context block when the other marker is applied", () => {
    const blocks = [{ type: "section", text: { type: "mrkdwn", text: "hi" } }];
    const sent = appendSuffixToBlocks(blocks, AGENT_SLACK_SEND_SUFFIX);
    const edited = appendSuffixToBlocks(sent, AGENT_SLACK_EDIT_SUFFIX);
    expect(edited).toEqual([
      ...blocks,
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "_(edited by agent-slack)_" }],
      },
    ]);
  });
});

describe("applyAgentSuffixToParams", () => {
  test("chat.postMessage gets the SEND marker", () => {
    const out = applyAgentSuffixToParams("chat.postMessage", { channel: "C1", text: "hello" });
    expect(out).toEqual({
      channel: "C1",
      text: "hello\n\n_(sent via agent-slack)_",
    });
  });

  test("chat.update gets the EDIT marker", () => {
    const out = applyAgentSuffixToParams("chat.update", {
      channel: "C1",
      ts: "1.2",
      text: "edited",
    });
    expect(out.text).toBe("edited\n\n_(edited by agent-slack)_");
  });

  test("editing a previously sent message swaps the marker rather than stacking", () => {
    const out = applyAgentSuffixToParams("chat.update", {
      channel: "C1",
      ts: "1.2",
      text: "hello\n\n_(sent via agent-slack)_",
    });
    expect(out.text).toBe("hello\n\n_(edited by agent-slack)_");
    expect((out.text as string).includes("sent via")).toBe(false);
  });

  test("editing an already-edited message stays idempotent", () => {
    const out = applyAgentSuffixToParams("chat.update", {
      channel: "C1",
      ts: "1.2",
      text: "hello\n\n_(edited by agent-slack)_",
    });
    expect(out.text).toBe("hello\n\n_(edited by agent-slack)_");
  });

  test("chat.postMessage with blocks appends a SEND context block", () => {
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

  test("chat.update with blocks swaps a trailing SEND context block for an EDIT one", () => {
    const blocks = [
      { type: "divider" },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "_(sent via agent-slack)_" }],
      },
    ];
    const out = applyAgentSuffixToParams("chat.update", {
      channel: "C1",
      ts: "1.2",
      text: "still here",
      blocks,
    });
    expect(out.blocks).toEqual([
      { type: "divider" },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "_(edited by agent-slack)_" }],
      },
    ]);
  });

  test("files.completeUploadExternal gets the SEND marker (uploads aren't edits)", () => {
    const out = applyAgentSuffixToParams("files.completeUploadExternal", {
      files: [{ id: "F1", title: "x.md" }],
      channel_id: "C1",
    });
    expect(out.initial_comment).toBe("_(sent via agent-slack)_");
  });

  test("appends the SEND marker to existing initial_comment on files.completeUploadExternal", () => {
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
