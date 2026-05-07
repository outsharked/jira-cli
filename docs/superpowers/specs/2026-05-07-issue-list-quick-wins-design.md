# Issue List Quick Wins — Design Spec

**Date:** 2026-05-07
**Scope:** Add missing `issue list` flags to reach parity with ankitpokhrel/jira-cli

---

## Goal

Add eight flags to `issue list` and the JQL builder that are present in the reference implementation but currently missing or incomplete:

- Multi-value `--label` with negation support
- `--priority`, `--reporter`, `--watching`
- `--created-before`, `--updated-before`
- `--order-by`, `--reverse`

---

## Reference alignment

All flags and JQL outputs below match `ankitpokhrel/jira-cli` behaviour exactly, verified against `internal/cmd/issue/list/list.go` and `internal/query/issue.go`.

One intentional divergence: `--reporter me` and `--assignee me` both resolve to `currentUser()` (consistent with our existing assignee handling; the reference passes the value through, but Jira Cloud JQL also accepts `currentUser()` directly).

---

## JQL builder (`src/lib/jql.ts`)

### Type changes

Replace `label?: string` with `labels?: string[]` in `JQLOptions`.

Add new fields:

```ts
labels?: string[];        // replaces label
priority?: string;
reporter?: string;
watching?: boolean;
createdBefore?: string;
updatedBefore?: string;
orderBy?: string;         // default "updated"
orderDirection?: "ASC" | "DESC";  // default "DESC"; --reverse sets "ASC"
```

### New clauses

| Input | JQL emitted |
|-------|-------------|
| `labels: ["bug"]` | `labels = "bug"` |
| `labels: ["bug", "ui"]` | `labels IN ("bug", "ui")` |
| `labels: ["~bug"]` | `labels NOT IN ("bug")` |
| `labels: ["bug", "~ui"]` | `labels IN ("bug") AND labels NOT IN ("ui")` |
| `priority: "High"` | `priority = "High"` |
| `reporter: "me"` | `reporter = currentUser()` |
| `reporter: "user@example.com"` | `reporter = "user@example.com"` |
| `watching: true` | `issue IN watchedIssues()` |
| `createdBefore: "2026-01-01"` | `created < "2026-01-01"` |
| `updatedBefore: "2026-01-01"` | `updated < "2026-01-01"` |

### Clause ordering

Watching fires first (before field filters), matching the reference:

```
watching → type → resolution → priority → reporter → assignee →
sprint → epic → labels → unresolved/resolved →
createdAfter → createdBefore → updatedAfter → updatedBefore →
customFields → ORDER BY {orderBy} {orderDirection}
```

### ORDER BY

Replace the hardcoded `ORDER BY updated DESC` with:

```ts
`ORDER BY ${options.orderBy ?? "updated"} ${options.orderDirection ?? "DESC"}`
```

---

## Command (`src/commands/issue/list.ts`)

### Flag changes

| Flag | Short | Change |
|------|-------|--------|
| `--label` | `-l` | `multiple: true` (was single string) |
| `--priority` | `-y` | new `Flags.string` |
| `--reporter` | `-r` | new `Flags.string` |
| `--watching` | `-w` | new `Flags.boolean` |
| `--created-before` | | new `Flags.string` |
| `--updated-before` | | new `Flags.string` |
| `--order-by` | | new `Flags.string`, default `"updated"` |
| `--reverse` | | new `Flags.boolean` |

### JQL options mapping

```ts
buildJql({
  ...existing,
  labels: flags.label,              // string[] | undefined
  priority: flags.priority,
  reporter: flags.reporter,
  watching: flags.watching,
  createdBefore: flags["created-before"],
  updatedBefore: flags["updated-before"],
  orderBy: flags["order-by"],
  orderDirection: flags.reverse ? "ASC" : "DESC",
})
```

Remove the separate `label` field from the `buildJql` call.

---

## Tests

### `tests/jql/builder.test.ts` — new cases

- `labels` single value → `labels = "x"`
- `labels` multiple → `labels IN ("x", "y")`
- `labels` negation `~x` → `labels NOT IN ("x")`
- `labels` mixed → `labels IN ("x") AND labels NOT IN ("y")`
- `priority` → `priority = "High"`
- `reporter: "me"` → `reporter = currentUser()`
- `reporter: "user@example.com"` → `reporter = "user@example.com"`
- `watching: true` → `issue IN watchedIssues()`
- `createdBefore` → `created < "2026-01-01"`
- `updatedBefore` → `updated < "2026-01-01"`
- `orderBy: "created"` → `ORDER BY created DESC`
- `orderDirection: "ASC"` → `ORDER BY updated ASC`
- `createdAfter` + `createdBefore` coexist in same query
- Clause order: watching fires before field filters

### `tests/issue/list.test.ts` — new cases

- `--watching` generates `issue IN watchedIssues()` in the search JQL
- `--label a --label b` passes `["a", "b"]` to the JQL builder
- `--reverse` flips order to ASC
- `--order-by created` changes ORDER BY field

---

## Files changed

| File | Change |
|------|--------|
| `src/lib/jql.ts` | New fields, new clauses, ORDER BY made dynamic |
| `src/commands/issue/list.ts` | 8 new/updated flags, updated `buildJql` call |
| `tests/jql/builder.test.ts` | ~14 new test cases |
| `tests/issue/list.test.ts` | ~4 new test cases |

---

## Out of scope

- `--history` (requires local history store — separate feature)
- `--component` (not in current JQL builder; separate feature)
- `--created` / `--updated` exact-date shorthand (separate feature)
- `--paginate` (separate feature)
- Interactive TUI (separate feature)
