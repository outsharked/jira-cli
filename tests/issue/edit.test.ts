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
