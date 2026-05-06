import { Config } from "@oclif/core";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import FieldsSync from "../../src/commands/fields/sync.js";
import { fieldsFilePath, loadFieldRegistry } from "../../src/lib/fields.js";

const hasCredentials =
	!!process.env.JIRA_API_TOKEN ||
	existsSync(
		join(process.env.HOME ?? "", ".config/jira-cli/config.json"),
	);

describe.skipIf(!hasCredentials)("fields sync (integration)", () => {
	let oclifConfig: Config;
	const testFieldsFile = join(
		process.env.HOME ?? "",
		".config/jira-cli/fields-test.json",
	);

	beforeAll(async () => {
		oclifConfig = await Config.load({ root: join(import.meta.dirname, "../..") });
		process.env.JIRA_FIELDS_FILE = testFieldsFile;
	});

	afterAll(() => {
		delete process.env.JIRA_FIELDS_FILE;
		if (existsSync(testFieldsFile)) unlinkSync(testFieldsFile);
	});

	it("syncs and writes a non-empty registry", async () => {
		await FieldsSync.run(["--project", "KAN"], oclifConfig);
		const registry = loadFieldRegistry("KAN");
		expect(registry).not.toBeNull();
		expect(registry!.fields.length).toBeGreaterThan(0);
		expect(registry!.syncedAt).toBeTruthy();
	});

	it("every entry has id, name, key, and schema", () => {
		const registry = loadFieldRegistry("KAN")!;
		for (const f of registry.fields) {
			expect(f.id).toBeTruthy();
			expect(f.name).toBeTruthy();
			expect(f.key).toBeTruthy();
			expect(f.schema.type).toBeTruthy();
		}
	});
});
