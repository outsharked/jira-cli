# Custom Fields Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a per-project custom field registry that fetches, caches, and resolves human-readable field names to Jira field IDs, with `jira fields sync`, `jira fields list`, and `--custom` filtering on `issue list`.

**Architecture:** A new `src/lib/fields.ts` module owns all registry I/O and resolution logic. Two new command files (`fields/sync.ts`, `fields/list.ts`) provide the user-facing sync and display. `jql.ts` and `issue/list.ts` are extended to accept and resolve `--custom` flags via the registry.

**Tech Stack:** TypeScript, jira.js v5 (`issueFields.getFields`, `issueCustomFieldContexts.getContextsForField`, `issueCustomFieldOptions.getOptionsForContext`), oclif v4, Vitest, Biome.

---

## File map

| File | Status | Purpose |
|------|--------|---------|
| `src/lib/fields.ts` | Create | Registry types, file I/O, sync, resolution |
| `src/commands/fields/sync.ts` | Create | `jira fields sync` command |
| `src/commands/fields/list.ts` | Create | `jira fields list` command |
| `src/lib/jql.ts` | Modify | Add `customFields` to `JQLOptions` |
| `src/commands/issue/list.ts` | Modify | Add `--custom` flag, wire registry |
| `tests/lib/fields.test.ts` | Create | Unit tests for fields.ts |
| `tests/issue/list.test.ts` | Create | Unit tests for --custom on issue list |
| `tests/fixtures/fields-get.json` | Exists | Real `getFields()` response (already saved) |
| `tests/integration/fields.test.ts` | Create | Integration smoke test for fields sync |

---

## Task 1: Core types, file I/O, and key normalisation in `src/lib/fields.ts`

**Files:**
- Create: `src/lib/fields.ts`
- Create: `tests/lib/fields.test.ts`

- [ ] **Step 1: Write failing tests for `normaliseKey` and `fieldsFilePath`**

Create `tests/lib/fields.test.ts`:

```ts
import { join, dirname } from "path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { normaliseKey, fieldsFilePath } from "../../src/lib/fields.js";

describe("normaliseKey", () => {
  it("lowercases and replaces spaces with underscores", () => {
    expect(normaliseKey("Story Points")).toBe("story_points");
  });
  it("replaces hyphens with underscores", () => {
    expect(normaliseKey("Due-Date")).toBe("due_date");
  });
  it("strips non-alphanumeric characters", () => {
    expect(normaliseKey("Field (beta)")).toBe("field_beta");
  });
  it("collapses multiple separators", () => {
    expect(normaliseKey("My  Field--Name")).toBe("my_field_name");
  });
});

describe("fieldsFilePath", () => {
  it("returns a path ending in fields.json", () => {
    expect(fieldsFilePath()).toMatch(/fields\.json$/);
  });
  it("is in the same directory as the config file", async () => {
    const { configPath } = await import("../../src/lib/config.js");
    expect(dirname(fieldsFilePath())).toBe(dirname(configPath()));
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test tests/lib/fields.test.ts
```

Expected: `Cannot find module '../../src/lib/fields.js'`

- [ ] **Step 3: Create `src/lib/fields.ts` with types, `normaliseKey`, and `fieldsFilePath`**

