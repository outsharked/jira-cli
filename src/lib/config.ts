import Conf from "conf";

export type JiraConfig = {
	host: string;
	email: string;
	apiToken: string;
	defaultProject?: string;
	defaultBoard?: number;
	fieldsCacheTtlDays?: number;
};

const store = new Conf<Partial<JiraConfig>>({
	projectName: "jira-cli",
	projectSuffix: "",
	schema: {
		host: { type: "string" },
		email: { type: "string" },
		apiToken: { type: "string" },
		defaultProject: { type: "string" },
		defaultBoard: { type: "number" },
		fieldsCacheTtlDays: { type: "number" },
	},
});

// Environment variables take precedence over the file store.
// Supported: JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_DEFAULT_PROJECT, JIRA_FIELDS_TTL_DAYS
export function loadConfig(): JiraConfig {
	const host = process.env.JIRA_HOST ?? store.get("host");
	const email = process.env.JIRA_EMAIL ?? store.get("email");
	const apiToken = process.env.JIRA_API_TOKEN ?? store.get("apiToken");
	if (!host || !email || !apiToken) {
		throw new Error("Not configured. Run `jira init` to set up credentials.");
	}
	const ttlEnv = process.env.JIRA_FIELDS_TTL_DAYS;
	const ttlParsed = ttlEnv ? Number.parseInt(ttlEnv, 10) : undefined;
	return {
		host,
		email,
		apiToken,
		defaultProject:
			process.env.JIRA_DEFAULT_PROJECT ?? store.get("defaultProject"),
		defaultBoard: store.get("defaultBoard"),
		fieldsCacheTtlDays:
			ttlParsed !== undefined && !Number.isNaN(ttlParsed)
				? ttlParsed
				: store.get("fieldsCacheTtlDays"),
	};
}

export function saveConfig(cfg: Partial<JiraConfig>): void {
	for (const [k, v] of Object.entries(cfg)) {
		if (v === undefined) continue;
		store.set(k as keyof JiraConfig, v);
	}
}

export function configPath(): string {
	return store.path;
}
