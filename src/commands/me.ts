import { Command, Flags } from "@oclif/core";
import { createClient } from "../lib/client.js";

export default class Me extends Command {
	static override description =
		"Print the current user's accountId (for shell substitution)";

	static override flags = {
		verbose: Flags.boolean({
			char: "v",
			description: "Show display name and email too",
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(Me);
		const client = createClient();
		const me = await client.myself.getCurrentUser();
		if (flags.verbose) {
			this.log(`${me.accountId}\t${me.displayName}\t${me.emailAddress ?? ""}`);
		} else {
			this.log(me.accountId ?? "");
		}
	}
}
