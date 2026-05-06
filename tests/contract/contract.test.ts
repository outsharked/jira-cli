// Port targets: jira-cloud-cli contract/*_test.go
//   - contract_test.go (155 lines)          — top-level schema validation
//   - canonical_fields_test.go (345 lines)  — canonical field name mapping
//   - error_envelope_test.go (262 lines)    — Jira error response parsing
//   - field_shape_test.go (142 lines)       — response shape assertions
// Plus fixtures under contract/schemas/ and testdata/fixtures/.
//
// These validate the shape of Jira API responses. jira.js gives us typed
// responses so many of these are partially enforced at compile time, but
// runtime validators (e.g. zod) on the edges will still be worth it.
import { describe, it } from 'vitest';

describe.skip('API contract (port of contract/*_test.go)', () => {
  it.todo('canonical fields: summary, description, status, assignee, priority, labels');
  it.todo('rejects response missing required fields');
  it.todo('error envelope: single-message errors');
  it.todo('error envelope: field-level errorMessages map');
  it.todo('error envelope: 401 vs 403 vs 404 mapped to auth/forbidden/notfound');
  it.todo('field shape: assignee is {accountId, displayName, emailAddress?}');
  it.todo('field shape: status is {name, statusCategory.key}');
  it.todo('fixture replay: canned responses parse cleanly');
});
