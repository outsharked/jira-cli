import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	fieldsFilePath,
	getIssueTypes,
	isStale,
	loadFieldRegistry,
	normaliseKey,
	type ProjectRegistry,
	type IssueTypeEntry,
	resolveField,
	saveFieldRegistry,
} from "../../src/lib/fields.js";

describe("normaliseKey", () => {
	it("lowercases and replaces spaces with underscores", () => {
		expect(normaliseKey("Story Points")).toBe("story_points");
	});
	it("replaces hyphens with underscores", () => {
		expect(normaliseKey("Due-Date")).toBe("due_date");
	});
	it("strips non-alphanumeric characters", () => {
		expect(normaliseKey("Field (beta)")).toBe("field_beta");
	});
	it("collapses multiple separators", () => {
		expect(normaliseKey("My  Field--Name")).toBe("my_field_name");
	});
});

describe("fieldsFilePath", () => {
	it("returns a path ending in fields.json", () => {
		expect(fieldsFilePath()).toMatch(/fields\.json$/);
	});
	it("is in the same directory as the config file", async () => {
		vi.stubEnv("JIRA_FIELDS_FILE", "");
		const { configPath } = await import("../../src/lib/config.js");
		expect(dirname(fieldsFilePath())).toBe(dirname(configPath()));
		vi.unstubAllEnvs();
	});
});

const sampleRegistry: ProjectRegistry = {
	syncedAt: new Date().toISOString(),
	fields: [
		{
			id: "customfield_10016",
			name: "Story Points",
			key: "story_points",
			schema: { type: "number" },
			allowedValues: null,
		},
		{
			id: "customfield_10050",
			name: "Environment",
			key: "environment",
			schema: { type: "option" },
			allowedValues: ["Production", "Staging"],
		},
	],
	issueTypes: [
		{ id: "10001", name: "Story", subtask: false },
		{ id: "10002", name: "Bug", subtask: false },
		{ id: "10003", name: "Sub-task", subtask: true },
	],
};

describe("resolveField", () => {
	it("resolves by exact ID", () => {
		const entry = resolveField(sampleRegistry, "customfield_10016");
		expect(entry?.name).toBe("Story Points");
	});
	it("resolves by exact key", () => {
		const entry = resolveField(sampleRegistry, "story_points");
		expect(entry?.name).toBe("Story Points");
	});
	it("resolves by case-insensitive name", () => {
		const entry = resolveField(sampleRegistry, "story points");
		expect(entry?.name).toBe("Story Points");
	});
	it("resolves by mixed-case name", () => {
		const entry = resolveField(sampleRegistry, "ENVIRONMENT");
		expect(entry?.name).toBe("Environment");
	});
	it("returns undefined for unknown input", () => {
		expect(resolveField(sampleRegistry, "nonexistent")).toBeUndefined();
	});
});

describe("getIssueTypes", () => {
	it("returns the issueTypes array when present", () => {
		const types = getIssueTypes(sampleRegistry);
		expect(types).toHaveLength(3);
		expect(types[0].name).toBe("Story");
	});
	it("returns an empty array when issueTypes is absent", () => {
		const reg: ProjectRegistry = { syncedAt: new Date().toISOString(), fields: [] };
		expect(getIssueTypes(reg)).toEqual([]);
	});
});

describe("isStale", () => {
	it("returns false for a registry synced just now", () => {
		expect(
			isStale({ ...sampleRegistry, syncedAt: new Date().toISOString() }),
		).toBe(false);
	});
	it("returns false for a registry synced 6 days ago", () => {
		const recent = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
		expect(isStale({ ...sampleRegistry, syncedAt: recent })).toBe(false);
	});
	it("returns true for a registry synced 8 days ago", () => {
		const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
		expect(isStale({ ...sampleRegistry, syncedAt: old })).toBe(true);
	});
	it("returns true for a registry with a corrupt syncedAt", () => {
		expect(isStale({ ...sampleRegistry, syncedAt: "not-a-date" })).toBe(true);
	});
	it("respects a custom ttlDays parameter", () => {
		const recent = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
		expect(isStale({ ...sampleRegistry, syncedAt: recent }, 1)).toBe(true);
		expect(isStale({ ...sampleRegistry, syncedAt: recent }, 2)).toBe(false);
	});
});

describe("loadFieldRegistry / saveFieldRegistry", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "jira-cli-test-"));
		vi.stubEnv("JIRA_FIELDS_FILE", join(tmpDir, "fields.json"));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true });
		vi.unstubAllEnvs();
	});

	it("returns null when no file exists", () => {
		expect(loadFieldRegistry("KAN")).toBeNull();
	});

	it("returns null for corrupt JSON", () => {
		writeFileSync(join(tmpDir, "fields.json"), "{ invalid json");
		expect(loadFieldRegistry("KAN")).toBeNull();
	});

	it("returns null for a missing project key", () => {
		saveFieldRegistry("ENG", sampleRegistry);
		expect(loadFieldRegistry("KAN")).toBeNull();
	});

	it("round-trips save and load", () => {
		saveFieldRegistry("KAN", sampleRegistry);
		const loaded = loadFieldRegistry("KAN");
		expect(loaded?.fields).toHaveLength(2);
		expect(loaded?.fields[0].id).toBe("customfield_10016");
	});

	it("preserves other projects when saving a new one", () => {
		saveFieldRegistry("KAN", sampleRegistry);
		saveFieldRegistry("ENG", {
			...sampleRegistry,
			syncedAt: new Date().toISOString(),
		});
		expect(loadFieldRegistry("KAN")).not.toBeNull();
		expect(loadFieldRegistry("ENG")).not.toBeNull();
	});
});
