import { money, type SearchFilters } from "./types";
export type FilterActivity = {
  source: "agent" | "browser";
  before: SearchFilters;
  after: SearchFilters;
  resultCount: number;
};
export const filterLabels: Record<keyof SearchFilters, string> = {
  neighbourhood: "Neighbourhood",
  maxRent: "Monthly rent",
  bedrooms: "Bedrooms",
  furnished: "Furnished",
  petsAllowed: "Pets allowed",
  inUnitLaundry: "In-unit laundry",
  availableBy: "Available by",
  sort: "Order",
};
export function filterValue(
  key: keyof SearchFilters,
  value: string | boolean,
): string {
  if (typeof value === "boolean") return value ? "Required" : "Any";
  if (!value) return "Any";
  if (key === "maxRent") return `Under ${money(Number(value))}`;
  if (key === "sort")
    return (
      {
        recommended: "Search order",
        "price-asc": "Rent: low to high",
        "price-desc": "Rent: high to low",
      }[value] || value
    );
  return value;
}
export function filterChanges(
  activity: Pick<FilterActivity, "before" | "after">,
) {
  return (Object.keys(filterLabels) as (keyof SearchFilters)[])
    .filter((key) => activity.before[key] !== activity.after[key])
    .map((key) => ({
      key,
      label: filterLabels[key],
      before: filterValue(key, activity.before[key]),
      after: filterValue(key, activity.after[key]),
    }));
}
