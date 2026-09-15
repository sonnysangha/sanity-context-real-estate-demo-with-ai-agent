export type QueryRole = "filter" | "keyword" | "semantic" | "ranking" | "plain";
export type QueryPiece = { text: string; role: QueryRole };
type Token = { text: string; start: number; end: number; role: QueryRole };

/** Presentation only: token spelling and order are never changed. */
export function presentGroq(query: string): {
  lines: QueryPiece[][];
  roles: QueryRole[];
  formatted: boolean;
} {
  const fallback = () => ({
    lines: query.split("\n").map((text) => [{ text, role: "plain" as const }]),
    roles: [] as QueryRole[],
    formatted: false,
  });
  // Comments need their original line boundaries. Unknown syntax stays verbatim.
  const pattern =
    /\s+|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[A-Za-z_$][\w$]*(?:::[A-Za-z_]\w*)*|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\.\.|\.\.|=>|->|==|!=|>=|<=|&&|\|\||\*\*|[\[\]{}(),.:|*+\-/%<>=!@^?]/gy;
  const tokens: Token[] = [];
  let cursor = 0;
  while (cursor < query.length) {
    pattern.lastIndex = cursor;
    const match = pattern.exec(query);
    if (
      !match ||
      query.startsWith("//", cursor) ||
      query.startsWith("/*", cursor)
    )
      return fallback();
    cursor = pattern.lastIndex;
    if (!/^\s+$/.test(match[0]))
      tokens.push({
        text: match[0],
        start: match.index,
        end: cursor,
        role: "plain",
      });
  }
  if (!tokens.length) return fallback();
  const pairs = new Map<number, number>();
  const stack: number[] = [];
  const closeFor: Record<string, string> = { "[": "]", "{": "}", "(": ")" };
  for (let i = 0; i < tokens.length; i++) {
    const value = tokens[i].text;
    if (value in closeFor) stack.push(i);
    else if (["]", "}", ")"].includes(value)) {
      const open = stack.pop();
      if (open === undefined || closeFor[tokens[open].text] !== value)
        return fallback();
      pairs.set(open, i);
    }
  }
  if (stack.length) return fallback();
  const paint = (from: number, to: number, role: QueryRole) => {
    for (let i = from; i <= to; i++) tokens[i].role = role;
  };
  const filterStarts = new Set<number>();
  for (const [open, end] of pairs) {
    // Only dataset selectors are labelled eligibility filters. [0], slices and
    // array literals in score() are not independent eligibility predicates.
    if (tokens[open].text === "[" && tokens[open - 1]?.text === "*") {
      filterStarts.add(open);
      paint(open, end, "filter");
    }
  }
  const functionCalls: { start: number; end: number; name: string }[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    if (
      /^[A-Za-z_]\w*(?:::\w+)*$/.test(tokens[i].text) &&
      tokens[i + 1].text === "("
    ) {
      functionCalls.push({
        start: i,
        end: pairs.get(i + 1)!,
        name: tokens[i].text,
      });
    }
  }
  // Paint containers before their children; semantic/keyword expressions take
  // precedence over the score/order operation containing them.
  for (const call of functionCalls) {
    if (/^(?:global::)?(?:score|order|boost)$/.test(call.name))
      paint(call.start, call.end, "ranking");
  }
  for (const call of functionCalls) {
    if (
      /^(?:global::)?boost$/.test(call.name) &&
      tokens.slice(call.start, call.end).some((t) => t.text === "match")
    )
      paint(call.start, call.end, "keyword");
    if (/^text::(?:query|match|bm25)$/.test(call.name))
      paint(call.start, call.end, "keyword");
  }
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].text === "match") tokens[i].role = "keyword";
  }
  for (const call of functionCalls) {
    if (
      /^(?:text::semanticSimilarity|vector::(?:similarity|cosineSimilarity))$/.test(
        call.name,
      )
    )
      paint(call.start, call.end, "semantic");
  }
  const lines: QueryPiece[][] = [[]];
  const layout: { end: number; multiline: boolean }[] = [];
  let indent = 0;
  const newline = () => {
    if (lines.at(-1)!.length) lines.push([]);
  };
  const append = (text: string, role: QueryRole) => {
    const line = lines.at(-1)!;
    if (!line.length && indent)
      line.push({ text: "  ".repeat(indent), role: "plain" });
    line.push({ text, role });
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const closing = layout.at(-1)?.end === i ? layout.pop() : undefined;
    if (closing?.multiline) {
      indent--;
      newline();
    }
    if (token.text === "|") newline();
    if (token.text === "&&" || token.text === "||") newline();
    const previous = tokens[i - 1];
    if (
      lines.at(-1)!.length &&
      previous &&
      /\s/.test(query.slice(previous.end, token.start))
    )
      append(" ", "plain");
    append(token.text, token.role);
    if (pairs.has(i)) {
      const multiline =
        token.text === "{" ||
        filterStarts.has(i) ||
        (token.text === "(" &&
          /^(?:global::)?(?:score|order)$/.test(previous?.text ?? ""));
      layout.push({ end: pairs.get(i)!, multiline });
      if (multiline) {
        indent++;
        newline();
      }
    }
    if (token.text === "," && layout.at(-1)?.multiline) newline();
  }
  return {
    lines: lines.filter((line) => line.length),
    roles: [...new Set(tokens.map((t) => t.role).filter((r) => r !== "plain"))],
    formatted: true,
  };
}
