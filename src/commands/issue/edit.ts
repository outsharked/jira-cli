import { Args, Command, Flags } from "@oclif/core";

export default class IssueEdit extends Command {
	static override description = "Edit an issue";

	static override args = {
		key: Args.string({ description: "Issue key (e.g. KAN-1)", required: true }),
	};

	static override flags = {
		summary: Flags.string({ char: "s", description: "New summary" }),
		description: Flags.string({ char: "d", description: "New description body" }),
		priority: Flags.string({ char: "y", description: "Priority name (e.g. High)" }),
		assignee: Flags.string({
			char: "a",
			description: 'accountId, "me" to self-assign, "x" to unassign',
		}),
		label: Flags.string({
			char: "l",
			description: "Append label; prefix with - to remove (repeatable)",
			multiple: true,
		}),
		parent: Flags.string({ char: "P", description: "Parent issue key" }),
		"no-input": Flags.boolean({
			description: "Skip prompts; at least one field flag required",
		}),
	};

	async run(): Promise<void> {
		throw new Error("not implemented");
	}
}
