import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { contextPlugin } from "@sanity/context/studio";
import { schemaTypes } from "./src/sanity/schemaTypes";
export default defineConfig({
  name: "homematch",
  title: "HomeMatch NYC",
  projectId:
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
    process.env.SANITY_STUDIO_PROJECT_ID ||
    "missingproject",
  dataset:
    process.env.NEXT_PUBLIC_SANITY_DATASET ||
    process.env.SANITY_STUDIO_DATASET ||
    "production",
  basePath: "/studio",
  plugins: [
    structureTool(),
    visionTool(),
    contextPlugin({ insights: { enabled: false } }),
  ],
  schema: { types: schemaTypes },
});
