# jira-ts-cli

Node.js port of [ankitpokhrel/jira-cli](https://github.com/ankitpokhrel/jira-cli) for Jira Cloud.

Built on [oclif](https://oclif.io) + [jira.js](https://github.com/MrRefactoring/jira.js).

## Status

Walking skeleton — Tier 1 MVP in progress.

The JQL builder is a port of `internal/jql/builder.go` from the internal Go
reference implementation at
`bitbucket.build.dkinternal.com/projects/CLI/repos/jira-cloud-cli`. Its
`builder_test.go` and `fuzz_test.go` have been ported to `tests/jql/*.test.ts`
and run green. Other test suites from that repo are scaffolded in `tests/`
as `describe.skip` placeholders with TODO notes — un-skip them as the
matching features land.

### Implemented
- `jira init` — interactive config (host, email, API token, default project); verifies auth
- `jira me` — prints current user's accountId (use with `$(jira me)` in shell)
- `jira issue list` — full filter flags, JQL builder, `--plain` / `--raw` / `--csv` output modes
- `jira issue view KEY` — display issue details
- `jira issue create` — interactive + `--no-input` scripted creation
- `jira issue edit KEY` — update summary, description, priority, assignee, labels, parent
- `jira issue assign KEY` — assign or unassign
- `jira issue move KEY` — transition issue status
- `jira issue comment add KEY` — add a comment
- `jira fields sync / list` — manage per-project custom field registry

### Not yet implemented
- `jira epic`, `jira sprint`, `jira project`, `jira board`, `jira release`, `jira open`
- Interactive TUI (press-key navigation, `v`/`m`/`c` shortcuts)
- `--history` (requires local history store)
- Shell completion
- `jira issue clone/delete/link`

## Quick start

```sh
mise install          # install pnpm at the version in .mise.toml
pnpm install          # install node_modules
mise run dev -- init  # configure credentials interactively
mise run dev -- me
mise run dev -- issue list --plain
```

`mise run dev` runs `bin/dev.js` via Node without a compile step — live edits
show up on the next invocation.

Credentials can also be set via environment variables instead of `init`:

```sh
export JIRA_HOST=https://company.atlassian.net
export JIRA_EMAIL=you@example.com
export JIRA_API_TOKEN=your-token
export JIRA_DEFAULT_PROJECT=KAN
```

For a compiled release:

```sh
mise run build               # tsc → dist/
node bin/run.js issue list   # runs against dist/
pnpm pack                    # triggers prepack → generates oclif.manifest.json
```

`oclif.manifest.json` is intentionally only generated at pack time — the
manifest is a cached snapshot of command metadata, so keeping it out of
the working tree means dev mode always reflects current sources.

## Layout

```
bin/           oclif entry points (run.js, dev.js)
src/
  commands/    one file per CLI command; nesting = subcommand groups
    init.ts
    me.ts
    issue/list.ts
  lib/
    config.ts  credential/config store (backed by `conf`)
    client.ts  authenticated jira.js Version3Client factory
    jql.ts     flag → JQL string builder
```

Config file lives at the path printed by `jira init` (typically `~/.config/jira-ts-cli/config.json`).
