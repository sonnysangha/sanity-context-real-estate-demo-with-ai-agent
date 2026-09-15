"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Check,
  ChevronDown,
  Code2,
  Copy,
  Maximize2,
  X,
  LoaderCircle,
  CircleAlert,
  Square,
} from "lucide-react";
import { presentGroq, type QueryRole } from "@/lib/groq-presentation";
import type { AgentToolCall, QueryTrace } from "@/lib/types";

const legend: { role: QueryRole; label: string; explanation: string }[] = [
  {
    role: "filter",
    label: "Hard filters",
    explanation: "Which documents can qualify",
  },
  {
    role: "keyword",
    label: "Keyword match",
    explanation: "Matching words in the content",
  },
  {
    role: "semantic",
    label: "Semantic meaning",
    explanation: "Similarity to the request’s meaning",
  },
  {
    role: "ranking",
    label: "Ranking & order",
    explanation: "Scoring and sorting the results",
  },
];

function QueryView({
  trace,
  number,
  pending = false,
}: {
  trace: QueryTrace;
  number: number;
  pending?: boolean;
}) {
  const [raw, setRaw] = useState(false);
  const [copiedQuery, setCopiedQuery] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const copied = copiedQuery === trace.query;
  const presentation = presentGroq(trace.query);
  async function copyQuery() {
    try {
      await navigator.clipboard.writeText(trace.query);
      setCopiedQuery(trace.query);
      setCopyError(false);
    } catch {
      setRaw(true);
      setCopyError(true);
    }
  }
  return (
    <section className="query-run" aria-label={`GROQ query ${number}`}>
      <p className="query-source-label">
        {pending || trace.querySource === "submitted"
          ? "Submitted GROQ · sent to Sanity"
          : "Executed GROQ · returned by Sanity"}
      </p>
      <div className="query-toolbar">
        <div className="query-view-toggle" aria-label="Query display">
          <button
            type="button"
            aria-pressed={!raw}
            onClick={() => setRaw(false)}
          >
            Formatted
          </button>
          <button type="button" aria-pressed={raw} onClick={() => setRaw(true)}>
            Raw
          </button>
        </div>
        <button
          type="button"
          className="query-copy"
          onClick={copyQuery}
          aria-label={`Copy original query ${number}`}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div
        className="query-code-scroll"
        tabIndex={0}
        role="region"
        aria-label={`GROQ query ${number}`}
      >
        <pre className={`query-code${raw ? " query-code-raw" : ""}`}>
          <code>
            {raw
              ? trace.query
              : presentation.lines.map((line, index) => (
                  <span className="query-code-line" key={index}>
                    <span className="query-line-number" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span>
                      {line.map((piece, part) => (
                        <span className={`groq-${piece.role}`} key={part}>
                          {piece.text}
                        </span>
                      ))}
                      {"\n"}
                    </span>
                  </span>
                ))}
          </code>
        </pre>
      </div>
      <p className="query-copy-status" role="status">
        {copyError
          ? "Clipboard unavailable. Select and copy the original query in Raw view."
          : copied
            ? "Original query copied."
            : !presentation.formatted
              ? "Original formatting preserved for this query."
              : "Whitespace formatted for readability. Copy keeps the original query."}
      </p>
      {!presentation.roles.includes("semantic") && (
        <p className="query-semantic-note">
          No semantic similarity call in this query.
        </p>
      )}
    </section>
  );
}

