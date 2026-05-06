import { input } from "@inquirer/prompts";
import { Args, Command, Flags } from "@oclif/core";
import { createClient } from "../../lib/client.js";
import { isInteractive } from "../../lib/prompt.js";

export default class IssueAssign extends Command {
	static override description = "Assign an issue to a user";
	static override examples = [
		"<%= config.bin %> issue assign KAN-1 --assignee me",
		"<%= config.bin %> issue assign KAN-1 --assignee 5b10ac8d82e05b22cc7d4ef5",
		"<%= config.bin %> issue assign KAN-1 --assignee none",
	];

	static override args = {
		key: Args.string({ description: "Issue key (e.g. KAN-1)", required: true }),
	};

	static override flags = {
		assignee: Flags.string({
			char: "a",
			description: 'accountId, "me", or "none" (unassign)',
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
				message: "Assignee (accountId, me, none):",
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
