# Issue Create Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `jira issue create` with interactive prompts and `--no-input` scripting mode, backed by issue types cached in the existing fields registry.

**Architecture:** Extend `ProjectRegistry` to store issue types; update `getOrSyncRegistry` to auto-sync on stale (replacing the warn-and-proceed pattern); implement `issue create` as a thin command following existing patterns; add `fieldsCacheTtlDays` to config for a tunable TTL.

**Tech Stack:** oclif v4, jira.js v5, @inquirer/prompts (select/input), prompt.ts (openEditor), fields.ts registry, conf (config store), Vitest

---

## File map

| File | Change |
|------|--------|
| `src/lib/fields.ts` | Add `IssueTypeEntry`, extend `ProjectRegistry`, update `isStale`, update `getOrSyncRegistry`, add `getIssueTypes()`, update `syncFieldRegistry` |
| `src/lib/config.ts` | Add `fieldsCacheTtlDays` to `JiraConfig` and conf schema |
| `src/lib/prompt.ts` | Add `allowEmpty` param to `openEditor` |
| `src/commands/fields/sync.ts` | Update output to report issue type count |
| `src/commands/issue/list.ts` | Remove stale-warning; pass `ttlDays` to `getOrSyncRegistry` |
| `src/commands/issue/create.ts` | New command |
| `tests/lib/fields.test.ts` | Tests for `IssueTypeEntry`, `getIssueTypes`, updated `isStale`, `getOrSyncRegistry` stale behaviour |
| `tests/lib/prompt.test.ts` | Tests for `openEditor` `allowEmpty` param |
| `tests/issue/create.test.ts` | New unit tests |
| `tests/integration/fields.test.ts` | Verify `issueTypes` populated after sync |

---

### Task 1: Add IssueTypeEntry, extend ProjectRegistry, add getIssueTypes()

**Files:**
- Modify: `src/lib/fields.ts:6-17`
- Test: `tests/lib/fields.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/lib/fields.test.ts` (after the existing `resolveField` describe block, before `isStale`):

```ts
import {
  fieldsFilePath,
  getIssueTypes,
  isStale,
  loadFieldRegistry,
  normaliseKey,
  type ProjectRegistry,
  resolveField,
  saveFieldRegistry,
} from "../../src/lib/fields.js";
```

And add to `sampleRegistry` (update the existing const):

```ts
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
  issueTypes: [
    { id: "10001", name: "Story", subtask: false },
    { id: "10002", name: "Bug", subtask: false },
    { id: "10003", name: "Sub-task", subtask: true },
  ],
};
```

Add the `getIssueTypes` describe block after `resolveField`:

```ts
describe("getIssueTypes", () => {
  it("returns the issueTypes array when present", () => {
    const types = getIssueTypes(sampleRegistry);
    expect(types).toHaveLength(3);
    expect(types[0].name).toBe("Story");
  });
  it("returns an empty array when issueTypes is absent", () => {
    const reg: ProjectRegistry = { syncedAt: new Date().toISOString(), fields: [] };
    expect(getIssueTypes(reg)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/jamiet/code/jira-cli && pnpm test tests/lib/fields.test.ts
```

Expected: FAIL — `getIssueTypes is not a function` (or import error)

- [ ] **Step 3: Implement the changes in fields.ts**

In `src/lib/fields.ts`, after `FieldEntry` (line 12), add:

```ts
export type IssueTypeEntry = {
	id: string;
	name: string;
	subtask: boolean;
};
```

Change `ProjectRegistry` (lines 14-17) to:

```ts
export type ProjectRegistry = {
	syncedAt: string;
	fields: FieldEntry[];
	issueTypes?: IssueTypeEntry[];
};
```

Add `getIssueTypes` after `resolveField` (after line 77):

```ts
export function getIssueTypes(registry: ProjectRegistry): IssueTypeEntry[] {
	return registry.issueTypes ?? [];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/jamiet/code/jira-cli && pnpm test tests/lib/fields.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/fields.ts tests/lib/fields.test.ts
git commit -m "feat: add IssueTypeEntry to ProjectRegistry with getIssueTypes helper"
```