function CallContents({
  call,
  number,
}: {
  call: AgentToolCall;
  number: number;
}) {
  if (call.name === "schema_explorer")
    return (
      <div className="query-schema-input">
        <span className="query-source-label">Schema tool arguments</span>
        <pre>
          <code>{JSON.stringify(call.input, null, 2)}</code>
        </pre>
        <p>{call.summary || "Reading the requested schema fields…"}</p>
      </div>
    );
  const trace = call.trace || {
    query: call.input.query || "",
    resultCount: 0,
    listingIds: [],
    durationMs: 0,
    timestamp: call.startedAt,
  };
  return (
    <>
      <div className="query-legend" aria-label="Query colour legend">
        {legend.map((item) => (
          <div
            className={`query-legend-item groq-${item.role}`}
            key={item.role}
          >
            <span className="query-legend-dot" aria-hidden="true" />
            <div>
              <strong>{item.label}</strong>
              <span>{item.explanation}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="query-reading-note">
        Colours identify operations. A match inside a filter restricts results;
        inside score(), it affects ranking.
      </p>
      <QueryView trace={trace} number={number} pending={!call.trace} />
      {call.trace && (
        <details className="query-result-details">
          <summary>
            Tool result · {call.trace.resultCount}{" "}
            {call.trace.resultCount === 1 ? "home" : "homes"}
          </summary>
          <pre>
            <code>
              {JSON.stringify(
                {
                  resultCount: call.trace.resultCount,
                  listingIds: call.trace.listingIds,
                  durationMs: call.trace.durationMs,
                },
                null,
                2,
              )}
            </code>
          </pre>
        </details>
      )}
    </>
  );
}

export default function QueryInspector({ calls }: { calls: AgentToolCall[] }) {
  if (!calls.length) return null;
  const recent = calls.slice(-12);
  const running = calls.some((call) => call.status === "running");
  return (
    <section className="query-details" aria-label="Behind this search">
      <div className="query-section-heading">
        <Code2 size={16} />
        <span className="query-summary-title">Behind this search</span>
        <span className="query-count">{calls.length}</span>
      </div>
      <p className="query-activity-status" role="status">
        {running
          ? "Calling Sanity Context…"
          : "Actual tool call for this response"}
      </p>
      <div
        className="query-activity-list"
        tabIndex={0}
        role="region"
        aria-label="Tool calls for this response"
      >
        {recent.map((call, index) => {
          const number = calls.length - recent.length + index + 1;
          const label =
            call.name === "groq_query" ? "Search apartments" : "Inspect schema";
          return (
            <details
              className={`query-call query-call-${call.status}`}
              key={call.id}
            >
              <summary>
                <span className="query-call-icon" aria-hidden="true">
                  {call.status === "running" ? (
                    <LoaderCircle size={16} />
                  ) : call.status === "completed" ? (
                    <Check size={16} />
                  ) : call.status === "cancelled" ? (
                    <Square size={13} />
                  ) : (
                    <CircleAlert size={16} />
                  )}
                </span>
                <span className="query-call-title">
                  <strong>{label}</strong>
                  <span>
                    {call.name} · {call.status}
                    {call.durationMs !== undefined
                      ? ` · ${new Intl.NumberFormat("en-US").format(call.durationMs)} ms`
                      : ""}
                  </span>
                </span>
                {call.trace && (
                  <span className="query-result-badge">
                    {call.trace.resultCount}{" "}
                    {call.trace.resultCount === 1 ? "home" : "homes"}
                  </span>
                )}
                <ChevronDown size={14} className="query-chevron" />
              </summary>
              <div className="query-details-body">
                <div className="query-intro">
                  <span>{call.summary || "Tool call in progress"}</span>
                  <Dialog.Root>
                    <Dialog.Trigger className="query-expand" type="button">
                      <Maximize2 size={14} /> Expand
                    </Dialog.Trigger>
                    <Dialog.Portal>
                      <Dialog.Overlay className="modal-overlay" />
                      <Dialog.Content className="query-modal">
                        <div className="query-modal-heading">
                          <div>
                            <Dialog.Title>{label}</Dialog.Title>
                            <Dialog.Description>
                              Tool call {number} · {call.name} · {call.status}
                            </Dialog.Description>
                          </div>
                          <Dialog.Close
                            className="icon-button"
                            aria-label="Close query inspector"
                          >
                            <X size={20} />
                          </Dialog.Close>
                        </div>
                        <div className="query-modal-body">
                          <CallContents call={call} number={number} />
                        </div>
                      </Dialog.Content>
                    </Dialog.Portal>
                  </Dialog.Root>
                </div>
                <CallContents call={call} number={number} />
              </div>
            </details>
          );
        })}
      </div>
      {calls.length > recent.length && (
        <p className="query-reading-note">
          Showing the latest {recent.length} tool calls.
        </p>
      )}
    </section>
  );
}
