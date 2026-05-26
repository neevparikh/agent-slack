---
name: agent-slack
description: |
  Slack automation CLI for AI agents. Use when:
  - Reading a Slack message or thread (given a URL or channel+ts)
  - Browsing recent channel messages / channel history
  - Downloading Slack attachments (snippets, images, files) to local paths
  - Searching Slack messages or files
  - Sending messages, including local file uploads via `message send --attach`
  - Editing or deleting a message; adding/removing reactions
  - Listing channels/conversations; creating channels and inviting users
  - Fetching a Slack canvas as markdown
  - Looking up Slack users
  - Marking channels/DMs as read
  - Opening DM or group DM channels
  - Discovering and running Slack workflows
  - Managing saved-for-later messages (Later tab)
  - Viewing all unread messages (inbox/unreads view)
  Triggers: "slack message", "slack thread", "slack URL", "slack link", "read slack", "reply on slack", "search slack", "channel history", "recent messages", "channel messages", "latest messages", "mark as read", "mark read", "slack later", "saved for later", "save for later", "slack unreads", "slack inbox", "unread slack", "upload file", "slack file upload", "send file slack"
---

# Slack automation with `agent-slack`

`agent-slack` is a CLI binary on `$PATH`. Invoke directly (e.g. `agent-slack user list`).

## Installation

If `agent-slack` is not found on `$PATH`, install it (pin a reviewed version; do not auto-update):

- `npm i -g agent-slack@<pinned-version>` (requires Node >= 22.5) — recommended
- `nix run github:stablyai/agent-slack/<pinned-rev> -- <args>` (no install needed, prefix all commands)

Do **not** use the `curl | sh` installer or `agent-slack update` in this posture; the auto-update path's trust root is the upstream GitHub Releases page, which is out-of-scope for this hardened deployment.

## Hardened posture (read this first)

This fork is configured for the **minimum-blast-radius** auth model. Do not deviate from these constraints unless the operator explicitly relaxes them:

- **No Slack session-token extraction.** The `auth import-desktop`, `auth import-chrome`, `auth import-brave`, `auth import-firefox`, and `auth parse-curl` commands are out-of-policy. Do not invoke them, even if the README suggests them.
- **No browser tokens.** `SLACK_TOKEN=xoxc-...` paired with `SLACK_COOKIE_D=xoxd-...` is out-of-policy. Only `xoxp-` (user) or `xoxb-` (bot) OAuth tokens are accepted.
- **`CI=1` is expected to be set.** This disables the unauthenticated local HTTP draft listener. Therefore, `message draft` will fail and must not be used (see the "Drafting" section below).
- **Tokens come from the macOS Keychain**, surfaced into `SLACK_TOKEN` at command time. Never paste a token into a message, log, file, or shell history.
- **Attribution suffix is mandatory and not configurable.** Every message agent-slack sends is suffixed with `_(sent via agent-slack)_`; there is no env var or CLI flag to disable or change it.

## CRITICAL: Bash command formatting rules

Claude Code's permission checker has security heuristics that force manual approval prompts. Avoid these patterns to keep commands auto-allowed. See: <https://github.com/anthropics/claude-code/issues/34379>

1. **No `#` anywhere in the command string.** Treated as a comment delimiter even inside quotes. Use bare channel names (`general` not `#general`). No `#` comments in inline scripts — use the Bash tool's `description` parameter instead.
2. **No `''` (consecutive single quotes) or `""` (consecutive double quotes).** Triggers "potential obfuscation" check. Avoid Python empty string literals like `d.get('key', '')` — use `d.get('key')` instead.
3. **Only `| jq` for filtering — no python3, no other commands.** `python3 -c` is not in the allow list and triggers prompts. `jq` with single-quote-only expressions (no `"` inside) is safe:
   - WRONG: `agent-slack search ... | python3 -c "..."` (not allowed)
   - WRONG: `agent-slack search ... | jq '.a + "x"'` (mixed quotes)
   - RIGHT: `agent-slack search ... | jq '.a'`
   - RIGHT: `agent-slack search ... | jq '.messages[] | .ts'`
4. **No `||` or `&&` chains.** Run multiple agent-slack commands as separate Bash tool calls.
5. **No file redirects (`>`, `>>`).** Process JSON output directly, don't write to files.

## Quick start (auth)

Token preference, in order:

1. **`xoxp-` user token (preferred default).** A scoped, revocable OAuth grant in the user's identity. Covers the full feature surface — including `search.*`, `unreads`, `later`, `canvas`, and the workflow endpoints, which Slack restricts to user tokens. Scope minimally; actions appear in audit logs as the granting user.
2. **`xoxb-` bot token.** Use only when the workflow is safe to run as a separate bot identity AND the operations needed are bot-callable (excludes `search.*`, `unreads`, `later`, `canvas`, `workflow run` against most triggers, and the draft editor). Bots can only see channels they are explicitly invited to.

Both come from a real Slack-app OAuth install — never from session extraction.

