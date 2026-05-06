import { input, password } from "@inquirer/prompts";
import { Command } from "@oclif/core";
import { Version3Client } from "jira.js";
import { configPath, saveConfig } from "../lib/config.js";

export default class Init extends Command {
	static override description =
		"Configure Jira site, credentials, and default project";

	async run(): Promise<void> {
		await this.parse(Init);
		const host = await input({
			message: "Jira site URL (e.g. https://yourcompany.atlassian.net):",
			validate: (v) => /^https?:\/\//.test(v) || "Must start with http(s)://",
		});
		const email = await input({ message: "Account email:" });
		const apiToken = await password({
			message:
				"API token (id.atlassian.com/manage-profile/security/api-tokens):",
			mask: "*",
		});

		this.log("Verifying credentials...");
		const client = new Version3Client({
			host,
			authentication: { basic: { email, apiToken } },
		});
		const me = await client.myself.getCurrentUser();
		this.log(
			`Authenticated as ${me.displayName} <${me.emailAddress ?? email}>`,
		);

		const defaultProject = await input({
			message: "Default project key (optional, e.g. ENG):",
			default: "",
		});

		saveConfig({
			host,
			email,
			apiToken,
			defaultProject: defaultProject || undefined,
		});
		this.log(`Saved config to ${configPath()}`);
	}
}
