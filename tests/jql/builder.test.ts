// Ported from jira-cloud-cli internal/jql/builder_test.go
import { describe, expect, it } from 'vitest';
import { buildJql } from '../../src/lib/jql.js';

describe('buildJql — status mappings', () => {
  const cases: Array<[string, string]> = [
    ['todo', 'status = "To Do"'],
    ['Todo', 'status = "To Do"'],
    ['TODO', 'status = "To Do"'],
    ['in-progress', 'status = "In Progress"'],
    ['In-Progress', 'status = "In Progress"'],
    ['inprogress', 'status = "In Progress"'],
    ['done', 'status = "Done"'],
    ['Done', 'status = "Done"'],
    ['DONE', 'status = "Done"'],
    ['Backlog', 'status = "Backlog"'],
    ['Custom Status', 'status = "Custom Status"'],
  ];
  for (const [input, want] of cases) {
    it(`maps ${JSON.stringify(input)}`, () => {
      expect(buildJql({ status: input })).toContain(want);
    });
  }
});

describe('buildJql — assignee', () => {
  it('maps "me" to currentUser()', () => {
    const got = buildJql({ assignee: 'me' });
    expect(got).toContain('assignee = currentUser()');
    expect(got).not.toContain('"currentUser');
  });

  it('quotes email assignee', () => {
    expect(buildJql({ assignee: 'user@example.com' })).toContain(
      'assignee = "user@example.com"'
    );
  });
});

describe('buildJql — sprint', () => {
  it('maps "active" to openSprints()', () => {
    expect(buildJql({ sprint: 'active' })).toContain('sprint IN openSprints()');
  });

  it('quotes named sprint', () => {
    expect(buildJql({ sprint: 'Sprint 5' })).toContain('sprint = "Sprint 5"');
  });
});

describe('buildJql — project quoting', () => {
  it('leaves simple project keys unquoted', () => {
    expect(buildJql({ project: 'DAR' })).toContain('project = DAR');
  });

  it('quotes project keys containing spaces', () => {
    expect(buildJql({ project: 'MY PROJECT' })).toContain('project = "MY PROJECT"');
  });
});

describe('buildJql — resolution', () => {
  it('unresolved emits resolution IS EMPTY', () => {
    expect(buildJql({ unresolved: true })).toContain('resolution IS EMPTY');
  });

  it('resolved emits resolution IS NOT EMPTY', () => {
    expect(buildJql({ resolved: true })).toContain('resolution IS NOT EMPTY');
  });
});

describe('buildJql — structure', () => {
  it('appends ORDER BY updated DESC', () => {
    expect(buildJql({ project: 'DAR' }).endsWith('ORDER BY updated DESC')).toBe(true);
  });

  it('returns empty string for empty options', () => {
    expect(buildJql({})).toBe('');
  });

  it('combines multiple flags with AND', () => {
    const got = buildJql({ project: 'DAR', assignee: 'me', status: 'todo' });
    expect(got).toContain('project = DAR');
    expect(got).toContain('assignee = currentUser()');
    expect(got).toContain('status = "To Do"');
    expect(got).toContain('ORDER BY updated DESC');
  });

  it('emits clauses in canonical order: project, assignee, status, sprint', () => {
    const got = buildJql({
      status: 'done',
      sprint: 'active',
      assignee: 'me',
      project: 'DAR',
    });
    const p = got.indexOf('project');
    const a = got.indexOf('assignee');
    const s = got.indexOf('status');
    const sp = got.indexOf('sprint');
    expect(p).toBeLessThan(a);
    expect(a).toBeLessThan(s);
    expect(s).toBeLessThan(sp);
  });
});

describe('buildJql — quoting injection defence', () => {
  it('escapes embedded double-quotes', () => {
    expect(buildJql({ assignee: 'evil"inject' })).toContain('"evil\\"inject"');
  });

  it('escapes backslashes', () => {
    expect(buildJql({ assignee: 'path\\to\\thing' })).toContain('"path\\\\to\\\\thing"');
  });
});

describe("buildJql — labels", () => {
  it("emits labels = for a single label", () => {
    expect(buildJql({ labels: ["bug"] })).toContain('labels = "bug"');
  });

  it("emits labels IN for multiple positive labels", () => {
    expect(buildJql({ labels: ["bug", "ui"] })).toContain(
      'labels IN ("bug", "ui")',
    );
  });

  it("emits labels NOT IN for a negated label (~prefix)", () => {
    expect(buildJql({ labels: ["~bug"] })).toContain('labels NOT IN ("bug")');
  });

  it("emits both IN and NOT IN for mixed labels", () => {
    const got = buildJql({ labels: ["bug", "~ui"] });
    expect(got).toContain('labels IN ("bug")');
    expect(got).toContain('labels NOT IN ("ui")');
  });
});

describe("buildJql — priority", () => {
  it("emits priority = value", () => {
    expect(buildJql({ priority: "High" })).toContain('priority = "High"');
  });
});

describe("buildJql — reporter", () => {
  it('maps "me" to currentUser()', () => {
    const got = buildJql({ reporter: "me" });
    expect(got).toContain("reporter = currentUser()");
    expect(got).not.toContain('"currentUser');
  });

  it("quotes email reporter", () => {
    expect(buildJql({ reporter: "user@example.com" })).toContain(
      'reporter = "user@example.com"',
    );
  });
});

describe("buildJql — watching", () => {
  it("emits issue IN watchedIssues() when watching is true", () => {
    expect(buildJql({ watching: true })).toContain(
      "issue IN watchedIssues()",
    );
  });

  it("does not emit watching clause when watching is false", () => {
    expect(buildJql({ watching: false })).not.toContain("watchedIssues");
  });
});

describe("buildJql — createdBefore / updatedBefore", () => {
  it("emits created < for createdBefore", () => {
    expect(buildJql({ createdBefore: "2026-01-01" })).toContain(
      'created < "2026-01-01"',
    );
  });

  it("emits updated < for updatedBefore", () => {
    expect(buildJql({ updatedBefore: "2026-01-01" })).toContain(
      'updated < "2026-01-01"',
    );
  });

  it("createdAfter and createdBefore coexist in the same query", () => {
    const got = buildJql({
      createdAfter: "2025-01-01",
      createdBefore: "2026-01-01",
    });
    expect(got).toContain('created >= "2025-01-01"');
    expect(got).toContain('created < "2026-01-01"');
  });
});

describe("buildJql — orderBy / orderDirection", () => {
  it("uses updated DESC by default", () => {
    expect(buildJql({ project: "DAR" }).endsWith("ORDER BY updated DESC")).toBe(
      true,
    );
  });

  it("uses custom orderBy field", () => {
    expect(
      buildJql({ project: "DAR", orderBy: "created" }).endsWith(
        "ORDER BY created DESC",
      ),
    ).toBe(true);
  });

  it("uses ASC when orderDirection is ASC", () => {
    expect(
      buildJql({ project: "DAR", orderDirection: "ASC" }).endsWith(
        "ORDER BY updated ASC",
      ),
    ).toBe(true);
  });
});

describe("buildJql — clause order (watching before project)", () => {
  it("watching clause appears before project clause", () => {
    const got = buildJql({ project: "DAR", watching: true });
    expect(got.indexOf("watchedIssues")).toBeLessThan(got.indexOf("project"));
  });
});
