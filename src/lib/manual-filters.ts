import { z } from "zod";
import { filterChanges } from "./filter-activity";
import type { Listing, SearchFilters } from "./types";

export const manualFiltersSchema = z
  .object({
    neighbourhood: z.enum([
      "",
      "Williamsburg",
      "Greenpoint",
      "Long Island City",
      "East Village",
    ]),
    maxRent: z
      .string()
      .max(20)
      .refine(
        (value) =>
          value === "" || (Number.isFinite(Number(value)) && Number(value) > 0),
      ),
    bedrooms: z.enum(["", "1", "2", "3"]),
    furnished: z.boolean(),
    petsAllowed: z.boolean(),
    inUnitLaundry: z.boolean(),
    availableBy: z.union([z.literal(""), z.iso.date()]),
    sort: z.enum(["recommended", "price-asc", "price-desc"]),
  })
  .partial();

/** An eligibility edit starts browsing the whole catalogue; sorting keeps the agent's subset. */
export function applyManualFilters(
  before: SearchFilters,
  after: SearchFilters,
  matches: Listing[] | null,
  overrides: Partial<SearchFilters>,
) {
  const changes = filterChanges({ before, after });
  return {
    filters: after,
    matches: changes.some(({ key }) => key !== "sort") ? null : matches,
    overrides: {
      ...overrides,
      ...Object.fromEntries(changes.map(({ key }) => [key, after[key]])),
    } as Partial<SearchFilters>,
  };
}

/** UI state travels with the request without adding a message to the visible chat. */
export function withManualFilterContext(
  messages: { role: "user" | "assistant"; content: string }[],
  overrides?: Partial<SearchFilters>,
) {
  if (!overrides || !Object.keys(overrides).length) return messages;
  return [
    ...messages.slice(0, -1),
    {
      role: "user" as const,
      content: `Browser filter updates since the last completed search: ${JSON.stringify(overrides)}. Use these as updates to my earlier criteria. An empty string or false removes that requirement; false does not mean exclude it. Unlisted criteria and preferences stay the same. My next message can change these again.`,
    },
    ...messages.slice(-1),
  ];
}
