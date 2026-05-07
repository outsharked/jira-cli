# Issue List Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add eight missing `issue list` flags (`--label` multi-value, `--priority`, `--reporter`, `--watching`, `--created-before`, `--updated-before`, `--order-by`, `--reverse`) to reach parity with ankitpokhrel/jira-cli.

**Architecture:** Two files change. `src/lib/jql.ts` gains new fields in `JQLOptions` and corresponding clause builders. `src/commands/issue/list.ts` adds/updates flags and wires them into the `buildJql` call. Tests cover the JQL builder exhaustively; the command tests do lightweight wiring checks.

**Tech Stack:** TypeScript ESM, oclif v4 `Flags`, Vitest

---

## File map

| File | Change |
|------|--------|
| `src/lib/jql.ts` | Replace `label` with `labels[]`, add new fields/clauses, dynamic ORDER BY |
| `src/commands/issue/list.ts` | Update `--label` to multi, add 7 new flags, update `buildJql` call |
| `tests/jql/builder.test.ts` | ~14 new test cases |
| `tests/issue/list.test.ts` | ~4 new test cases |

---

### Task 1: Update JQL builder — new options and clauses

**Files:**
- Modify: `src/lib/jql.ts`
- Test: `tests/jql/builder.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `tests/jql/builder.test.ts`. Append these new describe blocks after the existing ones (keep all existing tests):

```ts
describe("buildJql — labels", () => {
  it("emits labels = for a single label", () => {
    expect(buildJql({ labels: ["bug"] })).toContain('labels = "bug"');
  });

  it("emits labels IN for multiple positive labels", () => {
    expect(buildJql({ labels: ["bug", "ui"] })).toContain(
      'labels IN ("bug", "ui")',
    );
  });

  it("emits labels NOT IN for a negated label (~prefix)", () => {
    expect(buildJql({ labels: ["~bug"] })).toContain('labels NOT IN ("bug")');
  });

  it("emits both IN and NOT IN for mixed labels", () => {
    const got = buildJql({ labels: ["bug", "~ui"] });
    expect(got).toContain('labels IN ("bug")');
    expect(got).toContain('labels NOT IN ("ui")');
  });
});

describe("buildJql — priority", () => {
  it("emits priority = value", () => {
    expect(buildJql({ priority: "High" })).toContain('priority = "High"');
  });
});

describe("buildJql — reporter", () => {
  it('maps "me" to currentUser()', () => {
    const got = buildJql({ reporter: "me" });
    expect(got).toContain("reporter = currentUser()");
    expect(got).not.toContain('"currentUser');
  });

  it("quotes email reporter", () => {
    expect(buildJql({ reporter: "user@example.com" })).toContain(
      'reporter = "user@example.com"',
    );
  });
});

describe("buildJql — watching", () => {
  it("emits issue IN watchedIssues() when watching is true", () => {
    expect(buildJql({ watching: true })).toContain(
      "issue IN watchedIssues()",
    );
  });

  it("does not emit watching clause when watching is false", () => {
    expect(buildJql({ watching: false })).not.toContain("watchedIssues");
  });
});

describe("buildJql — createdBefore / updatedBefore", () => {
  it("emits created < for createdBefore", () => {
    expect(buildJql({ createdBefore: "2026-01-01" })).toContain(
      'created < "2026-01-01"',
    );
  });

  it("emits updated < for updatedBefore", () => {
    expect(buildJql({ updatedBefore: "2026-01-01" })).toContain(
      'updated < "2026-01-01"',
    );
  });

  it("createdAfter and createdBefore coexist in the same query", () => {
    const got = buildJql({
      createdAfter: "2025-01-01",
      createdBefore: "2026-01-01",
    });
    expect(got).toContain('created >= "2025-01-01"');
    expect(got).toContain('created < "2026-01-01"');
  });
});

describe("buildJql — orderBy / orderDirection", () => {
  it("uses updated DESC by default", () => {
    expect(buildJql({ project: "DAR" }).endsWith("ORDER BY updated DESC")).toBe(
      true,
    );
  });

  it("uses custom orderBy field", () => {
    expect(
      buildJql({ project: "DAR", orderBy: "created" }).endsWith(
        "ORDER BY created DESC",
      ),
    ).toBe(true);
  });

  it("uses ASC when orderDirection is ASC", () => {
    expect(
      buildJql({ project: "DAR", orderDirection: "ASC" }).endsWith(
        "ORDER BY updated ASC",
      ),
    ).toBe(true);
  });
});

