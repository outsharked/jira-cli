// Port target: jira-cloud-cli internal/adf/md_to_adf_test.go (500 lines)
//
// When we wire up marklassian (or @atlaskit/editor-markdown-transformer) in
// src/lib/adf.ts (markdownToAdf), un-skip and port these cases. The Go impl
// uses goldmark; ours will use a JS lib, so some edge cases may differ —
// document any intentional divergence in the test.
import { describe, it } from 'vitest';

describe.skip('markdownToAdf (port of internal/adf/md_to_adf_test.go)', () => {
  it.todo('empty string produces empty doc');
  it.todo('plain paragraph');
  it.todo('headings 1-6');
  it.todo('emphasis, strong, code, strike');
  it.todo('links with title');
  it.todo('bullet and ordered lists, nested');
  it.todo('code blocks with language');
  it.todo('blockquotes');
  it.todo('thematic break / hr');
  it.todo('round-trip: markdown → ADF → markdown is stable');
});
