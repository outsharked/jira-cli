# Issue Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `jira issue edit KEY` to update summary, description, priority, assignee, labels, and parent on an existing issue.

**Architecture:** A new thin command at `src/commands/issue/edit.ts`. It fetches the current issue first (for interactive pre-fill and label merging), builds a `fields` object containing only changed keys, then calls `client.issues.editIssue()`. Follows the same `isInteractive` / `openEditor` pattern as `issue create`.

**Tech Stack:** oclif v4, jira.js v5 (`Version3Client`), @inquirer/prompts, Vitest

---

## File Map

| File | Action |
|------|--------|
| `src/commands/issue/edit.ts` | Create — new command |
| `tests/issue/edit.test.ts` | Create — unit tests |
| `docs/parity.md` | Modify — mark `issue edit` ✅ |

---

### Task 1: Test file + command skeleton

**Files:**
- Create: `tests/issue/edit.test.ts`
- Create: `src/commands/issue/edit.ts`

Write all tests first, then create a minimal stub that compiles but throws so every test fails with a clear message.

- [ ] **Step 1: Write `tests/issue/edit.test.ts`**

```ts
import { join } from "node:path";
import { Config } from "@oclif/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import IssueEdit from "../../src/commands/issue/edit.js";
import { createClient } from "../../src/lib/client.js";

vi.mock("../../src/lib/client.js");

function makeMockClient() {
	return {
		issues: {
			getIssue: vi.fn().mockResolvedValue({
				fields: {
					summary: "Original summary",
					description: {
						type: "doc",
						version: 1,
						content: [
							{
								type: "paragraph",
								content: [{ type: "text", text: "Original body" }],
							},
						],
					},
					labels: ["urgent", "other"],
					priority: { name: "Medium" },
					parent: null,
				},
			}),
			editIssue: vi.fn().mockResolvedValue(undefined),
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
	vi.stubEnv("JIRA_DEFAULT_PROJECT", "KAN");
	vi.stubEnv("JIRA_HOST", "https://test.atlassian.net");
	vi.stubEnv("JIRA_EMAIL", "test@example.com");
	vi.stubEnv("JIRA_API_TOKEN", "test-token");
	oclifConfig = await Config.load({ root: join(import.meta.dirname, "../..") });
});

afterAll(() => {
	vi.unstubAllEnvs();
});

async function runEdit(
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
		await IssueEdit.run(argv, oclifConfig);
	} finally {
		console.log = origLog;
	}
	return { lines, mock };
}

describe("issue edit --no-input", () => {
	it("updates summary only; does not send unrequested fields", async () => {
		const { lines, mock } = await runEdit([
			"KAN-1",
			"--no-input",
			"--summary",
			"New title",
		]);
		expect(mock.issues.editIssue).toHaveBeenCalledWith(
			expect.objectContaining({
				issueIdOrKey: "KAN-1",
				fields: expect.objectContaining({ summary: "New title" }),
			}),
		);
		expect(mock.issues.editIssue.mock.calls[0][0].fields).not.toHaveProperty(
			"labels",
		);
		expect(lines.some((l) => l.includes("Updated KAN-1"))).toBe(true);
		expect(
			lines.some((l) => l.includes("https://test.atlassian.net/browse/KAN-1")),
		).toBe(true);
	});

	it("updates priority only; does not send summary", async () => {
		const { mock } = await runEdit(["KAN-1", "--no-input", "--priority", "High"]);
		expect(mock.issues.editIssue).toHaveBeenCalledWith(
			expect.objectContaining({
				fields: expect.objectContaining({ priority: { name: "High" } }),
			}),
		);
		expect(mock.issues.editIssue.mock.calls[0][0].fields).not.toHaveProperty(
			"summary",
		);
	});

	it("resolves --assignee me to currentUser accountId", async () => {
		const { mock } = await runEdit([
			"KAN-1",
			"--no-input",
			"--assignee",
			"me",
		]);
		expect(mock.myself.getCurrentUser).toHaveBeenCalled();
		expect(mock.issues.editIssue).toHaveBeenCalledWith(
			expect.objectContaining({
				fields: expect.objectContaining({
					assignee: { accountId: "abc123" },
				}),
			}),
		);
	});

	it("unassigns with --assignee x without calling getCurrentUser", async () => {
		const { mock } = await runEdit([
			"KAN-1",
			"--no-input",
			"--assignee",
			"x",
		]);
		expect(mock.myself.getCurrentUser).not.toHaveBeenCalled();
		expect(mock.issues.editIssue).toHaveBeenCalledWith(
			expect.objectContaining({
				fields: expect.objectContaining({ assignee: { accountId: null } }),
			}),
		);
	});

	it("appends and removes labels from existing set", async () => {
		// existing: ["urgent", "other"]; +bug -urgent → ["other", "bug"]
		const { mock } = await runEdit([
			"KAN-1",
			"--no-input",
			"--label",
			"bug",
			"--label",
			"-urgent",
		]);
		const labels = mock.issues.editIssue.mock.calls[0][0].fields
			.labels as string[];
		expect(labels).toContain("other");
		expect(labels).toContain("bug");
		expect(labels).not.toContain("urgent");
	});

	it("errors when no field flags provided with --no-input", async () => {
		await expect(runEdit(["KAN-1", "--no-input"])).rejects.toThrow(
			/At least one field flag/,
		);
	});
});
```

