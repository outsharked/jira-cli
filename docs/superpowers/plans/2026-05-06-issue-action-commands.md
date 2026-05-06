# Issue Action Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `issue assign`, `issue move`, and `issue comment add` commands, backed by shared `adf.ts` and `prompt.ts` libs that enforce a consistent interactive/non-interactive pattern across all action commands.

**Architecture:** Extract `renderAdf`/`textToAdf` to `src/lib/adf.ts` and interactive-detection/editor-spawn to `src/lib/prompt.ts`. Commands are thin oclif wrappers that parse flags, call lib helpers and the Jira API, and print a one-line result. The `--no-input` flag (plus non-TTY detection) disables all prompts and forces hard errors on missing required inputs.

**Tech Stack:** TypeScript ESM, oclif v4, jira.js v5, `@inquirer/prompts` (already a dependency), Vitest, Biome (tabs, double quotes).

---

## File Map

| File | Status | Purpose |
|------|--------|---------|
| `src/lib/adf.ts` | Create | `renderAdf` (ADF → text) + `textToAdf` (text → ADF doc) |
| `src/lib/prompt.ts` | Create | `isInteractive()` + `openEditor()` |
| `src/commands/issue/view.ts` | Modify | Replace inline `renderDescription` with `renderAdf` import |
| `src/commands/issue/assign.ts` | Create | `jira issue assign` |
| `src/commands/issue/move.ts` | Create | `jira issue move` |
| `src/commands/issue/comment/add.ts` | Create | `jira issue comment add` |
| `tests/lib/adf.test.ts` | Create | Unit tests for adf.ts |
| `tests/lib/prompt.test.ts` | Create | Unit tests for prompt.ts |
| `tests/issue/assign.test.ts` | Create | Unit tests for assign command |
| `tests/issue/move.test.ts` | Create | Unit tests for move command |
| `tests/issue/comment/add.test.ts` | Create | Unit tests for comment add command |
| `tests/integration/issue-actions.test.ts` | Create | Integration smoke tests |
| `docs/parity.md` | Modify | Mark view/assign/move/comment ✅ |
| `CLAUDE.md` | Modify | Add design patterns section |

---

## Task 1: `src/lib/adf.ts` — ADF rendering and construction

**Files:**
- Create: `src/lib/adf.ts`
- Create: `tests/lib/adf.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/lib/adf.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderAdf, textToAdf } from "../../src/lib/adf.js";

describe("renderAdf", () => {
	it("returns empty string for null", () => {
		expect(renderAdf(null)).toBe("");
	});
	it("returns stringified value for a non-object primitive", () => {
		expect(renderAdf("hello")).toBe("hello");
	});
	it("returns the text property for a text node", () => {
		expect(renderAdf({ type: "text", text: "hello" })).toBe("hello");
	});
	it("joins paragraph content with newlines", () => {
		expect(
			renderAdf({
				type: "paragraph",
				content: [
					{ type: "text", text: "hello" },
					{ type: "text", text: "world" },
				],
			}),
		).toBe("hello\nworld");
	});
	it("joins non-paragraph content without separator", () => {
		expect(
			renderAdf({
				type: "doc",
				content: [
					{ type: "text", text: "a" },
					{ type: "text", text: "b" },
				],
			}),
		).toBe("ab");
	});
	it("handles nested paragraphs inside a doc", () => {
		expect(
			renderAdf({
				type: "doc",
				content: [
					{ type: "paragraph", content: [{ type: "text", text: "line one" }] },
					{ type: "paragraph", content: [{ type: "text", text: "line two" }] },
				],
			}),
		).toBe("line one\nline two");
	});
	it("returns empty string for a node with no content and no text", () => {
		expect(renderAdf({ type: "hardBreak" })).toBe("");
	});
});

describe("textToAdf", () => {
	it("produces a doc > paragraph > text structure", () => {
		const doc = textToAdf("hello world") as any;
		expect(doc.type).toBe("doc");
		expect(doc.version).toBe(1);
		expect(doc.content[0].type).toBe("paragraph");
		expect(doc.content[0].content[0].type).toBe("text");
		expect(doc.content[0].content[0].text).toBe("hello world");
	});
	it("preserves the text content exactly", () => {
		const text = "multi\nline";
		expect((textToAdf(text) as any).content[0].content[0].text).toBe(text);
	});
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test tests/lib/adf.test.ts
```

