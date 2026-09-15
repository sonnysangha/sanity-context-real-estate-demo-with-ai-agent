import "./env";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { suggestedPrompts } from "../src/lib/suggested-prompts";
import { presentGroq } from "../src/lib/groq-presentation";
import type { Listing } from "../src/lib/types";
const report = [];
for (const suggestion of suggestedPrompts) {
  const started = Date.now();
  const response = await fetch(
    (process.env.DEMO_BASE_URL || "http://127.0.0.1:3000") + "/api/chat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: "suggestion-" + suggestion.id,
        messages: [{ role: "user", content: suggestion.prompt }],
      }),
    },
  );
  assert.equal(response.status, 200);
  const events = [];
  let buffer = "";
  const decoder = new TextDecoder();
  const reader = response.body!.getReader();
  while (true) {
    const { value: chunk, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines.filter(Boolean))
      events.push({ ...JSON.parse(line), receivedAtMs: Date.now() - started });
  }
  assert(!events.some((e) => e.type === "error"), "Live search error");
  assert(events.some((e) => e.type === "done"));
  const result = events.filter((e) => e.type === "results").at(-1);
  assert(result, "No structured result");
  const expected =
    suggestion.id === "move-in-workspace"
      ? ["foundry-2b", "workshop-3c"]
      : ["foundry-2b", "northlight-4a", "workshop-3c"];
  const ids = (result.listings as Listing[]).map((x) =>
    x._id.replace("homematch-listing-", ""),
  );
  assert.deepEqual([...ids].sort(), [...expected].sort());
  for (const x of result.listings as Listing[]) {
    assert.equal(x.neighbourhood, "Williamsburg");
    assert.equal(x.bedrooms, 2);
    assert(x.monthlyRent < 4500);
    assert(
      x.furnished &&
        x.petsAllowed &&
        x.inUnitLaundry &&
        x.status === "available",
    );
    if (suggestion.id === "move-in-workspace")
      assert(x.availableFrom <= "2026-11-01");
  }
  const roles = presentGroq(result.trace.query).roles;
  for (const role of ["filter", "keyword", "semantic", "ranking"] as const)
    assert(roles.includes(role), `Missing ${role}`);
  const calls = events.filter((e) => e.type === "tool");
  for (const end of calls.filter((e) => e.call.status === "completed")) {
    const begin = calls.find(
      (e) => e.call.id === end.call.id && e.call.status === "running",
    );
    assert(
      begin && calls.indexOf(begin) < calls.indexOf(end),
      "Missing real call start",
    );
  }
  assert(
    calls.some(
      (e) => e.call.name === "groq_query" && e.call.status === "completed",
    ),
  );
  report.push({
    id: suggestion.id,
    prompt: suggestion.prompt,
    ids,
    query: result.trace.query,
    durationMs: Date.now() - started,
    calls: calls.map((e) => ({
      name: e.call.name,
      status: e.call.status,
      receivedAtMs: e.receivedAtMs,
    })),
  });
  console.log(
    `${suggestion.id}: PASS (${ids.join(", ")}); hard filters + keyword + semantic + live tool events`,
  );
}
await mkdir(".runtime", { recursive: true });
await writeFile(
  ".runtime/suggestion-rehearsal.json",
  JSON.stringify(
    { verifiedAt: new Date().toISOString(), scenarios: report },
    null,
    2,
  ) + "\n",
);