describe("buildJql — clause order (watching before project)", () => {
  it("watching clause appears before project clause", () => {
    const got = buildJql({ project: "DAR", watching: true });
    expect(got.indexOf("watchedIssues")).toBeLessThan(got.indexOf("project"));
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
cd /home/jamiet/code/jira-cli && pnpm test tests/jql/builder.test.ts
```

Expected: new tests FAIL — `labels`, `priority`, `reporter`, `watching`, `createdBefore`, `updatedBefore`, `orderBy`, `orderDirection` not in `JQLOptions`.

- [ ] **Step 3: Replace `JQLOptions` and `buildJql` in `src/lib/jql.ts`**

Replace the entire file content with:

```ts
// Port of internal/jql/builder.go from
// bitbucket.build.dkinternal.com/projects/CLI/repos/jira-cloud-cli.
//
// All user-supplied values are double-quoted in the output; special characters
// (double-quote and backslash) are escaped inside quoted values. This prevents
// JQL injection from arbitrary input.

export type JQLOptions = {
	project?: string;
	assignee?: string;
	reporter?: string;
	status?: string;
	sprint?: string;
	issueType?: string;
	epic?: string;
	labels?: string[];
	priority?: string;
	watching?: boolean;
	createdAfter?: string;
	createdBefore?: string;
	updatedAfter?: string;
	updatedBefore?: string;
	unresolved?: boolean;
	resolved?: boolean;
	customFields?: Array<{ fieldName: string; value: string }>;
	orderBy?: string;
	orderDirection?: "ASC" | "DESC";
};

export function buildJql(opts: JQLOptions): string {
	const clauses: string[] = [];

	if (opts.watching) {
		clauses.push("issue IN watchedIssues()");
	}

	if (opts.project) {
		clauses.push(`project = ${quoteIdent(opts.project)}`);
	}

	if (opts.assignee) {
		if (opts.assignee.toLowerCase() === "me") {
			clauses.push("assignee = currentUser()");
		} else {
			clauses.push(`assignee = ${quoteValue(opts.assignee)}`);
		}
	}

	if (opts.reporter) {
		if (opts.reporter.toLowerCase() === "me") {
			clauses.push("reporter = currentUser()");
		} else {
			clauses.push(`reporter = ${quoteValue(opts.reporter)}`);
		}
	}

	if (opts.status) {
		const canonical = mapStatus(opts.status);
		clauses.push(`status = ${quoteValue(canonical)}`);
	}

	if (opts.sprint) {
		if (opts.sprint.toLowerCase() === "active") {
			clauses.push("sprint IN openSprints()");
		} else {
			clauses.push(`sprint = ${quoteValue(opts.sprint)}`);
		}
	}

	if (opts.issueType) {
		clauses.push(`issuetype = ${quoteValue(opts.issueType)}`);
	}

	if (opts.epic) {
		clauses.push(`"Epic Link" = ${quoteValue(opts.epic)}`);
	}

	if (opts.labels?.length) {
		const positive = opts.labels.filter((l) => !l.startsWith("~"));
		const negative = opts.labels
			.filter((l) => l.startsWith("~"))
			.map((l) => l.slice(1));
		if (positive.length === 1) {
			clauses.push(`labels = ${quoteValue(positive[0])}`);
		} else if (positive.length > 1) {
			clauses.push(`labels IN (${positive.map(quoteValue).join(", ")})`);
		}
		if (negative.length === 1) {
			clauses.push(`labels NOT IN (${quoteValue(negative[0])})`);
		} else if (negative.length > 1) {
			clauses.push(`labels NOT IN (${negative.map(quoteValue).join(", ")})`);
		}
	}

	if (opts.priority) {
		clauses.push(`priority = ${quoteValue(opts.priority)}`);
	}

	if (opts.unresolved) {
		clauses.push("resolution IS EMPTY");
	} else if (opts.resolved) {
		clauses.push("resolution IS NOT EMPTY");
	}

	if (opts.createdAfter) {
		clauses.push(`created >= ${quoteValue(opts.createdAfter)}`);
	}
	if (opts.createdBefore) {
		clauses.push(`created < ${quoteValue(opts.createdBefore)}`);
	}
	if (opts.updatedAfter) {
		clauses.push(`updated >= ${quoteValue(opts.updatedAfter)}`);
	}
	if (opts.updatedBefore) {
		clauses.push(`updated < ${quoteValue(opts.updatedBefore)}`);
	}

	for (const cf of opts.customFields ?? []) {
		clauses.push(`${quoteValue(cf.fieldName)} = ${quoteValue(cf.value)}`);
	}

	if (clauses.length === 0) return "";
	const orderBy = opts.orderBy ?? "updated";
	const dir = opts.orderDirection ?? "DESC";
	return `${clauses.join(" AND ")} ORDER BY ${orderBy} ${dir}`;
}

function mapStatus(s: string): string {
	switch (s.toLowerCase().replace(/-/g, "")) {
		case "todo":
			return "To Do";
		case "inprogress":
			return "In Progress";
		case "done":
			return "Done";
		default:
			return s;
	}
}

function quoteValue(s: string): string {
	const escaped = s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	return `"${escaped}"`;
}

function quoteIdent(s: string): string {
	if (/^[A-Za-z0-9._-]+$/.test(s)) return s;
	return quoteValue(s);
}
```

- [ ] **Step 4: Run tests to verify they all pass**

```bash
cd /home/jamiet/code/jira-cli && pnpm test tests/jql/builder.test.ts
```

Expected: All tests PASS (existing 23 + ~14 new).

Note: the existing `'appends ORDER BY updated DESC'` test uses `.endsWith('ORDER BY updated DESC')` which still passes since `orderBy` defaults to `"updated"` and `orderDirection` defaults to `"DESC"`.

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
cd /home/jamiet/code/jira-cli && pnpm test
```

Expected: All tests PASS. (`list.ts` passes `label: flags.label` to `buildJql` — TypeScript accepts this as an unknown property at runtime; it's silently ignored until Task 2 cleans it up.)

- [ ] **Step 6: Commit**

```bash
cd /home/jamiet/code/jira-cli && git add src/lib/jql.ts tests/jql/builder.test.ts
git commit -m "feat: add labels, priority, reporter, watching, date-before, order-by to JQL builder"
```

---

### Task 2: Update issue list command — new flags and wiring

**Files:**
- Modify: `src/commands/issue/list.ts`
- Test: `tests/issue/list.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `tests/issue/list.test.ts`. Add these describe blocks after the existing ones:

```ts
describe("issue list --watching", () => {
	it("generates issue IN watchedIssues() in JQL", async () => {
		const { jql } = await runList(["--watching"]);
		expect(jql).toContain("issue IN watchedIssues()");
	});
});

describe("issue list --label (multi)", () => {
	it("passes multiple labels to JQL builder", async () => {
		const { jql } = await runList(["-l", "bug", "-l", "ui"]);
		expect(jql).toContain('labels IN ("bug", "ui")');
	});

	it("passes a single label to JQL builder", async () => {
		const { jql } = await runList(["-l", "urgent"]);
		expect(jql).toContain('labels = "urgent"');
	});
});

describe("issue list --reverse / --order-by", () => {
	it("--reverse produces ORDER BY updated ASC", async () => {
		const { jql } = await runList(["--reverse"]);
		expect(jql).toMatch(/ORDER BY updated ASC$/);
	});

	it("--order-by created produces ORDER BY created DESC", async () => {
		const { jql } = await runList(["--order-by", "created"]);
		expect(jql).toMatch(/ORDER BY created DESC$/);
	});
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
cd /home/jamiet/code/jira-cli && pnpm test tests/issue/list.test.ts
```

Expected: new tests FAIL — `--watching`, multi `--label`, `--reverse`, `--order-by` not defined as flags yet; the `--label` test fails because single-value label doesn't produce `labels IN (...)`.

- [ ] **Step 3: Update `src/commands/issue/list.ts`**

Replace the `static override flags = { ... }` block and the `buildJql(...)` call. The full updated file:

```ts
import { Command, Flags } from "@oclif/core";
import Table from "cli-table3";
import { createClient } from "../../lib/client.js";
import { loadConfig } from "../../lib/config.js";
import { getOrSyncRegistry, resolveField } from "../../lib/fields.js";
import { buildJql } from "../../lib/jql.js";

export default class IssueList extends Command {
	static override description = "List and search issues";
	static override examples = [
		"<%= config.bin %> issue list -a me -y High -s todo",
		"<%= config.bin %> issue list --created-after -7d --plain",
		"<%= config.bin %> issue list --sprint active",
		'<%= config.bin %> issue list -q "project = KAN AND labels = urgent ORDER BY created DESC"',
	];

	static override flags = {
		project: Flags.string({
			char: "p",
			description: "Project key (defaults to configured project)",
		}),
		assignee: Flags.string({
			char: "a",
			description: 'Assignee (accountId, email, or "me")',
		}),
		reporter: Flags.string({
			char: "r",
			description: 'Reporter (accountId, email, or "me")',
		}),
		status: Flags.string({
			char: "s",
			description: "Status (todo / in-progress / done or a custom name)",
		}),
		sprint: Flags.string({ description: 'Sprint name or "active"' }),
		type: Flags.string({ char: "t", description: "Issue type" }),
		epic: Flags.string({ description: "Parent epic key" }),
		label: Flags.string({
			char: "l",
			description: "Label (repeatable; prefix with ~ to exclude)",
			multiple: true,
		}),
		priority: Flags.string({
			char: "y",
			description: "Priority (e.g. High)",
		}),
		watching: Flags.boolean({
			char: "w",
			description: "Issues you are watching",
		}),
		"created-after": Flags.string({
			description: "Created on/after (e.g. -7d)",
		}),
		"created-before": Flags.string({
			description: "Created before (e.g. 2026-01-01)",
		}),
		"updated-after": Flags.string({ description: "Updated on/after" }),
		"updated-before": Flags.string({
			description: "Updated before (e.g. 2026-01-01)",
		}),
		"order-by": Flags.string({
			description: 'Field to order by (default: "updated")',
		}),
		reverse: Flags.boolean({ description: "Reverse order (ASC instead of DESC)" }),
		unresolved: Flags.boolean({
			description: "Only issues with no resolution",
		}),
		resolved: Flags.boolean({ description: "Only issues with a resolution" }),
		limit: Flags.integer({ description: "Max issues to fetch", default: 100 }),
		plain: Flags.boolean({ description: "Plain tab-separated output" }),
		raw: Flags.boolean({ description: "Raw JSON output" }),
		csv: Flags.boolean({ description: "CSV output" }),
		"no-headers": Flags.boolean({
			description: "Omit header row in plain/csv modes",
		}),
		custom: Flags.string({
			description:
				'Custom field filter, format: "fieldName=value" (repeatable)',
			multiple: true,
		}),
		jql: Flags.string({
			char: "q",
			description: "Raw JQL query (overrides all filter flags)",
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(IssueList);
		const cfg = loadConfig();
		const project = flags.project ?? cfg.defaultProject;

		// Create client once; reused for both field registry and issue search.
		const client = createClient();

		// --jql overrides all filter flags; skip registry resolution and JQL building.
		let jql: string;
		if (flags.jql) {
			jql = flags.jql;
		} else {
			// Resolve --custom flags to JQL clauses.
			const customFields: Array<{ fieldName: string; value: string }> = [];
			if (flags.custom?.length) {
				const registry = await getOrSyncRegistry(
					project ?? "",
					client,
					() => this.log(`Fetching field registry for ${project}...`),
					cfg.fieldsCacheTtlDays,
				);
				for (const raw of flags.custom) {
					const eqIdx = raw.indexOf("=");
					if (eqIdx === -1)
						this.error(
							`Invalid --custom value "${raw}": expected format "fieldName=value"`,
						);
					const nameOrId = raw.slice(0, eqIdx).trim();
					const value = raw.slice(eqIdx + 1).trim();
					const entry = resolveField(registry, nameOrId);
					if (!entry)
						this.error(
							`Unknown field "${nameOrId}". Run \`jira fields list\` to see available fields.`,
						);
					customFields.push({ fieldName: entry.name, value });
				}
			}

			jql = buildJql({
				project,
				assignee: flags.assignee,
				reporter: flags.reporter,
				status: flags.status,
				sprint: flags.sprint,
				issueType: flags.type,
				epic: flags.epic,
				labels: flags.label,
				priority: flags.priority,
				watching: flags.watching,
				createdAfter: flags["created-after"],
				createdBefore: flags["created-before"],
				updatedAfter: flags["updated-after"],
				updatedBefore: flags["updated-before"],
				orderBy: flags["order-by"],
				orderDirection: flags.reverse ? "ASC" : undefined,
				unresolved: flags.unresolved,
				resolved: flags.resolved,
				customFields,
			});
		}

		const res =
			await client.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
				jql,
				maxResults: flags.limit,
				fields: ["summary", "status", "priority", "issuetype", "assignee"],
			});

		const rows = (res.issues ?? []).map((i) => {
			const f = i.fields as Record<
				string,
				{ name?: string; displayName?: string } | undefined
			>;
			return {
				key: i.key ?? "",
				type: f.issuetype?.name ?? "",
				status: f.status?.name ?? "",
				priority: f.priority?.name ?? "",
				assignee: f.assignee?.displayName ?? "",
				summary: (i.fields as { summary?: string }).summary ?? "",
			};
		});

		if (flags.raw) {
			this.log(JSON.stringify(res.issues ?? [], null, 2));
			return;
		}

		const headers = [
			"KEY",
			"TYPE",
			"STATUS",
			"PRIORITY",
			"ASSIGNEE",
			"SUMMARY",
		];
		const lines = rows.map((r) => [
			r.key,
			r.type,
			r.status,
			r.priority,
			r.assignee,
			r.summary,
		]);

		if (flags.csv) {
			const csvCell = (v: string) =>
				/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
			if (!flags["no-headers"]) this.log(headers.join(","));
			for (const row of lines) this.log(row.map(csvCell).join(","));
			return;
		}

		if (flags.plain || !process.stdout.isTTY) {
			if (!flags["no-headers"]) this.log(headers.join("\t"));
			for (const row of lines) this.log(row.join("\t"));
			return;
		}

		const table = new Table({ head: headers, style: { head: ["cyan"] } });
		for (const row of lines) table.push(row);
		this.log(table.toString());
		this.log(`\n${rows.length} issue${rows.length === 1 ? "" : "s"}`);
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/jamiet/code/jira-cli && pnpm test tests/issue/list.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Run the full suite**

```bash
cd /home/jamiet/code/jira-cli && pnpm test
```

Expected: All tests PASS.

- [ ] **Step 6: Lint**

```bash
cd /home/jamiet/code/jira-cli && pnpm lint:fix
```

- [ ] **Step 7: Commit**

```bash
cd /home/jamiet/code/jira-cli && git add src/commands/issue/list.ts tests/issue/list.test.ts
git commit -m "feat: add --label multi, --priority, --reporter, --watching, --created-before, --updated-before, --order-by, --reverse to issue list"
```

---

### Task 3: Update parity tracker

**Files:**
- Modify: `docs/parity.md`

- [ ] **Step 1: Update parity rows**

In `docs/parity.md`, make these changes:

Change `| \`-y\` priority | ⬜ |` to `| \`-y\` priority | ✅ |`

Change `| \`-l\` label (multi) | 🚧 | single label only |` to `| \`-l\` label (multi) | ✅ | |`

Change `| \`-r\` reporter | ⬜ |` to `| \`-r\` reporter | ✅ | |`

Change `| \`--order-by\` / \`--reverse\` | ⬜ | hardcoded \`ORDER BY updated DESC\` |` to `| \`--order-by\` / \`--reverse\` | ✅ | |`

Change `| \`-w\` watching | ⬜ |` to `| \`-w\` watching | ✅ | |`

Change `| \`--created\` / \`--created-before\` | 🚧 | \`--created-after\` done; \`--created-before\` not done |` to `| \`--created\` / \`--created-before\` | ✅ | |`

Change `| \`--updated\` / \`--updated-before\` | 🚧 | \`--updated-after\` done; \`--updated-before\` not done |` to `| \`--updated\` / \`--updated-before\` | ✅ | |`

- [ ] **Step 2: Commit**

```bash
cd /home/jamiet/code/jira-cli && git add docs/parity.md
git commit -m "docs: mark quick-win flags as done in parity tracker"
```

---

## Done

After all tasks, verify manually:

```bash
# Multi-label
mise run dev -- issue list -l bug -l ui --plain

# Watching
mise run dev -- issue list -w --plain

# Priority + reporter
mise run dev -- issue list -y High -r me --plain

# Date range
mise run dev -- issue list --created-after -30d --created-before 2026-04-01 --plain

# Reverse order
mise run dev -- issue list --reverse --plain
```