---

### Task 2: Update isStale to accept a ttlDays parameter

**Files:**
- Modify: `src/lib/fields.ts:132-138`
- Test: `tests/lib/fields.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the `isStale` describe block in `tests/lib/fields.test.ts`:

```ts
it("respects a custom ttlDays parameter", () => {
  const recent = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  expect(isStale({ ...sampleRegistry, syncedAt: recent }, 1)).toBe(true);
  expect(isStale({ ...sampleRegistry, syncedAt: recent }, 2)).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify the new test fails**

```bash
cd /home/jamiet/code/jira-cli && pnpm test tests/lib/fields.test.ts
```

Expected: The new `respects a custom ttlDays parameter` test fails (function ignores the argument)

- [ ] **Step 3: Update isStale in fields.ts**

Replace lines 132-138 in `src/lib/fields.ts`:

```ts
export function isStale(registry: ProjectRegistry, ttlDays = 7): boolean {
	const t = new Date(registry.syncedAt).getTime();
	if (Number.isNaN(t)) return true;
	return Date.now() - t > ttlDays * 24 * 60 * 60 * 1000;
}
```

(Remove the `const STALE_MS = 7 * 24 * 60 * 60 * 1000;` line above it.)

- [ ] **Step 4: Run tests to verify they all pass**

```bash
cd /home/jamiet/code/jira-cli && pnpm test tests/lib/fields.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/fields.ts tests/lib/fields.test.ts
git commit -m "feat: make isStale TTL configurable via ttlDays parameter"
```

---

### Task 3: Update getOrSyncRegistry to auto-sync on stale

**Files:**
- Modify: `src/lib/fields.ts:142-151`
- Test: `tests/lib/fields.test.ts`

- [ ] **Step 1: Write the failing tests**

Add a new `describe("getOrSyncRegistry")` block to `tests/lib/fields.test.ts`. Add this import at the top of the file:

```ts
import {
  fieldsFilePath,
  getIssueTypes,
  getOrSyncRegistry,
  isStale,
  loadFieldRegistry,
  normaliseKey,
  type ProjectRegistry,
  resolveField,
  saveFieldRegistry,
} from "../../src/lib/fields.js";
```

Add the describe block after the `loadFieldRegistry / saveFieldRegistry` describe block:

```ts
describe("getOrSyncRegistry", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "jira-cli-test-"));
    vi.stubEnv("JIRA_FIELDS_FILE", join(tmpDir, "fields.json"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
    vi.unstubAllEnvs();
  });

  function makeSyncClient() {
    return {
      issueFields: { getFields: vi.fn().mockResolvedValue([]) },
      issueCustomFieldContexts: {
        getContextsForField: vi.fn().mockResolvedValue({ values: [] }),
      },
      issueCustomFieldOptions: {
        getOptionsForContext: vi.fn().mockResolvedValue({ values: [] }),
      },
      projects: {
        getProject: vi.fn().mockResolvedValue({ id: "10000", key: "KAN" }),
      },
      issueTypes: {
        getIssueTypesForProject: vi.fn().mockResolvedValue([]),
      },
    };
  }

  it("returns cached registry when fresh without calling the API", async () => {
    saveFieldRegistry("KAN", { ...sampleRegistry, syncedAt: new Date().toISOString() });
    const client = makeSyncClient();
    await getOrSyncRegistry("KAN", client as any);
    expect(client.issueFields.getFields).not.toHaveBeenCalled();
  });

  it("syncs when registry is missing and calls onAutoSync callback", async () => {
    const client = makeSyncClient();
    const onSync = vi.fn();
    await getOrSyncRegistry("KAN", client as any, onSync);
    expect(onSync).toHaveBeenCalled();
    expect(client.issueFields.getFields).toHaveBeenCalled();
  });

  it("syncs when registry is stale and calls onAutoSync callback", async () => {
    const staleDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    saveFieldRegistry("KAN", { ...sampleRegistry, syncedAt: staleDate });
    const client = makeSyncClient();
    const onSync = vi.fn();
    await getOrSyncRegistry("KAN", client as any, onSync);
    expect(onSync).toHaveBeenCalled();
    expect(client.issueFields.getFields).toHaveBeenCalled();
  });

  it("respects a custom ttlDays — does not sync when within TTL", async () => {
    const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    saveFieldRegistry("KAN", { ...sampleRegistry, syncedAt: recentDate });
    const client = makeSyncClient();
    await getOrSyncRegistry("KAN", client as any, undefined, 3);
    expect(client.issueFields.getFields).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/jamiet/code/jira-cli && pnpm test tests/lib/fields.test.ts
```

Expected: The stale test FAILS — current `getOrSyncRegistry` returns cached stale data without syncing.

- [ ] **Step 3: Update getOrSyncRegistry in fields.ts**

Replace lines 140-151 in `src/lib/fields.ts`:

```ts
export async function getOrSyncRegistry(
	project: string,
	client: Version3Client,
	onAutoSync?: () => void,
	ttlDays = 7,
): Promise<ProjectRegistry> {
	const existing = loadFieldRegistry(project);
	if (existing && !isStale(existing, ttlDays)) return existing;
	onAutoSync?.();
	return syncFieldRegistry(project, client);
}
```

(Remove the old comment `// Returns the registry, syncing only if missing.`)

- [ ] **Step 4: Run tests to verify they all pass**

```bash
cd /home/jamiet/code/jira-cli && pnpm test tests/lib/fields.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/fields.ts tests/lib/fields.test.ts
git commit -m "feat: auto-sync registry on stale in getOrSyncRegistry"
```

---

### Task 4: Add fieldsCacheTtlDays to config

**Files:**
- Modify: `src/lib/config.ts`

- [ ] **Step 1: Update JiraConfig type and conf schema in config.ts**

In `src/lib/config.ts`, change `JiraConfig` to:

```ts
export type JiraConfig = {
	host: string;
	email: string;
	apiToken: string;
	defaultProject?: string;
	defaultBoard?: number;
	fieldsCacheTtlDays?: number;
};
```

Change the `store` declaration to add the new field to the schema:

```ts
const store = new Conf<Partial<JiraConfig>>({
	projectName: "jira-cli",
	projectSuffix: "",
	schema: {
		host: { type: "string" },
		email: { type: "string" },
		apiToken: { type: "string" },
		defaultProject: { type: "string" },
		defaultBoard: { type: "number" },
		fieldsCacheTtlDays: { type: "number" },
	},
});
```

Update `loadConfig` to read it (add after the `defaultBoard` line):

```ts
export function loadConfig(): JiraConfig {
	const host = process.env.JIRA_HOST ?? store.get("host");
	const email = process.env.JIRA_EMAIL ?? store.get("email");
	const apiToken = process.env.JIRA_API_TOKEN ?? store.get("apiToken");
	if (!host || !email || !apiToken) {
		throw new Error("Not configured. Run `jira init` to set up credentials.");
	}
	const ttlEnv = process.env.JIRA_FIELDS_TTL_DAYS;
	return {
		host,
		email,
		apiToken,
		defaultProject:
			process.env.JIRA_DEFAULT_PROJECT ?? store.get("defaultProject"),
		defaultBoard: store.get("defaultBoard"),
		fieldsCacheTtlDays: ttlEnv
			? Number.parseInt(ttlEnv, 10)
			: store.get("fieldsCacheTtlDays"),
	};
}
```

- [ ] **Step 2: Run the full test suite to verify nothing broke**

```bash
cd /home/jamiet/code/jira-cli && pnpm test
```

Expected: All existing tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/config.ts
git commit -m "feat: add fieldsCacheTtlDays config with JIRA_FIELDS_TTL_DAYS env override"
```

---

### Task 5: Update syncFieldRegistry to fetch and store issue types

**Files:**
- Modify: `src/lib/fields.ts:79-130`
- Modify: `src/commands/fields/sync.ts:33`
- Test: `tests/lib/fields.test.ts` (getOrSyncRegistry tests already cover this)
- Test: `tests/integration/fields.test.ts`

- [ ] **Step 1: Add integration test assertions for issueTypes**

In `tests/integration/fields.test.ts`, add a new test after the existing `every entry has id, name, key, and schema` test:

```ts
it("populates issueTypes with id, name, subtask fields", () => {
  const registry = loadFieldRegistry("KAN")!;
  expect(registry.issueTypes).toBeDefined();
  expect(registry.issueTypes!.length).toBeGreaterThan(0);
  for (const t of registry.issueTypes!) {
    expect(t.id).toBeTruthy();
    expect(t.name).toBeTruthy();
    expect(typeof t.subtask).toBe("boolean");
  }
});
```

- [ ] **Step 2: Run integration test to verify it fails (requires credentials)**

```bash
cd /home/jamiet/code/jira-cli && pnpm test:integration
```

Expected: The `populates issueTypes` test FAILS — registry doesn't have `issueTypes` yet.

- [ ] **Step 3: Update syncFieldRegistry in fields.ts**

Replace the `syncFieldRegistry` function body (lines 79-130 of `src/lib/fields.ts`):

```ts
export async function syncFieldRegistry(
	project: string,
	client: Version3Client,
): Promise<ProjectRegistry> {
	const rawFields = await client.issueFields.getFields();

	const fields: FieldEntry[] = [];
	for (const f of rawFields) {
		if (!f.id || !f.name || !f.schema) continue;
		const isOption = f.schema.type === "option" || f.schema.items === "option";
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
						opts.values?.flatMap((o) =>
							!o.disabled && o.value != null ? [o.value] : [],
						) ?? null;
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

	let issueTypes: IssueTypeEntry[] = [];
	try {
		const projectData = await client.projects.getProject({
			projectIdOrKey: project,
		});
		const types = await client.issueTypes.getIssueTypesForProject({
			projectId: projectData.id,
		});
		issueTypes = (types ?? [])
			.filter(
				(t): t is { id: string; name: string; subtask: boolean } =>
					typeof t.id === "string" && typeof t.name === "string",
			)
			.map((t) => ({ id: t.id, name: t.name, subtask: t.subtask ?? false }));
	} catch {
		// issue types are best-effort; leave empty on error
	}

	const registry: ProjectRegistry = {
		syncedAt: new Date().toISOString(),
		fields,
		issueTypes,
	};
	saveFieldRegistry(project, registry);
	return registry;
}
```

- [ ] **Step 4: Update fields sync command output**

In `src/commands/fields/sync.ts`, replace line 33:

```ts
this.log(
  `${registry.fields.length} fields and ${registry.issueTypes?.length ?? 0} issue types cached for ${project}.`,
);
```

- [ ] **Step 5: Run unit tests to verify nothing broke**

```bash
cd /home/jamiet/code/jira-cli && pnpm test
```

Expected: All tests PASS (the `getOrSyncRegistry` tests already include `projects.getProject` and `issueTypes.getIssueTypesForProject` in their mocks)

- [ ] **Step 6: Commit**

```bash
git add src/lib/fields.ts src/commands/fields/sync.ts tests/integration/fields.test.ts
git commit -m "feat: sync issue types into field registry during fields sync"
```

---

### Task 6: Update issue list — remove stale-warning, pass ttlDays

**Files:**
- Modify: `src/commands/issue/list.ts`

- [ ] **Step 1: Update the import in issue/list.ts**

In `src/commands/issue/list.ts`, change the fields import from:

```ts
import {
	getOrSyncRegistry,
	isStale,
	loadFieldRegistry,
	resolveField,
} from "../../lib/fields.js";
```

To:

```ts
import {
	getOrSyncRegistry,
	resolveField,
} from "../../lib/fields.js";
```

- [ ] **Step 2: Replace the stale-warning block in run()**

In `src/commands/issue/list.ts`, inside the `if (flags.custom?.length)` block, replace:

```ts
			const existing = loadFieldRegistry(project ?? "");
				if (existing && isStale(existing)) {
					this.warn(
						`Field registry for ${project} is stale. Run \`jira fields sync\` to refresh.`,
					);
				}
				const registry = await getOrSyncRegistry(project ?? "", client, () =>
					this.log(`Fetching field registry for ${project}...`),
				);
```

With:

```ts
				const registry = await getOrSyncRegistry(
					project ?? "",
					client,
					() => this.log(`Fetching field registry for ${project}...`),
					cfg.fieldsCacheTtlDays,
				);
```

Also remove the comment above it (`// Auto-sync if registry missing; warn (but proceed) if stale.`), replacing it with:

```ts
			// Resolve --custom flags to JQL clauses.
```

- [ ] **Step 3: Run tests to verify nothing broke**

```bash
cd /home/jamiet/code/jira-cli && pnpm test tests/issue/list.test.ts
```

Expected: All tests PASS

- [ ] **Step 4: Lint**

```bash
cd /home/jamiet/code/jira-cli && pnpm lint:fix
```

- [ ] **Step 5: Commit**

```bash
git add src/commands/issue/list.ts
git commit -m "refactor: remove stale-warning from issue list; auto-sync handles it"
```

---

### Task 7: Add allowEmpty to openEditor

**Files:**
- Modify: `src/lib/prompt.ts`
- Test: `tests/lib/prompt.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/lib/prompt.test.ts`, add after the `isInteractive` describe block:

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isInteractive, openEditor } from "../../src/lib/prompt.js";
```

(Update the import at the top of the file to add `openEditor`, `mkdtempSync`, `rmSync`, `writeFileSync`, `tmpdir`, `join`.)

Add a new describe block:

```ts
describe("openEditor allowEmpty", () => {
  it("throws on empty content by default", async () => {
    vi.stubEnv("EDITOR", "true"); // 'true' command exits 0 without writing
    await expect(openEditor()).rejects.toThrow(/empty input/);
    vi.unstubAllEnvs();
  });

  it("returns empty string when allowEmpty is true and editor writes nothing", async () => {
    vi.stubEnv("EDITOR", "true");
    const result = await openEditor("", true);
    expect(result).toBe("");
    vi.unstubAllEnvs();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/jamiet/code/jira-cli && pnpm test tests/lib/prompt.test.ts
```

Expected: The `allowEmpty` test FAILS

- [ ] **Step 3: Update openEditor in prompt.ts**

In `src/lib/prompt.ts`, change the `openEditor` signature and the empty-check:

```ts
export async function openEditor(template = "", allowEmpty = false): Promise<string> {
	const editor = process.env.EDITOR ?? process.env.VISUAL ?? "vi";
	const dir = mkdtempSync(join(tmpdir(), "jira-cli-"));
	const file = join(dir, "message.txt");
	try {
		writeFileSync(file, template);
		const result = spawnSync(editor, [file], { stdio: "inherit" });
		if (result.error) {
			throw result.error;
		}
		if (result.status !== 0) {
			throw new Error("Aborted: editor exited with non-zero status");
		}
		const content = readFileSync(file, "utf8").trim();
		if (!content && !allowEmpty) throw new Error("Aborted: empty input");
		return content;
	} finally {
		rmSync(dir, { recursive: true });
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/jamiet/code/jira-cli && pnpm test tests/lib/prompt.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompt.ts tests/lib/prompt.test.ts
git commit -m "feat: add allowEmpty param to openEditor for optional description input"
```

---

### Task 8: Implement issue create command

**Files:**
- Create: `src/commands/issue/create.ts`
- Create: `tests/issue/create.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/issue/create.test.ts`:

```ts
import { Config } from "@oclif/core";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import IssueCreate from "../../src/commands/issue/create.js";
import { createClient } from "../../src/lib/client.js";
import * as fieldsModule from "../../src/lib/fields.js";

vi.mock("../../src/lib/client.js");

const sampleRegistry = {
	syncedAt: new Date().toISOString(),
	fields: [],
	issueTypes: [
		{ id: "10001", name: "Story", subtask: false },
		{ id: "10002", name: "Bug", subtask: false },
	],
};

function makeMockClient() {
	return {
		issues: {
			createIssue: vi.fn().mockResolvedValue({ id: "10005", key: "KAN-5", self: "" }),
		},
		myself: {
			getCurrentUser: vi.fn().mockResolvedValue({
				accountId: "abc123",
				displayName: "Jamie Test",
			}),
		},
	};
}

let oclifConfig: Config;
beforeAll(async () => {
	oclifConfig = await Config.load({ root: join(import.meta.dirname, "../..") });
});

async function runCreate(
	argv: string[],
): Promise<{ lines: string[]; mock: ReturnType<typeof makeMockClient> }> {
	const mock = makeMockClient();
	vi.mocked(createClient).mockReturnValue(mock as any);
	const lines: string[] = [];
	const origLog = console.log.bind(console);
	console.log = (...args: unknown[]) => {
		lines.push(args.map(String).join(" "));
	};
	try {
		await IssueCreate.run(argv, oclifConfig);
	} finally {
		console.log = origLog;
	}
	return { lines, mock };
}

describe("issue create --no-input", () => {
	it("creates issue with summary and type, prints key and URL", async () => {
		const { lines, mock } = await runCreate([
			"--no-input",
			"--summary",
			"New feature",
			"--type",
			"Story",
		]);
		expect(mock.issues.createIssue).toHaveBeenCalledWith(
			expect.objectContaining({
				fields: expect.objectContaining({
					summary: "New feature",
					issuetype: { name: "Story" },
				}),
			}),
		);
		expect(lines.some((l) => l.includes("KAN-5"))).toBe(true);
		expect(lines.some((l) => l.includes("/browse/KAN-5"))).toBe(true);
	});

	it("errors when --summary is missing", async () => {
		await expect(
			runCreate(["--no-input", "--type", "Story"]),
		).rejects.toThrow(/required/);
	});

	it("errors when --type is missing", async () => {
		await expect(
			runCreate(["--no-input", "--summary", "Something"]),
		).rejects.toThrow(/required/);
	});

	it("resolves --assignee me to current user accountId", async () => {
		const { mock } = await runCreate([
			"--no-input",
			"--summary",
			"Bug fix",
			"--type",
			"Bug",
			"--assignee",
			"me",
		]);
		expect(mock.myself.getCurrentUser).toHaveBeenCalled();
		expect(mock.issues.createIssue).toHaveBeenCalledWith(
			expect.objectContaining({
				fields: expect.objectContaining({
					assignee: { id: "abc123" },
				}),
			}),
		);
	});

	it("passes --assignee accountId directly without API call", async () => {
		const { mock } = await runCreate([
			"--no-input",
			"--summary",
			"Bug fix",
			"--type",
			"Bug",
			"--assignee",
			"user456",
		]);
		expect(mock.myself.getCurrentUser).not.toHaveBeenCalled();
		expect(mock.issues.createIssue).toHaveBeenCalledWith(
			expect.objectContaining({
				fields: expect.objectContaining({ assignee: { id: "user456" } }),
			}),
		);
	});

	it("passes multiple --label flags as labels array", async () => {
		const { mock } = await runCreate([
			"--no-input",
			"--summary",
			"Labelled",
			"--type",
			"Story",
			"--label",
			"frontend",
			"--label",
			"urgent",
		]);
		expect(mock.issues.createIssue).toHaveBeenCalledWith(
			expect.objectContaining({
				fields: expect.objectContaining({ labels: ["frontend", "urgent"] }),
			}),
		);
	});

	it("passes --parent as parent key", async () => {
		const { mock } = await runCreate([
			"--no-input",
			"--summary",
			"Child",
			"--type",
			"Story",
			"--parent",
			"KAN-1",
		]);
		expect(mock.issues.createIssue).toHaveBeenCalledWith(
			expect.objectContaining({
				fields: expect.objectContaining({ parent: { key: "KAN-1" } }),
			}),
		);
	});

	it("passes --description as ADF description", async () => {
		const { mock } = await runCreate([
			"--no-input",
			"--summary",
			"With desc",
			"--type",
			"Story",
			"--description",
			"Hello world",
		]);
		const fields = mock.issues.createIssue.mock.calls[0][0].fields;
		expect(fields.description).toMatchObject({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: "Hello world" }],
				},
			],
		});
	});

	it("passes --priority as priority name", async () => {
		const { mock } = await runCreate([
			"--no-input",
			"--summary",
			"High prio",
			"--type",
			"Bug",
			"--priority",
			"High",
		]);
		expect(mock.issues.createIssue).toHaveBeenCalledWith(
			expect.objectContaining({
				fields: expect.objectContaining({ priority: { name: "High" } }),
			}),
		);
	});

	it("--raw prints the created issue as JSON", async () => {
		const { lines } = await runCreate([
			"--no-input",
			"--summary",
			"Raw",
			"--type",
			"Story",
			"--raw",
		]);
		const parsed = JSON.parse(lines.join("\n"));
		expect(parsed.key).toBe("KAN-5");
	});
});

describe("issue create --no-input (registry mocked for type selection)", () => {
	it("uses cached issue types when selecting interactively (via getOrSyncRegistry spy)", async () => {
		vi.spyOn(fieldsModule, "getOrSyncRegistry").mockResolvedValue(
			sampleRegistry as any,
		);
		// Can't test the interactive select itself in unit tests (requires TTY),
		// but verify getOrSyncRegistry is called when --type is omitted in non-no-input mode.
		// This test just ensures the spy is wired; interactive path requires E2E.
		vi.restoreAllMocks();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/jamiet/code/jira-cli && pnpm test tests/issue/create.test.ts
```

Expected: FAIL — `Cannot find module '../../src/commands/issue/create.js'`

- [ ] **Step 3: Implement src/commands/issue/create.ts**

Create `src/commands/issue/create.ts`:

```ts
import { input, select } from "@inquirer/prompts";
import { Command, Flags } from "@oclif/core";
import { textToAdf } from "../../lib/adf.js";
import { createClient } from "../../lib/client.js";
import { loadConfig } from "../../lib/config.js";
import { getIssueTypes, getOrSyncRegistry } from "../../lib/fields.js";
import { isInteractive, openEditor } from "../../lib/prompt.js";

export default class IssueCreate extends Command {
	static override description = "Create an issue";
	static override examples = [
		'<%= config.bin %> issue create -t Story -s "New feature"',
		'<%= config.bin %> issue create -t Bug -s "Login broken" -y High -a me',
		'<%= config.bin %> issue create --no-input -t Story -s "Summary" -d "Details"',
	];

	static override flags = {
		summary: Flags.string({ char: "s", description: "Issue summary" }),
		type: Flags.string({ char: "t", description: "Issue type name" }),
		description: Flags.string({ char: "d", description: "Description body text" }),
		priority: Flags.string({ char: "y", description: "Priority name (e.g. High)" }),
		assignee: Flags.string({
			char: "a",
			description: 'accountId or "me"',
		}),
		label: Flags.string({
			char: "l",
			description: "Label (repeatable)",
			multiple: true,
		}),
		parent: Flags.string({ description: "Parent issue key" }),
		project: Flags.string({
			char: "p",
			description: "Project key (defaults to configured project)",
		}),
		"no-input": Flags.boolean({
			description: "Non-interactive; --summary and --type required",
		}),
		raw: Flags.boolean({ description: "Print created issue as JSON" }),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(IssueCreate);
		const cfg = loadConfig();
		const project = flags.project ?? cfg.defaultProject;
		if (!project) {
			this.error(
				"No project specified. Use --project or set a default with `jira init`.",
			);
		}

		const interactive = isInteractive(flags["no-input"] ?? false);

		if (!interactive && (!flags.type || !flags.summary)) {
			this.error("--summary and --type are required in non-interactive mode");
		}

		const client = createClient();

		// Resolve issue type
		let issueType = flags.type;
		if (!issueType) {
			const registry = await getOrSyncRegistry(
				project,
				client,
				() => this.log(`Fetching field registry for ${project}...`),
				cfg.fieldsCacheTtlDays,
			);
			const types = getIssueTypes(registry).filter(
				(t) => !t.subtask && t.name !== "Epic",
			);
			if (types.length > 0) {
				issueType = await select({
					message: "Issue type:",
					choices: types.map((t) => ({ name: t.name, value: t.name })),
				});
			} else {
				issueType = await input({ message: "Issue type:" });
			}
		}

		// Resolve summary
		let summary = flags.summary;
		if (!summary) {
			summary = await input({
				message: "Summary:",
				validate: (v) => v.trim().length > 0 || "Summary is required",
			});
		}

		// Resolve description
		let description = flags.description;
		if (!description && interactive) {
			try {
				description = await openEditor("", true);
			} catch {
				// editor errors (non-zero exit); treat as no description
			}
			if (!description) description = undefined;
		}

		// Resolve assignee
		let assigneeId: string | undefined;
		if (flags.assignee) {
			if (flags.assignee.toLowerCase() === "me") {
				const me = await client.myself.getCurrentUser();
				assigneeId = me.accountId ?? undefined;
			} else {
				assigneeId = flags.assignee;
			}
		}

		const created = await client.issues.createIssue({
			fields: {
				summary,
				project: { key: project },
				issuetype: { name: issueType },
				...(description ? { description: textToAdf(description) } : {}),
				...(flags.priority ? { priority: { name: flags.priority } } : {}),
				...(assigneeId ? { assignee: { id: assigneeId } } : {}),
				...(flags.label?.length ? { labels: flags.label } : {}),
				...(flags.parent ? { parent: { key: flags.parent } } : {}),
			},
		});

		if (flags.raw) {
			this.log(JSON.stringify(created, null, 2));
			return;
		}

		this.log(`Created ${created.key}.\n${cfg.host}/browse/${created.key}`);
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/jamiet/code/jira-cli && pnpm test tests/issue/create.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Run the full test suite**

```bash
cd /home/jamiet/code/jira-cli && pnpm test
```

Expected: All tests PASS

- [ ] **Step 6: Lint**

```bash
cd /home/jamiet/code/jira-cli && pnpm lint:fix
```

- [ ] **Step 7: Commit**

```bash
git add src/commands/issue/create.ts tests/issue/create.test.ts
git commit -m "feat: add issue create command with interactive prompts and --no-input mode"
```

---

### Task 9: Update CLAUDE.md and parity tracker

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/parity.md`

- [ ] **Step 1: Update CLAUDE.md project layout**

In `CLAUDE.md`, under the `src/commands/issue/` section in the project layout, add:

```
    issue/create.ts
```

(after `issue/view.ts` and before `issue/assign.ts`)

- [ ] **Step 2: Update parity tracker**

In `docs/parity.md`, change the `issue create` row from:

```
| `issue create` | ⬜ |
```

To:

```
| `issue create` | ✅ |
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/parity.md
git commit -m "docs: update layout and parity tracker for issue create"
```

---

## Done

After all tasks, verify end-to-end manually:

```bash
# Non-interactive create
mise run dev -- issue create --no-input -t Story -s "Test from plan" -y High

# Interactive create (opens editor for description)
mise run dev -- issue create
```
