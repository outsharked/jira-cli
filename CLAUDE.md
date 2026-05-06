# jira-ts-cli

Node.js/TypeScript CLI tool for Jira Cloud. Port of [ankitpokhrel/jira-cli](https://github.com/ankitpokhrel/jira-cli).

## Stack

- **Runtime**: Node.js >=20
- **Language**: TypeScript (ESM, `tsc -b`)
- **CLI framework**: [oclif](https://oclif.io) v4
- **Jira client**: [jira.js](https://github.com/MrRefactoring/jira.js) v5
- **Package manager**: pnpm (version pinned in `.mise.toml`)
- **Tooling**: [mise](https://mise.jdx.dev) — manages pnpm version and task scripts
- **Linter/formatter**: [Biome](https://biomejs.dev) v2 (`biome.json`)
- **Test runner**: Vitest

## Common tasks

Use `mise run <task>` or `pnpm <script>`:

| Task | Command |
|------|---------|
| Run CLI (dev, no compile) | `mise run dev -- <args>` |
| Build | `mise run build` |
| Test (unit) | `mise run test` |
| Test (integration) | `mise run test:integration` |
| Lint | `mise run lint` |
| Lint + fix | `mise run lint:fix` |

## Configuration

Credentials are read from environment variables first, then from the file store (`~/.config/jira-cli/config.json`).

| Env var | Description |
|---------|-------------|
| `JIRA_HOST` | Jira site URL (e.g. `https://company.atlassian.net`) |
| `JIRA_EMAIL` | Account email |
| `JIRA_API_TOKEN` | API token |
| `JIRA_DEFAULT_PROJECT` | Default project key |

Run `mise run dev -- init` to write credentials to the file store interactively.

## Field registry

Custom field metadata is stored separately from credentials in `~/.config/jira-cli/fields.json`.

- `jira fields sync [--project KAN]` — fetches and caches all fields for a project
- `jira fields list [--project KAN]` — displays the cached registry
- Auto-syncs on first use when `--custom` is passed to `issue list`
- Set `JIRA_FIELDS_FILE` env var to override the file path (used in tests)

## Project layout

```
bin/            oclif entry points (run.js prod, dev.js dev/tsx)
src/
  commands/     one file per command; nesting = subcommand groups
    init.ts
    me.ts
    issue/list.ts
    issue/view.ts
    issue/assign.ts
    issue/move.ts
    issue/comment/add.ts
    fields/sync.ts
    fields/list.ts
  lib/
    config.ts   credential store (conf + env var overlay)
    client.ts   authenticated jira.js Version3Client factory
    jql.ts      flag → JQL string builder
    fields.ts   per-project custom field registry (load/save/sync/resolve)
    adf.ts      ADF → text rendering; text → ADF construction
    prompt.ts   interactive/non-interactive detection; $EDITOR spawn
tests/
  fixtures/     JSON fixtures captured from real API calls (one file per endpoint)
  jql/          builder + fuzz tests (ported from Go reference)
  adf/          ADF ↔ markdown (skipped, pending impl)
  config/       config tests (skipped)
  contract/     API contract tests (skipped)
  output/       output formatter tests (skipped)
  integration/  real-API tests; run manually with mise run test:integration
docs/
  parity.md     feature parity tracker vs ankitpokhrel/jira-cli
```

## Testing

Every feature must have tests. The rule:

- **Unit tests** (`tests/<area>/*.test.ts`) — mock `createClient` from `src/lib/client.ts` and inject a canned response. Test flag parsing, output formatting, error handling. Fast, no network.
- **Fixtures** (`tests/fixtures/<endpoint>.json`) — real API responses captured by calling the live Jira instance. Commit alongside the tests that use them. Refresh by re-running against the real API when the shape changes.
- **Integration tests** (`tests/integration/*.test.ts`) — call the real API. Skipped by default; run with `mise run test:integration` (requires `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN` env vars). These are smoke tests — verify exit 0 and basic shape, not exhaustive logic.

### Mocking pattern

```ts
import { vi, describe, it, expect, beforeEach } from "vitest";
import { createClient } from "../../src/lib/client.js";

vi.mock("../../src/lib/client.js");

const mockClient = { issues: { getIssue: vi.fn() } };
vi.mocked(createClient).mockReturnValue(mockClient as any);
```

Mock at the `createClient` boundary, not deep inside jira.js internals.

### Capturing command output

oclif's `this.log()` routes through `console.log` (via `@oclif/core`'s `ux/write.js`). Intercept `console.log`, not `process.stdout.write`:

```ts
import { Config } from "@oclif/core";
import { join } from "path";

let oclifConfig: Config;
beforeAll(async () => {
  oclifConfig = await Config.load({ root: join(import.meta.dirname, "../..") });
});

async function runCommand(argv: string[]): Promise<string[]> {
  const lines: string[] = [];
  const origLog = console.log.bind(console);
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  try {
    await MyCommand.run(argv, oclifConfig);
  } finally {
    console.log = origLog;
  }
  return lines.map((l) => l.trim()).filter(Boolean);
}
```

Load `oclifConfig` once per suite in `beforeAll` — `Config.load` is slow.

## Coding conventions

- Biome enforces formatting (tabs, double quotes) and lint rules — run `mise run lint:fix` before committing.
- No comments unless the *why* is non-obvious.
- Commands call `this.parse(ClassName)` at the top of `run()`.
- Jira Cloud only — no on-prem support.

## Design patterns

**Thin commands.** `run()` = parse flags → validate → API call → format output.
No business logic in command files. If logic is needed by more than one command,
it belongs in `src/lib/`.

**Single-responsibility libs.** Each lib file has one job. `adf.ts` owns ADF
rendering and construction. `fields.ts` owns the field registry. Don't add
unrelated utilities to an existing lib for convenience.

**Interactive/non-interactive.** Commands with optional inputs use `isInteractive()`
from `src/lib/prompt.ts`. If interactive: prompt via `@inquirer/prompts` or open
`$EDITOR` via `openEditor()`. If not (non-TTY or `--no-input` flag): hard error
with a clear message. Every command that can prompt must accept `--no-input`.

**ADF.** Use `renderAdf()` from `adf.ts` to display Jira content. Use `textToAdf()`
to send user-supplied text to the API.

**Output.** Use `--raw` for debug JSON output. Use `cli-table3` for TTY tables,
plain tab-separated for non-TTY / `--plain`.
