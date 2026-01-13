import { searchTools, SearchResponse } from "../search.js";
import type { SearchToolsInput } from "../schemas.js";

/** First line only, max 80 chars */
function oneLiner(text: string | undefined): string {
  if (!text) return "";
  const line = text.split("\n")[0].trim();
  return line.length > 80 ? line.slice(0, 77) + "..." : line;
}

/**
 * Search for MCP tools across all wrapped servers
 * Returns MINIMAL results - just enough to identify and call the tool
 */
export async function handleSearchTools(params: SearchToolsInput) {
  const response: SearchResponse = await searchTools(params.query, params.limit, params.offset);

  const output = {
    results: response.results.map((r) => ({
      name: r.tool.name,
      server: r.tool.server,
      description: oneLiner(r.tool.description),
    })),
    // Pagination metadata (MCP best practice)
    count: response.results.length,
    limit: params.limit,
    offset: params.offset,
    totalCount: response.totalCount,
    has_more: (params.offset + response.results.length) < (response.totalCount || 0),
    // Source info
    source: response.source,
    ...(response.fallbackReason && { fallbackReason: response.fallbackReason }),
    ...(response.suggestion && { suggestion: response.suggestion }),
  };

  return {
    content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
    structuredContent: output,
  };
}
