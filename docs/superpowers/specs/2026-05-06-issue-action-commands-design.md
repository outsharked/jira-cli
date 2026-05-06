# Issue Action Commands — Design Spec

Date: 2026-05-06

## Problem

The CLI can list and view issues but cannot act on them. The three highest-value action commands are `assign`, `move` (transition), and `comment add`. All three share a common interaction pattern: accept inputs as flags/args for scripting, fall back to interactive prompts for human use, and fail fast under `--no-input`.

## Scope

This spec covers:
- `src/lib/adf.ts` — shared ADF rendering and construction
- `src/lib/prompt.ts` — shared interactive/non-interactive helpers
- `src/commands/issue/view.ts` — refactor to use `adf.ts` (no behaviour change)
- `src/commands/issue/assign.ts`
- `src/commands/issue/move.ts`
- `src/commands/issue/comment/add.ts`
- `docs/parity.md` — update status
- `CLAUDE.md` — add design patterns section

Out of scope: `issue create`, `issue edit`, user search/picker, worklog, link/unlink.

---

## Shared Infrastructure

### `src/lib/adf.ts`

Two exports. Single responsibility: everything to do with Atlassian Document Format.

```ts
// Render an ADF document node to plain text.
// Handles: doc, paragraph, text, other node types (via content recursion).
export function renderAdf(doc: unknown): string

// Wrap plain text in a minimal ADF document for submission to the Jira API.
// The entire text is placed in a single paragraph node regardless of newlines.
// Multi-paragraph ADF construction is out of scope for v1.
export function textToAdf(text: string): object
// Returns:
// { type: "doc", version: 1, content: [
//   { type: "paragraph", content: [{ type: "text", text }] }
// ]}
```

`renderAdf` is the `renderDescription` function extracted verbatim from `view.ts`, renamed. `view.ts` imports it instead of defining it locally.

---

### `src/lib/prompt.ts`

Two exports. Single responsibility: interactive/non-interactive detection and editor spawning.

```ts
// Returns true when interactive prompts are permitted:
// the no-input flag is not set, and both stdin and stdout are TTYs.
export function isInteractive(noInput: boolean): boolean

// Spawn $EDITOR (fallback: vi) on a temp file with optional template content.
// Waits for the editor to exit, reads the file, returns trimmed content.
// Throws if the result is empty or the editor exits non-zero.
export async function openEditor(template?: string): Promise<string>
```

`openEditor` creates a temp file via `mkdtempSync`, writes `template ?? ""`, spawns `spawnSync(editor, [path], { stdio: "inherit" })`, reads the result, cleans up, and throws `"Aborted: empty input"` if the user saved nothing.

---

## Commands

### `issue assign KEY`

**File:** `src/commands/issue/assign.ts`

```
jira issue assign KAN-1 --assignee me
jira issue assign KAN-1 --assignee user@example.com
jira issue assign KAN-1 --assignee none       # unassign
```

**Args:** `key` (required)

**Flags:**

| Flag | Short | Description |
|------|-------|-------------|
| `--assignee` | `-a` | accountId, email, `"me"`, or `"none"` (unassign) |
| `--no-input` | | Disable interactive prompts; error if inputs missing |

**Behaviour:**
1. If `--assignee` missing and `isInteractive(flags["no-input"])`: prompt with `@inquirer/input` ("Assignee (email, accountId, me, none):")
2. If `--assignee` missing and not interactive: `this.error("--assignee is required (use --no-input to suppress prompts)")`
3. Resolve `"me"` → call `client.myself.getCurrentUser()` to get `accountId`
4. Resolve `"none"` → `accountId: null`
5. Call `client.issues.assignIssue({ issueIdOrKey: key, body: { accountId } })`
6. Print: `Assigned KAN-1 to <displayName>.` (or `Unassigned KAN-1.` for none)

**Error cases:**
- API 404: issue not found
- API 403: not permitted to assign

---

### `issue move KEY`

**File:** `src/commands/issue/move.ts`

```
jira issue move KAN-1 "In Progress"
jira issue move KAN-1 --transition "In Progress"
```

**Args:** `key` (required), `transition` (optional positional, alternative to flag — flag takes precedence if both given)

**Flags:**

| Flag | Short | Description |
|------|-------|-------------|
| `--transition` | `-t` | Transition name (case-insensitive) |
| `--no-input` | | Disable interactive prompts |

**Behaviour:**
1. Fetch available transitions: `client.issues.getTransitions({ issueIdOrKey: key })`
2. If transition name supplied (positional arg or flag): case-insensitive match against available transitions. If no match: `this.error("Unknown transition \"<name>\". Available: <list>.")`
3. If transition missing and `isInteractive(flags["no-input"])`: present `@inquirer/select` with transition names
4. If transition missing and not interactive: error
5. Call `client.issues.doTransition({ issueIdOrKey: key, body: { transition: { id } } })`
6. Print: `Moved KAN-1 to <transitionName>.`

