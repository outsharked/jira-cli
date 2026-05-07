# Issue Edit — Design Spec

**Date:** 2026-05-07
**Scope:** Add `issue edit KEY` command

---

## Goal

Add `jira issue edit KEY` to update an existing issue's summary, description, priority, assignee, labels, and parent. Matches the reference implementation (`ankitpokhrel/jira-cli`) flag names and behaviour, with the same label append/remove model.

---

## Architecture

A new thin command at `src/commands/issue/edit.ts`. It fetches the current issue first (needed for interactive pre-fill and label merging), then calls `client.issues.editIssue()` with only the fields that changed. Follows the same `isInteractive` / `openEditor` pattern as `issue create`.

---

## Flags

| Flag | Short | Type | Notes |
|------|-------|------|-------|
| `ISSUE-KEY` | — | positional arg | Required. Normalized with `getJiraIssueKey(project, args[0])` |
| `--summary` | `-s` | string | New issue summary |
| `--description` | `-d` | string | New description body (or open editor if omitted in interactive mode) |
| `--priority` | `-y` | string | e.g. `High`, `Low` |
| `--assignee` | `-a` | string | Account ID, email, display name, or `me` → resolves to `currentUser` account ID. `x` to unassign |
| `--label` | `-l` | string, multiple | Append labels. Prefix with `-` to remove (e.g. `--label -urgent`) |
| `--parent` | `-P` | string | Re-parent to another issue key |
| `--no-input` | — | boolean | Skip all prompts; require at least one other flag |

Short chars match the reference and `issue create` for muscle memory.

---

## Data Flow

1. Parse flags, normalize `ISSUE-KEY` with `getJiraIssueKey(project, args[0])`
2. Fetch current issue: `client.issues.getIssue({ issueIdOrKey: key })`
3. In interactive mode, prompt for any unflagged fields:
   - Summary: `input()` pre-filled with `issue.fields.summary`
   - Description: `openEditor(renderAdf(issue.fields.description) ?? "", allowEmpty: true)`
4. Resolve assignee:
   - `"me"` → `client.myself.getCurrentUser().accountId`
   - `"x"` → unassign sentinel (`{ accountId: null }`)
   - anything else → pass through as account ID
5. Compute label set: `existing.concat(positives).filter(l => !removals.has(l))`
   - `positives` = labels without `-` prefix
   - `removals` = labels with `-` prefix stripped
6. Build `fields` object containing only keys that have a new value
7. Call `client.issues.editIssue({ issueIdOrKey: key, fields })`
8. Print: `Updated KEY.\n${host}/browse/${KEY}`

---

## Label Handling

Labels passed via `--label` are split into positives and removals:

- `--label bug` → append `"bug"` to existing labels
- `--label -urgent` → remove `"urgent"` from existing labels
- Both can appear together: `--label bug --label -urgent`

The final set is: `existingLabels + positives - removals`. Duplicate additions are deduplicated. Removing a label that isn't present is a no-op.

---

## Non-Interactive Requirements

With `--no-input`:
- At least one field flag (`--summary`, `--description`, `--priority`, `--assignee`, `--label`, `--parent`) must be provided; otherwise error: `"At least one field flag is required with --no-input"`
- No prompts or editor are opened

Without `--no-input` (interactive):
- Summary is prompted with current value pre-filled
- Description opens `$EDITOR` with current content pre-filled (ADF rendered to text)
- Flags that are provided skip their corresponding prompt

---

## API Shape

```ts
// Fetch
client.issues.getIssue({ issueIdOrKey: key })
// → { fields: { summary, description, labels, priority, parent } }

// Edit (only changed fields sent)
client.issues.editIssue({
  issueIdOrKey: key,
  fields: {
    summary?: string,
    description?: ADF,           // textToAdf(body)
    priority?: { name: string },
    assignee?: { accountId: string | null },
    labels?: string[],
    parent?: { key: string },
  }
})
// → void (204)
```

---

## Tests (`tests/issue/edit.test.ts`)

Same setup as `issue create`: stub env vars in `beforeAll`/`afterAll`, mock `createClient`, load `oclifConfig` once, capture `console.log`.

| Scenario | Verified |
|----------|---------|
| `--summary "New title" --no-input` | `editIssue` called with `{ summary: "New title" }` only |
| `--priority High --no-input` | `editIssue` called with `{ priority: { name: "High" } }` |
| `--assignee me --no-input` | `getCurrentUser` called; `editIssue` called with `{ assignee: { accountId: "<id>" } }` |
| `--assignee x --no-input` | `editIssue` called with `{ assignee: { accountId: null } }` |
| `--label bug --label -urgent --no-input` | existing `["urgent", "other"]` → result `["other", "bug"]` |
| `--no-input` with no other flags | Errors "At least one field flag is required with --no-input" |
| Success output | Prints `Updated KEY-1.` and browse URL |

The `getIssue` mock returns a fixture with known `summary`, `labels: ["urgent", "other"]`, and an ADF `description`.

---

## Files Changed

| File | Change |
|------|--------|
| `src/commands/issue/edit.ts` | New command |
| `tests/issue/edit.test.ts` | New test file |
| `docs/parity.md` | Mark `issue edit` ✅ |

---

## Out of Scope

- `--component` (not yet in this project)
- `--fix-version` / `--affects-version` (not yet in this project)
- `--web` (open browser after update)
- Interactive metadata prompts (survey-style multi-step like the reference)
