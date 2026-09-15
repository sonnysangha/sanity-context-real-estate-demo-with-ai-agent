/**
 * HomeMatch NYC — agent integration exercise.
 * Follow README.md, "Build the agent on the starter branch", and compare with main.
 * The UI, content schemas, fixtures, and result contract are already provided.
 */
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  // 1. Validate the conversation and load server-only provider/Context settings.
  //    Validate each message's optional manualFilters with manualFiltersSchema.
  //    Expand them with withManualFilterContext before calling the model; keep UI chat clean.
  // 2. Fetch initial context and discover the hosted MCP tools.
  // 3. Expose schema_explorer and groq_query to the model with agentInstructions.
  // 4. Validate the tool result using listingSchema; attach the executed query.
  //    Include filters: queryFilters(trace.query) on the results event for browser sync.
  // 5. Stream status, tool running/completed/error events, results, text, and done/error
  //    as newline-delimited JSON. AgentToolCall powers the live inspector.
  // 6. Close the MCP client and abort upstream work when the viewer stops.
  return Response.json(
    {
      error:
        "Build the agent route using the README, or switch to main to run the finished demo.",
    },
    { status: 501 },
  );
}
