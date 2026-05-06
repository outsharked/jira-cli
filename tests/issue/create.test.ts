import { join } from "node:path";
import { Config } from "@oclif/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import IssueCreate from "../../src/commands/issue/create.js";
import { createClient } from "../../src/lib/client.js";

vi.mock("../../src/lib/client.js");

function makeMockClient() {
	return {
		issues: {
			createIssue: vi
				.fn()
				.mockResolvedValue({ id: "10005", key: "KAN-5", self: "" }),
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
		await expect(runCreate(["--no-input", "--type", "Story"])).rejects.toThrow(
			/required/,
		);
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