```ts
import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { Version3Client } from "jira.js";
import { configPath } from "./config.js";

export type FieldEntry = {
	id: string;
	name: string;
	key: string;
	schema: { type: string; custom?: string };
	allowedValues: string[] | null;
};

export type ProjectRegistry = {
	syncedAt: string;
	fields: FieldEntry[];
};

type FieldsFile = Record<string, ProjectRegistry>;

export function fieldsFilePath(): string {
	return join(dirname(configPath()), "fields.json");
}

export function normaliseKey(name: string): string {
	return name
		.toLowerCase()
		.replace(/[\s\-]+/g, "_")
		.replace(/[^a-z0-9_]/g, "")
		.replace(/_+/g, "_")
		.replace(/^_|_$/g, "");
}

export function loadFieldRegistry(project: string): ProjectRegistry | null {
	const path = fieldsFilePath();
	if (!existsSync(path)) return null;
	const file: FieldsFile = JSON.parse(readFileSync(path, "utf8"));
	return file[project] ?? null;
}

export function saveFieldRegistry(
	project: string,
	registry: ProjectRegistry,
): void {
	const path = fieldsFilePath();
	const file: FieldsFile = existsSync(path)
		? JSON.parse(readFileSync(path, "utf8"))
		: {};
	file[project] = registry;
	writeFileSync(path, JSON.stringify(file, null, 2));
}

export function resolveField(
	registry: ProjectRegistry,
	input: string,
): FieldEntry | undefined {
	// 1. exact ID
	const byId = registry.fields.find((f) => f.id === input);
	if (byId) return byId;
	// 2. exact key
	const byKey = registry.fields.find((f) => f.key === input);
	if (byKey) return byKey;
	// 3. case-insensitive name
	const lower = input.toLowerCase();
	return registry.fields.find((f) => f.name.toLowerCase() === lower);
}

export async function syncFieldRegistry(
	project: string,
	client: Version3Client,
): Promise<ProjectRegistry> {
	const rawFields = await client.issueFields.getFields();

	const fields: FieldEntry[] = [];
	for (const f of rawFields) {
		if (!f.id || !f.name || !f.schema) continue;
		const isOption =
			f.schema.type === "option" || f.schema.items === "option";
		let allowedValues: string[] | null = null;
		if (isOption) {
			try {
				const contexts =
					await client.issueCustomFieldContexts.getContextsForField({
						fieldId: f.id,
					});
				const ctxId = contexts.values?.[0]?.id;
				if (ctxId) {
					const opts =
						await client.issueCustomFieldOptions.getOptionsForContext({
							fieldId: f.id,
							contextId: Number(ctxId),
						});
					allowedValues =
						opts.values
							?.filter((o) => !o.disabled)
							.map((o) => o.value ?? "") ?? null;
				}
			} catch {
				// allowed values are best-effort; leave null on error
			}
		}
		fields.push({
			id: f.id,
			name: f.name,
			key: normaliseKey(f.name),
			schema: {
				type: f.schema.type ?? "string",
				...(f.schema.custom ? { custom: f.schema.custom } : {}),
			},
			allowedValues,
		});
	}

	const registry: ProjectRegistry = {
		syncedAt: new Date().toISOString(),
		fields,
	};
	saveFieldRegistry(project, registry);
	return registry;
}

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function isStale(registry: ProjectRegistry): boolean {
	return Date.now() - new Date(registry.syncedAt).getTime() > STALE_MS;
}

// Returns the registry, syncing only if missing.
// Stale detection is left to the caller so they can emit UX-appropriate messages.
export async function getOrSyncRegistry(
	project: string,
	client: Version3Client,
	onAutoSync?: () => void,
): Promise<ProjectRegistry> {
	const existing = loadFieldRegistry(project);
	if (existing) return existing;
	onAutoSync?.();
	return syncFieldRegistry(project, client);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm test tests/lib/fields.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fields.ts tests/lib/fields.test.ts tests/fixtures/fields-get.json
git commit -m "feat: add fields registry core (types, I/O, normaliseKey, resolveField)"
```

---

## Task 2: Unit tests for `resolveField`, `loadFieldRegistry`, and `saveFieldRegistry`

**Files:**
- Modify: `tests/lib/fields.test.ts`

- [ ] **Step 1: Add tests using a temp file for I/O and the fixture for resolveField**

Append to `tests/lib/fields.test.ts`:

