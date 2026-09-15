import {
  Database,
  ScanSearch,
  SlidersHorizontal,
  Monitor,
  ArrowRight,
} from "lucide-react";
export default function AgentToolsOverview() {
  return (
    <section
      className="agent-tools-overview"
      aria-labelledby="agent-tools-title"
    >
      <div className="tools-overview-intro">
        <span className="tools-eyebrow">UNDER THE HOOD</span>
        <h2 id="agent-tools-title">The tools behind your next home.</h2>
        <p>
          The model interprets your request. Sanity searches the content. Your
          browser displays the results.
        </p>
      </div>
      <div className="tools-overview-grid">
        <article>
          <span className="tool-location">
            <Database size={14} /> Server · Sanity Context MCP
          </span>
          <ScanSearch size={24} />
          <h3>Inspect schema</h3>
          <code>schema_explorer</code>
          <p>
            Reads the listing fields and references, so the agent can write a
            precise query.
          </p>
          <span className="tool-access">Read-only · agent-callable</span>
        </article>
        <article>
          <span className="tool-location">
            <Database size={14} /> Server · Sanity Context MCP
          </span>
          <Database size={24} />
          <h3>Search apartments</h3>
          <code>groq_query</code>
          <p>
            Combines hard filters, keyword matching and semantic ranking in a
            live GROQ query.
          </p>
          <div className="tool-operation-tags">
            <span>Hard filters</span>
            <span>Keyword</span>
            <span>Semantic</span>
          </div>
          <span className="tool-access">Read-only · agent-callable</span>
        </article>
        <article>
          <span className="tool-location client">
            <Monitor size={14} /> Client · browser action
          </span>
          <SlidersHorizontal size={24} />
          <h3>Apply filters</h3>
          <code>filterListings</code>
          <p>
            Filters the full collection when you change your must-haves. Changes
            made by the agent appear in the chat with before-and-after values.
          </p>
          <span className="tool-access">
            Local UI action · no content writes
          </span>
        </article>
      </div>
      <div className="tools-overview-flow">
        <span>Your request</span>
        <ArrowRight size={14} />
        <span>Schema + live query</span>
        <ArrowRight size={14} />
        <span>Cards + applied filters</span>
      </div>
      <p className="tools-overview-note">
        The agent has two MCP tools. Applying filters is a browser action
        triggered by returned results or your controls; it is not an additional
        model-callable tool. Semantic preferences change ranking, while hard
        filters determine eligibility.
      </p>
    </section>
  );
}
