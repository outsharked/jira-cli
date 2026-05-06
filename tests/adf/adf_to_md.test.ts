// Port target: jira-cloud-cli internal/adf/adf_to_md_test.go (427 lines)
//
// Behavior to preserve when porting:
//  - Invalid JSON → (input, ok=false)
//  - Non-doc root type → (input, ok=false)
//  - Empty doc → ("", ok=true)
//  - Paragraph, heading (levels clamped to 1..6)
//  - Lists (bullet, ordered, nested)
//  - Marks: strong, em, code, strike, link
//  - Code blocks with language
//  - Blockquote, rule, hardBreak, mention, status, emoji
//
// Un-skip when implementing src/lib/adf.ts (adfToMarkdown).
import { describe, it } from 'vitest';

describe.skip('adfToMarkdown (port of internal/adf/adf_to_md_test.go)', () => {
  it.todo('invalid JSON returns input unchanged with ok=false');
  it.todo('non-doc type returns input unchanged with ok=false');
  it.todo('empty doc returns empty string with ok=true');
  it.todo('paragraph renders plain text');
  it.todo('heading levels 1-6 render as hashes');
  it.todo('heading level 0 clamps to 1, level 7+ clamps to 6');
  it.todo('bullet list renders with dashes');
  it.todo('ordered list renders with numbers');
  it.todo('nested lists indent correctly');
  it.todo('strong/em/code/strike/link marks round-trip');
  it.todo('code block preserves language');
});
