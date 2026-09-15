import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse, evaluate } from "groq-js";
import {
  listingSchema,
  unpackMcp,
  contextScope,
} from "../src/lib/agent-contract";
const seed = JSON.parse(
  await readFile(new URL("../seed/listings.json", import.meta.url), "utf8"),
);
const documents = [...seed.neighbourhoods, ...seed.listings];
const filters =
  '_type == "listing" && public == true && status == "available" && neighbourhood->slug.current == "williamsburg" && bedrooms == 2 && furnished == true && petsAllowed == true && inUnitLaundry == true';
async function query(extra: string, budget = 4500, docs = documents) {
  const ast = parse(
    `*[${filters} && monthlyRent < ${budget} ${extra}] | order(monthlyRent asc) { _id }`,
  );
  return (await (await evaluate(ast, { dataset: docs })).get()).map(
    (x: { _id: string }) => x._id.replace("homematch-listing-", ""),
  );
}
test("All hard filters must match the same apartment", async () => {
  assert.deepEqual(await query(""), [
    "foundry-2b",
    "northlight-4a",
    "workshop-3c",
  ]);
});
test("Budget refinements preserve constraints and return honest empty arrays", async () => {
  assert.deepEqual(await query("", 4000), ["foundry-2b"]);
  assert.deepEqual(await query("", 3000), []);
});
test("Date-only strings compare without datetime coercion", async () => {
  assert.deepEqual(await query('&& availableFrom <= "2026-11-01"'), [
    "foundry-2b",
    "workshop-3c",
  ]);
});
test("Rented units disappear from the same query", async () => {
  const changed = documents.map((x) =>
    x._id === "homematch-listing-foundry-2b" ? { ...x, status: "rented" } : x,
  );
  assert.deepEqual(await query("", 4500, changed), [
    "northlight-4a",
    "workshop-3c",
  ]);
});
test("Endpoint scope excludes non-public listing fixture", async () => {
  const scoped = await (
    await evaluate(parse(`*[${contextScope}]{_id}`), { dataset: documents })
  ).get();
  assert(
    !scoped.some(
      (x: { _id: string }) => x._id === "homematch-listing-east-village-2d",
    ),
  );
});
test("MCP result parsing handles text and structured output, rejects invented card shape", () => {
  const payload = { meta: { resultCount: 0 }, result: [] };
  assert.deepEqual(
    unpackMcp({ content: [{ type: "text", text: JSON.stringify(payload) }] }),
    payload,
  );
  assert.deepEqual(unpackMcp({ structuredContent: payload }), payload);
  assert.equal(
    unpackMcp({ content: [{ type: "text", text: "not JSON" }] }),
    null,
  );
  assert.equal(
    listingSchema.safeParse({ _id: "x", title: "Invented" }).success,
    false,
  );
});
