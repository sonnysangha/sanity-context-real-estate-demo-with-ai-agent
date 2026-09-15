import { after } from "next/server";
import { recordInsights, type InsightsExchange } from "@/lib/insights";
import { visibleToolInput } from "@/lib/tool-activity";
import { queryFilters } from "@/lib/query-filters";
import {
  manualFiltersSchema,
  withManualFilterContext,
} from "@/lib/manual-filters";
import type { AgentToolCall, QueryTrace } from "@/lib/types";
import { createMCPClient } from "@ai-sdk/mcp";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { streamText, stepCountIs, type ToolSet } from "ai";
import { z } from "zod";
import {
  agentInstructions,
  contextScope,
  listingSchema,
  unpackMcp,
} from "@/lib/agent-contract";
export const runtime = "nodejs";
export const maxDuration = 120;
const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(6000),
        manualFilters: manualFiltersSchema.optional(),
      }),
    )
    .min(1)
    .max(40),
  threadId: z.string().min(1).max(100),
});
export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") || 0) > 100000)
    return Response.json(
      { error: "This conversation is too long. Start a new search." },
      { status: 413 },
    );
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > 100000)
    return Response.json(
      { error: "This conversation is too long. Start a new search." },
      { status: 413 },
    );
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }
  const body = requestSchema.safeParse(json);
  if (!body.success)
    return Response.json(
      { error: "Please enter a search, or start a new conversation." },
      { status: 400 },
    );
  const endpoint = process.env.SANITY_CONTEXT_MCP_URL;
  const token = process.env.SANITY_ORGANIZATION_TOKEN;
  if (
    !endpoint ||
    !token ||
    (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY)
  )
    return Response.json(
      {
        error:
          "The live agent is not configured yet. Complete the Context endpoint and model settings in .env.local using the README.",
      },
      { status: 503 },
    );
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return Response.json(
      {
        error: "The Context endpoint URL is not valid. Check the setup guide.",
      },
      { status: 503 },
    );
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "api.sanity.io" ||
    !/^\/v(?:1|\d{4}-\d{2}-\d{2})\/context\/organizations\/[^/]+\/mcp\/[^/]+\/?$/.test(
      url.pathname,
    )
  )
    return Response.json(
      {
        error: "The Context endpoint URL is not valid. Check the setup guide.",
      },
      { status: 503 },
    );
  url.searchParams.set("groqFilter", contextScope);
  url.searchParams.set("perspective", "published");
  url.searchParams.set("embeddings", "true");
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort(), { once: true });
  let completedExchange: InsightsExchange | undefined;
  after(async () => {
    if (completedExchange) await recordInsights(completedExchange);
  });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: unknown) => {
        if (!closed && !abort.signal.aborted)
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      const timeout = setTimeout(() => {
        send({
          type: "error",
          text: "The search took too long. Your previous results are unchanged. Try again.",
        });
        closed = true;
        controller.close();
        abort.abort();
      }, 110000);
      let mcp: Awaited<ReturnType<typeof createMCPClient>> | undefined;
      try {
        send({ type: "status", text: "Reading the catalogue schema…" });
        const initialUrl = new URL(url);
        initialUrl.pathname =
          initialUrl.pathname.replace(/\/$/, "") + "/initial-context";
        const initial = await fetch(initialUrl, {
          headers: { Authorization: `Bearer ${token}` },
          signal: abort.signal,
          cache: "no-store",
        });
        if (!initial.ok)
          throw new Error(`Context initial context HTTP ${initial.status}`);
        const schemaContext = await initial.text();
        mcp = await createMCPClient({
          transport: {
            type: "http",
            url: url.toString(),
            headers: { Authorization: `Bearer ${token}` },
          },
        });
        const discovered = await mcp.tools();
        const tools: ToolSet = {};
        let queryAttempted = false;
        let validResults = false;
        for (const name of ["groq_query", "schema_explorer"] as const) {
          const original = discovered[name];
          if (!original?.execute) continue;
          const execute = original.execute;
          tools[name] = {
            ...original,
            execute: async (input, options) => {
              const started = Date.now();
              const call: AgentToolCall = {
                id: options.toolCallId || crypto.randomUUID(),
                name,
                status: "running",
                input: visibleToolInput(name, input),
                startedAt: new Date(started).toISOString(),
              };
              send({ type: "tool", call });
              let trace: QueryTrace | undefined;
              try {
                send({
                  type: "status",
                  text:
                    name === "groq_query"
                      ? "Checking matching apartments…"
                      : "Inspecting the listing fields…",
                });
                const output = await execute(input, options);
                if (name === "groq_query") {
                  queryAttempted = true;
                  validResults = false;
                  const payload = unpackMcp(output);
                  if (payload && Array.isArray(payload.result)) {
                    const parsed = z
                      .array(listingSchema)
                      .safeParse(payload.result);
                    if (parsed.success) {
                      validResults = true;
                      const listings = parsed.data.map((x) => ({
                        ...x,
                        _score: x._score ?? undefined,
                      }));
                      const meta = payload.meta as
                        Record<string, unknown> | undefined;
                      trace = {
                        querySource:
                          typeof meta?.executedQuery === "string"
                            ? "executed"
                            : "submitted",
                        query:
                          typeof meta?.executedQuery === "string"
                            ? meta.executedQuery
                            : (input as { query: string }).query,
                        resultCount: listings.length,
                        listingIds: listings.map((x) => x._id),
                        durationMs: Date.now() - started,
                        timestamp: new Date().toISOString(),
                      };
                      send({
                        type: "results",
                        listings,
                        trace,
                        filters: queryFilters(trace.query),
                      });
                    }
                  }
                }
                const failed =
                  (name === "groq_query" && !trace) ||
                  !!(
                    output &&
                    typeof output === "object" &&
                    "isError" in output &&
                    output.isError
                  );
                send({
                  type: "tool",
                  call: {
                    ...call,
                    status: failed ? "error" : "completed",
                    durationMs: Date.now() - started,
                    summary: failed
                      ? "The tool did not return a valid result."
                      : trace
                        ? `${trace.resultCount} matching ${trace.resultCount === 1 ? "home" : "homes"} returned.`
                        : "Schema fields received.",
                    trace,
                  } satisfies AgentToolCall,
                });
                if (name === "groq_query" && !trace)
                  return {
                    isError: true,
                    content: [
                      {
                        type: "text",
                        text: "The query failed or did not return the required listing card fields. Retry using the complete card projection from the system instructions. Do not describe these results as successful.",
                      },
                    ],
                  };
                return output;
              } catch (error) {
                send({
                  type: "tool",
                  call: {
                    ...call,
                    status: abort.signal.aborted ? "cancelled" : "error",
                    durationMs: Date.now() - started,
                    summary: "The tool call could not be completed.",
                  } satisfies AgentToolCall,
                });
                throw error;
              }
            },
          };
        }
        if (!tools.groq_query)
          throw new Error("The endpoint does not serve the GROQ tool.");
        const model = process.env.ANTHROPIC_API_KEY
          ? anthropic(process.env.AI_MODEL || "claude-sonnet-4-6")
          : openai(process.env.AI_MODEL || "gpt-5.4");
        const result = streamText({
          model,
          system:
            agentInstructions +
            "\n\nLive schema and team-managed context:\n" +
            schemaContext,
          messages: body.data.messages.flatMap(
            ({ role, content, manualFilters }) =>
              withManualFilterContext([{ role, content }], manualFilters),
          ),
          tools,
          stopWhen: stepCountIs(6),
          maxOutputTokens: 2400,
          abortSignal: abort.signal,
        });
        let answer = "";
        for await (const event of result.fullStream) {
          if (event.type === "text-delta") {
            answer += event.text;
            send({ type: "text", text: event.text });
          }
          if (event.type === "error") throw event.error;
        }
        if (queryAttempted && !validResults)
          throw new Error("No valid listing results returned");
        completedExchange = {
          threadId: body.data.threadId,
          endpoint: url.toString(),
          messages: [
            ...body.data.messages,
            { role: "assistant", content: answer },
          ],
          modelId: model.modelId,
          modelProvider: model.provider,
          usage: await result.totalUsage,
        };
        send({ type: "done" });
      } catch (error) {
        if (!abort.signal.aborted) {
          console.error(
            "HomeMatch agent failed:",
            error instanceof Error ? error.name : "UnknownError",
          );
          send({
            type: "error",
            text: "The live search could not be completed. Your previous results are unchanged. Check your Context and model connection, then retry.",
          });
        }
      } finally {
        clearTimeout(timeout);
        try {
          await mcp?.close();
        } catch {}
        closed = true;
        if (!abort.signal.aborted) controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
