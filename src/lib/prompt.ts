import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function isInteractive(noInput: boolean): boolean {
	return (
		!noInput && process.stdin.isTTY === true && process.stdout.isTTY === true
	);
}

export async function openEditor(template = ""): Promise<string> {
	const editor = process.env.EDITOR ?? process.env.VISUAL ?? "vi";
	const dir = mkdtempSync(join(tmpdir(), "jira-cli-"));
	const file = join(dir, "message.txt");
	try {
		writeFileSync(file, template);
		const result = spawnSync(editor, [file], { stdio: "inherit" });
		if (result.status !== 0) {
			throw new Error("Aborted: editor exited with non-zero status");
		}
		const content = readFileSync(file, "utf8").trim();
		if (!content) throw new Error("Aborted: empty input");
		return content;
	} finally {
		rmSync(dir, { recursive: true });
	}
}
