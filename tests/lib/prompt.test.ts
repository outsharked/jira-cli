import { afterEach, describe, expect, it } from "vitest";
import { isInteractive } from "../../src/lib/prompt.js";

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
