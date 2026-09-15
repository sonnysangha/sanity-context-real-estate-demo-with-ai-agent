import "server-only";
import { createClient } from "@sanity/client";
import { defineQuery } from "groq";
import type { Listing } from "./types";
export const listingProjection = `{_id,title,"slug":slug.current,monthlyRent,currency,bedrooms,bathrooms,squareFeet,furnished,petsAllowed,inUnitLaundry,status,availableFrom,description,"neighbourhood":neighbourhood->name,"borough":neighbourhood->borough,"image":images[0].asset->url,"imageAlt":images[0].alt,features,_score}`;
const browseQuery = defineQuery(
  `*[_type == "listing" && public == true && city == "new-york-city" && status == "available"] | order(monthlyRent asc, _id asc) ${listingProjection}`,
);
export function catalogueClient() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  if (!projectId || !process.env.SANITY_API_READ_TOKEN) return null;
  return createClient({
    projectId,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
    token: process.env.SANITY_API_READ_TOKEN,
    apiVersion: "2026-09-01",
    perspective: "published",
    useCdn: false,
  });
}
export async function getListings() {
  const client = catalogueClient();
  if (!client) return { listings: [] as Listing[], configured: false };
  return {
    listings: await client.fetch<Listing[]>(
      browseQuery,
      {},
      { cache: "no-store" },
    ),
    configured: true,
  };
}
export async function getListing(slug: string) {
  const client = catalogueClient();
  return (
    client?.fetch<Listing | null>(
      `*[_type == "listing" && public == true && city == "new-york-city" && slug.current == $slug][0]${listingProjection}`,
      { slug },
      { cache: "no-store" },
    ) ?? null
  );
}
export async function getSavedListings(ids: string[]) {
  const client = catalogueClient();
  if (!client) return [];
  return client.fetch<Listing[]>(
    `*[_type == "listing" && public == true && city == "new-york-city" && _id in $ids]${listingProjection}`,
    { ids },
    { cache: "no-store" },
  );
}
