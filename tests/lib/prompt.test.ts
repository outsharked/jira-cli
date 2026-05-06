import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isInteractive, openEditor } from "../../src/lib/prompt.js";

describe("isInteractive", () => {
	const origStdin = process.stdin.isTTY;
	const origStdout = process.stdout.isTTY;

	afterEach(() => {
		Object.defineProperty(process.stdin, "isTTY", {
			value: origStdin,
			configurable: true,
			writable: true,
		});
		Object.defineProperty(process.stdout, "isTTY", {
			value: origStdout,
			configurable: true,
			writable: true,
		});
	});

	function setTTY(stdin: boolean, stdout: boolean) {
		Object.defineProperty(process.stdin, "isTTY", {
			value: stdin,
			configurable: true,
			writable: true,
		});
		Object.defineProperty(process.stdout, "isTTY", {
			value: stdout,
			configurable: true,
			writable: true,
		});
	}

	it("returns true when noInput is false and both are TTYs", () => {
		setTTY(true, true);
		expect(isInteractive(false)).toBe(true);
	});
	it("returns false when noInput is true", () => {
		setTTY(true, true);
		expect(isInteractive(true)).toBe(false);
	});
	it("returns false when stdin is not a TTY", () => {
		setTTY(false, true);
		expect(isInteractive(false)).toBe(false);
	});
	it("returns false when stdout is not a TTY", () => {
		setTTY(true, false);
		expect(isInteractive(false)).toBe(false);
	});
});

describe("openEditor allowEmpty", () => {
	it("throws on empty content by default", async () => {
		vi.stubEnv("EDITOR", "true"); // 'true' command exits 0 without writing
		await expect(openEditor()).rejects.toThrow(/empty input/);
		vi.unstubAllEnvs();
	});

	it("returns empty string when allowEmpty is true and editor writes nothing", async () => {
		vi.stubEnv("EDITOR", "true");
		const result = await openEditor("", true);
		expect(result).toBe("");
		vi.unstubAllEnvs();
	});
});
