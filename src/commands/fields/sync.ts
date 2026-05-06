import { Command, Flags } from "@oclif/core";
import { createClient } from "../../lib/client.js";
import { loadConfig } from "../../lib/config.js";
import { syncFieldRegistry } from "../../lib/fields.js";

export default class FieldsSync extends Command {
	static override description =
		"Fetch and cache the field registry for a project";
	static override examples = [
		"<%= config.bin %> fields sync",
		"<%= config.bin %> fields sync --project ENG",
	];

	static override flags = {
		project: Flags.string({
			char: "p",
			description: "Project key (defaults to configured default project)",
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(FieldsSync);
		const cfg = loadConfig();
		const project = flags.project ?? cfg.defaultProject;
		if (!project) {
			this.error(
				"No project specified. Use --project or set a default with `jira init`.",
			);
		}
		this.log(`Syncing fields for ${project}...`);
		const client = createClient();
		const registry = await syncFieldRegistry(project, client);
		this.log(`${registry.fields.length} fields cached for ${project}.`);
	}
}
