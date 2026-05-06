import { Args, Command, Flags } from "@oclif/core";
import chalk from "chalk";
import { renderAdf } from "../../lib/adf.js";
import { createClient } from "../../lib/client.js";

export default class IssueView extends Command {
	static override description = "Display details of an issue";
	static override examples = [
		"<%= config.bin %> issue view KAN-1",
		"<%= config.bin %> issue view KAN-1 --raw",
	];

	static override args = {
		key: Args.string({ description: "Issue key (e.g. KAN-1)", required: true }),
	};

	static override flags = {
		raw: Flags.boolean({ description: "Print raw JSON response" }),
	};

	async run(): Promise<void> {
		const { args, flags } = await this.parse(IssueView);

		const client = createClient();
		const issue = await client.issues.getIssue({
			issueIdOrKey: args.key,
			fields: [
				"summary",
				"description",
				"status",
				"priority",
				"issuetype",
				"assignee",
				"reporter",
				"labels",
				"created",
				"updated",
				"comment",
				"parent",
			],
		});

		if (flags.raw) {
			this.log(JSON.stringify(issue, null, 2));
			return;
		}

		const f = issue.fields as Record<string, any>;

		const type = f.issuetype?.name ?? "?";
		const status = f.status?.name ?? "?";
		const priority = f.priority?.name ?? "—";
		const assignee = f.assignee?.displayName ?? "Unassigned";
		const reporter = f.reporter?.displayName ?? "—";
		const labels: string[] = f.labels ?? [];
		const created = f.created ? new Date(f.created).toLocaleString() : "—";
		const updated = f.updated ? new Date(f.updated).toLocaleString() : "—";

		this.log(
			`${chalk.bold(issue.key)}  ${chalk.cyan(type)}  ${chalk.yellow(status)}`,
		);
		this.log(`${chalk.bold(f.summary ?? "")}`);
		this.log("");
		this.log(`  Priority  : ${priority}`);
		this.log(`  Assignee  : ${assignee}`);
		this.log(`  Reporter  : ${reporter}`);
		this.log(`  Labels    : ${labels.length ? labels.join(", ") : "—"}`);
		this.log(`  Created   : ${created}`);
		this.log(`  Updated   : ${updated}`);

		if (f.description) {
			this.log("");
			this.log(chalk.bold("Description"));
			this.log(renderAdf(f.description));
		}

		const comments = f.comment?.comments ?? [];
		if (comments.length) {
			this.log("");
			this.log(chalk.bold(`Comments (${comments.length})`));
			for (const c of comments) {
				const author = c.author?.displayName ?? "?";
				const when = c.created ? new Date(c.created).toLocaleString() : "";
				this.log(`  ${chalk.dim(`${author} · ${when}`)}`);
				if (c.body) {
					this.log(`  ${renderAdf(c.body)}`);
				}
				this.log("");
			}
		}
	}
}
