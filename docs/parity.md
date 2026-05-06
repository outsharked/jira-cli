# Feature parity tracker

Reference: [ankitpokhrel/jira-cli](https://github.com/ankitpokhrel/jira-cli) — Jira Cloud only.

Legend: ✅ done · 🚧 partial · ⬜ not started

---

## Setup

| Command | Status | Notes |
|---------|--------|-------|
| `jira init` | ✅ | |
| `jira me` | ✅ | |
| `--config/-c` flag (per-project config file) | ⬜ | |
| `jira completion` (shell completion) | ⬜ | |
| `jira open` (open project in browser) | ⬜ | |
| `jira open KEY-1` (open issue in browser) | ⬜ | |

---

## `jira issue`

### `issue list` flags

| Flag | Status | Notes |
|------|--------|-------|
| `-a` assignee / `me` / `-ax` unassigned | 🚧 | `me` and named assignee done; `-ax` unassigned not done |
| `-s` status (with shorthand mapping) | ✅ | |
| `-y` priority | ⬜ | |
| `-t` type | ✅ | |
| `-l` label (multi) | 🚧 | single label only |
| `-r` reporter | ⬜ | |
| `-R` resolution | 🚧 | `--resolved`/`--unresolved` done; named resolution not done |
| `--sprint` / active | ✅ | |
| `--epic` parent epic | ✅ | |
| `--created` / `--created-before` | 🚧 | `--created-after` done; `--created-before` not done |
| `--updated` / `--updated-before` | 🚧 | `--updated-after` done; `--updated-before` not done |
| `-w` watching | ⬜ | |
| `--order-by` / `--reverse` | ⬜ | hardcoded `ORDER BY updated DESC` |
| `--history` | ⬜ | requires local history store |
| `--custom` field filter | ✅ | via field registry; `jira fields sync` required |
| `-q`/`--jql` raw JQL passthrough | ✅ | overrides all filter flags |
| `--limit` | ✅ | |
| `--plain` / `--raw` / `--csv` / `--no-headers` | ✅ | |
| Interactive TUI | ⬜ | |

### Other `issue` subcommands

| Command | Status |
|---------|--------|
| `issue view KEY` | ✅ |
| `issue create` | ✅ |
| `issue edit KEY` | ⬜ |
| `issue assign KEY` | ✅ |
| `issue move KEY` (transition) | ✅ |
| `issue clone KEY` | ⬜ |
| `issue delete KEY` | ⬜ |
| `issue link KEY` | ⬜ |
| `issue link remote KEY` | ⬜ |
| `issue unlink KEY` | ⬜ |
| `issue comment add KEY` | ✅ |
| `issue worklog add KEY` | ⬜ |

---

## `jira epic`

| Command | Status |
|---------|--------|
| `epic list` | ⬜ |
| `epic create` | ⬜ |
| `epic add KEY` (add issues to epic) | ⬜ |
| `epic remove KEY` (remove issues from epic) | ⬜ |

---

## `jira sprint`

| Command | Status |
|---------|--------|
| `sprint list` | ⬜ |
| `sprint add KEY` (add issues to sprint) | ⬜ |

---

## `jira release`

| Command | Status |
|---------|--------|
| `release list` | ⬜ |

---

## `jira project` / `jira board`

| Command | Status |
|---------|--------|
| `project list` | ⬜ |
| `board list` | ⬜ |
