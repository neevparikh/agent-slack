# `agent-slack` command map (reference)

Run `agent-slack --help` (or `agent-slack <command> --help`) for the full option list.

## Auth

In-policy commands:

- `agent-slack auth whoami` — show configured workspaces in `credentials.json` (secrets redacted). Does NOT reflect the active env-var token.
- `agent-slack auth test [--workspace <url-or-unique-substring>]` — verify the live token by calling Slack `auth.test`. This is the authoritative identity check.
- `agent-slack auth add --workspace-url <url> --token <xoxp-...-or-xoxb-...>` — persist a standard OAuth token. **Never pass `--xoxc`/`--xoxd`.**
- `agent-slack auth set-default <workspace-url>`
- `agent-slack auth remove <workspace-url>`

Out-of-policy in this fork (do not invoke — they extract live Slack session credentials):

- `agent-slack auth import-desktop`
- `agent-slack auth import-chrome`
- `agent-slack auth import-brave`
- `agent-slack auth import-firefox`
- `agent-slack auth parse-curl`

## Messages / threads

- `agent-slack message get <target>`
  - `<target>`: Slack message URL OR `#channel`/`channel`/channel id (`C...`) (see `targets.md`)
  - Options:
    - `--workspace <url-or-unique-substring>` (required when using a channel _name_ across multiple workspaces)
    - `--ts <seconds>.<micros>` (required when targeting a channel)
    - `--thread-ts <seconds>.<micros>` (optional hint for thread permalinks)
    - `--max-body-chars <n>` (default `8000`, `-1` unlimited)
    - `--include-reactions`
    - `--resolve-users` (attach resolved user profiles in `referenced_users`)
    - `--refresh-users` (implies `--resolve-users` and forces a cache refresh)

- `agent-slack message list <target>`
  - Lists recent channel messages (channel history), or fetches all thread replies
  - **Channel history** (default when targeting a channel without `--thread-ts`):
    - `agent-slack message list "general"` — latest 25 messages
    - `agent-slack message list "general" --limit 50` — latest 50 messages
  - **Thread mode** (when `--thread-ts` or `--ts` is provided, or target is a message URL):
    - `agent-slack message list "<url>"` — all replies in that thread
    - `agent-slack message list "general" --thread-ts "1770165109.000001"` — thread replies
  - Options:
    - `--workspace <url-or-unique-substring>` (same rules as above)
    - `--thread-ts <seconds>.<micros>` (switches to thread mode; fetches replies)
    - `--ts <seconds>.<micros>` (resolve a message to its thread)
    - `--limit <n>` (default `25`, max `200`; channel history mode only)
    - `--oldest <ts>` (only messages after this ts; channel history mode)
    - `--latest <ts>` (only messages before this ts; channel history mode)
    - `--with-reaction <emoji>` (repeatable; include only messages that have this reaction; channel history mode; requires `--oldest`)
    - `--without-reaction <emoji>` (repeatable; include only messages that do not have this reaction; channel history mode; requires `--oldest`)
    - `--max-body-chars <n>` (default `8000`, `-1` unlimited)
    - `--include-reactions`
    - `--resolve-users` (attach resolved user profiles in `referenced_users`)
    - `--refresh-users` (implies `--resolve-users` and forces a cache refresh)

- `agent-slack message draft <target> [text]` — **out-of-policy in this fork.** Spins up an unauthenticated local HTTP server on `127.0.0.1` for the editor, which is exploitable by any page the operator's browser visits during the 30-minute listen window. `CI=1` is expected to be set in this posture, which short-circuits the command. Do not invoke; use `message send` instead.

- `agent-slack message send <target> [text]`
  - If `<target>` is a Slack message URL, replies in that message’s thread.
  - Otherwise posts to the channel/DM.
  - `[text]` is optional when uploading files with `--attach`; when present, it becomes the initial comment on the first uploaded file.
  - Bullet lists (`- `, `* `, `• `, `1. `, etc.) are automatically converted to Slack’s native rich text format, so recipients see real editable bullets instead of plain-text dashes.
  - Example: `agent-slack message send "general" "Coverage report" --attach ./report.md`
  - Options:
    - `--workspace <url-or-unique-substring>` (needed for channel _names_ across multiple workspaces)
    - `--thread-ts <seconds>.<micros>` (optional, channel mode only)
    - `--attach <path>` (repeatable; upload local files as attachments)
    - `--blocks <path>` raw Block Kit blocks from a JSON file (or `-` for stdin). Bypasses markdown-to-rich-text conversion; enables header/divider/section/table blocks. Cannot be combined with `--attach`.

- `agent-slack message edit <target> <text>`
  - URL target edits that exact message.
  - Channel target requires `--ts`.
  - Options:
    - `--workspace <url-or-unique-substring>` (needed for channel _names_ across multiple workspaces)
    - `--ts <seconds>.<micros>` (required for channel targets)

- `agent-slack message delete <target>`
  - URL target deletes that exact message.
  - Channel target requires `--ts`.
  - Options:
    - `--workspace <url-or-unique-substring>` (needed for channel _names_ across multiple workspaces)
    - `--ts <seconds>.<micros>` (required for channel targets)