**Error cases:**
- No transitions available (issue may be in a terminal state)
- Transition name ambiguous (multiple case-insensitive matches): error listing matches

---

### `issue comment add KEY`

**File:** `src/commands/issue/comment/add.ts`

```
jira issue comment add KAN-1 --body "Looks good to me"
jira issue comment add KAN-1          # opens $EDITOR
```

**Args:** `key` (required)

**Flags:**

| Flag | Short | Description |
|------|-------|-------------|
| `--body` | `-b` | Comment text (inline) |
| `--no-input` | | Disable editor; error if body missing |

**Behaviour:**
1. If `--body` supplied: use directly
2. If body missing and `isInteractive(flags["no-input"])`: call `openEditor()` from `prompt.ts`
3. If body missing and not interactive: `this.error("--body is required in non-interactive mode")`
4. Wrap body in ADF via `textToAdf(body)` from `adf.ts`
5. Call `client.issueComments.addComment(...)` — verify exact parameter shape against jira.js v5 types at implementation time (`body` vs `requestBody`)
6. Print: `Comment added to KAN-1.`

**Error cases:**
- Empty body after editor: `this.error("Aborted: empty comment.")`
- API 404: issue not found

---

## `view.ts` Refactor

Extract `renderDescription` → `renderAdf` in `src/lib/adf.ts`. Update `view.ts` to import it. No behaviour change. Update `docs/parity.md` to mark `issue view` ✅.

---

## CLAUDE.md Design Patterns

Add a new "Design patterns" section:

```markdown
## Design patterns

**Thin commands.** `run()` = parse flags → validate → API call → format output.
No business logic in command files. If logic is needed by more than one command,
it belongs in `src/lib/`.

**Single-responsibility libs.** Each lib file has one job. `adf.ts` owns ADF
rendering and construction. `fields.ts` owns the field registry. Don't add
unrelated utilities to an existing lib for convenience.

**Interactive/non-interactive.** Commands with optional inputs use `isInteractive()`
from `src/lib/prompt.ts`. If interactive: prompt via `@inquirer/prompts` or open
`$EDITOR`. If not (non-TTY or `--no-input` flag): hard error with a clear message.
Every command that can prompt must accept `--no-input`.

**ADF.** Use `renderAdf()` from `adf.ts` to display Jira content. Use `textToAdf()`
to send user-supplied text to the API.

**Output.** Use `--raw` for debug JSON output. Use `cli-table3` for TTY tables,
plain tab-separated for non-TTY / `--plain`.
```

---

## Testing

| Test file | What it covers |
|-----------|---------------|
| `tests/lib/adf.test.ts` | `renderAdf`: text node, paragraph, nested, null input; `textToAdf`: output structure |
| `tests/lib/prompt.test.ts` | `isInteractive`: all combos of `noInput` × TTY state via `vi.stubEnv` on `process.stdin.isTTY` / `process.stdout.isTTY` |
| `tests/issue/assign.test.ts` | Happy path (me, email, none); `--no-input` + missing assignee → error; `"me"` → getCurrentUser called |
| `tests/issue/move.test.ts` | Happy path (flag, positional); case-insensitive match; unknown transition → error with list; `--no-input` + no transition → error |
| `tests/issue/comment/add.test.ts` | `--body` supplied → correct ADF sent; `--no-input` + no body → error; mock `openEditor` → body used |

Integration tests for all three commands follow the same pattern as the existing fields integration test: `describe.skipIf(!hasCredentials)`, real API call, smoke-check the result.

---

## File Map

| File | Status | Purpose |
|------|--------|---------|
| `src/lib/adf.ts` | Create | ADF render + construction |
| `src/lib/prompt.ts` | Create | Interactive detection + editor spawn |
| `src/commands/issue/view.ts` | Modify | Import `renderAdf` from lib |
| `src/commands/issue/assign.ts` | Create | `jira issue assign` |
| `src/commands/issue/move.ts` | Create | `jira issue move` |
| `src/commands/issue/comment/add.ts` | Create | `jira issue comment add` |
| `tests/lib/adf.test.ts` | Create | adf.ts unit tests |
| `tests/lib/prompt.test.ts` | Create | prompt.ts unit tests |
| `tests/issue/assign.test.ts` | Create | assign unit tests |
| `tests/issue/move.test.ts` | Create | move unit tests |
| `tests/issue/comment/add.test.ts` | Create | comment add unit tests |
| `tests/integration/issue-actions.test.ts` | Create | integration smoke tests |
| `docs/parity.md` | Modify | Mark view/assign/move/comment as ✅ |
| `CLAUDE.md` | Modify | Add design patterns section |
