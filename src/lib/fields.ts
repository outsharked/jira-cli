import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Version3Client } from "jira.js";
import { configPath } from "./config.js";

export type FieldEntry = {
	id: string;
	name: string;
	key: string;
	schema: { type: string; custom?: string };
	allowedValues: string[] | null;
};

export type IssueTypeEntry = {
	id: string;
	name: string;
	subtask: boolean;
};

export type ProjectRegistry = {
	syncedAt: string;
	fields: FieldEntry[];
	issueTypes?: IssueTypeEntry[];
};

type FieldsFile = Record<string, ProjectRegistry>;

export function fieldsFilePath(): string {
	const envPath = process.env.JIRA_FIELDS_FILE;
	if (envPath) return envPath;
	return join(dirname(configPath()), "fields.json");
}

export function normaliseKey(name: string): string {
	return name
		.toLowerCase()
		.replace(/[\s-]+/g, "_")
		.replace(/[^a-z0-9_]/g, "")
		.replace(/_+/g, "_")
		.replace(/^_|_$/g, "");
}

export function loadFieldRegistry(project: string): ProjectRegistry | null {
	const path = fieldsFilePath();
	if (!existsSync(path)) return null;
	try {
		const file: FieldsFile = JSON.parse(readFileSync(path, "utf8"));
		return file[project] ?? null;
	} catch {
		return null;
	}
}

export function saveFieldRegistry(
	project: string,
	registry: ProjectRegistry,
): void {
	const path = fieldsFilePath();
	let file: FieldsFile = {};
	if (existsSync(path)) {
		try {
			file = JSON.parse(readFileSync(path, "utf8"));
		} catch {
			// corrupt file — start fresh
		}
	}
	file[project] = registry;
	writeFileSync(path, JSON.stringify(file, null, 2));
}

export function resolveField(
	registry: ProjectRegistry,
	input: string,
): FieldEntry | undefined {
	// 1. exact ID
	const byId = registry.fields.find((f) => f.id === input);
	if (byId) return byId;
	// 2. exact key
	const byKey = registry.fields.find((f) => f.key === input);
	if (byKey) return byKey;
	// 3. case-insensitive name
	const lower = input.toLowerCase();
	return registry.fields.find((f) => f.name.toLowerCase() === lower);
}

export function getIssueTypes(registry: ProjectRegistry): IssueTypeEntry[] {
	return registry.issueTypes ?? [];
}

export async function syncFieldRegistry(
	project: string,
	client: Version3Client,
): Promise<ProjectRegistry> {
	const rawFields = await client.issueFields.getFields();

	const fields: FieldEntry[] = [];
	for (const f of rawFields) {
		if (!f.id || !f.name || !f.schema) continue;
		const isOption = f.schema.type === "option" || f.schema.items === "option";
		let allowedValues: string[] | null = null;
		if (isOption) {
			try {
				const contexts =
					await client.issueCustomFieldContexts.getContextsForField({
						fieldId: f.id,
					});
				const ctxId = contexts.values?.[0]?.id;
				if (ctxId) {
					const opts =
						await client.issueCustomFieldOptions.getOptionsForContext({
							fieldId: f.id,
							contextId: Number(ctxId),
						});
					allowedValues =
						opts.values?.flatMap((o) =>
							!o.disabled && o.value != null ? [o.value] : [],
						) ?? null;
				}
			} catch {
				// allowed values are best-effort; leave null on error
			}
		}
		fields.push({
			id: f.id,
			name: f.name,
			key: normaliseKey(f.name),
			schema: {
				type: f.schema.type ?? "string",
				...(f.schema.custom ? { custom: f.schema.custom } : {}),
			},
			allowedValues,
		});
	}

	const registry: ProjectRegistry = {
		syncedAt: new Date().toISOString(),
		fields,
	};
	saveFieldRegistry(project, registry);
	return registry;
}

export function isStale(registry: ProjectRegistry, ttlDays = 7): boolean {
	const t = new Date(registry.syncedAt).getTime();
	if (Number.isNaN(t)) return true;
	return Date.now() - t > ttlDays * 24 * 60 * 60 * 1000;
}

export async function getOrSyncRegistry(
	project: string,
	client: Version3Client,
	onAutoSync?: () => void,
	ttlDays = 7,
): Promise<ProjectRegistry> {
	const existing = loadFieldRegistry(project);
	if (existing && !isStale(existing, ttlDays)) return existing;
	onAutoSync?.();
	return syncFieldRegistry(project, client);
}
