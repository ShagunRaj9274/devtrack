/** Extracts unique, lower-cased @usernames from a comment body. */
export function extractMentions(body: string): string[] {
  const found = new Set<string>();
  const pattern = /(^|[^a-zA-Z0-9_@-])@([a-zA-Z0-9_-]{3,30})/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) found.add(match[2].toLowerCase());
  return [...found];
}
