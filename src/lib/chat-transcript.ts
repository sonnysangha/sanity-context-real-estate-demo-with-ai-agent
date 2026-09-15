import type { ChatMessage, ChatPart } from "./types";
import { settleToolCalls, updateToolCalls } from "./tool-activity";

/** Keep tools and text in arrival order within the response that owns them. */
export function appendResponseEvent(
  messages: ChatMessage[],
  responseId: string,
  event: ChatPart,
): ChatMessage[] {
  return messages.map((message) => {
    if (message.id !== responseId) return message;
    const parts = [...(message.parts ?? [])];
    if (event.type === "filters")
      return { ...message, parts: [...parts, event] };
    if (event.type === "text") {
      const last = parts.at(-1);
      if (last?.type === "text")
        parts[parts.length - 1] = {
          type: "text",
          text: last.text + event.text,
        };
      else parts.push({ type: "text", text: event.text });
      return { ...message, content: message.content + event.text, parts };
    }
    const index = parts.findIndex(
      (part) => part.type === "tool" && part.call.id === event.call.id,
    );
    const old = parts[index];
    if (old?.type === "tool")
      parts[index] = {
        type: "tool",
        call: updateToolCalls([old.call], event.call)[0],
      };
    else parts.push({ type: "tool", call: event.call });
    return { ...message, parts };
  });
}

export function interruptResponse(
  messages: ChatMessage[],
  responseId: string,
  status: "cancelled" | "error",
): ChatMessage[] {
  return messages.flatMap((message) => {
    if (message.id !== responseId) return [message];
    const parts: ChatPart[] = (message.parts ?? [])
      .filter((part) => part.type === "tool")
      .map((part) => ({
        type: "tool",
        call: settleToolCalls([part.call], status)[0],
      }));
    // Keep actual activity for the failed attempt, but never send partial answer text back as history.
    return parts.length ? [{ ...message, content: "", parts }] : [];
  });
}
