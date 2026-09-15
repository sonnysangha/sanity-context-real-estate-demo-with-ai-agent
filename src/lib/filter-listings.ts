import type { Listing, SearchFilters } from "./types";

export const neighbourhoodOptions = [
  "Williamsburg",
  "Greenpoint",
  "Long Island City",
  "East Village",
] as const;
export const bedroomOptions = [1, 2, 3] as const;

/** Filters the selected catalogue or saved homes. Live agent results retain their query order. */
export function filterListings(
  source: Listing[],
  filters: SearchFilters,
  includeRented = false,
) {
  return source
    .filter(
      (home) =>
        (includeRented || home.status === "available") &&
        (!filters.neighbourhood ||
          home.neighbourhood === filters.neighbourhood) &&
        (!filters.maxRent || home.monthlyRent < Number(filters.maxRent)) &&
        (!filters.bedrooms || home.bedrooms === Number(filters.bedrooms)) &&
        (!filters.furnished || home.furnished) &&
        (!filters.petsAllowed || home.petsAllowed) &&
        (!filters.inUnitLaundry || home.inUnitLaundry) &&
        (!filters.availableBy || home.availableFrom <= filters.availableBy),
    )
    .sort((a, b) =>
      filters.sort === "price-asc"
        ? a.monthlyRent - b.monthlyRent
        : filters.sort === "price-desc"
          ? b.monthlyRent - a.monthlyRent
          : 0,
    );
}
