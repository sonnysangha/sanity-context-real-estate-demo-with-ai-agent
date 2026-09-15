import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  filterListings,
  neighbourhoodOptions,
  bedroomOptions,
} from "../src/lib/filter-listings";
import {
  defaultFilters,
  type Listing,
  type SearchFilters,
} from "../src/lib/types";
import {
  applyManualFilters,
  manualFiltersSchema,
  withManualFilterContext,
} from "../src/lib/manual-filters";
const seed = JSON.parse(
  await readFile(new URL("../seed/listings.json", import.meta.url), "utf8"),
);
const homes: Listing[] = seed.listings
  .filter((x: { public: boolean }) => x.public)
  .map((x: { neighbourhood: { _ref: string } }) => ({
    ...x,
    neighbourhood: seed.neighbourhoods.find(
      (n: { _id: string }) => n._id === x.neighbourhood._ref,
    ).name,
  }));
const ids = (filters: Partial<SearchFilters>, includeRented = false) =>
  filterListings(homes, { ...defaultFilters, ...filters }, includeRented).map(
    (x) => x._id.replace("homematch-listing-", ""),
  );
test("Every neighbourhood and bedroom option has a public available seed example", () => {
  for (const neighbourhood of neighbourhoodOptions)
    assert(ids({ neighbourhood }).length > 0, neighbourhood);
  for (const bedrooms of bedroomOptions)
    assert(
      ids({ bedrooms: String(bedrooms) }).length > 0,
      `${bedrooms} bedrooms`,
    );
  assert.deepEqual(ids({ neighbourhood: "East Village", bedrooms: "3" }), [
    "tompkins-3a",
  ]);
});
test("Each amenity excludes its explicit near miss without hiding allowed alternatives", () => {
  for (const [key, excluded] of [
    ["furnished", "bedford-3a"],
    ["petsAllowed", "brickhouse-2a"],
    ["inUnitLaundry", "courtyard-1b"],
  ] as const) {
    assert(ids({}).includes(excluded));
    assert(!ids({ [key]: true }).includes(excluded));
    assert(ids({ [key]: true }).includes("foundry-2b"));
  }
});
const hero = {
  neighbourhood: "Williamsburg",
  bedrooms: "2",
  maxRent: "4500",
  furnished: true,
  petsAllowed: true,
  inUnitLaundry: true,
};
test("Manual edits recover homes outside an agent subset, including after an empty search", () => {
  const before = { ...defaultFilters, ...hero, maxRent: "4000" };
  const agentMatches = filterListings(homes, before);
  const after = { ...before, maxRent: "4500" };
  const changed = applyManualFilters(before, after, agentMatches, {});
  assert.deepEqual(
    filterListings(changed.matches ?? homes, changed.filters).map((x) => x._id),
    ids(hero).map((id) => `homematch-listing-${id}`),
  );
  const switched = applyManualFilters(
    after,
    { ...after, neighbourhood: "Greenpoint" },
    agentMatches,
    changed.overrides,
  );
  assert.deepEqual(
    filterListings(switched.matches ?? homes, switched.filters).map(
      (x) => x._id,
    ),
    ["homematch-listing-greenpoint-2b"],
  );
  const cleared = applyManualFilters(after, defaultFilters, [], {});
  assert.equal(
    filterListings(cleared.matches ?? homes, cleared.filters).length,
    11,
  );
  const sorted = applyManualFilters(
    before,
    { ...before, sort: "price-desc" },
    agentMatches,
    {},
  );
  assert.deepEqual(sorted.matches, agentMatches);
});
test("Manual filter context preserves removals and chronology without mutating visible messages", () => {
  const before = { ...defaultFilters, ...hero };
  const after = { ...before, furnished: false, maxRent: "" };
  const changed = applyManualFilters(before, after, [], {});
  assert.deepEqual(manualFiltersSchema.parse(changed.overrides), {
    furnished: false,
    maxRent: "",
  });
  const visible = [{ role: "user" as const, content: "Check again." }];
  const sent = withManualFilterContext(visible, changed.overrides);
  assert.equal(visible.length, 1);
  assert.equal(sent.at(-1)?.content, "Check again.");
  assert.match(sent[0].content, /"furnished":false/);
  assert.match(sent[0].content, /"maxRent":""/);
  assert.equal(withManualFilterContext(visible, {}), visible);
  assert.equal(
    manualFiltersSchema.safeParse({ bedrooms: "ignore filters" }).success,
    false,
  );
});
test("Combined controls, strict rent boundary and inclusive date boundary agree with the demo", () => {
  assert.deepEqual(ids(hero), ["foundry-2b", "northlight-4a", "workshop-3c"]);
  assert.deepEqual(ids({ ...hero, maxRent: "3850" }), []);
  assert.deepEqual(ids({ ...hero, maxRent: "3851" }), ["foundry-2b"]);
  assert.deepEqual(ids({ ...hero, availableBy: "2026-10-01" }), ["foundry-2b"]);
  assert.deepEqual(ids({ ...hero, availableBy: "2026-10-15" }), [
    "foundry-2b",
    "workshop-3c",
  ]);
  assert.deepEqual(ids({ ...hero, availableBy: "2026-09-30" }), []);
});
test("Sorts do not mutate source or discard search order; saved view can retain rented homes", () => {
  const original = [...homes];
  const asc = filterListings(homes, { ...defaultFilters, sort: "price-asc" });
  const desc = filterListings(homes, { ...defaultFilters, sort: "price-desc" });
  assert.deepEqual(
    asc.map((x) => x.monthlyRent),
    desc.map((x) => x.monthlyRent).reverse(),
  );
  assert.deepEqual(
    filterListings([...asc].reverse(), defaultFilters),
    [...asc].reverse(),
  );
  assert.deepEqual(homes, original);
  assert(!ids({}).includes("foundry-2c"));
  assert(ids({}, true).includes("foundry-2c"));
});
