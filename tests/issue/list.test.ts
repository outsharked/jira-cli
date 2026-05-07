import { Config } from "@oclif/core";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import IssueList from "../../src/commands/issue/list.js";
import { createClient } from "../../src/lib/client.js";
import * as fieldsModule from "../../src/lib/fields.js";

vi.mock("../../src/lib/client.js");

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
	console.log = (...args: unknown[]) => {
		lines.push(args.map(String).join(" "));
	};
	try {
		await IssueList.run(argv, oclifConfig);
	} finally {
		console.log = origLog;
	}
	const call = mock.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost.mock.calls[0]?.[0];
	return { lines, jql: call?.jql ?? "" };
}

describe("issue list --jql", () => {
	it("passes raw JQL directly to the search API", async () => {
		const raw = "project = KAN AND labels = urgent ORDER BY created DESC";
		const { jql } = await runList(["-q", raw]);
		expect(jql).toBe(raw);
	});

	it("--jql overrides other filter flags", async () => {
		const raw = "project = KAN";
		const { jql } = await runList(["-q", raw, "--assignee", "me"]);
		expect(jql).toBe(raw);
	});
});

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
