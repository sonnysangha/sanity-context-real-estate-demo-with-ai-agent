import { createClient } from "@sanity/client";
import { need } from "./env";
const status = process.argv[2];
if (status !== "available" && status !== "rented")
  throw new Error("Use rented or available.");
const client = createClient({
  projectId: need("NEXT_PUBLIC_SANITY_PROJECT_ID"),
  dataset: need("NEXT_PUBLIC_SANITY_DATASET"),
  token: need("SANITY_API_WRITE_TOKEN"),
  apiVersion: "2026-09-01",
  useCdn: false,
});
await client.patch("homematch-listing-foundry-2b").set({ status }).commit();
console.log(
  `Foundry Loft 2B is now ${status}. Run a fresh search to see the change.`,
);
