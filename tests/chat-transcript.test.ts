import test from "node:test";
import assert from "node:assert/strict";
import {
  appendResponseEvent,
  interruptResponse,
} from "../src/lib/chat-transcript";
import type { AgentToolCall, ChatMessage } from "../src/lib/types";
const call: AgentToolCall = {
  id: "query-1",
  name: "groq_query",
  status: "running",
  input: { query: "*[]" },
  startedAt: "2026-09-15T00:00:00Z",
};
const conversation: ChatMessage[] = [
  { id: "user-1", role: "user", content: "Find a home" },
  { id: "answer-1", role: "assistant", content: "" },
];
test("A call stays between the text before and after it as it completes", () => {
  let messages = appendResponseEvent(conversation, "answer-1", {
    type: "text",
    text: "Checking. ",
  });
  messages = appendResponseEvent(messages, "answer-1", { type: "tool", call });
  messages = appendResponseEvent(messages, "answer-1", {
    type: "text",
    text: "Found ",
  });
  messages = appendResponseEvent(messages, "answer-1", {
    type: "tool",
    call: { ...call, status: "completed" },
  });
  messages = appendResponseEvent(messages, "answer-1", {
    type: "text",
    text: "three.",
  });
  assert.deepEqual(
    messages[1].parts?.map((p) => p.type),
    ["text", "tool", "text"],
  );
  assert.equal(messages[1].content, "Checking. Found three.");
  assert.deepEqual(messages[1].parts?.[2], {
    type: "text",
    text: "Found three.",
  });
  assert.equal(
    (messages[1].parts?.[1] as { call: AgentToolCall }).call.status,
    "completed",
  );
});
test("Follow-up calls stay in their own response and do not move an earlier call", () => {
  const first = appendResponseEvent(conversation, "answer-1", {
    type: "tool",
    call,
  });
  const next = [
    ...first,
    { id: "user-2", role: "user" as const, content: "Less expensive" },
    { id: "answer-2", role: "assistant" as const, content: "" },
  ];
  const result = appendResponseEvent(next, "answer-2", {
    type: "tool",
    call: { ...call, id: "query-2" },
  });
  assert.strictEqual(result[1], first[1]);
  assert.equal(
    (result[3].parts?.[0] as { call: AgentToolCall }).call.id,
    "query-2",
  );
});
test("Stopping preserves call evidence in place but removes uncompleted answer text", () => {
  let messages = appendResponseEvent(conversation, "answer-1", {
    type: "tool",
    call,
  });
  messages = appendResponseEvent(messages, "answer-1", {
    type: "text",
    text: "Partial answer",
  });
  const stopped = interruptResponse(messages, "answer-1", "cancelled");
  assert.equal(stopped[1].content, "");
  assert.deepEqual(
    stopped[1].parts?.map((p) => p.type),
    ["tool"],
  );
  assert.equal(
    (stopped[1].parts?.[0] as { call: AgentToolCall }).call.status,
    "cancelled",
  );
  assert.equal(
    appendResponseEvent(stopped, "answer-1", { type: "tool", call })[1]
      .parts?.[0].type,
    "tool",
  );
});
