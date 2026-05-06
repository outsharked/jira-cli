import { Args, Command, Flags } from "@oclif/core";
import { textToAdf } from "../../../lib/adf.js";
import { createClient } from "../../../lib/client.js";
import { isInteractive, openEditor } from "../../../lib/prompt.js";

export default class IssueCommentAdd extends Command {
	static override description = "Add a comment to an issue";
	static override examples = [
		'<%= config.bin %> issue comment add KAN-1 --body "Looks good"',
		"<%= config.bin %> issue comment add KAN-1",
	];

	static override args = {
		key: Args.string({ description: "Issue key (e.g. KAN-1)", required: true }),
	};

	static override flags = {
		body: Flags.string({
			char: "b",
			description: "Comment text",
		}),
		"no-input": Flags.boolean({
			description: "Disable editor; error if body missing",
		}),
	};

	async run(): Promise<void> {
		const { args, flags } = await this.parse(IssueCommentAdd);

		let body = flags.body;
		if (!body) {
			if (!isInteractive(flags["no-input"] ?? false)) {
				this.error("--body is required in non-interactive mode");
			}
			body = await openEditor();
			if (!body) this.error("Aborted: empty comment.");
		}

		const client = createClient();
		await client.issueComments.addComment({
			issueIdOrKey: args.key,
			comment: textToAdf(body),
		});
		this.log(`Comment added to ${args.key}.`);
	}
}
