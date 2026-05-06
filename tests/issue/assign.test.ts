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
