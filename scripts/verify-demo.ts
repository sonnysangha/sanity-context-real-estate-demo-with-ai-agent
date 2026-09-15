import "./env";
import assert from "node:assert/strict";
import { createClient } from "@sanity/client";
import { need } from "./env";
import { HERO_PROMPT, type Listing } from "../src/lib/types";
import { writeFile, mkdir } from "node:fs/promises";
const base = process.env.DEMO_BASE_URL || "http://127.0.0.1:3000";
const history: { role: "user" | "assistant"; content: string }[] = [];
const report: unknown[] = [];
async function ask(label: string, prompt: string, expected: string[] | null) {
  const started = Date.now();
  history.push({ role: "user", content: prompt });
  const response = await fetch(base + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: history,
      threadId: "homematch-live-rehearsal",
    }),
  });
  assert.equal(response.status, 200);
  const text = await response.text();
  await mkdir(".runtime", { recursive: true });
  await writeFile(
    ".runtime/rehearsal-" +
      label.toLowerCase().replaceAll(" ", "-") +
      ".ndjson",
    text,
  );
  const events = text
    .trim()
    .split("\n")
    .map((x) => JSON.parse(x));
  assert(!events.some((x) => x.type === "error"), text);
  assert(
    events.some((x) => x.type === "done"),
    "Stream did not finish",
  );
  const result = events.filter((x) => x.type === "results").at(-1);
  assert(result, "Agent did not return structured results");
  const listings = result.listings as Listing[];
  const ids = listings.map((x) => x._id.replace("homematch-listing-", ""));
  if (expected) assert.deepEqual(ids, expected);
  for (const home of listings) {
    assert.equal(home.status, "available");
    assert.equal(home.neighbourhood, "Williamsburg");
    assert.equal(home.bedrooms, 2);
    assert(home.furnished && home.petsAllowed && home.inUnitLaundry);
    assert(home.monthlyRent < 4500);
  }
  const answer = events
    .filter((x) => x.type === "text")
    .map((x) => x.text)
    .join("");
  assert(answer.length > 0, "No spoken response");
  history.push({ role: "assistant", content: answer });
  report.push({
    label,
    prompt,
    ids,
    query: result.trace.query,
    answer,
    durationMs: Date.now() - started,
  });
  console.log(label + ": PASS — " + (ids.join(", ") || "zero results"));
  return result;
}
const client = createClient({
  projectId: need("NEXT_PUBLIC_SANITY_PROJECT_ID"),
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
  token: need("SANITY_API_WRITE_TOKEN"),
  apiVersion: "2026-09-01",
  useCdn: false,
});
const id = "homematch-listing-foundry-2b";
const initial = await client.getDocument(id);
assert(
  initial && initial.status === "available",
  "Restore Foundry before rehearsal",
);
try {
  await ask("Hero", HERO_PROMPT, [
    "foundry-2b",
    "northlight-4a",
    "workshop-3c",
  ]);
  await ask(
    "Narrow budget",
    "Keep every other criterion, but lower the budget to under $4,000.",
    ["foundry-2b"],
  );
  await ask(
    "Empty result",
    "Keep every other criterion, but lower the budget to under $3,000.",
    [],
  );
  await ask(
    "Move-in date",
    "Restore the budget to under $4,500. Keep the other original criteria and only include homes available by November 1, 2026.",
    ["foundry-2b", "workshop-3c"],
  );
  const hybrid = await ask(
    "Hybrid preferences",
    "I can be flexible on the move-in date. Keep everything else the same, including the budget under $4,500. I'd love a bright place with a proper workspace. Northlight would be my first choice, but please show me other options too.",
    null,
  );
  assert(
    hybrid.trace.query.includes("semanticSimilarity"),
    "No semantic ranking",
  );
  assert(hybrid.trace.query.includes("match"), "No keyword matching");
  assert.deepEqual(
    [...hybrid.listings.map((x: Listing) => x._id)].sort(),
    ["foundry-2b", "northlight-4a", "workshop-3c"]
      .map((x) => "homematch-listing-" + x)
      .sort(),
  );
  await client.patch(id).set({ status: "rented" }).commit();
  await ask(
    "Live publication",
    "Use the original search criteria again. Check current availability and sort by lowest monthly rent.",
    ["northlight-4a", "workshop-3c"],
  );
} finally {
  await client.patch(id).set({ status: initial.status }).commit();
  await mkdir(".runtime", { recursive: true });
  await writeFile(
    ".runtime/live-rehearsal.json",
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        baseUrl: base,
        contextEndpoint: process.env.SANITY_CONTEXT_MCP_URL,
        model:
          process.env.AI_MODEL ||
          (process.env.ANTHROPIC_API_KEY ? "claude-sonnet-4-6" : "gpt-5.4"),
        restored: true,
        checks: report,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Foundry restored to available.");
}
