# Issue Create Implementation Design

**Goal:** Add `jira issue create` that creates a Jira issue interactively or via flags, with issue types cached in the existing fields registry.

**Architecture:** Extend `ProjectRegistry` to store issue types alongside custom fields; update `getOrSyncRegistry` to auto-sync on stale (removing the warn-and-proceed pattern); add `issue create` as a thin command following existing patterns.

**Tech Stack:** oclif v4, jira.js v5, @inquirer/prompts (select/input), existing prompt.ts (openEditor), fields.ts registry, conf (config store)

---

## Data model changes — `src/lib/fields.ts`

Add `IssueTypeEntry` and extend `ProjectRegistry`:

```ts
export type IssueTypeEntry = {
  id: string;
  name: string;
  subtask: boolean;
};

export type ProjectRegistry = {
  project: string;
  syncedAt: string;
  fields: FieldEntry[];
  issueTypes?: IssueTypeEntry[];   // new; optional for backward-compat with existing cache files
};
```

New exported helper:

```ts
export function getIssueTypes(registry: ProjectRegistry): IssueTypeEntry[] {
  return registry.issueTypes ?? [];
}
```

### `isStale` signature change

Replace the hardcoded `STALE_MS` constant with a `ttlDays` parameter:

```ts
export function isStale(registry: ProjectRegistry, ttlDays = 7): boolean {
  const t = new Date(registry.syncedAt).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t > ttlDays * 24 * 60 * 60 * 1000;
}
```

### `getOrSyncRegistry` behaviour change

Currently auto-syncs only when the registry is missing; warns (but proceeds) when stale.

New behaviour: auto-sync on **both** missing and stale. Accept `ttlDays` param and check staleness internally. Callers no longer need to check `isStale` themselves.

```ts
export async function getOrSyncRegistry(
  project: string,
  client: Version3Client,
  onSync: () => void,
  ttlDays = 7,
): Promise<ProjectRegistry>
```

---

## Config change — `src/lib/config.ts`

Add `fieldsCacheTtlDays` to `JiraConfig` and the `conf` schema:

```ts
export type JiraConfig = {
  host: string;
  email: string;
  apiToken: string;
  defaultProject?: string;
  defaultBoard?: number;
  fieldsCacheTtlDays?: number;    // new; default 7 when absent
};
```

Env var override: `JIRA_FIELDS_TTL_DAYS` (parsed as integer). `loadConfig()` reads it with `?? undefined`; callers use `cfg.fieldsCacheTtlDays ?? 7` or pass it directly to `getOrSyncRegistry`.

Not exposed in `jira init` — power-user setting via env var or direct JSON edit.

---

## `fields sync` changes — `src/commands/fields/sync.ts`

During sync, also fetch issue types for the project using `client.issueTypes.getIssueTypesForProject({ projectId })` and write them into `registry.issueTypes`. The list is stored as `IssueTypeEntry[]` (id, name, subtask only — no other metadata needed).

---

## `issue list` changes — `src/commands/issue/list.ts`

Remove the stale-warning block. Pass `cfg.fieldsCacheTtlDays` to `getOrSyncRegistry`:

```ts
const registry = await getOrSyncRegistry(project ?? "", client, () =>
  this.log(`Fetching field registry for ${project}...`),
  cfg.fieldsCacheTtlDays,
);
```

---

## New command — `src/commands/issue/create.ts`

### Flags

| Flag | Short | Required | Notes |
|------|-------|----------|-------|
| `--summary` | `-s` | In `--no-input` mode | Issue summary |
| `--type` | `-t` | In `--no-input` mode | Issue type name |
| `--description` | `-d` | No | Body text; bypasses editor |
| `--priority` | `-y` | No | Priority name (e.g. `High`) |
| `--assignee` | `-a` | No | accountId or `me` |
| `--label` | `-l` | No | Repeatable |
| `--parent` | | No | Parent issue key (subtask parent or epic link) |
| `--project` | `-p` | No | Defaults to configured project |
| `--no-input` | | No | Non-interactive; errors if summary/type missing |
| `--raw` | | No | Print created issue as JSON |

### Interactive flow (TTY, no `--no-input`)

1. **Type** — if `--type` not supplied: call `getOrSyncRegistry()` (auto-syncs if missing or stale), filter out `subtask: true` types and Epic, show `select` prompt. If registry has no issue types (e.g. sync returned none), fall back to `input` prompt.
2. **Summary** — if `--summary` not supplied: `input` prompt, required (re-prompts on empty).
3. **Description** — if `--description` not supplied: call `openEditor("")`; empty result is allowed (omit description field from API call, do not error).
4. Resolve `--assignee me` → `client.myself.getCurrentUser()` accountId.
5. Call `client.issues.createIssue(...)`.
6. Print: `Created KAN-5.\nhttps://<host>/browse/KAN-5`

### Non-interactive (`--no-input` or non-TTY)

- Require `--summary` and `--type`; `this.error(...)` if either is missing.
- `--description` optional.
- No registry fetch.
- Resolve `--assignee me` same as interactive.

### `--raw` output

Print the full API response as JSON (`JSON.stringify(issue, null, 2)`).

### Error handling

| Scenario | Behaviour |
|----------|-----------|
| `--no-input` with missing `--summary` or `--type` | `this.error("--summary and --type are required in non-interactive mode")` |
| `--type` value unknown to Jira | Surface API error — no local pre-validation |
| Empty editor save | Omit description (blank allowed) |
| Registry sync fails | Surface error (same as `fields sync` failure) |
| `createIssue` API error | Surface Jira error message |

---

## Testing

### Unit tests — `tests/issue/create.test.ts`

Mock `createClient` at the boundary. Tests:
- `--no-input` with `--summary` and `--type` → calls API, prints key + URL
- `--no-input` missing `--summary` → errors
- `--no-input` missing `--type` → errors
- `--assignee me` → resolves via `myself.getCurrentUser()`
- `--raw` → prints JSON
- Multiple `--label` flags → all sent to API

### Unit tests — `tests/lib/fields.test.ts` additions

- `isStale` with custom `ttlDays` param (e.g. 1-day TTL with 25-hour-old registry → stale)
- `getIssueTypes` with populated registry → returns types
- `getIssueTypes` with missing `issueTypes` field → returns `[]`
- `getOrSyncRegistry` with stale registry → triggers sync callback

### Integration test additions — `tests/integration/fields.test.ts`

- After `fields sync`, `registry.issueTypes` is a non-empty array with `id`, `name`, `subtask` fields.

### `tests/lib/fields.test.ts` — existing `isStale` tests

Update to pass explicit `ttlDays` argument to match new signature.

---

## Files changed summary

| File | Change |
|------|--------|
| `src/lib/fields.ts` | Add `IssueTypeEntry`, extend `ProjectRegistry`, update `isStale` signature, update `getOrSyncRegistry` (auto-sync on stale + ttlDays param), add `getIssueTypes()` |
| `src/lib/config.ts` | Add `fieldsCacheTtlDays` to `JiraConfig` and conf schema |
| `src/commands/fields/sync.ts` | Fetch and store issue types during sync |
| `src/commands/issue/create.ts` | New command |
| `src/commands/issue/list.ts` | Remove stale-warning block; pass `ttlDays` to `getOrSyncRegistry` |
| `tests/lib/fields.test.ts` | Tests for `isStale(ttlDays)`, `getIssueTypes()`, updated `getOrSyncRegistry` |
| `tests/issue/create.test.ts` | New unit tests |
| `tests/integration/fields.test.ts` | Issue types populated after sync |