- [ ] **Step 2: Create `src/commands/issue/edit.ts` stub**

```ts
import { Args, Command, Flags } from "@oclif/core";

export default class IssueEdit extends Command {
	static override description = "Edit an issue";

	static override args = {
		key: Args.string({ description: "Issue key (e.g. KAN-1)", required: true }),
	};

	static override flags = {
		summary: Flags.string({ char: "s", description: "New summary" }),
		description: Flags.string({ char: "d", description: "New description body" }),
		priority: Flags.string({ char: "y", description: "Priority name (e.g. High)" }),
		assignee: Flags.string({
			char: "a",
			description: 'accountId, "me" to self-assign, "x" to unassign',
		}),
		label: Flags.string({
			char: "l",
			description: "Append label; prefix with - to remove (repeatable)",
			multiple: true,
		}),
		parent: Flags.string({ char: "P", description: "Parent issue key" }),
		"no-input": Flags.boolean({
			description: "Skip prompts; at least one field flag required",
		}),
	};

	async run(): Promise<void> {
		throw new Error("not implemented");
	}
}
```

- [ ] **Step 3: Run tests to confirm they all fail**

```bash
mise run test -- tests/issue/edit.test.ts
```

Expected: all 6 tests FAIL with "not implemented" or similar.

- [ ] **Step 4: Commit the test file and stub**

```bash
git add tests/issue/edit.test.ts src/commands/issue/edit.ts
git commit -m "test: add issue edit tests + command stub"
```

---

### Task 2: Implement the full command

**Files:**
- Modify: `src/commands/issue/edit.ts`

Replace the stub `run()` with the complete implementation. Tests drive the order.

- [ ] **Step 1: Replace `run()` with complete implementation**

Replace the entire file contents with:

