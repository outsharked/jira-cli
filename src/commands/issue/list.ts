import { Command, Flags } from "@oclif/core";
import Table from "cli-table3";
import { createClient } from "../../lib/client.js";
import { loadConfig } from "../../lib/config.js";
import { getOrSyncRegistry, resolveField } from "../../lib/fields.js";
import { buildJql } from "../../lib/jql.js";

export default class IssueList extends Command {
	static override description = "List and search issues";
	static override examples = [
		"<%= config.bin %> issue list -a me -y High -s todo",
		"<%= config.bin %> issue list --created-after -7d --plain",
		"<%= config.bin %> issue list --sprint active",
		'<%= config.bin %> issue list -q "project = KAN AND labels = urgent ORDER BY created DESC"',
	];

	static override flags = {
		project: Flags.string({
			char: "p",
			description: "Project key (defaults to configured project)",
		}),
		assignee: Flags.string({
			char: "a",
			description: 'Assignee (accountId, email, or "me")',
		}),
		reporter: Flags.string({
			char: "r",
			description: 'Reporter (accountId, email, or "me")',
		}),
		status: Flags.string({
			char: "s",
			description: "Status (todo / in-progress / done or a custom name)",
		}),
		sprint: Flags.string({ description: 'Sprint name or "active"' }),
		type: Flags.string({ char: "t", description: "Issue type" }),
		epic: Flags.string({ description: "Parent epic key" }),
		label: Flags.string({
			char: "l",
			description: "Label (repeatable; prefix with ~ to exclude)",
			multiple: true,
		}),
		priority: Flags.string({
			char: "y",
			description: "Priority (e.g. High)",
		}),
		watching: Flags.boolean({
			char: "w",
			description: "Issues you are watching",
		}),
		"created-after": Flags.string({
			description: "Created on/after (e.g. -7d)",
		}),
		"created-before": Flags.string({
			description: "Created before (e.g. 2026-01-01)",
		}),
		"updated-after": Flags.string({ description: "Updated on/after" }),
		"updated-before": Flags.string({
			description: "Updated before (e.g. 2026-01-01)",
		}),
		"order-by": Flags.string({
			description: 'Field to order by (default: "updated")',
		}),
		reverse: Flags.boolean({
			description: "Reverse order (ASC instead of DESC)",
		}),
		unresolved: Flags.boolean({
			description: "Only issues with no resolution",
		}),
		resolved: Flags.boolean({ description: "Only issues with a resolution" }),
		limit: Flags.integer({ description: "Max issues to fetch", default: 100 }),
		plain: Flags.boolean({ description: "Plain tab-separated output" }),
		raw: Flags.boolean({ description: "Raw JSON output" }),
		csv: Flags.boolean({ description: "CSV output" }),
		"no-headers": Flags.boolean({
			description: "Omit header row in plain/csv modes",
		}),
		custom: Flags.string({
			description:
				'Custom field filter, format: "fieldName=value" (repeatable)',
			multiple: true,
		}),
		jql: Flags.string({
			char: "q",
			description: "Raw JQL query (overrides all filter flags)",
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(IssueList);
		const cfg = loadConfig();
		const project = flags.project ?? cfg.defaultProject;

		// Create client once; reused for both field registry and issue search.
		const client = createClient();

		// --jql overrides all filter flags; skip registry resolution and JQL building.
		let jql: string;
		if (flags.jql) {
			jql = flags.jql;
		} else {
			// Resolve --custom flags to JQL clauses.
			const customFields: Array<{ fieldName: string; value: string }> = [];
			if (flags.custom?.length) {
				const registry = await getOrSyncRegistry(
					project ?? "",
					client,
					() => this.log(`Fetching field registry for ${project}...`),
					cfg.fieldsCacheTtlDays,
				);
				for (const raw of flags.custom) {
					const eqIdx = raw.indexOf("=");
					if (eqIdx === -1)
						this.error(
							`Invalid --custom value "${raw}": expected format "fieldName=value"`,
						);
					const nameOrId = raw.slice(0, eqIdx).trim();
					const value = raw.slice(eqIdx + 1).trim();
					const entry = resolveField(registry, nameOrId);
					if (!entry)
						this.error(
							`Unknown field "${nameOrId}". Run \`jira fields list\` to see available fields.`,
						);
					customFields.push({ fieldName: entry.name, value });
				}
			}

			jql = buildJql({
				project,
				assignee: flags.assignee,
				reporter: flags.reporter,
				status: flags.status,
				sprint: flags.sprint,
				issueType: flags.type,
				epic: flags.epic,
				labels: flags.label,
				priority: flags.priority,
				watching: flags.watching,
				createdAfter: flags["created-after"],
				createdBefore: flags["created-before"],
				updatedAfter: flags["updated-after"],
				updatedBefore: flags["updated-before"],
				orderBy: flags["order-by"],
				orderDirection: flags.reverse ? "ASC" : undefined,
				unresolved: flags.unresolved,
				resolved: flags.resolved,
				customFields,
			});
		}

		const res =
			await client.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
				jql,
				maxResults: flags.limit,
				fields: ["summary", "status", "priority", "issuetype", "assignee"],
			});

		const rows = (res.issues ?? []).map((i) => {
			const f = i.fields as Record<
				string,
				{ name?: string; displayName?: string } | undefined
			>;
			return {
				key: i.key ?? "",
				type: f.issuetype?.name ?? "",
				status: f.status?.name ?? "",
				priority: f.priority?.name ?? "",
				assignee: f.assignee?.displayName ?? "",
				summary: (i.fields as { summary?: string }).summary ?? "",
			};
		});

		if (flags.raw) {
			this.log(JSON.stringify(res.issues ?? [], null, 2));
			return;
		}

		const headers = [
			"KEY",
			"TYPE",
			"STATUS",
			"PRIORITY",
			"ASSIGNEE",
			"SUMMARY",
		];
		const lines = rows.map((r) => [
			r.key,
			r.type,
			r.status,
			r.priority,
			r.assignee,
			r.summary,
		]);

		if (flags.csv) {
			const csvCell = (v: string) =>
				/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
			if (!flags["no-headers"]) this.log(headers.join(","));
			for (const row of lines) this.log(row.map(csvCell).join(","));
			return;
		}

		if (flags.plain || !process.stdout.isTTY) {
			if (!flags["no-headers"]) this.log(headers.join("\t"));
			for (const row of lines) this.log(row.join("\t"));
			return;
		}

		const table = new Table({ head: headers, style: { head: ["cyan"] } });
		for (const row of lines) table.push(row);
		this.log(table.toString());
		this.log(`\n${rows.length} issue${rows.length === 1 ? "" : "s"}`);
	}
}
