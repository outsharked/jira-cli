import { Config } from "@oclif/core";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
	vi.restoreAllMocks();
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
	});
});
