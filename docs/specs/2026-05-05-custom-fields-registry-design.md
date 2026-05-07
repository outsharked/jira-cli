# Custom Fields Registry — Design Spec

Date: 2026-05-05

## Problem

Jira projects use custom fields (e.g. "Story Points", "Environment", "Sprint") that have opaque IDs like `customfield_10016`. Users need to be able to reference these fields by human-readable name anywhere the CLI accepts a field name — filtering, display, creation.

## Scope

This spec covers the registry infrastructure and its first consumer (`issue list --custom`). Wiring the registry into other commands (`issue view`, `issue create`, etc.) follows as those commands are built.

---

## Storage

**File:** `~/.config/jira-cli/fields.json`

Plain JSON, managed directly (not via `conf`). Separate from the credentials store (`config.json`) — fields are derived/refreshable data, not secrets.

**Schema:**

```json
{
  "KAN": {
    "syncedAt": "2026-05-05T14:00:00.000Z",
    "fields": [
      {
        "id": "customfield_10016",
        "name": "Story Points",
        "key": "story_points",
        "schema": {
          "type": "number",
          "custom": "com.atlassian.jira.plugin.system.customfieldtypes:float"
        },
        "allowedValues": null
      },
      {
        "id": "customfield_10050",
        "name": "Environment",
        "key": "environment",
        "schema": {
          "type": "option",
          "custom": "com.atlassian.jira.plugin.system.customfieldtypes:select"
        },
        "allowedValues": ["Production", "Staging", "Dev"]
      }
    ]
  }
}
```

**Field entry properties:**

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Jira field ID (`customfield_NNNNN` for custom fields) |
| `name` | string | Human-readable display name from Jira |
| `key` | string | Normalised slug: lowercase, spaces/hyphens → underscores |
| `schema.type` | string | Jira schema type: `number`, `string`, `option`, `array`, etc. |
| `schema.custom` | string | Full custom field type URI (null for standard fields) |
| `allowedValues` | string[] \| null | For option/select fields; null for free-text or complex types |
| `syncedAt` | ISO 8601 string | Timestamp of last sync for the project |

Fields are stored per-project. The per-project key records which project was active when the sync ran — useful for staleness warnings and future filtering.

---

## Module: `src/lib/fields.ts`

Public interface:

```ts
type FieldEntry = {
  id: string;
  name: string;
  key: string;
  schema: { type: string; custom?: string };
  allowedValues: string[] | null;
};

type ProjectRegistry = {
  syncedAt: string;
  fields: FieldEntry[];
};

// Path to fields.json (parallel to configPath())
function fieldsFilePath(): string

// Read registry for a project; null if not yet synced
function loadFieldRegistry(project: string): ProjectRegistry | null

// Write registry for a project
function saveFieldRegistry(project: string, registry: ProjectRegistry): void

// Fetch from Jira API, save, return
async function syncFieldRegistry(project: string, client: Version3Client): Promise<ProjectRegistry>

// Return cached registry if < 7 days old, otherwise sync
async function getOrSyncRegistry(project: string, client: Version3Client): Promise<ProjectRegistry>

// Resolve a user-supplied name/key/ID to a FieldEntry
// Checks: exact ID match → exact key match → case-insensitive name match
function resolveField(registry: ProjectRegistry, input: string): FieldEntry | undefined
```

### Sync API strategy

Two calls to Jira:

1. **`client.issueFields.getFields()`** — returns all fields with `id`, `name`, `schema`. Source of truth for field list and types. Custom fields have IDs prefixed `customfield_`.

2. **Allowed values** — for any field where `schema.type === 'option'` or `schema.items === 'option'`: fetch via `client.issueFields.getFieldContexts({ fieldId })` then `client.issueFields.getOptionsForContext({ fieldId, contextId })`. All other fields get `allowedValues: null`.

`key` is derived at sync time: `name.toLowerCase().replace(/[\s\-]+/g, '_').replace(/[^a-z0-9_]/g, '')`.

---

## Commands

### `jira fields sync [--project KAN]`

Fetches the field registry from Jira and saves to `fields.json`. Defaults to the configured default project.

```
$ jira fields sync
Syncing fields for KAN... 42 fields cached.

$ jira fields sync --project ENG
Syncing fields for ENG... 38 fields cached.
```

### `jira fields list [--project KAN]`

Displays the cached registry as a table.

```
$ jira fields list
Fields for KAN (synced 2 hours ago)

 ID                    NAME            TYPE    ALLOWED VALUES
 customfield_10016     Story Points    number  —
 customfield_10050     Environment     option  Production, Staging, Dev
 customfield_10010     Sprint          array   —
 ...
```

Errors if no registry exists for the project (prompts to run `jira fields sync`).

---

## Resolution in commands

`resolveField(registry, input)` checks in order:
1. Exact `id` match (e.g. `customfield_10016`)
2. Exact `key` match (e.g. `story_points`)
3. Case-insensitive `name` match (e.g. `Story Points`, `story points`)

Returns the `FieldEntry` or `undefined` if not found.

### `issue list --custom`

New flag on `issue list`:

```
--custom <key=value>    Filter by custom field (repeatable)
```

Examples — all equivalent:
```
jira issue list --custom "story_points=8"
jira issue list --custom "Story Points=8"
jira issue list --custom "customfield_10016=8"
```

Each `--custom` value is parsed as `<nameOrKeyOrId>=<value>` and appended to the JQL as `"<fieldName>" = "<value>"` (using the display name in JQL, double-quoted and escaped).

---

## Error handling

| Situation | Behaviour |
|-----------|-----------|
| Registry missing (first use) | Auto-sync with notice: `Fetching field registry for KAN...` |
| Registry older than 7 days | Warn: `Field registry for KAN is 7 days old. Run \`jira fields sync\` to refresh.` — then proceed with cached data |
| Field name unresolvable | Hard error: `Unknown field "story_pointz". Did you mean: story_points?` (Levenshtein closest match) |
| Jira API failure during auto-sync | Propagate HTTP error; do not proceed with empty registry |

---

## Testing

- **Unit tests** for `fields.ts`: `resolveField` with exact/key/name/case-insensitive inputs; staleness logic; `key` normalisation from known names.
- **Unit tests** for `issue list --custom`: mock `createClient` + mock `loadFieldRegistry`; verify JQL clause generation; verify error on unknown field.
- **Fixture**: capture real `getFields()` response from KAN to `tests/fixtures/fields-get.json`.
- **Integration test**: `jira fields sync` exits 0 and writes a non-empty `fields.json`.

---

## Out of scope

- Filtering the field list by issue type (all fields are stored, regardless of which issue types they apply to)
- Writing custom field values (`issue create`, `issue edit`) — handled when those commands are built
- Custom field display in `issue view` — handled when view rendering is extended
- On-premise Jira
