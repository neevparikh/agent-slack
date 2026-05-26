import { afterEach, describe, expect, mock, test } from "bun:test";
import { SlackApiClient } from "../src/slack/client.ts";

const SEND_SUFFIX = "\n\n_(sent via agent-slack)_";
const EDIT_SUFFIX = "\n\n_(edited by agent-slack)_";

/**
 * End-to-end check that SlackApiClient.api() injects the agent-slack
 * suffix at the wire layer. We mock global fetch and inspect the body
 * that would have been sent to Slack.
 *
 * These tests use browser auth because that path serializes params into
 * a URL-encoded form we can read off the fetch call. The standard-auth
 * path goes through @slack/web-api's WebClient and would need a
 * different mock; the wrapper logic itself is shared (both paths call
 * applyAgentSuffixToParams via api()).
 */

type RecordedCall = {
  url: string;
  params: URLSearchParams;
};

function mockFetch(responseBody: Record<string, unknown> = { ok: true }) {
  const calls: RecordedCall[] = [];
  const fetchMock = mock(async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body;
    let params: URLSearchParams;
    if (body instanceof URLSearchParams) {
      params = body;
    } else if (typeof body === "string") {
      params = new URLSearchParams(body);
    } else {
      params = new URLSearchParams();
    }
    calls.push({ url: String(url), params });
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  return { fetchMock, calls };
}

describe("SlackApiClient injects agent-slack suffix at the wire layer", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("chat.postMessage text gets the suffix appended", async () => {
    const { fetchMock, calls } = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new SlackApiClient(
      { auth_type: "browser", xoxc_token: "xoxc-test", xoxd_cookie: "d" },
      { workspaceUrl: "https://workspace.slack.com" },
    );
    await client.api("chat.postMessage", { channel: "C1", text: "hello" });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.params.get("text")).toBe(`hello${SEND_SUFFIX}`);
  });

  test("chat.update text gets the EDIT marker (not the send marker)", async () => {
    const { fetchMock, calls } = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new SlackApiClient(
      { auth_type: "browser", xoxc_token: "xoxc-test", xoxd_cookie: "d" },
      { workspaceUrl: "https://workspace.slack.com" },
    );
    await client.api("chat.update", { channel: "C1", ts: "1.2", text: "edited" });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.params.get("text")).toBe(`edited${EDIT_SUFFIX}`);
  });

  test("chat.update on an agent-sent message swaps 'sent via' to 'edited by'", async () => {
    const { fetchMock, calls } = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new SlackApiClient(
      { auth_type: "browser", xoxc_token: "xoxc-test", xoxd_cookie: "d" },
      { workspaceUrl: "https://workspace.slack.com" },
    );
    await client.api("chat.update", {
      channel: "C1",
      ts: "1.2",
      text: `hello${SEND_SUFFIX}`,
    });

    const text = calls[0]?.params.get("text");
    expect(text).toBe(`hello${EDIT_SUFFIX}`);
    expect(text?.includes("sent via")).toBe(false);
  });

  test("files.completeUploadExternal gets initial_comment injected even when none was provided", async () => {
    const { fetchMock, calls } = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new SlackApiClient(
      { auth_type: "browser", xoxc_token: "xoxc-test", xoxd_cookie: "d" },
      { workspaceUrl: "https://workspace.slack.com" },
    );
    await client.api("files.completeUploadExternal", {
      files: [{ id: "F1", title: "x.md" }],
      channel_id: "C1",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.params.get("initial_comment")).toBe(SEND_SUFFIX.trim());
  });

  test("--blocks payload gets a context block appended", async () => {
    const { fetchMock, calls } = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new SlackApiClient(
      { auth_type: "browser", xoxc_token: "xoxc-test", xoxd_cookie: "d" },
      { workspaceUrl: "https://workspace.slack.com" },
    );
    await client.api("chat.postMessage", {
      channel: "C1",
      text: "fallback",
      blocks: [{ type: "divider" }],
    });

    expect(calls).toHaveLength(1);
    const blocksJson = calls[0]?.params.get("blocks");
    expect(blocksJson).toBeDefined();
    type BlockKitBlock = {
      type: string;
      elements?: { type: string; text: string }[];
    };
    const blocks = JSON.parse(blocksJson!) as BlockKitBlock[];
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ type: "divider" });
    expect(blocks[1]).toEqual({
      type: "context",
      elements: [{ type: "mrkdwn", text: SEND_SUFFIX.trim() }],
    });
  });

  test("reactions.add (a non-write method) is not touched", async () => {
    const { fetchMock, calls } = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new SlackApiClient(
      { auth_type: "browser", xoxc_token: "xoxc-test", xoxd_cookie: "d" },
      { workspaceUrl: "https://workspace.slack.com" },
    );
    await client.api("reactions.add", { channel: "C1", timestamp: "1.2", name: "rocket" });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.params.get("text")).toBeNull();
    expect(calls[0]?.params.get("initial_comment")).toBeNull();
  });

  test("AGENT_SLACK_MESSAGE_SUFFIX env var is intentionally ignored", async () => {
    const original = process.env.AGENT_SLACK_MESSAGE_SUFFIX;
    process.env.AGENT_SLACK_MESSAGE_SUFFIX = "";
    try {
      const { fetchMock, calls } = mockFetch();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const client = new SlackApiClient(
        { auth_type: "browser", xoxc_token: "xoxc-test", xoxd_cookie: "d" },
        { workspaceUrl: "https://workspace.slack.com" },
      );
      await client.api("chat.postMessage", { channel: "C1", text: "hello" });

      // Setting the env var to "" must NOT disable the suffix — the
      // hardcoded marker still lands on the wire.
      expect(calls[0]?.params.get("text")).toBe(`hello${SEND_SUFFIX}`);
    } finally {
      if (original === undefined) {
        delete process.env.AGENT_SLACK_MESSAGE_SUFFIX;
      } else {
        process.env.AGENT_SLACK_MESSAGE_SUFFIX = original;
      }
    }
  });

  test("idempotency: re-editing an already-edited message keeps a single EDIT marker", async () => {
    const { fetchMock, calls } = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new SlackApiClient(
      { auth_type: "browser", xoxc_token: "xoxc-test", xoxd_cookie: "d" },
      { workspaceUrl: "https://workspace.slack.com" },
    );
    await client.api("chat.update", {
      channel: "C1",
      ts: "1.2",
      text: `already edited${EDIT_SUFFIX}`,
    });

    expect(calls[0]?.params.get("text")).toBe(`already edited${EDIT_SUFFIX}`);
  });
});
