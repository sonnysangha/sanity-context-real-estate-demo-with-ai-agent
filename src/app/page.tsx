import HomeMatch from "@/components/home-match";
import { getListings } from "@/lib/catalogue";
import type { Listing } from "@/lib/types";
export const dynamic = "force-dynamic";
export default async function Page() {
  let listings: Listing[] = [];
  let error = "";
  try {
    const data = await getListings();
    listings = data.listings;
    if (!data.configured)
      error =
        "Connect your Sanity project using the README to load the catalogue.";
  } catch {
    error =
      "The catalogue couldn't load. Check the Sanity connection and refresh.";
  }
  return <HomeMatch initialListings={listings} initialError={error} />;
}
