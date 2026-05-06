import { select } from "@inquirer/prompts";
import { Args, Command, Flags } from "@oclif/core";
import { createClient } from "../../lib/client.js";
import { isInteractive } from "../../lib/prompt.js";

export default class IssueMove extends Command {
	static override description =
		"Move an issue to a new status via a workflow transition";
	static override examples = [
		'<%= config.bin %> issue move KAN-1 "In Progress"',
		"<%= config.bin %> issue move KAN-1 --transition done",
	];

	static override args = {
		key: Args.string({ description: "Issue key (e.g. KAN-1)", required: true }),
		transition: Args.string({
			description: "Transition name (optional; flag takes precedence)",
			required: false,
		}),
	};

	static override flags = {
		transition: Flags.string({
			char: "t",
			description: "Transition name (case-insensitive)",
		}),
		"no-input": Flags.boolean({ description: "Disable interactive prompts" }),
	};

	async run(): Promise<void> {
		const { args, flags } = await this.parse(IssueMove);
		const client = createClient();

		const res = await client.issues.getTransitions({
			issueIdOrKey: args.key,
		});
		const transitions = res.transitions ?? [];

		if (transitions.length === 0) {
			this.error(`No transitions available for ${args.key}.`);
		}

		// flag takes precedence over positional arg
		const transitionName = flags.transition ?? args.transition;

		let transitionId: string;
		let transitionLabel: string;

		if (transitionName) {
			const lower = transitionName.toLowerCase();
			const matches = transitions.filter(
				(t) => t.name?.toLowerCase() === lower,
			);
			if (matches.length === 0) {
				const available = transitions.map((t) => t.name).join(", ");
				this.error(
					`Unknown transition "${transitionName}". Available: ${available}.`,
				);
			}
			if (matches.length > 1) {
				const names = matches.map((t) => t.name).join(", ");
				this.error(
					`Ambiguous transition "${transitionName}" matches: ${names}.`,
				);
			}
			const match = matches[0];
			transitionId = match.id ?? "";
			transitionLabel = match.name ?? "";
		} else {
			if (!isInteractive(flags["no-input"] ?? false)) {
				this.error("--transition is required in non-interactive mode");
			}
			const chosen = await select({
				message: "Select transition:",
				choices: transitions.map((t) => ({
					name: t.name ?? t.id ?? "",
					value: t.id ?? "",
				})),
			});
			transitionId = chosen;
			transitionLabel =
				transitions.find((t) => t.id === chosen)?.name ?? chosen;
		}

		await client.issues.doTransition({
			issueIdOrKey: args.key,
			transition: { id: transitionId },
		});
		this.log(`Moved ${args.key} to ${transitionLabel}.`);
	}
}
