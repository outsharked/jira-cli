import { input, select } from "@inquirer/prompts";
import { Command, Flags } from "@oclif/core";
import { textToAdf } from "../../lib/adf.js";
import { createClient } from "../../lib/client.js";
import { loadConfig } from "../../lib/config.js";
import { getIssueTypes, getOrSyncRegistry } from "../../lib/fields.js";
import { isInteractive, openEditor } from "../../lib/prompt.js";

export default class IssueCreate extends Command {
	static override description = "Create an issue";
	static override examples = [
		'<%= config.bin %> issue create -t Story -s "New feature"',
		'<%= config.bin %> issue create -t Bug -s "Login broken" -y High -a me',
		'<%= config.bin %> issue create --no-input -t Story -s "Summary" -d "Details"',
	];

	static override flags = {
		summary: Flags.string({ char: "s", description: "Issue summary" }),
		type: Flags.string({ char: "t", description: "Issue type name" }),
		description: Flags.string({
			char: "d",
			description: "Description body text",
		}),
		priority: Flags.string({
			char: "y",
			description: "Priority name (e.g. High)",
		}),
		assignee: Flags.string({
			char: "a",
			description: 'accountId or "me"',
		}),
		label: Flags.string({
			char: "l",
			description: "Label (repeatable)",
			multiple: true,
		}),
		parent: Flags.string({ description: "Parent issue key" }),
		project: Flags.string({
			char: "p",
			description: "Project key (defaults to configured project)",
		}),
		"no-input": Flags.boolean({
			description: "Non-interactive; --summary and --type required",
		}),
		raw: Flags.boolean({ description: "Print created issue as JSON" }),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(IssueCreate);
		const cfg = loadConfig();
		const project = flags.project ?? cfg.defaultProject;
		if (!project) {
			this.error(
				"No project specified. Use --project or set a default with `jira init`.",
			);
		}

		const interactive = isInteractive(flags["no-input"] ?? false);

		const client = createClient();

		let issueType = flags.type;
		if (!issueType) {
			if (!interactive) {
				this.error("--type is required in non-interactive mode");
			}
			const registry = await getOrSyncRegistry(
				project,
				client,
				() => this.log(`Fetching field registry for ${project}...`),
				cfg.fieldsCacheTtlDays,
			);
			const types = getIssueTypes(registry).filter(
				(t) => !t.subtask && t.name !== "Epic",
			);
			if (types.length > 0) {
				issueType = await select({
					message: "Issue type:",
					choices: types.map((t) => ({ name: t.name, value: t.name })),
				});
			} else {
				issueType = await input({ message: "Issue type:" });
			}
		}

		let summary = flags.summary;
		if (!summary) {
			if (!interactive) {
				this.error("--summary is required in non-interactive mode");
			}
			summary = await input({
				message: "Summary:",
				validate: (v) => v.trim().length > 0 || "Summary is required",
			});
		}

		let description = flags.description;
		if (!description && interactive) {
			try {
				description = await openEditor("", true);
			} catch {
				// editor errors (non-zero exit); treat as no description
			}
			if (!description) description = undefined;
		}

		let assigneeId: string | undefined;
		if (flags.assignee) {
			if (flags.assignee.toLowerCase() === "me") {
				const me = await client.myself.getCurrentUser();
				if (!me.accountId) {
					this.error("Could not resolve your account ID from Jira");
				}
				assigneeId = me.accountId;
			} else {
				assigneeId = flags.assignee;
			}
		}

		const created = await client.issues.createIssue({
			fields: {
				summary,
				project: { key: project },
				issuetype: { name: issueType },
				...(description ? { description: textToAdf(description) } : {}),
				...(flags.priority ? { priority: { name: flags.priority } } : {}),
				...(assigneeId ? { assignee: { id: assigneeId } } : {}),
				...(flags.label?.length ? { labels: flags.label } : {}),
				...(flags.parent ? { parent: { key: flags.parent } } : {}),
			},
		});

		if (flags.raw) {
			this.log(JSON.stringify(created, null, 2));
			return;
		}

		this.log(`Created ${created.key}.\n${cfg.host}/browse/${created.key}`);
	}
}
