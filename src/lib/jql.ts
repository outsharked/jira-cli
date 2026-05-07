// Port of internal/jql/builder.go from
// bitbucket.build.dkinternal.com/projects/CLI/repos/jira-cloud-cli.
//
// All user-supplied values are double-quoted in the output; special characters
// (double-quote and backslash) are escaped inside quoted values. This prevents
// JQL injection from arbitrary input.

export type JQLOptions = {
	project?: string;
	assignee?: string;
	reporter?: string;
	status?: string;
	sprint?: string;
	issueType?: string;
	epic?: string;
	labels?: string[];
	priority?: string;
	watching?: boolean;
	createdAfter?: string;
	createdBefore?: string;
	updatedAfter?: string;
	updatedBefore?: string;
	unresolved?: boolean;
	resolved?: boolean;
	customFields?: Array<{ fieldName: string; value: string }>;
	orderBy?: string;
	orderDirection?: "ASC" | "DESC";
};

export function buildJql(opts: JQLOptions): string {
	const clauses: string[] = [];

	if (opts.watching) {
		clauses.push("issue IN watchedIssues()");
	}

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

	if (opts.reporter) {
		if (opts.reporter.toLowerCase() === "me") {
			clauses.push("reporter = currentUser()");
		} else {
			clauses.push(`reporter = ${quoteValue(opts.reporter)}`);
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

	if (opts.labels?.length) {
		const positive = opts.labels.filter((l) => !l.startsWith("~"));
		const negative = opts.labels
			.filter((l) => l.startsWith("~"))
			.map((l) => l.slice(1));
		if (positive.length === 1 && negative.length === 0) {
			clauses.push(`labels = ${quoteValue(positive[0])}`);
		} else if (positive.length > 0) {
			clauses.push(`labels IN (${positive.map(quoteValue).join(", ")})`);
		}
		if (negative.length === 1) {
			clauses.push(`labels NOT IN (${quoteValue(negative[0])})`);
		} else if (negative.length > 1) {
			clauses.push(`labels NOT IN (${negative.map(quoteValue).join(", ")})`);
		}
	}

	if (opts.priority) {
		clauses.push(`priority = ${quoteValue(opts.priority)}`);
	}

	if (opts.unresolved) {
		clauses.push("resolution IS EMPTY");
	} else if (opts.resolved) {
		clauses.push("resolution IS NOT EMPTY");
	}

	if (opts.createdAfter) {
		clauses.push(`created >= ${quoteValue(opts.createdAfter)}`);
	}
	if (opts.createdBefore) {
		clauses.push(`created < ${quoteValue(opts.createdBefore)}`);
	}
	if (opts.updatedAfter) {
		clauses.push(`updated >= ${quoteValue(opts.updatedAfter)}`);
	}
	if (opts.updatedBefore) {
		clauses.push(`updated < ${quoteValue(opts.updatedBefore)}`);
	}

	for (const cf of opts.customFields ?? []) {
		clauses.push(`${quoteValue(cf.fieldName)} = ${quoteValue(cf.value)}`);
	}

	if (clauses.length === 0) return "";
	const orderBy = opts.orderBy ?? "updated";
	const dir = opts.orderDirection ?? "DESC";
	return `${clauses.join(" AND ")} ORDER BY ${orderBy} ${dir}`;
}

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

function quoteValue(s: string): string {
	const escaped = s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	return `"${escaped}"`;
}

function quoteIdent(s: string): string {
	if (/^[A-Za-z0-9._-]+$/.test(s)) return s;
	return quoteValue(s);
}
