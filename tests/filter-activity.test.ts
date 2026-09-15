import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { queryFilters } from "../src/lib/query-filters";
import { filterChanges } from "../src/lib/filter-activity";
import { defaultFilters } from "../src/lib/types";
import { appendResponseEvent } from "../src/lib/chat-transcript";
test("Hybrid query examples synchronize hard controls without promoting preferences", async () => {
  const report = JSON.parse(
    await readFile(
      new URL("./fixtures/hybrid-query-examples.json", import.meta.url),
      "utf8",
    ),
  );
  for (const scenario of report.scenarios) {
    assert.deepEqual(queryFilters(scenario.query), {
      ...defaultFilters,
      neighbourhood: "Williamsburg",
      bedrooms: "2",
      maxRent: "4500",
      furnished: true,
      petsAllowed: true,
      inUnitLaundry: true,
      availableBy: scenario.id === "move-in-workspace" ? "2026-11-01" : "",
    });
  }
});
test("OR branches, nested selectors, and unsupported rent comparators never become UI requirements", () => {
  assert.deepEqual(
    queryFilters(
      '*[(bedrooms == 1 || bedrooms == 2) && monthlyRent <= 4500 && count(features[@ == "petsAllowed"]) > 0]',
    ),
    defaultFilters,
  );
  assert.equal(queryFilters("*[bedrooms == 2"), null);
  assert.equal(queryFilters("*[/* comment */ bedrooms == 2]"), null);
  assert.equal(
    queryFilters(
      '*[title == "]"] | score(text::semanticSimilarity("home office"))',
    )?.bedrooms,
    "",
  );
});
test("Filter changes report exact before/after values, including clears and sorting", () => {
  const before = { ...defaultFilters, maxRent: "4500", furnished: true };
  const after = {
    ...defaultFilters,
    maxRent: "4000",
    sort: "price-desc" as const,
  };
  assert.deepEqual(
    filterChanges({ before, after }).map((x) => [x.label, x.before, x.after]),
    [
      ["Monthly rent", "Under $4,500", "Under $4,000"],
      ["Furnished", "Required", "Any"],
      ["Order", "Search order", "Rent: high to low"],
    ],
  );
  assert.deepEqual(filterChanges({ before, after: before }), []);
});
test("Applied-filter events stay with their response and do not modify model answer text", () => {
  const messages = appendResponseEvent(
    [{ id: "a", role: "assistant", content: "Found three homes." }],
    "a",
    {
      type: "filters",
      activity: {
        source: "agent",
        before: defaultFilters,
        after: { ...defaultFilters, bedrooms: "2" },
        resultCount: 3,
      },
    },
  );
  assert.equal(messages[0].content, "Found three homes.");
  assert.equal(messages[0].parts?.[0].type, "filters");
});