```ts
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import {
  loadFieldRegistry,
  saveFieldRegistry,
  resolveField,
  isStale,
  type ProjectRegistry,
} from "../../src/lib/fields.js";

const sampleRegistry: ProjectRegistry = {
  syncedAt: new Date().toISOString(),
  fields: [
    {
      id: "customfield_10016",
      name: "Story Points",
      key: "story_points",
      schema: { type: "number" },
      allowedValues: null,
    },
    {
      id: "customfield_10050",
      name: "Environment",
      key: "environment",
      schema: { type: "option" },
      allowedValues: ["Production", "Staging"],
    },
  ],
};

describe("resolveField", () => {
  it("resolves by exact ID", () => {
    const entry = resolveField(sampleRegistry, "customfield_10016");
    expect(entry?.name).toBe("Story Points");
  });
  it("resolves by exact key", () => {
    const entry = resolveField(sampleRegistry, "story_points");
    expect(entry?.name).toBe("Story Points");
  });
  it("resolves by case-insensitive name", () => {
    const entry = resolveField(sampleRegistry, "story points");
    expect(entry?.name).toBe("Story Points");
  });
  it("resolves by mixed-case name", () => {
    const entry = resolveField(sampleRegistry, "ENVIRONMENT");
    expect(entry?.name).toBe("Environment");
  });
  it("returns undefined for unknown input", () => {
    expect(resolveField(sampleRegistry, "nonexistent")).toBeUndefined();
  });
});

describe("isStale", () => {
  it("returns false for a registry synced just now", () => {
    expect(isStale({ ...sampleRegistry, syncedAt: new Date().toISOString() })).toBe(false);
  });
  it("returns true for a registry synced 8 days ago", () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    expect(isStale({ ...sampleRegistry, syncedAt: old })).toBe(true);
  });
});

describe("loadFieldRegistry / saveFieldRegistry", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "jira-cli-test-"));
    // Point fieldsFilePath to a temp location via env override
    vi.stubEnv("JIRA_FIELDS_FILE", join(tmpDir, "fields.json"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
    vi.unstubAllEnvs();
  });

  it("returns null when no file exists", () => {
    expect(loadFieldRegistry("KAN")).toBeNull();
  });

  it("round-trips save and load", () => {
    saveFieldRegistry("KAN", sampleRegistry);
    const loaded = loadFieldRegistry("KAN");
    expect(loaded?.fields).toHaveLength(2);
    expect(loaded?.fields[0].id).toBe("customfield_10016");
  });

  it("preserves other projects when saving a new one", () => {
    saveFieldRegistry("KAN", sampleRegistry);
    saveFieldRegistry("ENG", { ...sampleRegistry, syncedAt: new Date().toISOString() });
    expect(loadFieldRegistry("KAN")).not.toBeNull();
    expect(loadFieldRegistry("ENG")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Update `fieldsFilePath` in `src/lib/fields.ts` to honour the env override used in tests**

Replace the `fieldsFilePath` function body:

```ts
export function fieldsFilePath(): string {
	return (
		process.env.JIRA_FIELDS_FILE ?? join(dirname(configPath()), "fields.json")
	);
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test tests/lib/fields.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/fields.ts tests/lib/fields.test.ts
git commit -m "feat: add resolveField, load/save registry, isStale with tests"
```

---

## Task 3: `jira fields sync` command

**Files:**
- Create: `src/commands/fields/sync.ts`

- [ ] **Step 1: Create the command**

```ts
import { Command, Flags } from "@oclif/core";
import { createClient } from "../../lib/client.js";
import { loadConfig } from "../../lib/config.js";
import { syncFieldRegistry } from "../../lib/fields.js";

export default class FieldsSync extends Command {
	static override description = "Fetch and cache the field registry for a project";
	static override examples = [
		"<%= config.bin %> fields sync",
		"<%= config.bin %> fields sync --project ENG",
	];

	static override flags = {
		project: Flags.string({
			char: "p",
			description: "Project key (defaults to configured default project)",
		}),
	};

	async run(): Promise<void> {
		await this.parse(FieldsSync);
		const { flags } = await this.parse(FieldsSync);
		const cfg = loadConfig();
		const project = flags.project ?? cfg.defaultProject;
		if (!project) {
			this.error(
				"No project specified. Use --project or set a default with `jira init`.",
			);
		}
		this.log(`Syncing fields for ${project}...`);
		const client = createClient();
		const registry = await syncFieldRegistry(project, client);
		this.log(`${registry.fields.length} fields cached for ${project}.`);
	}
}
```

- [ ] **Step 2: Smoke-test the command in dev mode**

```bash
mise run dev -- fields sync
```

Expected output:
```
Syncing fields for KAN...
51 fields cached for KAN.
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/fields/sync.ts
git commit -m "feat: add jira fields sync command"
```

---

## Task 4: `jira fields list` command

**Files:**
- Create: `src/commands/fields/list.ts`

- [ ] **Step 1: Create the command**

```ts
import { Command, Flags } from "@oclif/core";
import Table from "cli-table3";
import { loadConfig } from "../../lib/config.js";
import { loadFieldRegistry } from "../../lib/fields.js";

export default class FieldsList extends Command {
	static override description = "Display the cached field registry for a project";
	static override examples = [
		"<%= config.bin %> fields list",
		"<%= config.bin %> fields list --project ENG",
	];

	static override flags = {
		project: Flags.string({
			char: "p",
			description: "Project key (defaults to configured default project)",
		}),
		plain: Flags.boolean({ description: "Plain tab-separated output" }),
	};

	async run(): Promise<void> {
		await this.parse(FieldsList);
		const { flags } = await this.parse(FieldsList);
		const cfg = loadConfig();
		const project = flags.project ?? cfg.defaultProject;
		if (!project) {
			this.error(
				"No project specified. Use --project or set a default with `jira init`.",
			);
		}
		const registry = loadFieldRegistry(project);
		if (!registry) {
			this.error(
				`No field registry for ${project}. Run \`jira fields sync --project ${project}\` first.`,
			);
		}

		const syncedAgo = humanAge(registry.syncedAt);
		this.log(`Fields for ${project} (synced ${syncedAgo})\n`);

		const headers = ["ID", "NAME", "TYPE", "ALLOWED VALUES"];
		const rows = registry.fields.map((f) => [
			f.id,
			f.name,
			f.schema.type,
			f.allowedValues ? f.allowedValues.join(", ") : "—",
		]);

		if (flags.plain || !process.stdout.isTTY) {
			this.log(headers.join("\t"));
			for (const row of rows) this.log(row.join("\t"));
			return;
		}

		const table = new Table({ head: headers, style: { head: ["cyan"] } });
		for (const row of rows) table.push(row);
		this.log(table.toString());
	}
}

function humanAge(iso: string): string {
	const ms = Date.now() - new Date(iso).getTime();
	const mins = Math.floor(ms / 60_000);
	if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
	const days = Math.floor(hours / 24);
	return `${days} day${days === 1 ? "" : "s"} ago`;
}
```

- [ ] **Step 2: Smoke-test the command**

```bash
mise run dev -- fields list
```

Expected: a table of field IDs, names, types, and allowed values for KAN.

- [ ] **Step 3: Commit**

```bash
git add src/commands/fields/list.ts
git commit -m "feat: add jira fields list command"
```

---

## Task 5: Wire `--custom` into `jql.ts` and `issue list`

**Files:**
- Modify: `src/lib/jql.ts`
- Modify: `src/commands/issue/list.ts`
- Create: `tests/issue/list.test.ts`

- [ ] **Step 1: Write failing tests for `--custom` JQL generation**

Create `tests/issue/list.test.ts`:

```ts
import { Config } from "@oclif/core";
import { readFileSync } from "fs";
import { join } from "path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import IssueList from "../../src/commands/issue/list.js";
import { createClient } from "../../src/lib/client.js";
import * as fieldsModule from "../../src/lib/fields.js";

vi.mock("../../src/lib/client.js");

const fieldsFixture = JSON.parse(
  readFileSync(join(import.meta.dirname, "../fixtures/fields-get.json"), "utf8"),
);

const sampleRegistry = {
  syncedAt: new Date().toISOString(),
  fields: [
    {
      id: "customfield_10016",
      name: "Story Points",
      key: "story_points",
      schema: { type: "number" },
      allowedValues: null,
    },
  ],
};

function makeMockClient() {
  return {
    issueSearch: {
      searchForIssuesUsingJqlEnhancedSearchPost: vi.fn().mockResolvedValue({ issues: [] }),
    },
  };
}

let oclifConfig: Config;
beforeAll(async () => {
  oclifConfig = await Config.load({ root: join(import.meta.dirname, "../..") });
});

async function runList(argv: string[]): Promise<{ lines: string[]; jql: string }> {
  const mock = makeMockClient();
  vi.mocked(createClient).mockReturnValue(mock as any);
  const lines: string[] = [];
  const origLog = console.log.bind(console);
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  try {
    await IssueList.run(argv, oclifConfig);
  } finally {
    console.log = origLog;
  }
  const call = mock.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost.mock.calls[0]?.[0];
  return { lines, jql: call?.jql ?? "" };
}

describe("issue list --custom", () => {
  beforeEach(() => {
    vi.spyOn(fieldsModule, "getOrSyncRegistry").mockResolvedValue(sampleRegistry as any);
  });

  it("resolves by key and appends JQL clause", async () => {
    const { jql } = await runList(["--custom", "story_points=8"]);
    expect(jql).toContain('"Story Points" = "8"');
  });

  it("resolves by display name (case-insensitive)", async () => {
    const { jql } = await runList(["--custom", "story points=8"]);
    expect(jql).toContain('"Story Points" = "8"');
  });

  it("resolves by raw field ID", async () => {
    const { jql } = await runList(["--custom", "customfield_10016=8"]);
    expect(jql).toContain('"Story Points" = "8"');
  });

  it("throws on unknown field name", async () => {
    await expect(runList(["--custom", "nonexistent=8"])).rejects.toThrow(/Unknown field/);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test tests/issue/list.test.ts
```

Expected: errors — `--custom` flag not defined, `getOrSyncRegistry` not being called.

- [ ] **Step 3: Extend `JQLOptions` in `src/lib/jql.ts`**

Add `customFields` to the type and handler. In `src/lib/jql.ts`, update `JQLOptions` and `buildJql`:

```ts
export type JQLOptions = {
	project?: string;
	assignee?: string;
	status?: string;
	sprint?: string;
	issueType?: string;
	epic?: string;
	label?: string;
	createdAfter?: string;
	updatedAfter?: string;
	unresolved?: boolean;
	resolved?: boolean;
	customFields?: Array<{ fieldName: string; value: string }>;
};
```

And inside `buildJql`, after the `updatedAfter` block:

```ts
	for (const cf of opts.customFields ?? []) {
		clauses.push(`${quoteValue(cf.fieldName)} = ${quoteValue(cf.value)}`);
	}
```

- [ ] **Step 4: Add `--custom` flag to `src/commands/issue/list.ts`**

Add to the `flags` block:

```ts
		custom: Flags.string({
			description: 'Custom field filter, format: "fieldName=value" (repeatable)',
			multiple: true,
		}),
```

Add imports at the top of the file:

```ts
import { getOrSyncRegistry, isStale, loadFieldRegistry, resolveField } from "../../lib/fields.js";
```

Replace the `run()` method's config + JQL section (before `const client = createClient()`) with:

```ts
		const { flags } = await this.parse(IssueList);
		const cfg = loadConfig();
		const project = flags.project ?? cfg.defaultProject;

		// Create client once; reused for both field registry and issue search.
		const client = createClient();

		// Resolve --custom flags to JQL clauses.
		// Auto-sync if registry missing; warn (but proceed) if stale.
		const customFields: Array<{ fieldName: string; value: string }> = [];
		if (flags.custom?.length) {
			const existing = loadFieldRegistry(project ?? "");
			if (existing && isStale(existing)) {
				this.warn(`Field registry for ${project} is stale. Run \`jira fields sync\` to refresh.`);
			}
			const registry = await getOrSyncRegistry(
				project ?? "",
				client,
				() => this.log(`Fetching field registry for ${project}...`),
			);
			for (const raw of flags.custom) {
				const eqIdx = raw.indexOf("=");
				if (eqIdx === -1) this.error(`Invalid --custom value "${raw}": expected format "fieldName=value"`);
				const nameOrId = raw.slice(0, eqIdx).trim();
				const value = raw.slice(eqIdx + 1).trim();
				const entry = resolveField(registry, nameOrId);
				if (!entry) this.error(`Unknown field "${nameOrId}". Run \`jira fields list\` to see available fields.`);
				customFields.push({ fieldName: entry.name, value });
			}
		}

		const jql = buildJql({
			project,
			assignee: flags.assignee,
			status: flags.status,
			sprint: flags.sprint,
			issueType: flags.type,
			epic: flags.epic,
			label: flags.label,
			createdAfter: flags["created-after"],
			updatedAfter: flags["updated-after"],
			unresolved: flags.unresolved,
			resolved: flags.resolved,
			customFields,
		});
```

- [ ] **Step 5: Remove the now-redundant `const client = createClient()` line**

In `src/commands/issue/list.ts`, delete the line `const client = createClient();` that appears after the JQL block (the client is now created earlier and reused).

- [ ] **Step 6: Run tests**

```bash
pnpm test tests/issue/list.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 6: Run the full test suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 7: Run lint**

```bash
pnpm lint:fix
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/jql.ts src/commands/issue/list.ts tests/issue/list.test.ts
git commit -m "feat: add --custom flag to issue list with field registry resolution"
```

---

## Task 6: Integration test

**Files:**
- Create: `tests/integration/fields.test.ts`

- [ ] **Step 1: Create the integration test**

```ts
import { Config } from "@oclif/core";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import FieldsSync from "../../src/commands/fields/sync.js";
import { fieldsFilePath, loadFieldRegistry } from "../../src/lib/fields.js";

const hasCredentials =
  !!process.env.JIRA_API_TOKEN || existsSync(
    join(process.env.HOME ?? "", ".config/jira-cli/config.json"),
  );

describe.skipIf(!hasCredentials)("fields sync (integration)", () => {
  let oclifConfig: Config;
  const testFieldsFile = join(
    process.env.HOME ?? "",
    ".config/jira-cli/fields-test.json",
  );

  beforeAll(async () => {
    oclifConfig = await Config.load({ root: join(import.meta.dirname, "../..") });
    process.env.JIRA_FIELDS_FILE = testFieldsFile;
  });

  afterAll(() => {
    delete process.env.JIRA_FIELDS_FILE;
    if (existsSync(testFieldsFile)) unlinkSync(testFieldsFile);
  });

  it("syncs and writes a non-empty registry", async () => {
    await FieldsSync.run(["--project", "KAN"], oclifConfig);
    const registry = loadFieldRegistry("KAN");
    expect(registry).not.toBeNull();
    expect(registry!.fields.length).toBeGreaterThan(0);
    expect(registry!.syncedAt).toBeTruthy();
  });

  it("every entry has id, name, key, and schema", () => {
    const registry = loadFieldRegistry("KAN")!;
    for (const f of registry.fields) {
      expect(f.id).toBeTruthy();
      expect(f.name).toBeTruthy();
      expect(f.key).toBeTruthy();
      expect(f.schema.type).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run integration tests**

```bash
mise run test:integration
```

Expected: both tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/fields.test.ts
git commit -m "test: add fields sync integration test"
```

---

## Task 7: Update `docs/parity.md` and `CLAUDE.md`

**Files:**
- Modify: `docs/parity.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Mark `--custom` as done in parity tracker**

In `docs/parity.md`, find the custom field row and update:

```markdown
| `-q`/`--jql` raw JQL passthrough | ⬜ | |
```

Add above it:

```markdown
| `--custom` field filter | ✅ | via field registry; `jira fields sync` required |
```

- [ ] **Step 2: Add fields registry section to `CLAUDE.md`**

Add to the Layout section in CLAUDE.md under `src/lib/`:

```
    fields.ts   per-project custom field registry (load/save/sync/resolve)
```

Add a new section after the Configuration section:

```markdown
## Field registry

Custom field metadata is stored separately from credentials in `~/.config/jira-cli/fields.json`.

- `jira fields sync [--project KAN]` — fetches and caches all fields for a project
- `jira fields list [--project KAN]` — displays the cached registry
- Auto-syncs on first use when `--custom` is passed to `issue list`
- Set `JIRA_FIELDS_FILE` env var to override the file path (used in tests)
```

- [ ] **Step 3: Commit**

```bash
git add docs/parity.md CLAUDE.md
git commit -m "docs: update parity tracker and CLAUDE.md for fields registry"
```
