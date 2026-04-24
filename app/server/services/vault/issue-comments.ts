export interface IssueComment {
  readonly author: string;
  readonly timestamp: string;
  readonly body: string;
}

function normalizeBody(body: string): string {
  return body.replace(/\r\n?/g, "\n").trim();
}

export function readIssueSection(body: string, heading: string): string | null {
  const normalizedBody = normalizeBody(body);
  if (normalizedBody.length === 0) {
    return null;
  }

  const match = normalizedBody.match(new RegExp(`(?:^|\\n)##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "i"));
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : null;
}

export function replaceIssueSection(body: string, heading: string, value: string | null | undefined): string {
  const normalized = body.trim();
  const sectionPattern = new RegExp(`(?:\\n|^)##\\s+${heading}\\s*\\n[\\s\\S]*?(?=\\n##\\s+|$)`, "i");
  const withoutSection = normalized.replace(sectionPattern, "").trim();
  if (value === undefined) {
    return normalized;
  }

  const parts = [withoutSection];
  if (value !== null) {
    parts.push(`## ${heading}\n${value}`);
  }

  return `${parts.filter((part) => part.trim().length > 0).join("\n\n").trimEnd()}\n`;
}

export function parseIssueComments(body: string): ReadonlyArray<IssueComment> {
  const section = readIssueSection(body, "Comments");
  if (section === null) {
    return [];
  }

  const comments: IssueComment[] = [];
  const pattern = /^###\s+(.+?)\s+\|\s+(.+?)\n([\s\S]*?)(?=\n###\s+|$)/gm;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(section)) !== null) {
    const [, author, timestamp, commentBody] = match;
    const normalizedCommentBody = commentBody.trim();
    if (!author?.trim() || !timestamp?.trim() || normalizedCommentBody.length === 0) {
      continue;
    }

    comments.push({
      author: author.trim(),
      timestamp: timestamp.trim(),
      body: normalizedCommentBody,
    });
  }

  return comments;
}

export function appendIssueComment(body: string, comment: IssueComment): string {
  const existing = readIssueSection(body, "Comments");
  const nextEntry = `### ${comment.author} | ${comment.timestamp}\n${comment.body.trim()}`;
  const nextSection = existing === null ? nextEntry : `${existing.trim()}\n\n${nextEntry}`;
  return replaceIssueSection(body, "Comments", nextSection);
}
