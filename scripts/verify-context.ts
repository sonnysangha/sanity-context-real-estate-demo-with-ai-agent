import "./env";
import assert from "node:assert/strict";
import { createMCPClient } from "@ai-sdk/mcp";
import { need } from "./env";
import {
  contextScope,
  cardProjection,
  unpackMcp,
  listingSchema,
} from "../src/lib/agent-contract";
import { writeFile, mkdir } from "node:fs/promises";
const url = new URL(need("SANITY_CONTEXT_MCP_URL"));
url.searchParams.set("groqFilter", contextScope);
url.searchParams.set("perspective", "published");
url.searchParams.set("embeddings", "true");
const token = url.pathname.includes("/organizations/")
  ? need("SANITY_ORGANIZATION_TOKEN")
  : need("SANITY_API_READ_TOKEN");
const client = await createMCPClient({
  transport: {
    type: "http",
    url: url.toString(),
    headers: { Authorization: `Bearer ${token}` },
  },
});
try {
  const tools = await client.tools();
  console.log("Discovered tools:", Object.keys(tools).join(", "));
  await mkdir(".runtime", { recursive: true });
  await writeFile(
    ".runtime/tool-schemas.json",
    JSON.stringify(
      Object.fromEntries(
        Object.entries(tools).map(([k, v]) => [
          k,
          { description: v.description, inputSchema: v.inputSchema },
        ]),
      ),
      null,
      2,
    ),
  );
  const query = `*[_type == "listing" && public == true && status == "available" && neighbourhood->slug.current == "williamsburg" && monthlyRent < 4500 && bedrooms == 2 && furnished == true && petsAllowed == true && inUnitLaundry == true] | order(monthlyRent asc) [0...24] ${cardProjection}`;
  const output = await tools.groq_query.execute!(
    { query },
    { toolCallId: "verify", context: undefined, messages: [] },
  );
  await writeFile(
    ".runtime/context-result.json",
    JSON.stringify(output, null, 2),
  );
  const payload = unpackMcp(output);
  const listings = listingSchema.array().parse(payload?.result);
  assert.deepEqual(
    listings.map((listing) => listing._id),
    [
      "homematch-listing-foundry-2b",
      "homematch-listing-northlight-4a",
      "homematch-listing-workshop-3c",
    ],
    "The live Context hero query must return the three expected homes in rent order",
  );
  console.log(
    `Verified ${listings.length} hero homes: ${listings.map((listing) => listing.title).join(", ")}`,
  );
} finally {
  await client.close();
}
