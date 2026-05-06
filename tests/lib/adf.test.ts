import { describe, expect, it } from "vitest";
import { renderAdf, textToAdf } from "../../src/lib/adf.js";

describe("renderAdf", () => {
	it("returns empty string for null", () => {
		expect(renderAdf(null)).toBe("");
	});
	it("returns stringified value for a non-object primitive", () => {
		expect(renderAdf("hello")).toBe("hello");
	});
	it("returns the text property for a text node", () => {
		expect(renderAdf({ type: "text", text: "hello" })).toBe("hello");
	});
	it("joins paragraph content with newlines", () => {
		expect(
			renderAdf({
				type: "paragraph",
				content: [
					{ type: "text", text: "hello" },
					{ type: "text", text: "world" },
				],
			}),
		).toBe("hello\nworld");
	});
	it("joins non-paragraph content without separator", () => {
		expect(
			renderAdf({
				type: "doc",
				content: [
					{ type: "text", text: "a" },
					{ type: "text", text: "b" },
				],
			}),
		).toBe("ab");
	});
	it("handles nested paragraphs inside a doc", () => {
		expect(
			renderAdf({
				type: "doc",
				content: [
					{ type: "paragraph", content: [{ type: "text", text: "line one" }] },
					{ type: "paragraph", content: [{ type: "text", text: "line two" }] },
				],
			}),
		).toBe("line one\nline two");
	});
	it("returns empty string for a node with no content and no text", () => {
		expect(renderAdf({ type: "hardBreak" })).toBe("");
	});
});

describe("textToAdf", () => {
	it("produces a doc > paragraph > text structure", () => {
		const doc = textToAdf("hello world") as any;
		expect(doc.type).toBe("doc");
		expect(doc.version).toBe(1);
		expect(doc.content[0].type).toBe("paragraph");
		expect(doc.content[0].content[0].type).toBe("text");
		expect(doc.content[0].content[0].text).toBe("hello world");
	});
	it("preserves the text content exactly", () => {
		const text = "multi\nline";
		expect((textToAdf(text) as any).content[0].content[0].text).toBe(text);
	});
});