Expected: `Cannot find module '../../src/lib/adf.js'`

- [ ] **Step 3: Create `src/lib/adf.ts`**

```ts
export function renderAdf(doc: unknown): string {
	if (!doc || typeof doc !== "object") return String(doc ?? "");
	const node = doc as { type?: string; text?: string; content?: unknown[] };
	if (node.type === "text") return node.text ?? "";
	if (Array.isArray(node.content)) {
		return node.content
			.map(renderAdf)
			.join(node.type === "paragraph" ? "\n" : "");
	}
	return "";
}

export function textToAdf(text: string): object {
	return {
		type: "doc",
		version: 1,
		content: [
			{
				type: "paragraph",
				content: [{ type: "text", text }],
			},
		],
	};
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm test tests/lib/adf.test.ts
```

Expected: 9/9 pass.

- [ ] **Step 5: Run lint fix**

```bash
pnpm lint:fix
```

- [ ] **Step 6: Run full suite to confirm no regressions**

```bash
pnpm test
```

---

## Task 2: `src/lib/prompt.ts` + refactor `view.ts`

**Files:**
- Create: `src/lib/prompt.ts`
- Create: `tests/lib/prompt.test.ts`
- Modify: `src/commands/issue/view.ts`

- [ ] **Step 1: Write failing tests for `isInteractive`**

Create `tests/lib/prompt.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { isInteractive } from "../../src/lib/prompt.js";

describe("isInteractive", () => {
	const origStdin = process.stdin.isTTY;
	const origStdout = process.stdout.isTTY;

	afterEach(() => {
		Object.defineProperty(process.stdin, "isTTY", {
			value: origStdin,
			configurable: true,
		});
		Object.defineProperty(process.stdout, "isTTY", {
			value: origStdout,
			configurable: true,
		});
	});

	function setTTY(stdin: boolean, stdout: boolean) {
		Object.defineProperty(process.stdin, "isTTY", {
			value: stdin,
			configurable: true,
		});
		Object.defineProperty(process.stdout, "isTTY", {
			value: stdout,
			configurable: true,
		});
	}

	it("returns true when noInput is false and both are TTYs", () => {
		setTTY(true, true);
		expect(isInteractive(false)).toBe(true);
	});
	it("returns false when noInput is true", () => {
		setTTY(true, true);
		expect(isInteractive(true)).toBe(false);
	});
	it("returns false when stdin is not a TTY", () => {
		setTTY(false, true);
		expect(isInteractive(false)).toBe(false);
	});
	it("returns false when stdout is not a TTY", () => {
		setTTY(true, false);
		expect(isInteractive(false)).toBe(false);
	});
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test tests/lib/prompt.test.ts
```

Expected: `Cannot find module '../../src/lib/prompt.js'`

- [ ] **Step 3: Create `src/lib/prompt.ts`**

```ts
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function isInteractive(noInput: boolean): boolean {
	return (
		!noInput &&
		process.stdin.isTTY === true &&
		process.stdout.isTTY === true
	);
}

export async function openEditor(template = ""): Promise<string> {
	const editor =
		process.env.EDITOR ?? process.env.VISUAL ?? "vi";
	const dir = mkdtempSync(join(tmpdir(), "jira-cli-"));
	const file = join(dir, "message.txt");
	try {
		writeFileSync(file, template);
		const result = spawnSync(editor, [file], { stdio: "inherit" });
		if (result.status !== 0) {
			throw new Error("Aborted: editor exited with non-zero status");
		}
		const content = readFileSync(file, "utf8").trim();
		if (!content) throw new Error("Aborted: empty input");
		return content;
	} finally {
		rmSync(dir, { recursive: true });
	}
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm test tests/lib/prompt.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 5: Refactor `src/commands/issue/view.ts` to use `renderAdf`**

Replace the entire file with:

```ts
import { Args, Command, Flags } from "@oclif/core";
import chalk from "chalk";
import { renderAdf } from "../../lib/adf.js";
import { createClient } from "../../lib/client.js";

export default class IssueView extends Command {
	static override description = "Display details of an issue";
	static override examples = [
		"<%= config.bin %> issue view KAN-1",
		"<%= config.bin %> issue view KAN-1 --raw",
	];

	static override args = {
		key: Args.string({ description: "Issue key (e.g. KAN-1)", required: true }),
	};

	static override flags = {
		raw: Flags.boolean({ description: "Print raw JSON response" }),
	};

