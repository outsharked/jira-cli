export function renderAdf(doc: unknown): string {
	if (!doc || typeof doc !== "object") return String(doc ?? "");
	const node = doc as { type?: string; text?: string; content?: unknown[] };
	if (node.type === "text") return node.text ?? "";
	if (Array.isArray(node.content)) {
		const rendered = node.content.map(renderAdf);
		const hasParagraphs = node.content.some((item) => {
			if (typeof item !== "object" || item === null) return false;
			return (item as Record<string, unknown>).type === "paragraph";
		});
		return rendered.join(
			node.type === "paragraph" || hasParagraphs ? "\n" : "",
		);
	}
	return "";
}

export function textToAdf(text: string): object {
	return {
		type: "doc",
		version: 1,
		content: [
			{
				type: "paragraph",
				content: [{ type: "text", text }],
			},
		],
	};
}
