import { existsSync } from "node:fs";
import { join } from "node:path";
import { Config } from "@oclif/core";
import { beforeAll, describe, expect, it } from "vitest";
import IssueAssign from "../../src/commands/issue/assign.js";
import IssueCommentAdd from "../../src/commands/issue/comment/add.js";

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
