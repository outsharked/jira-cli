import { Version3Client } from "jira.js";
import { loadConfig } from "./config.js";

export function createClient(): Version3Client {
	const cfg = loadConfig();
	return new Version3Client({
		host: cfg.host,
		authentication: {
			basic: {
				email: cfg.email,
				apiToken: cfg.apiToken,
			},
		},
	});
}
