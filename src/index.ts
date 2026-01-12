import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { searchTools, getCategories, SearchResponse, getToolByName } from "./search.js";
import { executeCode, getAvailableClientNames } from "./sandbox/runtime.js";
import { startLifecycleManagement, getConnectedClients, getAuditLog } from "./sandbox/clients.js";

const server = new Server(
  { name: "tool-executor", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

/**
 * Tool definitions for the two main tools
 */
const TOOLS: Tool[] = [
  {
    name: "search_tools",
    description: `Search for MCP tools across all wrapped servers. Returns slim results (name, server, description, example) for discovery.

Use get_tool_schema(name) to get the full inputSchema when you're ready to call a specific tool.

Available categories: game-dev, code-nav, knowledge, ai-models, web, source-control, ui, reasoning, debugging, misc

Example queries:
- "godot scene" → tools for Godot game development
- "semantic code search" → Serena code navigation
- "generate diagram" → Mermaid diagram tools
- "fetch webpage" → HTTP fetch tools`,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query for finding relevant tools",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_tool_schema",
    description: `Get the full inputSchema for a specific tool. Use after search_tools to get parameter details before calling execute_code.

Example: get_tool_schema("generate_mermaid_diagram") → returns full schema with all parameters, types, enums, etc.`,
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Tool name (from search_tools results)",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "execute_code",
    description: `Execute TypeScript/JavaScript code with access to all MCP clients and workspace helpers.

**Available MCP clients (call as async functions):**
${getAvailableClientNames().map((n) => `- ${n}`).join("\n")}

**Workspace API (file operations scoped to ./workspace/):**
- workspace.read(path), workspace.write(path, data)
- workspace.readJSON(path), workspace.writeJSON(path, data)
- workspace.list(path), workspace.glob(pattern)
- workspace.exists(path), workspace.mkdir(path)

**Example:**
\`\`\`typescript
// Search code with Serena
const result = await serena.search_for_pattern({
  substring_pattern: "handleError",
  relative_path: "src"
});
console.log(result);

// Save data to workspace
await workspace.writeJSON("results.json", result);
\`\`\`

Code runs in a sandbox. Results are returned as logs array.`,
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "TypeScript/JavaScript code to execute",
        },
        timeout: {
          type: "number",
          description: "Execution timeout in ms (default: 30000)",
        },
      },
      required: ["code"],
    },
  },
];

/**
 * Handle tool listing
 */
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

/**
 * Handle tool calls
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "search_tools": {
      const query = args?.query as string;
      const limit = (args?.limit as number) || 10;

      if (!query) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "query is required" }) }],
          isError: true,
        };
      }

      const response: SearchResponse = await searchTools(query, limit);

      // Format results - slim response without inputSchema (use get_tool_schema for that)
      const formatted = {
        results: response.results.map((r) => ({
          name: r.tool.name,
          server: r.tool.server,
          description: r.tool.description,
          example: r.tool.example,
        })),
        source: response.source,
        suggestion: response.suggestion,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }],
      };
    }

    case "get_tool_schema": {
      const toolName = args?.name as string;

      if (!toolName) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "name is required" }) }],
          isError: true,
        };
      }

      const tool = await getToolByName(toolName);

      if (!tool) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: `Tool not found: ${toolName}`,
              suggestion: "Use search_tools to find available tools first",
            }),
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            name: tool.name,
            server: tool.server,
            description: tool.description,
            inputSchema: tool.inputSchema,
            example: tool.example,
            notes: tool.notes,
          }, null, 2),
        }],
      };
    }

    case "execute_code": {
      const code = args?.code as string;
      const timeout = args?.timeout as number | undefined;

      if (!code) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "code is required" }) }],
          isError: true,
        };
      }

      const result = await executeCode(code, timeout);

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: !!result.error,
      };
    }

    default:
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: `Unknown tool: ${name}`,
            availableTools: TOOLS.map((t) => t.name),
          }),
        }],
        isError: true,
      };
  }
});

/**
 * Main entry point
 */
async function main() {
  // Start lifecycle management (idle cleanup, shutdown handlers)
  startLifecycleManagement();

  // Exit gracefully when client disconnects (prevents orphan processes)
  process.stdin.on("close", () => {
    console.error("Client disconnected, shutting down");
    process.exit(0);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Tool Executor MCP running");
  console.error(`Available MCP clients: ${getAvailableClientNames().join(", ")}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
