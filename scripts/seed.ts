import { createClient } from "@sanity/client";
import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { need } from "./env";
const client = createClient({
  projectId: need("NEXT_PUBLIC_SANITY_PROJECT_ID"),
  dataset: need("NEXT_PUBLIC_SANITY_DATASET"),
  token: need("SANITY_API_WRITE_TOKEN"),
  apiVersion: "2026-09-01",
  useCdn: false,
});
const seed = JSON.parse(await readFile("seed/listings.json", "utf8"));
const reset = process.argv.includes("--reset");
const imagesOnly = process.argv.includes("--images-only");
if (reset && imagesOnly)
  throw new Error("Choose either --reset or --images-only.");
// Explicit, isolated tutorial IDs are intentional: repeated imports must not duplicate fixtures.
const assetIds: Record<string, string> = {};
for (const file of [
  ...new Set<string>(
    seed.listings.map((x: { imageFile: string }) => x.imageFile),
  ),
]) {
  const asset = await client.assets.upload(
    "image",
    createReadStream(`public/apartments/${file}`),
    { filename: file },
  );
  assetIds[file] = asset._id;
}
let tx = client.transaction();
if (!imagesOnly)
  for (const doc of seed.neighbourhoods)
    tx = reset ? tx.createOrReplace(doc) : tx.createIfNotExists(doc);
for (const raw of seed.listings) {
  const { imageFile, imageAlt, ...doc } = raw;
  doc.images = [
    {
      _type: "image",
      _key: "main",
      alt: imageAlt,
      asset: { _type: "reference", _ref: assetIds[imageFile] },
    },
  ];
  tx = imagesOnly
    ? tx.patch(doc._id, { set: { images: doc.images } })
    : reset
      ? tx.createOrReplace(doc)
      : tx.createIfNotExists(doc);
}
await tx.commit();
console.log(
  imagesOnly
    ? `Updated images for ${seed.listings.length} fictional apartments. Other fields were untouched.`
    : `${reset ? "Restored" : "Seeded"} ${seed.listings.length} fictional apartments and ${seed.neighbourhoods.length} neighbourhoods. Other documents were untouched.`,
);