	async run(): Promise<void> {
		const { args, flags } = await this.parse(IssueView);

		const client = createClient();
		const issue = await client.issues.getIssue({
			issueIdOrKey: args.key,
			fields: [
				"summary",
				"description",
				"status",
				"priority",
				"issuetype",
				"assignee",
				"reporter",
				"labels",
				"created",
				"updated",
				"comment",
				"parent",
			],
		});

		if (flags.raw) {
			this.log(JSON.stringify(issue, null, 2));
			return;
		}

		const f = issue.fields as Record<string, any>;

		const type = f.issuetype?.name ?? "?";
		const status = f.status?.name ?? "?";
		const priority = f.priority?.name ?? "—";
		const assignee = f.assignee?.displayName ?? "Unassigned";
		const reporter = f.reporter?.displayName ?? "—";
		const labels: string[] = f.labels ?? [];
		const created = f.created ? new Date(f.created).toLocaleString() : "—";
		const updated = f.updated ? new Date(f.updated).toLocaleString() : "—";

		this.log(
			`${chalk.bold(issue.key)}  ${chalk.cyan(type)}  ${chalk.yellow(status)}`,
		);
		this.log(`${chalk.bold(f.summary ?? "")}`);
		this.log("");
		this.log(`  Priority  : ${priority}`);
		this.log(`  Assignee  : ${assignee}`);
		this.log(`  Reporter  : ${reporter}`);
		this.log(`  Labels    : ${labels.length ? labels.join(", ") : "—"}`);
		this.log(`  Created   : ${created}`);
		this.log(`  Updated   : ${updated}`);

		if (f.description) {
			this.log("");
			this.log(chalk.bold("Description"));
			this.log(renderAdf(f.description));
		}

		const comments = f.comment?.comments ?? [];
		if (comments.length) {
			this.log("");
			this.log(chalk.bold(`Comments (${comments.length})`));
			for (const c of comments) {
				const author = c.author?.displayName ?? "?";
				const when = c.created ? new Date(c.created).toLocaleString() : "";
				this.log(`  ${chalk.dim(`${author} · ${when}`)}`);
				this.log(`  ${renderAdf(c.body)}`);
				this.log("");
			}
		}
	}
}
```

- [ ] **Step 6: Run the existing view tests to confirm no regressions**

```bash
pnpm test tests/issue/view.test.ts
```

Expected: all existing view tests pass.

- [ ] **Step 7: Run lint fix**

```bash
pnpm lint:fix
```

- [ ] **Step 8: Run full suite**

```bash
pnpm test
```

---

## Task 3: `issue assign` command

**Files:**
- Create: `src/commands/issue/assign.ts`
- Create: `tests/issue/assign.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/issue/assign.test.ts`:

```ts
import { Config } from "@oclif/core";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import IssueAssign from "../../src/commands/issue/assign.js";
import { createClient } from "../../src/lib/client.js";

vi.mock("../../src/lib/client.js");

function makeMockClient() {
	return {
		issues: {
			assignIssue: vi.fn().mockResolvedValue(undefined),
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
	oclifConfig = await Config.load({
		root: join(import.meta.dirname, "../.."),
	});
});

async function runAssign(
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
		await IssueAssign.run(argv, oclifConfig);
	} finally {
		console.log = origLog;
	}
	return { lines, mock };
}

