import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { presentGroq } from "../src/lib/groq-presentation";
import {
  settleToolCalls,
  updateToolCalls,
  visibleToolInput,
} from "../src/lib/tool-activity";
import type { AgentToolCall } from "../src/lib/types";

const textOf = (query: string) =>
  presentGroq(query)
    .lines.map((line) => line.map((piece) => piece.text).join(""))
    .join("\n");
const lexicalWords = (query: string) =>
  query.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s"']+/g);
const characterStream = (query: string) =>
  lexicalWords(query)
    ?.map((word) => (/^['"]/.test(word) ? word : word.replace(/\s/g, "")))
    .join("");

test("formatting preserves every example query's exact non-whitespace content", () => {
  const report = JSON.parse(
    readFileSync(
      new URL("./fixtures/query-examples.json", import.meta.url),
      "utf8",
    ),
  );
  for (const check of report.checks) {
    assert.equal(presentGroq(check.query).formatted, true);
    assert.equal(
      characterStream(textOf(check.query)),
      characterStream(check.query),
    );
    assert.ok(textOf(check.query).split("\n").length > 10);
  }
});

test("quoted operators, bracket characters and escaped quotes stay in one token", () => {
  const query =
    '*[title == "A \\"quoted\\" home, [near] work && play" && monthlyRent < 4500]{title}';
  const presented = presentGroq(query);
  assert.equal(presented.formatted, true);
  const pieces = presented.lines.flat();
  assert.ok(
    pieces.some(
      (piece) => piece.text === '"A \\"quoted\\" home, [near] work && play"',
    ),
  );
  assert.equal(characterStream(textOf(query)), characterStream(query));
});

test("hard selectors, keyword boost, semantic similarity and ordering have distinct roles", () => {
  const query =
    '*[bedrooms == 2 && amenities[name == "laundry"]]{title} | score(boost([title] match text::query("Northlight"), 3), text::semanticSimilarity("bright workspace")) | order(_score desc)[0...10]';
  const tokens = presentGroq(query).lines.flat();
  const role = (text: string) =>
    tokens.find((token) => token.text === text)?.role;
  assert.equal(role("bedrooms"), "filter");
  assert.equal(role("amenities"), "filter");
  assert.equal(role("boost"), "keyword");
  assert.equal(role("text::query"), "keyword");
  assert.equal(role('"Northlight"'), "keyword");
  assert.equal(role("text::semanticSimilarity"), "semantic");
  assert.equal(role('"bright workspace"'), "semantic");
  assert.equal(role("order"), "ranking");
  assert.equal(role("10"), "plain");
  assert.equal(tokens.find((token) => token.text === "title")?.role, "plain");
});

test("a keyword-only query does not claim semantic retrieval; array literals are not filters", () => {
  const result = presentGroq(
    '*[_type == "listing"] | score([title, description] match "loft")',
  );
  assert.equal(result.roles.includes("semantic"), false);
  assert.equal(
    result.lines.flat().find((token) => token.text === "description")?.role,
    "ranking",
  );
});

test("unsupported, commented or unbalanced syntax falls back to exact raw lines", () => {
  for (const query of [
    '*[title == "unfinished]',
    '*[_type == "listing"] // keep comment\n{title}',
    "*[x ` y]",
    "*[(x]",
  ]) {
    assert.equal(presentGroq(query).formatted, false);
    assert.equal(textOf(query), query);
  }
});

const running: AgentToolCall = {
  id: "call-a",
  name: "groq_query",
  status: "running",
  input: { query: '*[_type == "listing"]' },
  startedAt: "2026-09-15T10:00:00Z",
};

test("tool events preserve identity, settle terminal states and ignore delayed starts", () => {
  const begun = updateToolCalls([], running);
  const complete = {
    ...running,
    status: "completed" as const,
    durationMs: 24,
    summary: "3 matching homes returned.",
  };
  const finished = updateToolCalls(begun, complete);
  assert.equal(finished.length, 1);
  assert.deepEqual(finished[0], complete);
  assert.deepEqual(updateToolCalls(finished, running), finished);
  const second = { ...running, id: "call-b" };
  const cancelled = settleToolCalls(
    updateToolCalls(finished, second),
    "cancelled",
  );
  assert.equal(cancelled[0].status, "completed");
  assert.equal(cancelled[1].status, "cancelled");
  assert.equal(settleToolCalls([running], "error")[0].status, "error");
});

test("activity includes only the documented public MCP arguments", () => {
  const input = {
    query: "*[]",
    type: "listing",
    path: "images",
    authorization: "private",
    systemPrompt: "internal",
  };
  assert.deepEqual(visibleToolInput("groq_query", input), { query: "*[]" });
  assert.deepEqual(visibleToolInput("schema_explorer", input), {
    type: "listing",
    path: "images",
  });
  assert.deepEqual(visibleToolInput("groq_query", null), {});
});