```ts
import { input } from "@inquirer/prompts";
import { Args, Command, Flags } from "@oclif/core";
import { renderAdf, textToAdf } from "../../lib/adf.js";
import { createClient } from "../../lib/client.js";
import { loadConfig } from "../../lib/config.js";
import { isInteractive, openEditor } from "../../lib/prompt.js";

export default class IssueEdit extends Command {
	static override description = "Edit an issue";
	static override examples = [
		'<%= config.bin %> issue edit KAN-1 --summary "New title"',
		"<%= config.bin %> issue edit KAN-1 --label bug --label -urgent",
		"<%= config.bin %> issue edit KAN-1 --assignee me",
		"<%= config.bin %> issue edit KAN-1 --no-input --priority High",
	];

	static override args = {
		key: Args.string({ description: "Issue key (e.g. KAN-1)", required: true }),
	};

	static override flags = {
		summary: Flags.string({ char: "s", description: "New summary" }),
		description: Flags.string({ char: "d", description: "New description body" }),
		priority: Flags.string({
			char: "y",
			description: "Priority name (e.g. High)",
		}),
		assignee: Flags.string({
			char: "a",
			description: 'accountId, "me" to self-assign, "x" to unassign',
		}),
		label: Flags.string({
			char: "l",
			description: "Append label; prefix with - to remove (repeatable)",
			multiple: true,
		}),
		parent: Flags.string({ char: "P", description: "Parent issue key" }),
		"no-input": Flags.boolean({
			description: "Skip prompts; at least one field flag required",
		}),
	};

	async run(): Promise<void> {
		const { args, flags } = await this.parse(IssueEdit);
		const cfg = loadConfig();
		const interactive = isInteractive(flags["no-input"] ?? false);

		const noFieldFlags =
			!flags.summary &&
			!flags.description &&
			!flags.priority &&
			!flags.assignee &&
			!(flags.label?.length) &&
			!flags.parent;

		if (!interactive && noFieldFlags) {
			this.error(
				"At least one field flag is required with --no-input",
			);
		}

		const client = createClient();
		const issue = await client.issues.getIssue({
			issueIdOrKey: args.key,
			fields: ["summary", "description", "labels", "priority", "parent"],
		});

		let summary = flags.summary;
		if (!summary && interactive) {
			summary = await input({
				message: "Summary:",
				default: (issue.fields?.summary as string | undefined) ?? "",
			});
		}

		let description = flags.description;
		if (!description && interactive) {
			const existing = renderAdf(issue.fields?.description) ?? "";
			try {
				description = await openEditor(existing, true);
			} catch {
				// editor abort; no description change
			}
			if (!description) description = undefined;
		}

		let assigneeField: { accountId: string | null } | undefined;
		if (flags.assignee) {
			if (flags.assignee.toLowerCase() === "me") {
				const me = await client.myself.getCurrentUser();
				if (!me.accountId) {
					this.error("Could not resolve your account ID from Jira");
				}
				assigneeField = { accountId: me.accountId };
			} else if (flags.assignee === "x") {
				assigneeField = { accountId: null };
			} else {
				assigneeField = { accountId: flags.assignee };
			}
		}

		let labelsField: string[] | undefined;
		if (flags.label?.length) {
			const existing = (issue.fields?.labels as string[]) ?? [];
			const positives = flags.label.filter((l) => !l.startsWith("-"));
			const removals = new Set(
				flags.label
					.filter((l) => l.startsWith("-"))
					.map((l) => l.slice(1)),
			);
			labelsField = [
				...new Set([...existing, ...positives]),
			].filter((l) => !removals.has(l));
		}

		const fields: Record<string, unknown> = {};
		if (summary) fields.summary = summary;
		if (description) fields.description = textToAdf(description);
		if (flags.priority) fields.priority = { name: flags.priority };
		if (assigneeField !== undefined) fields.assignee = assigneeField;
		if (labelsField !== undefined) fields.labels = labelsField;
		if (flags.parent) fields.parent = { key: flags.parent };

		await client.issues.editIssue({ issueIdOrKey: args.key, fields });

		this.log(`Updated ${args.key}.\n${cfg.host}/browse/${args.key}`);
	}
}
```

- [ ] **Step 2: Run the tests**

```bash
mise run test -- tests/issue/edit.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 3: Run the full test suite to check for regressions**

```bash
mise run test
```

Expected: all tests pass, no regressions.

- [ ] **Step 4: Run the linter**

```bash
mise run lint:fix
```

- [ ] **Step 5: Commit**

```bash
git add src/commands/issue/edit.ts
git commit -m "feat: add issue edit command"
```

---

### Task 3: Update parity tracker

**Files:**
- Modify: `docs/parity.md`

- [ ] **Step 1: Mark `issue edit` done in parity.md**

In `docs/parity.md`, find the line:

```
| `issue edit KEY` | ⬜ |
```

Replace with:

```
| `issue edit KEY` | ✅ |
```

- [ ] **Step 2: Commit**

```bash
git add docs/parity.md
git commit -m "docs: mark issue edit as done in parity tracker"
```
