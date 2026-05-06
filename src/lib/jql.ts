// Port of internal/jql/builder.go from
// bitbucket.build.dkinternal.com/projects/CLI/repos/jira-cloud-cli.
//
// All user-supplied values are double-quoted in the output; special characters
// (double-quote and backslash) are escaped inside quoted values. This prevents
// JQL injection from arbitrary input.

export type JQLOptions = {
	project?: string;
	assignee?: string;
	status?: string;
	sprint?: string;
	issueType?: string;
	epic?: string;
	label?: string;
	createdAfter?: string;
	updatedAfter?: string;
	unresolved?: boolean;
	resolved?: boolean;
	customFields?: Array<{ fieldName: string; value: string }>;
};

// BuildJQL constructs a JQL string from opts, appending ORDER BY updated DESC.
// Returns "" if no fields are set.
export function buildJql(opts: JQLOptions): string {
	const clauses: string[] = [];

	if (opts.project) {
		clauses.push(`project = ${quoteIdent(opts.project)}`);
	}

	if (opts.assignee) {
		if (opts.assignee.toLowerCase() === "me") {
			clauses.push("assignee = currentUser()");
		} else {
			clauses.push(`assignee = ${quoteValue(opts.assignee)}`);
		}
	}

	if (opts.status) {
		const canonical = mapStatus(opts.status);
		clauses.push(`status = ${quoteValue(canonical)}`);
	}

	if (opts.sprint) {
		if (opts.sprint.toLowerCase() === "active") {
			clauses.push("sprint IN openSprints()");
		} else {
			clauses.push(`sprint = ${quoteValue(opts.sprint)}`);
		}
	}

	if (opts.issueType) {
		clauses.push(`issuetype = ${quoteValue(opts.issueType)}`);
	}

	if (opts.epic) {
		clauses.push(`"Epic Link" = ${quoteValue(opts.epic)}`);
	}

	if (opts.label) {
		clauses.push(`labels = ${quoteValue(opts.label)}`);
	}

	if (opts.unresolved) {
		clauses.push("resolution IS EMPTY");
	} else if (opts.resolved) {
		clauses.push("resolution IS NOT EMPTY");
	}

	if (opts.createdAfter) {
		clauses.push(`created >= ${quoteValue(opts.createdAfter)}`);
	}
	if (opts.updatedAfter) {
		clauses.push(`updated >= ${quoteValue(opts.updatedAfter)}`);
	}

	for (const cf of opts.customFields ?? []) {
		clauses.push(`${quoteValue(cf.fieldName)} = ${quoteValue(cf.value)}`);
	}

	if (clauses.length === 0) return "";
	return `${clauses.join(" AND ")} ORDER BY updated DESC`;
}

// mapStatus converts common shorthand status names to canonical Jira display names.
// Input is case-insensitive. Unknown values are returned verbatim.
function mapStatus(s: string): string {
	switch (s.toLowerCase().replace(/-/g, "")) {
		case "todo":
			return "To Do";
		case "inprogress":
			return "In Progress";
		case "done":
			return "Done";
		default:
			return s;
	}
}

// quoteValue wraps s in double-quotes and escapes any contained backslash or
// double-quote. Use this for all user-supplied leaf values.
function quoteValue(s: string): string {
	const escaped = s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	return `"${escaped}"`;
}

// quoteIdent returns s without quotes when it is a simple alphanumeric identifier
// (letters, digits, hyphens, underscores, dots) — suitable for project keys.
// Otherwise falls back to quoteValue.
function quoteIdent(s: string): string {
	if (/^[A-Za-z0-9._-]+$/.test(s)) return s;
	return quoteValue(s);
}