- `agent-slack message react add <target> <emoji>`
- `agent-slack message react remove <target> <emoji>`
  - Options (channel mode):
    - `--workspace <url-or-unique-substring>` (needed for channel _names_ across multiple workspaces)
    - `--ts <seconds>.<micros>` (required for channel targets)

## Channels

- `agent-slack channel list [--workspace <url-or-unique-substring>] [--user <U...|@handle|handle> | --all] [--limit <n>] [--cursor <cursor>]`
  - Default mode calls `users.conversations` for the current user.
  - `--user` resolves handles/ids and lists conversations for that user.
  - `--all` switches to `conversations.list` (mutually exclusive with `--user`).
  - Returns one page and optional `next_cursor`; pass `--cursor` to continue.
- `agent-slack channel new --name <name> [--private] [--workspace <url-or-unique-substring>]`
- `agent-slack channel invite --channel <id|name> --users "<U...,@handle,email,...>" [--workspace <url-or-unique-substring>]`
  - Internal invite (default): resolves users (`U...`, `@handle`, `handle`, `email`) and uses `conversations.invite`.
  - **External Slack Connect invites (`--external`, `--allow-external-user-invites`) are out-of-policy in this fork.** Surface the request to the operator instead of running it.
- `agent-slack channel mark <target> [--ts <seconds>.<micros>] [--workspace <url-or-unique-substring>]`
  - Marks a channel/DM as read up to the given message timestamp (`conversations.mark`)
  - URL target extracts channel, ts, and workspace automatically; `--ts` optionally overrides the URL timestamp; `--workspace` is rejected
  - Channel name/ID target requires `--ts`

## Later

- `agent-slack later list` â€” list saved-for-later messages (default: in-progress)
  - Options:
    - `--workspace <url-or-unique-substring>` (defaults to configured workspace)
    - `--state <state>` (filter: `in_progress` (default), `archived`, `completed`, `all`)
    - `--limit <n>` (max items, default `20`)
    - `--max-body-chars <n>` (max content chars per message, default `4000`, `-1` unlimited)
    - `--counts-only` (only show counts per state)

- `agent-slack later complete <target>` â€” mark a saved message as completed
- `agent-slack later archive <target>` â€” archive a saved message
- `agent-slack later reopen <target>` â€” move back to in-progress (from completed or archived)
- `agent-slack later save <target>` â€” save a message for later
- `agent-slack later remove <target>` â€” remove from Later entirely
  - All accept Slack message URL or channel ID with `--ts`
  - Options: `--workspace <url-or-unique-substring>`, `--ts <seconds>.<micros>`

- `agent-slack later remind <target> --in <duration>` â€” set a reminder on a saved item
  - `--in` accepts: `30m`, `1h`, `3h`, `2d`, `tomorrow`, `monday`, or a unix timestamp
  - Options: `--workspace <url-or-unique-substring>`, `--ts <seconds>.<micros>`

## Unreads

- `agent-slack unreads` — show all unread messages across channels, DMs, and threads
  - Options:
    - `--workspace <url-or-unique-substring>` (defaults to configured workspace)
    - `--counts-only` (only show unread counts, skip message content)
    - `--max-messages <n>` (max unread messages per channel, default `10`)
    - `--max-body-chars <n>` (max content chars per message, default `4000`, `-1` unlimited)
    - `--include-system` (include system messages like joins, leaves, topic changes; excluded by default)

## Search

- `agent-slack search all <query>` — messages + files (default)
- `agent-slack search messages <query>`
- `agent-slack search files <query>`

Common options:

- `--workspace <url-or-unique-substring>` (recommended when using channel names across multiple workspaces)
- `--channel <channel...>` repeatable (`#name`, `name`, or id)
- `--user <@name|name|U...>`
- `--after YYYY-MM-DD`
- `--before YYYY-MM-DD`
- `--content-type any|text|image|snippet|file`
- `--limit <n>` (default `20`)
- `--max-content-chars <n>` (default `4000`, `-1` unlimited; messages only)
- `--resolve-users` (attach resolved user profiles in `referenced_users`; applies to `search messages` / `search all`)
- `--refresh-users` (implies `--resolve-users` and forces a cache refresh)

## Canvas

- `agent-slack canvas get <canvas-url-or-id>`
  - Options:
    - `--workspace <url-or-unique-substring>` (required when passing an id and multiple workspaces)
    - `--max-chars <n>` (default `20000`, `-1` unlimited)

## Workflows

- `agent-slack workflow list <channel> [--workspace <url-or-unique-substring>]` — list workflows bookmarked or featured in a channel
- `agent-slack workflow preview <trigger-id> [--workspace <url-or-unique-substring>]` — get workflow metadata from a trigger ID (no side effects)
- `agent-slack workflow get <id> [--workspace <url-or-unique-substring>]` — get workflow definition including form fields and steps (accepts `Ft...` or `Wf...`)
- `agent-slack workflow run <trigger-id> --channel <id-or-name> [--workspace <url-or-unique-substring>]` — trip a workflow trigger

## Users

- `agent-slack user list [--workspace <url-or-unique-substring>] [--limit <n>] [--cursor <cursor>] [--include-bots]`
- `agent-slack user get <U...|@handle|handle> [--workspace <url-or-unique-substring>]`
- `agent-slack user dm-open <users...> [--workspace <url-or-unique-substring>]` — get DM or group DM channel ID for one or more users (max 8)