describe("issue assign", () => {
	it("assigns by accountId directly", async () => {
		const { mock } = await runAssign(["KAN-1", "--assignee", "user123"]);
		expect(mock.issues.assignIssue).toHaveBeenCalledWith({
			issueIdOrKey: "KAN-1",
			accountId: "user123",
		});
	});

	it("resolves 'me' to current user accountId", async () => {
		const { mock } = await runAssign(["KAN-1", "--assignee", "me"]);
		expect(mock.myself.getCurrentUser).toHaveBeenCalled();
		expect(mock.issues.assignIssue).toHaveBeenCalledWith({
			issueIdOrKey: "KAN-1",
			accountId: "abc123",
		});
	});

	it("unassigns with 'none' (sends accountId: null)", async () => {
		const { lines, mock } = await runAssign(["KAN-1", "--assignee", "none"]);
		expect(mock.issues.assignIssue).toHaveBeenCalledWith({
			issueIdOrKey: "KAN-1",
			accountId: null,
		});
		expect(lines.some((l) => l.includes("Unassigned"))).toBe(true);
	});

	it("prints confirmation with accountId when assigned directly", async () => {
		const { lines } = await runAssign(["KAN-1", "--assignee", "user123"]);
		expect(lines.some((l) => l.includes("Assigned") && l.includes("KAN-1"))).toBe(true);
	});

	it("errors with --no-input and no --assignee", async () => {
		await expect(
			runAssign(["KAN-1", "--no-input"]),
		).rejects.toThrow(/required/);
	});
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test tests/issue/assign.test.ts
```

Expected: `Cannot find module '../../src/commands/issue/assign.js'`

- [ ] **Step 3: Create `src/commands/issue/assign.ts`**

```ts
import { input } from "@inquirer/prompts";
import { Args, Command, Flags } from "@oclif/core";
import { createClient } from "../../lib/client.js";
import { isInteractive } from "../../lib/prompt.js";

export default class IssueAssign extends Command {
	static override description = "Assign an issue to a user";
	static override examples = [
		"<%= config.bin %> issue assign KAN-1 --assignee me",
		"<%= config.bin %> issue assign KAN-1 --assignee user@example.com",
		"<%= config.bin %> issue assign KAN-1 --assignee none",
	];

	static override args = {
		key: Args.string({ description: "Issue key (e.g. KAN-1)", required: true }),
	};

	static override flags = {
		assignee: Flags.string({
			char: "a",
			description: 'accountId, email, "me", or "none" (unassign)',
		}),
		"no-input": Flags.boolean({
			description: "Disable interactive prompts; error if inputs missing",
		}),
	};

	async run(): Promise<void> {
		const { args, flags } = await this.parse(IssueAssign);
		const client = createClient();

		let assigneeInput = flags.assignee;
		if (!assigneeInput) {
			if (!isInteractive(flags["no-input"] ?? false)) {
				this.error("--assignee is required in non-interactive mode");
			}
			assigneeInput = await input({
				message: "Assignee (email, accountId, me, none):",
			});
		}

		let accountId: string | null;
		let displayName: string;

		if (assigneeInput.toLowerCase() === "none") {
			accountId = null;
			displayName = "";
		} else if (assigneeInput.toLowerCase() === "me") {
			const me = await client.myself.getCurrentUser();
			accountId = me.accountId ?? null;
			displayName = me.displayName ?? "you";
		} else {
			accountId = assigneeInput;
			displayName = assigneeInput;
		}

		await client.issues.assignIssue({ issueIdOrKey: args.key, accountId });

		if (accountId === null) {
			this.log(`Unassigned ${args.key}.`);
		} else {
			this.log(`Assigned ${args.key} to ${displayName}.`);
		}
	}
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm test tests/issue/assign.test.ts
```

Expected: 5/5 pass.

- [ ] **Step 5: Run lint fix and full suite**

```bash
pnpm lint:fix && pnpm test
```

---

## Task 4: `issue move` command

**Files:**
- Create: `src/commands/issue/move.ts`
- Create: `tests/issue/move.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/issue/move.test.ts`:

```ts
import { Config } from "@oclif/core";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import IssueMove from "../../src/commands/issue/move.js";
import { createClient } from "../../src/lib/client.js";

vi.mock("../../src/lib/client.js");

const mockTransitions = [
	{ id: "11", name: "In Progress" },
	{ id: "21", name: "Done" },
	{ id: "31", name: "To Do" },
];

function makeMockClient() {
	return {
		issues: {
			getTransitions: vi.fn().mockResolvedValue({ transitions: mockTransitions }),
			doTransition: vi.fn().mockResolvedValue(undefined),
		},
	};
}

let oclifConfig: Config;
beforeAll(async () => {
	oclifConfig = await Config.load({
		root: join(import.meta.dirname, "../.."),
	});
});

async function runMove(
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
		await IssueMove.run(argv, oclifConfig);
	} finally {
		console.log = origLog;
	}
	return { lines, mock };
}

describe("issue move", () => {
	it("transitions by --transition flag (case-insensitive)", async () => {
		const { mock, lines } = await runMove([
			"KAN-1",
			"--transition",
			"in progress",
		]);
		expect(mock.issues.doTransition).toHaveBeenCalledWith({
			issueIdOrKey: "KAN-1",
			transition: { id: "11" },
		});
		expect(lines.some((l) => l.includes("In Progress"))).toBe(true);
	});

	it("transitions by positional arg", async () => {
		const { mock } = await runMove(["KAN-1", "Done"]);
		expect(mock.issues.doTransition).toHaveBeenCalledWith({
			issueIdOrKey: "KAN-1",
			transition: { id: "21" },
		});
	});

	it("flag takes precedence over positional arg", async () => {
		const { mock } = await runMove(["KAN-1", "Done", "--transition", "To Do"]);
		expect(mock.issues.doTransition).toHaveBeenCalledWith({
			issueIdOrKey: "KAN-1",
			transition: { id: "31" },
		});
	});

	it("errors on unknown transition name", async () => {
		await expect(
			runMove(["KAN-1", "--transition", "nonexistent", "--no-input"]),
		).rejects.toThrow(/Unknown transition/);
	});

	it("errors with --no-input and no transition supplied", async () => {
		await expect(runMove(["KAN-1", "--no-input"])).rejects.toThrow(/required/);
	});

	it("errors when no transitions are available", async () => {
		const mock = makeMockClient();
		mock.issues.getTransitions = vi.fn().mockResolvedValue({ transitions: [] });
		vi.mocked(createClient).mockReturnValue(mock as any);
		await expect(
			IssueMove.run(["KAN-1", "--no-input"], oclifConfig),
		).rejects.toThrow(/No transitions/);
	});
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test tests/issue/move.test.ts
```

Expected: `Cannot find module '../../src/commands/issue/move.js'`

- [ ] **Step 3: Create `src/commands/issue/move.ts`**

```ts
import { select } from "@inquirer/prompts";
import { Args, Command, Flags } from "@oclif/core";
import { createClient } from "../../lib/client.js";
import { isInteractive } from "../../lib/prompt.js";

export default class IssueMove extends Command {
	static override description =
		"Move an issue to a new status via a workflow transition";
	static override examples = [
		'<%= config.bin %> issue move KAN-1 "In Progress"',
		"<%= config.bin %> issue move KAN-1 --transition done",
	];

	static override args = {
		key: Args.string({ description: "Issue key (e.g. KAN-1)", required: true }),
		transition: Args.string({
			description: "Transition name (optional; flag takes precedence)",
			required: false,
		}),
	};

	static override flags = {
		transition: Flags.string({
			char: "t",
			description: "Transition name (case-insensitive)",
		}),
		"no-input": Flags.boolean({ description: "Disable interactive prompts" }),
	};

	async run(): Promise<void> {
		const { args, flags } = await this.parse(IssueMove);
		const client = createClient();

		const res = await client.issues.getTransitions({
			issueIdOrKey: args.key,
		});
		const transitions = res.transitions ?? [];

		if (transitions.length === 0) {
			this.error(`No transitions available for ${args.key}.`);
		}

		// flag takes precedence over positional arg
		const transitionName = flags.transition ?? args.transition;

		let transitionId: string;
		let transitionLabel: string;

		if (transitionName) {
			const lower = transitionName.toLowerCase();
			const matches = transitions.filter(
				(t) => t.name?.toLowerCase() === lower,
			);
			if (matches.length === 0) {
				const available = transitions.map((t) => t.name).join(", ");
				this.error(
					`Unknown transition "${transitionName}". Available: ${available}.`,
				);
			}
			if (matches.length > 1) {
				const names = matches.map((t) => t.name).join(", ");
				this.error(
					`Ambiguous transition "${transitionName}" matches: ${names}.`,
				);
			}
			transitionId = matches[0].id!;
			transitionLabel = matches[0].name!;
		} else {
			if (!isInteractive(flags["no-input"] ?? false)) {
				this.error("--transition is required in non-interactive mode");
			}
			const chosen = await select({
				message: "Select transition:",
				choices: transitions.map((t) => ({
					name: t.name ?? t.id ?? "",
					value: t.id ?? "",
				})),
			});
			transitionId = chosen;
			transitionLabel =
				transitions.find((t) => t.id === chosen)?.name ?? chosen;
		}

		await client.issues.doTransition({
			issueIdOrKey: args.key,
			transition: { id: transitionId },
		});
		this.log(`Moved ${args.key} to ${transitionLabel}.`);
	}
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm test tests/issue/move.test.ts
```

Expected: 6/6 pass.

- [ ] **Step 5: Run lint fix and full suite**

```bash
pnpm lint:fix && pnpm test
```

---

## Task 5: `issue comment add` command

**Files:**
- Create: `src/commands/issue/comment/add.ts`
- Create: `tests/issue/comment/add.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/issue/comment/add.test.ts`:

```ts
import { Config } from "@oclif/core";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import IssueCommentAdd from "../../../src/commands/issue/comment/add.js";
import { createClient } from "../../../src/lib/client.js";
import * as promptModule from "../../../src/lib/prompt.js";
import { textToAdf } from "../../../src/lib/adf.js";

vi.mock("../../../src/lib/client.js");

function makeMockClient() {
	return {
		issueComments: {
			addComment: vi.fn().mockResolvedValue({ id: "10001" }),
		},
	};
}

let oclifConfig: Config;
beforeAll(async () => {
	oclifConfig = await Config.load({
		root: join(import.meta.dirname, "../../.."),
	});
});

async function runCommentAdd(
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
		await IssueCommentAdd.run(argv, oclifConfig);
	} finally {
		console.log = origLog;
	}
	return { lines, mock };
}

describe("issue comment add", () => {
	it("submits body as ADF when --body is supplied", async () => {
		const { mock, lines } = await runCommentAdd(["KAN-1", "--body", "hello"]);
		expect(mock.issueComments.addComment).toHaveBeenCalledWith({
			issueIdOrKey: "KAN-1",
			comment: textToAdf("hello"),
		});
		expect(lines.some((l) => l.includes("Comment added"))).toBe(true);
	});

	it("errors with --no-input and no --body", async () => {
		await expect(
			runCommentAdd(["KAN-1", "--no-input"]),
		).rejects.toThrow(/required/);
	});

	it("uses openEditor result when interactive and no --body", async () => {
		vi.spyOn(promptModule, "isInteractive").mockReturnValue(true);
		vi.spyOn(promptModule, "openEditor").mockResolvedValue("editor content");
		const { mock } = await runCommentAdd(["KAN-1"]);
		expect(mock.issueComments.addComment).toHaveBeenCalledWith({
			issueIdOrKey: "KAN-1",
			comment: textToAdf("editor content"),
		});
		vi.restoreAllMocks();
	});
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test "tests/issue/comment/add.test.ts"
```

Expected: `Cannot find module '../../../src/commands/issue/comment/add.js'`

- [ ] **Step 3: Create `src/commands/issue/comment/add.ts`** (create the `comment/` directory)

```ts
import { Args, Command, Flags } from "@oclif/core";
import { textToAdf } from "../../../lib/adf.js";
import { createClient } from "../../../lib/client.js";
import { isInteractive, openEditor } from "../../../lib/prompt.js";

export default class IssueCommentAdd extends Command {
	static override description = "Add a comment to an issue";
	static override examples = [
		'<%= config.bin %> issue comment add KAN-1 --body "Looks good"',
		"<%= config.bin %> issue comment add KAN-1",
	];

	static override args = {
		key: Args.string({ description: "Issue key (e.g. KAN-1)", required: true }),
	};

	static override flags = {
		body: Flags.string({
			char: "b",
			description: "Comment text",
		}),
		"no-input": Flags.boolean({
			description: "Disable editor; error if body missing",
		}),
	};

	async run(): Promise<void> {
		const { args, flags } = await this.parse(IssueCommentAdd);

		let body = flags.body;
		if (!body) {
			if (!isInteractive(flags["no-input"] ?? false)) {
				this.error("--body is required in non-interactive mode");
			}
			body = await openEditor();
			if (!body) this.error("Aborted: empty comment.");
		}

		const client = createClient();
		await client.issueComments.addComment({
			issueIdOrKey: args.key,
			comment: textToAdf(body),
		});
		this.log(`Comment added to ${args.key}.`);
	}
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm test "tests/issue/comment/add.test.ts"
```

Expected: 3/3 pass.

- [ ] **Step 5: Run lint fix and full suite**

```bash
pnpm lint:fix && pnpm test
```

---

## Task 6: Integration tests

**Files:**
- Create: `tests/integration/issue-actions.test.ts`

- [ ] **Step 1: Create the integration test file**

```ts
import { Config } from "@oclif/core";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import IssueAssign from "../../src/commands/issue/assign.js";
import IssueCommentAdd from "../../src/commands/issue/comment/add.js";
import IssueMove from "../../src/commands/issue/move.js";

const hasCredentials =
	!!process.env.JIRA_API_TOKEN ||
	existsSync(join(process.env.HOME ?? "", ".config/jira-cli/config.json"));

// Set TEST_ISSUE_KEY env to a real writable issue key, e.g. KAN-4
const testKey = process.env.TEST_ISSUE_KEY ?? "KAN-4";

describe.skipIf(!hasCredentials)("issue action commands (integration)", () => {
	let oclifConfig: Config;

	beforeAll(async () => {
		oclifConfig = await Config.load({
			root: join(import.meta.dirname, "../.."),
		});
	});

	it("assign: assigns to current user then unassigns", async () => {
		await expect(
			IssueAssign.run([testKey, "--assignee", "me"], oclifConfig),
		).resolves.not.toThrow();
		await expect(
			IssueAssign.run([testKey, "--assignee", "none"], oclifConfig),
		).resolves.not.toThrow();
	});

	it("comment add: adds a comment with --body", async () => {
		await expect(
			IssueCommentAdd.run(
				[testKey, "--body", "Automated test comment from jira-cli"],
				oclifConfig,
			),
		).resolves.not.toThrow();
	});

	it("move: fetches transitions without error", async () => {
		// Only verify the transition fetch succeeds; don't actually transition
		// the issue since we don't know valid transitions in advance.
		const { createClient } = await import("../../src/lib/client.js");
		const client = createClient();
		const res = await client.issues.getTransitions({ issueIdOrKey: testKey });
		expect(res.transitions).toBeDefined();
		expect(Array.isArray(res.transitions)).toBe(true);
	});
});
```

- [ ] **Step 2: Run lint fix**

```bash
pnpm lint:fix
```

- [ ] **Step 3: Confirm unit suite is unaffected**

```bash
pnpm test
```

Expected: all unit tests pass; integration suite skipped (no credentials in test env).

---

## Task 7: Update docs (`parity.md`, `CLAUDE.md`)

**Files:**
- Modify: `docs/parity.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `docs/parity.md`**

In the "Other `issue` subcommands" table, change:

```markdown
| `issue view KEY` | ⬜ |
| `issue create` | ⬜ |
| `issue edit KEY` | ⬜ |
| `issue assign KEY` | ⬜ |
| `issue move KEY` (transition) | ⬜ |
```

to:

```markdown
| `issue view KEY` | ✅ |
| `issue create` | ⬜ |
| `issue edit KEY` | ⬜ |
| `issue assign KEY` | ✅ |
| `issue move KEY` (transition) | ✅ |
```

And change:

```markdown
| `issue comment add KEY` | ⬜ |
```

to:

```markdown
| `issue comment add KEY` | ✅ |
```

- [ ] **Step 2: Add design patterns section to `CLAUDE.md`**

After the `## Coding conventions` section (end of file), append:

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
`$EDITOR` via `openEditor()`. If not (non-TTY or `--no-input` flag): hard error
with a clear message. Every command that can prompt must accept `--no-input`.

**ADF.** Use `renderAdf()` from `adf.ts` to display Jira content. Use `textToAdf()`
to send user-supplied text to the API.

**Output.** Use `--raw` for debug JSON output. Use `cli-table3` for TTY tables,
plain tab-separated for non-TTY / `--plain`.
```

- [ ] **Step 3: Update the project layout in `CLAUDE.md`**

In the project layout code block, under `src/commands/`, the current list is:

```
    init.ts
    me.ts
    issue/list.ts
    fields/sync.ts
    fields/list.ts
```

Change to:

```
    init.ts
    me.ts
    issue/list.ts
    issue/view.ts
    issue/assign.ts
    issue/move.ts
    issue/comment/add.ts
    fields/sync.ts
    fields/list.ts
```

And under `src/lib/`, the current list is:

```
    config.ts   credential store (conf + env var overlay)
    client.ts   authenticated jira.js Version3Client factory
    jql.ts      flag → JQL string builder
    fields.ts   per-project custom field registry (load/save/sync/resolve)
```

Change to:

```
    config.ts   credential store (conf + env var overlay)
    client.ts   authenticated jira.js Version3Client factory
    jql.ts      flag → JQL string builder
    fields.ts   per-project custom field registry (load/save/sync/resolve)
    adf.ts      ADF → text rendering; text → ADF construction
    prompt.ts   interactive/non-interactive detection; $EDITOR spawn
```

- [ ] **Step 4: Run full test suite one final time**

```bash
pnpm test
```

Expected: all tests pass.
