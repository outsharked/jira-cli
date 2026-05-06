import { Command, Flags } from "@oclif/core";
import Table from "cli-table3";
import { loadConfig } from "../../lib/config.js";
import { loadFieldRegistry } from "../../lib/fields.js";

export default class FieldsList extends Command {
	static override description =
		"Display the cached field registry for a project";
	static override examples = [
		"<%= config.bin %> fields list",
		"<%= config.bin %> fields list --project ENG",
	];

	static override flags = {
		project: Flags.string({
			char: "p",
			description: "Project key (defaults to configured default project)",
		}),
		plain: Flags.boolean({ description: "Plain tab-separated output" }),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(FieldsList);
		const cfg = loadConfig();
		const project = flags.project ?? cfg.defaultProject;
		if (!project) {
			this.error(
				"No project specified. Use --project or set a default with `jira init`.",
			);
		}
		const registry = loadFieldRegistry(project);
		if (!registry) {
			this.error(
				`No field registry for ${project}. Run \`jira fields sync --project ${project}\` first.`,
			);
		}

		const syncedAgo = humanAge(registry.syncedAt);
		this.log(`Fields for ${project} (synced ${syncedAgo})\n`);

		const headers = ["ID", "NAME", "TYPE", "ALLOWED VALUES"];
		const rows = registry.fields.map((f) => [
			f.id,
			f.name,
			f.schema.type,
			f.allowedValues ? f.allowedValues.join(", ") : "—",
		]);

		if (flags.plain || !process.stdout.isTTY) {
			this.log(headers.join("\t"));
			for (const row of rows) this.log(row.join("\t"));
			return;
		}

		const table = new Table({ head: headers, style: { head: ["cyan"] } });
		for (const row of rows) table.push(row);
		this.log(table.toString());
	}
}

function humanAge(iso: string): string {
	const ms = Date.now() - new Date(iso).getTime();
	if (Number.isNaN(ms)) return "unknown";
	const mins = Math.floor(ms / 60_000);
	if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
	const days = Math.floor(hours / 24);
	return `${days} day${days === 1 ? "" : "s"} ago`;
}
