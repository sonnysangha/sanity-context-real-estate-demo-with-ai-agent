import type { AgentToolCall } from "./types";

export function updateToolCalls(
  calls: AgentToolCall[],
  next: AgentToolCall,
): AgentToolCall[] {
  const existing = calls.find((call) => call.id === next.id);
  // A delayed start event must not reopen a completed/cancelled operation.
  if (existing && existing.status !== "running" && next.status === "running")
    return calls;
  return existing
    ? calls.map((call) => (call.id === next.id ? next : call))
    : [...calls, next];
}

export function settleToolCalls(
  calls: AgentToolCall[],
  status: "cancelled" | "error",
): AgentToolCall[] {
  return calls.map((call) =>
    call.status === "running"
      ? {
          ...call,
          status,
          summary:
            status === "cancelled"
              ? "Search stopped before a result was received."
              : "No tool result received. Retry the search.",
        }
      : call,
  );
}

/** Only public tool arguments belong in the browser activity stream. */
export function visibleToolInput(
  name: AgentToolCall["name"],
  input: unknown,
): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const record = input as Record<string, unknown>;
  const keys = name === "groq_query" ? ["query"] : ["type", "path"];
  return Object.fromEntries(
    keys
      .filter((key) => typeof record[key] === "string")
      .map((key) => [key, record[key] as string]),
  );
}
