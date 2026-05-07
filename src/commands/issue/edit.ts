import { input } from "@inquirer/prompts";
import { Args, Command, Flags } from "@oclif/core";
import { renderAdf, textToAdf } from "../../lib/adf.js";
import { createClient } from "../../lib/client.js";
import { loadConfig } from "../../lib/config.js";
import { isInteractive, openEditor } from "../../lib/prompt.js";

export default class IssueEdit extends Command {
	static override description = "Edit an issue";
	static override examples = [
		'<%= config.bin %> issue edit KAN-1 --summary "New title"',
		"<%= config.bin %> issue edit KAN-1 --label bug --label -urgent",
		"<%= config.bin %> issue edit KAN-1 --assignee me",
		"<%= config.bin %> issue edit KAN-1 --no-input --priority High",
	];

	static override args = {
		key: Args.string({ description: "Issue key (e.g. KAN-1)", required: true }),
	};

	static override flags = {
		summary: Flags.string({ char: "s", description: "New summary" }),
		description: Flags.string({
			char: "d",
			description: "New description body",
		}),
		priority: Flags.string({
			char: "y",
			description: "Priority name (e.g. High)",
		}),
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
		const { args, flags } = await this.parse(IssueEdit);
		const cfg = loadConfig();
		const interactive = isInteractive(flags["no-input"] ?? false);

		const noFieldFlags =
			!flags.summary &&
			!flags.description &&
			!flags.priority &&
			!flags.assignee &&
			!flags.label?.length &&
			!flags.parent;

		if (!interactive && noFieldFlags) {
			this.error("At least one field flag is required with --no-input");
		}

		const client = createClient();
		const issue = await client.issues.getIssue({
			issueIdOrKey: args.key,
			fields: ["summary", "description", "labels", "priority", "parent"],
		});

		let summary = flags.summary;
		if (!summary && interactive) {
			summary = await input({
				message: "Summary:",
				default: (issue.fields?.summary as string | undefined) ?? "",
			});
		}

		let description = flags.description;
		if (!description && interactive) {
			const existing = renderAdf(issue.fields?.description) ?? "";
			try {
				description = await openEditor(existing, true);
			} catch {
				// editor abort; no description change
			}
			if (!description) description = undefined;
		}

		let assigneeField: { accountId: string | null } | undefined;
		if (flags.assignee) {
			if (flags.assignee.toLowerCase() === "me") {
				const me = await client.myself.getCurrentUser();
				if (!me.accountId) {
					this.error("Could not resolve your account ID from Jira");
				}
				assigneeField = { accountId: me.accountId };
			} else if (flags.assignee === "x") {
				assigneeField = { accountId: null };
			} else {
				assigneeField = { accountId: flags.assignee };
			}
		}

		let labelsField: string[] | undefined;
		if (flags.label?.length) {
			const existing = (issue.fields?.labels as string[]) ?? [];
			const positives = flags.label.filter((l) => !l.startsWith("-"));
			const removals = new Set(
				flags.label.filter((l) => l.startsWith("-")).map((l) => l.slice(1)),
			);
			labelsField = [...new Set([...existing, ...positives])].filter(
				(l) => !removals.has(l),
			);
		}

		const fields: Record<string, unknown> = {};
		if (summary) fields.summary = summary;
		if (description) fields.description = textToAdf(description);
		if (flags.priority) fields.priority = { name: flags.priority };
		if (assigneeField !== undefined) fields.assignee = assigneeField;
		if (labelsField !== undefined) fields.labels = labelsField;
		if (flags.parent) fields.parent = { key: flags.parent };

		await client.issues.editIssue({ issueIdOrKey: args.key, fields });

		this.log(`Updated ${args.key}.\n${cfg.host}/browse/${args.key}`);
	}
}
