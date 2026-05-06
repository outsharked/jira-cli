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
