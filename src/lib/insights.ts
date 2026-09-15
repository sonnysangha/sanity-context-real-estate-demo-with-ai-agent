import "server-only";
import { createClient } from "@sanity/client";
import { classifyConversation } from "@sanity/context/insights";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModelUsage } from "ai";

export type InsightsExchange = {
  threadId: string;
  endpoint: string;
  messages: { role: "user" | "assistant"; content: string }[];
  modelId: string;
  modelProvider: string;
  usage: LanguageModelUsage;
};

// Serialize follow-ups in this local tutorial process so an older verdict cannot
// overwrite a newer transcript. Multi-instance hosting needs a durable queue.
const pending = new Map<string, Promise<void>>();

export function recordInsights(exchange: InsightsExchange): Promise<void> {
  if (process.env.SANITY_INSIGHTS_ENABLED !== "true") return Promise.resolve();
  const previous = pending.get(exchange.threadId) || Promise.resolve();
  const job = previous
    .then(() => saveAndClassify(exchange))
    .catch((error: unknown) => {
      const status =
        error && typeof error === "object" && "statusCode" in error
          ? error.statusCode
          : "unknown";
      // Do not log a provider error body, transcript, or credentials.
      console.error("HomeMatch Insights failed (status):", status);
    });
  pending.set(exchange.threadId, job);
  return job.finally(() => {
    if (pending.get(exchange.threadId) === job)
      pending.delete(exchange.threadId);
  });
}

async function saveAndClassify(exchange: InsightsExchange) {
  const endpoint = new URL(exchange.endpoint);
  const match = endpoint.pathname.match(
    /^\/v(?:1|\d{4}-\d{2}-\d{2})\/context\/organizations\/([^/]+)\/mcp\/([^/]+)\/?$/,
  );
  const organizationId = process.env.SANITY_ORGANIZATION_ID || match?.[1];
  if (
    endpoint.origin !== "https://api.sanity.io" ||
    !match ||
    organizationId !== match[1]
  ) {
    throw new Error(
      "Insights requires the matching organization Context endpoint.",
    );
  }
  const token = process.env.SANITY_ORGANIZATION_TOKEN;
  if (!token)
    throw new Error("Insights requires an organization Context token.");
  const client = createClient({
    apiVersion: "2026-08-25",
    context: { organizationId },
    token,
    useCdn: false,
    useProjectHostname: false,
    timeout: 15000,
  });
  const messages = exchange.messages.map(({ role, content }) => ({
    role,
    content,
  }));
  endpoint.search = "";
  const record = {
    threadId: exchange.threadId,
    messages,
    mcpUrl: endpoint.toString(),
    metadata: { mcpEndpoints: [match[2]], app: "homematch-nyc" },
    modelId: exchange.modelId,
    modelProvider: exchange.modelProvider,
    tokenUsage: {
      inputTokens: exchange.usage.inputTokens,
      outputTokens: exchange.usage.outputTokens,
      totalTokens: exchange.usage.totalTokens,
    },
  };
  await client.context.conversations.save(record);
  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic(process.env.INSIGHTS_MODEL || "claude-haiku-4-5")
    : openai(process.env.INSIGHTS_MODEL || "gpt-5.4");
  await classifyConversation({
    client,
    threadId: exchange.threadId,
    messages,
    model,
  });
  console.info("HomeMatch Insights: conversation saved and classified.");
}
