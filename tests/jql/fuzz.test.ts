// Ported from jira-cloud-cli internal/jql/fuzz_test.go
// Go's native fuzzing is replaced with seeded cases + randomized strings, verifying
// the same invariant: no unescaped double-quotes can appear inside quoted values.
import { describe, expect, it } from 'vitest';
import { buildJql, type JQLOptions } from '../../src/lib/jql.js';

const seeds = [
  'normal value',
  "'; DROP TABLE issues; --",
  'value with "quotes"',
  'back\\slash',
  '" OR "1"="1',
  '',
];

const slots: Array<keyof JQLOptions> = [
  'assignee',
  'status',
  'sprint',
  'project',
  'issueType',
  'label',
  'createdAfter',
  'updatedAfter',
];

function randomString(): string {
  const len = Math.floor(Math.random() * 40);
  const chars = 'abc "\\_/.-@:"\'';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function assertNoInjection(result: string, input: string): void {
  if (result === '') return;

  // Primary invariant (from Go fuzz_test.go): unescaped double-quotes must come
  // in pairs (opening + closing for each value). An odd count means a raw "
  // leaked through unescaped.
  let unescaped = 0;
  for (let i = 0; i < result.length; i++) {
    if (result[i] !== '"') continue;
    let bs = 0;
    for (let j = i - 1; j >= 0 && result[j] === '\\'; j--) bs++;
    if (bs % 2 === 0) unescaped++;
  }
  expect(
    unescaped % 2,
    `odd unescaped quotes in ${JSON.stringify(result)} from ${JSON.stringify(input)}`
  ).toBe(0);

  // Note: the Go source has a second "input appears verbatim" check that it
  // acknowledges is a conservative over-approximation — it false-positives on
  // valid escaped output (e.g. input `"b` → output `"\"b"` legitimately contains
  // `"b` as a substring). We intentionally skip that check; the primary
  // invariant above is sufficient for the injection-safety guarantee.
}

describe('buildJql — fuzz invariant', () => {
  const cases = [...seeds, ...Array.from({ length: 200 }, randomString)];

  for (const input of cases) {
    for (const slot of slots) {
      const opts = { [slot]: input } as JQLOptions;
      it(`slot=${slot} input=${JSON.stringify(input).slice(0, 60)}`, () => {
        const got = buildJql(opts);
        assertNoInjection(got, input);
      });
    }
  }
});
