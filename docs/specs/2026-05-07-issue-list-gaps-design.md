# Issue List Gaps — Design Spec

**Date:** 2026-05-07
**Scope:** Fill remaining `issue list` flag gaps to reach parity with ankitpokhrel/jira-cli

---

## Goal

Add five missing capabilities to `issue list` and the JQL builder:

- `--component/-C` filter
- `--parent/-P` filter
- `--resolution/-R` named resolution filter (alongside existing `--unresolved`/`--resolved`)
- `--created` / `--updated` exact-date shorthands
- `--assignee x` unassigned filter

---

## Reference alignment

All JQL outputs match `ankitpokhrel/jira-cli` behaviour verified against `internal/query/issue.go`.

---

## JQL builder (`src/lib/jql.ts`)

### New fields in `JQLOptions`

```ts
component?: string;
parent?: string;
resolution?: string;
created?: string;
updated?: string;
```

`assignee` already exists — only the `"x"` sentinel handling is new.

### New clauses

| Input | JQL emitted |
|-------|-------------|
| `component: "Backend"` | `component = "Backend"` |
| `parent: "KAN-1"` | `parent = "KAN-1"` |
| `resolution: "Won't Fix"` | `resolution = "Won't Fix"` |
| `assignee: "x"` | `assignee is EMPTY` |
| `created: "today"` | `created >= startOfDay()` |
| `created: "week"` | `created >= startOfWeek()` |
| `created: "month"` | `created >= startOfMonth()` |
| `created: "year"` | `created >= startOfYear()` |
| `created: "2026-01-01"` | `created >= "2026-01-01" AND created < "2026-01-02"` |
| `updated: "today"` | `updated >= startOfDay()` |
| `updated: "2026-01-01"` | `updated >= "2026-01-01" AND updated < "2026-01-02"` |

Date shorthand special values are case-insensitive. Any value that is not a recognised shorthand and not a parseable date is passed through quoted (same as `createdAfter`/`updatedAfter`).

### Date shorthand helper

A shared private function handles both `created` and `updated` since the logic is identical:

```ts
function addDateClause(clauses: string[], field: string, value: string): void {
  switch (value.toLowerCase()) {
    case "today":  clauses.push(`${field} >= startOfDay()`); break;
    case "week":   clauses.push(`${field} >= startOfWeek()`); break;
    case "month":  clauses.push(`${field} >= startOfMonth()`); break;
    case "year":   clauses.push(`${field} >= startOfYear()`); break;
    default: {
      const dt = tryParseDate(value);
      if (dt) {
        clauses.push(`${field} >= ${quoteValue(value)}`);
        clauses.push(`${field} < ${quoteValue(addOneDay(dt, value))}`);
      } else {
        clauses.push(`${field} >= ${quoteValue(value)}`);
      }
    }
  }
}
```

`tryParseDate` attempts ISO date parsing (`YYYY-MM-DD`); returns `Date | null`.
`addOneDay` returns the next day in the same format.

### Assignee `"x"` sentinel

Extend the existing assignee clause:

```ts
if (opts.assignee) {
  if (opts.assignee.toLowerCase() === "me") {
    clauses.push("assignee = currentUser()");
  } else if (opts.assignee.toLowerCase() === "x") {
    clauses.push("assignee is EMPTY");
  } else {
    clauses.push(`assignee = ${quoteValue(opts.assignee)}`);
  }
}
```

### Clause ordering

Insert new clauses into the existing order:

```
watching → project → assignee → reporter → status → sprint →
issueType → epic → component → parent → labels → priority →
resolution(named) → unresolved/resolved →
createdAfter → createdBefore → created(shorthand) →
updatedAfter → updatedBefore → updated(shorthand) →
customFields → ORDER BY
```

`resolution` (named string) fires before `unresolved`/`resolved` booleans; if both are passed, all three emit clauses (user's problem).

---

## Command (`src/commands/issue/list.ts`)

### New flags

| Flag | Short | Type |
|------|-------|------|
| `--component` | `-C` | `Flags.string` |
| `--parent` | `-P` | `Flags.string` |
| `--resolution` | `-R` | `Flags.string` |
| `--created` | | `Flags.string` |
| `--updated` | | `Flags.string` |

### JQL options mapping additions

```ts
component: flags.component,
parent: flags.parent,
resolution: flags.resolution,
created: flags.created,
updated: flags.updated,
```

`assignee` mapping is unchanged — `"x"` is handled in the JQL builder.

---

## Tests (`tests/jql/builder.test.ts`)

New cases:

- `component` → `component = "Backend"`
- `parent` → `parent = "KAN-1"`
- `resolution` → `resolution = "Won't Fix"`
- `assignee: "x"` → `assignee is EMPTY`
- `assignee: "X"` → `assignee is EMPTY` (case-insensitive)
- `created: "today"` → `created >= startOfDay()`
- `created: "week"` → `created >= startOfWeek()`
- `created: "month"` → `created >= startOfMonth()`
- `created: "year"` → `created >= startOfYear()`
- `created: "2026-01-01"` → `created >= "2026-01-01" AND created < "2026-01-02"`
- `updated: "today"` → `updated >= startOfDay()`
- `updated: "2026-01-01"` → `updated >= "2026-01-01" AND updated < "2026-01-02"`
- `created` + `createdAfter` coexist in same query (both clauses emitted)
- `resolution` string + `--unresolved` boolean coexist (both clauses emitted)

---

## Files changed

| File | Change |
|------|--------|
| `src/lib/jql.ts` | New fields, new clauses, `addDateClause` helper, assignee `"x"` case |
| `src/commands/issue/list.ts` | 5 new flags, updated `buildJql` call |
| `tests/jql/builder.test.ts` | ~14 new test cases |

---

## Out of scope

- `--history` (requires local history store)
- `--no-truncate` / `--delimiter` / `--columns` (output formatting, linked to TUI work)
- `--paginate` (separate feature)
- Interactive TUI
