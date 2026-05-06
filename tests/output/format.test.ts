// Port targets: jira-cloud-cli internal/output/*_test.go
//   - format_test.go (97 lines)   — formatting primitives
//   - output_test.go (124 lines)  — top-level render entry
//   - render_test.go (112 lines)  — table renderer
//   - text_test.go (262 lines)    — text utils (wrap, truncate, etc.)
//   - confirm_test.go (119 lines) — yes/no prompts
//   - dryrun_test.go (322 lines)  — --dry-run output
//   - exitcodes_test.go (118 lines) — canonical exit codes
//   - fixcommands_test.go (177 lines) — "did you mean" suggestions
//
// We have ad-hoc formatting inside src/commands/issue/list.ts right now.
// When we extract src/lib/output/ these tests come alive.
import { describe, it } from 'vitest';

describe.skip('output formatters (port of internal/output/*_test.go)', () => {
  it.todo('plain tab-separated output with headers');
  it.todo('--no-headers suppresses header row');
  it.todo('csv output escapes commas, quotes, and newlines');
  it.todo('csv output double-quotes embedded quotes');
  it.todo('raw mode emits JSON');
  it.todo('table mode colorizes headers and pads columns');
  it.todo('text truncation respects terminal width');
  it.todo('confirm prompt accepts y/Y/yes and rejects n/N/no');
  it.todo('--dry-run prints the intended API call without executing');
  it.todo('exit codes: 0 success, 2 usage, 3 not found, 4 auth, 5 network');
  it.todo('unknown command prints "did you mean" suggestions');
});
