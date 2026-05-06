import { Config } from "@oclif/core";
import { readFileSync } from "fs";
import { join } from "path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import IssueView from "../../src/commands/issue/view.js";
import { createClient } from "../../src/lib/client.js";

vi.mock("../../src/lib/client.js");

const fixture = JSON.parse(
	readFileSync(join(import.meta.dirname, "../fixtures/issue-get.json"), "utf8"),
);

function makeMockClient(issue = fixture) {
	return { issues: { getIssue: vi.fn().mockResolvedValue(issue) } };
}

let oclifConfig: Config;
beforeAll(async () => {
	oclifConfig = await Config.load({ root: join(import.meta.dirname, "../..") });
});

async function runView(argv: string[]): Promise<string[]> {
	const lines: string[] = [];
	// oclif's this.log() routes through console.log (via ux/write.js)
	const origLog = console.log.bind(console);
	console.log = (...args: unknown[]) => {
		lines.push(args.map(String).join(" "));
	};
	try {
		await IssueView.run(argv, oclifConfig);
	} finally {
		console.log = origLog;
	}
	return lines.map((l) => l.trim()).filter(Boolean);
}

describe("issue view", () => {
	beforeEach(() => {
		vi.mocked(createClient).mockReturnValue(makeMockClient() as any);
	});

	it("calls getIssue with the supplied key", async () => {
		const mock = makeMockClient();
		vi.mocked(createClient).mockReturnValue(mock as any);
		await runView(["KAN-2"]);
		expect(mock.issues.getIssue).toHaveBeenCalledWith(
			expect.objectContaining({ issueIdOrKey: "KAN-2" }),
		);
	});

	it("renders key, type and status on the first line", async () => {
		const lines = await runView(["KAN-2"]);
		expect(lines[0]).toContain("KAN-2");
		expect(lines[0]).toContain("Story");
		expect(lines[0]).toContain("In Progress");
	});

	it("renders summary on the second line", async () => {
		const lines = await runView(["KAN-2"]);
		expect(lines[1]).toContain("Task 2");
	});

	it("renders reporter and unassigned assignee", async () => {
		const all = (await runView(["KAN-2"])).join("\n");
		expect(all).toContain("Alf");
		expect(all).toContain("Unassigned");
	});

	it("omits Description section when description is null", async () => {
		const all = (await runView(["KAN-2"])).join("\n");
		expect(all).not.toContain("Description");
	});

	it("--raw prints JSON and nothing else", async () => {
		const lines = await runView(["KAN-2", "--raw"]);
		const parsed = JSON.parse(lines.join("\n"));
		expect(parsed.key).toBe("KAN-2");
	});

	it("renders Description section when description is present", async () => {
		const withDesc = {
			...fixture,
			fields: {
				...fixture.fields,
				description: {
					type: "doc",
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: "Hello world" }],
						},
					],
				},
			},
		};
		vi.mocked(createClient).mockReturnValue(makeMockClient(withDesc) as any);
		const all = (await runView(["KAN-2"])).join("\n");
		expect(all).toContain("Description");
		expect(all).toContain("Hello world");
	});
});