### Loading a token from Keychain

```bash
agent-slack auth test
```

The operator's shell is expected to export `SLACK_TOKEN` from the macOS Keychain, e.g.:

```bash
export SLACK_TOKEN="$(security find-generic-password -a "$USER" -s agent-slack-user-token -w)"
unset SLACK_COOKIE_D
export CI=1
export AGENT_SLACK_NO_UPDATE_CHECK=1
```

If `auth test` fails with a missing/invalid token, tell the operator. Do **not** attempt to recover by running `auth import-desktop` or any other extraction command.

### Multi-workspace (optional)

To operate across multiple workspaces, persist tokens to the credentials store (mode `0600`) instead of switching env vars:

```bash
agent-slack auth add --workspace-url "https://myteam.slack.com" --token "xoxp-..."
agent-slack auth set-default "https://myteam.slack.com"
```

Then select per command with `--workspace` or `SLACK_WORKSPACE_URL`. Never call `auth add` with `--xoxc`/`--xoxd`.

### Checking identity

```bash
agent-slack auth whoami    # reflects ~/.config/agent-slack/credentials.json only (not the env var)
agent-slack auth test      # calls Slack auth.test; this is the real "who am I right now"
```

## Canonical workflow (given a Slack message URL)

1. Fetch a single message (plus thread summary, if any):

```bash
agent-slack message get "https://workspace.slack.com/archives/C123/p1700000000000000"
```

1. If you need the full thread:

```bash
agent-slack message list "https://workspace.slack.com/archives/C123/p1700000000000000"
```

## Browse recent channel messages

To see what's been posted recently in a channel (channel history):

```bash
agent-slack message list "general" --limit 20
agent-slack message list "C0123ABC" --limit 10
agent-slack message list "general" --with-reaction eyes --oldest "1770165109.000000" --limit 20
agent-slack message list "general" --without-reaction dart --oldest "1770165109.000000" --limit 20
agent-slack message list "general" --resolve-users
```

This returns the most recent messages in chronological order. Use `--limit` to control how many (default 25).
When using `--with-reaction` or `--without-reaction`, you must also pass `--oldest` to bound scanning.

## Attachments (snippets/images/files)

`message get/list` and `search` auto-download attachments and include file metadata in JSON output (typically under `message.files[]` / `files[]`), including `name` when available and `path` for the local download. Failed message attachment downloads keep the attachment entry, preserve a local `.download-error.txt` path, and include `message.files[].error` for `message get/list` or `messages[].files[].error` for `search messages|all`; `search files` skips files whose download fails.

## Draft a message (DISABLED in this posture)

The `agent-slack message draft` command spins up a local unauthenticated HTTP listener on `127.0.0.1` for up to 30 minutes; any page the operator's browser visits during that window can post Slack messages as them (no CSRF protection). Because `CI=1` is set in this posture, the command will short-circuit and refuse to start the listener.

If the operator asks for a draft-then-send workflow, send the message directly via `message send` after showing them the text for confirmation in chat — do not try to launch the draft editor.

## Send, edit, delete, or react

```bash
agent-slack message send "https://workspace.slack.com/archives/C123/p1700000000000000" "I can take this."
agent-slack message send "alerts-staging" "here's the report" --attach ./report.md
agent-slack message edit "https://workspace.slack.com/archives/C123/p1700000000000000" "I can take this today."
agent-slack message delete "https://workspace.slack.com/archives/C123/p1700000000000000"

agent-slack message send "general" "Here's the plan:
- Step 1: do the thing
- Step 2: verify it worked
  - Sub-step: check logs"
agent-slack message react add "https://workspace.slack.com/archives/C123/p1700000000000000" "eyes"
agent-slack message react remove "https://workspace.slack.com/archives/C123/p1700000000000000" "eyes"
```

Channel mode for edit/delete requires `--ts`:

```bash
agent-slack message edit "general" "Updated text" --workspace "myteam" --ts "1770165109.628379"
agent-slack message delete "general" --workspace "myteam" --ts "1770165109.628379"
```

Attach options for `message send`:

- `--attach <path>` upload a local file (repeatable; message text is optional when attaching files)
- `--blocks <path>` send raw [Block Kit](https://docs.slack.dev/block-kit/) blocks from a JSON file (or `-` for stdin). Enables headers, dividers, table blocks, and other structured layouts. Incompatible with `--attach`.

File upload example:

```bash
agent-slack message send "general" "Coverage report" --attach ./report.md
```

`message send` returns `channel_id` plus the posted `ts` and a `permalink` (for non-attachment sends). `thread_ts` appears only when replying in a thread.

Mentions: just write `@U05BRPTKL6A`, `@here`, `@channel`, or `@everyone` — the CLI converts them to real Slack mention tokens and escapes literal `&`/`<`/`>` in your text. You don't need to wrap IDs yourself.

## Mandatory agent attribution

Every message you send through `agent-slack` is automatically suffixed with `_(sent via agent-slack)_` (Slack mrkdwn italics on a new line) so recipients can tell an LLM agent wrote the text rather than the human whose token signed the request. The marker is applied at the API boundary, so it covers `message send`, `message edit`, file uploads via `--attach` (injected into `initial_comment`), and `--blocks` payloads (appended as a trailing `context` block). The marker is idempotent — editing an already-suffixed message does not double-append.

The suffix is **not configurable at runtime**: there is no env var override (`AGENT_SLACK_MESSAGE_SUFFIX` has no effect — it was removed) and no per-message CLI flag. This is deliberate so attribution cannot be silently bypassed inside an automated pipeline. Do not attempt to disable or alter the suffix; if a workflow truly needs different text, that requires a code change to `src/slack/append-agent-suffix.ts` and a code review.

## List channels + create/invite users

```bash
agent-slack channel list
agent-slack channel list --user "@alice" --limit 50
agent-slack channel list --all --limit 100
agent-slack channel new --name "incident-war-room"
agent-slack channel new --name "incident-leads" --private
agent-slack channel invite --channel "incident-war-room" --users "U01AAAA,@alice,bob@example.com"
```

**External Slack Connect invites (`--external` / `--allow-external-user-invites`) are out-of-policy in this posture** — they expand identity to people outside the workspace under the operator's name. If an external invite is genuinely required, surface the request to the operator in chat and let them run it manually.

## Search (messages + files)

Prefer channel-scoped search for reliability:

```bash
agent-slack search all "smoke tests failed" --channel "alerts" --after 2026-01-01 --before 2026-02-01
agent-slack search messages "stably test" --user "@alice" --channel general
agent-slack search messages "stably test" --resolve-users
agent-slack search files "testing" --content-type snippet --limit 10
```

`search.*` requires a `xoxp-` user token with the `search:read` scope. With a `xoxb-` bot token Slack returns `not_allowed_token_type` and search will not work. If the operator is on a bot token and asks for a search, fall back to `agent-slack message list <channel> --limit N` and filter the JSON locally with `jq` (per the Bash formatting rules above).

## Multi-workspace guardrail (important)

If you have multiple workspaces configured and you use a channel **name** (e.g. `general`), pass `--workspace` (or set `SLACK_WORKSPACE_URL`) to avoid ambiguity:

```bash
agent-slack message get "general" --workspace "https://myteam.slack.com" --ts "1770165109.628379"
agent-slack message get "general" --workspace "myteam" --ts "1770165109.628379"
```

## DM / group DM channels

Get the channel ID for a DM or group DM, useful for sending messages to a group of users:

```bash
agent-slack user dm-open @alice @bob
agent-slack user dm-open U01AAAA U02BBBB U03CCCC
```

## Mark as read

Mark a channel, DM, or group DM as read up to a given message:

```bash
agent-slack channel mark "https://workspace.slack.com/archives/C123/p1700000000000000"
agent-slack channel mark "general" --workspace "myteam" --ts "1770165109.628379"
agent-slack channel mark "D0A04PB2QBW" --workspace "myteam" --ts "1770165109.628379"
```

To make a specific message appear unread, set `--ts` to just before it (subtract `0.000001`). This moves the read cursor so that message and everything after it appear as new:

```bash
agent-slack channel mark "general" --workspace "myteam" --ts "1770165109.628378"
```

## Workflows

Discover and run Slack workflows bookmarked in channels:

```bash
# List workflows in a channel
agent-slack workflow list "#ops"

# Preview trigger metadata (no side effects)
agent-slack workflow preview "Ft123ABC"

# Get workflow definition including form fields and steps
agent-slack workflow get "Ft123ABC"
agent-slack workflow get "Wf456DEF"

# Trip a workflow trigger
agent-slack workflow run "Ft123ABC" --channel "#ops"
```

## Later (saved messages)

Manage your saved-for-later messages:

```bash
agent-slack later list
agent-slack later list --counts-only
agent-slack later list --state completed
agent-slack later complete "<message-url>"
agent-slack later archive "<message-url>"
agent-slack later reopen "<message-url>"
agent-slack later save "<message-url>"
agent-slack later remove "<message-url>"
agent-slack later remind "<message-url>" --in 1h
agent-slack later remind "<message-url>" --in tomorrow
```

## Unreads (inbox view)

See all unread messages across channels, DMs, and threads:

```bash
agent-slack unreads
agent-slack unreads --counts-only
agent-slack unreads --max-messages 5
agent-slack unreads --include-system
```

## Canvas + Users

```bash
agent-slack canvas get "https://workspace.slack.com/docs/T123/F456"
agent-slack user list --workspace "https://workspace.slack.com" --limit 100
agent-slack user get "@alice" --workspace "https://workspace.slack.com"
```

## References

- [references/commands.md](references/commands.md): full command map + all flags
- [references/targets.md](references/targets.md): URL vs `#channel` targeting rules
- [references/output.md](references/output.md): JSON output shapes + download paths
