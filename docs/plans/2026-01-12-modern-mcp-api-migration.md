# Modern MCP API Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate from deprecated `Server` + `setRequestHandler` API to modern `McpServer` + `registerTool` with Zod validation, annotations, and structuredContent.

**Architecture:** Replace monolithic switch-based handler with individual tool registrations. Each tool gets its own Zod schema for runtime validation, annotations for client hints, and dual response format (text + structuredContent).

**Tech Stack:** TypeScript, @modelcontextprotocol/sdk ^1.6.1, Zod ^3.23.8

---

## Pre-Flight Checklist

Before starting, verify:
```bash
git status  # Should be on feature/modern-mcp-api, clean
npm test    # Should pass 26/26
```

---

### Task 1: Install Zod Dependency

**Files:**
- Modify: `package.json`

**Step 1: Install Zod**

```bash
npm install zod
```

**Step 2: Verify installation**

```bash
grep zod package.json
```
Expected: `"zod": "^3.x.x"` in dependencies

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add zod for runtime schema validation"
```

---

### Task 2: Create Zod Schemas Module

**Files:**
- Create: `src/schemas.ts`

**Step 1: Create schemas file with all tool input schemas**

```typescript
import { z } from "zod";

/**
 * Input schema for search_tools
 */
export const SearchToolsInputSchema = z.object({
  query: z.string()
    .min(1, "Query cannot be empty")
    .describe("Search query for finding relevant tools"),
  limit: z.number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum results to return (default: 10)"),
}).strict();

export type SearchToolsInput = z.infer<typeof SearchToolsInputSchema>;

/**
 * Input schema for get_tool_schema
 */
export const GetToolSchemaInputSchema = z.object({
  name: z.string()
    .min(1, "Tool name cannot be empty")
    .describe("Tool name (from search_tools results)"),
}).strict();

export type GetToolSchemaInput = z.infer<typeof GetToolSchemaInputSchema>;

/**
 * Input schema for execute_code
 */
export const ExecuteCodeInputSchema = z.object({
  code: z.string()
    .min(1, "Code cannot be empty")
    .describe("TypeScript/JavaScript code to execute"),
  timeout: z.number()
    .int()
    .min(1000)
    .max(600000)
    .default(30000)
    .describe("Execution timeout in ms (default: 30000)"),
}).strict();

export type ExecuteCodeInput = z.infer<typeof ExecuteCodeInputSchema>;
```

**Step 2: Verify TypeScript compiles**

```bash
npm run build
```
Expected: No errors

**Step 3: Commit**

```bash
git add src/schemas.ts
git commit -m "feat: add Zod schemas for tool input validation"
```

---

### Task 3: Create Tool Handlers Module

**Files:**
- Create: `src/tools/search.ts`
- Create: `src/tools/schema.ts`
- Create: `src/tools/execute.ts`
- Create: `src/tools/index.ts`

**Step 1: Create tools directory**

```bash
mkdir -p src/tools
```

**Step 2: Create search_tools handler**

Create `src/tools/search.ts`:

```typescript
import { searchTools, SearchResponse } from "../search.js";
import type { SearchToolsInput } from "../schemas.js";

/**
 * Search for MCP tools across all wrapped servers
 */
export async function handleSearchTools(params: SearchToolsInput) {
  const response: SearchResponse = await searchTools(params.query, params.limit);

  const output = {
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
    content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
    structuredContent: output,
  };
}
```

**Step 3: Create get_tool_schema handler**

Create `src/tools/schema.ts`:

```typescript
import { getToolByName } from "../search.js";
import type { GetToolSchemaInput } from "../schemas.js";

/**
 * Get full inputSchema for a specific tool
 */
export async function handleGetToolSchema(params: GetToolSchemaInput) {
  const tool = await getToolByName(params.name);

  if (!tool) {
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          error: `Tool not found: ${params.name}`,
          suggestion: "Use search_tools to find available tools first",
        }),
      }],
      isError: true,
    };
  }

  const output = {
    name: tool.name,
    server: tool.server,
    description: tool.description,
    inputSchema: tool.inputSchema,
    example: tool.example,
    notes: tool.notes,
  };

  return {
    content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
    structuredContent: output,
  };
}
```

**Step 4: Create execute_code handler**

Create `src/tools/execute.ts`:

```typescript
import { executeCode } from "../sandbox/runtime.js";
import type { ExecuteCodeInput } from "../schemas.js";

/**
 * Execute TypeScript/JavaScript code in sandbox
 */
export async function handleExecuteCode(params: ExecuteCodeInput) {
  const result = await executeCode(params.code, params.timeout);

  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    structuredContent: result,
    isError: !!result.error,
  };
}
```

**Step 5: Create barrel export**

Create `src/tools/index.ts`:

```typescript
export { handleSearchTools } from "./search.js";
export { handleGetToolSchema } from "./schema.js";
export { handleExecuteCode } from "./execute.js";
```

**Step 6: Verify build**

```bash
npm run build
```
Expected: No errors

**Step 7: Commit**

```bash
git add src/tools/
git commit -m "feat: extract tool handlers into separate modules"
```

---

### Task 4: Migrate to McpServer with registerTool

**Files:**
- Modify: `src/index.ts`

**Step 1: Rewrite index.ts with modern API**

Replace entire contents of `src/index.ts`:

```typescript
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  SearchToolsInputSchema,
  GetToolSchemaInputSchema,
  ExecuteCodeInputSchema,
} from "./schemas.js";
import {
  handleSearchTools,
  handleGetToolSchema,
  handleExecuteCode,
} from "./tools/index.js";
import { startLifecycleManagement } from "./sandbox/clients.js";
import { getAvailableClientNames } from "./sandbox/runtime.js";

const server = new McpServer({
  name: "tool-executor-mcp-server",
  version: "1.0.0",
});

/**
 * Tool: search_tools
 * Search for MCP tools across all wrapped servers
 */
server.registerTool(
  "search_tools",
  {
    title: "Search MCP Tools",
    description: `Search for MCP tools across all wrapped servers. Returns slim results (name, server, description, example) for discovery.

Use get_tool_schema(name) to get the full inputSchema when you're ready to call a specific tool.

Available categories: game-dev, code-nav, knowledge, ai-models, web, source-control, ui, reasoning, debugging, misc

Example queries:
- "godot scene" - tools for Godot game development
- "semantic code search" - Serena code navigation
- "generate diagram" - Mermaid diagram tools
- "fetch webpage" - HTTP fetch tools`,
    inputSchema: SearchToolsInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  handleSearchTools
);

/**
 * Tool: get_tool_schema
 * Get full inputSchema for a specific tool
 */
server.registerTool(
  "get_tool_schema",
  {
    title: "Get Tool Schema",
    description: `Get the full inputSchema for a specific tool. Use after search_tools to get parameter details before calling execute_code.

Example: get_tool_schema("generate_mermaid_diagram") - returns full schema with all parameters, types, enums, etc.`,
    inputSchema: GetToolSchemaInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  handleGetToolSchema
);

/**
 * Tool: execute_code
 * Execute TypeScript/JavaScript code in sandbox
 */
const clientList = getAvailableClientNames().map((n) => `- ${n}`).join("\n");

server.registerTool(
  "execute_code",
  {
    title: "Execute Code",
    description: `Execute TypeScript/JavaScript code with access to all MCP clients and workspace helpers.

**Available MCP clients (call as async functions):**
${clientList}

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
    inputSchema: ExecuteCodeInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  handleExecuteCode
);

/**
 * Main entry point
 */
async function main() {
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
```

**Step 2: Build and verify**

```bash
npm run build
```
Expected: No errors

**Step 3: Run tests**

```bash
npm test
```
Expected: 26/26 passing (tests don't touch index.ts directly)

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: migrate to McpServer with registerTool API

BREAKING: Uses modern MCP SDK patterns
- McpServer instead of Server
- registerTool instead of setRequestHandler
- Zod schemas for input validation
- Tool annotations (readOnlyHint, destructiveHint, etc.)
- structuredContent in responses
- title field on all tools"
```

---

### Task 5: Manual Integration Test

**Files:**
- None (testing only)

**Step 1: Start the server manually**

```bash
node dist/index.js
```
Expected: "Tool Executor MCP running" on stderr

**Step 2: Test with MCP Inspector (optional)**

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

- List tools: should show 3 tools with titles
- Call search_tools: `{ "query": "diagram" }`
- Verify response has structuredContent

**Step 3: Kill test server**

```bash
# Ctrl+C or the server exits when stdin closes
```

---

### Task 6: Update SDK Version in package.json

**Files:**
- Modify: `package.json`

**Step 1: Update SDK to latest**

```bash
npm install @modelcontextprotocol/sdk@latest
```

**Step 2: Verify build still works**

```bash
npm run build && npm test
```
Expected: All passing

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: update MCP SDK to latest version"
```

---

### Task 7: Clean Up Old Types

**Files:**
- Modify: `src/types.ts`

**Step 1: Remove unused imports from types.ts**

The `Client` import in types.ts is only used for the MCPClients interface which is still needed. No changes required.

**Step 2: Verify no dead code**

```bash
npm run build
```
Expected: No unused variable warnings

**Step 3: Commit (if any changes)**

```bash
git add -A && git commit -m "chore: remove unused type imports" || echo "No changes"
```

---

### Task 8: Final Verification & Push

**Files:**
- None

**Step 1: Run full test suite**

```bash
npm test
```
Expected: 26/26 passing

**Step 2: Build clean**

```bash
rm -rf dist && npm run build
```
Expected: Clean build, no errors

**Step 3: Verify git status**

```bash
git log --oneline -5
```
Expected: See all commits from this migration

**Step 4: Push feature branch**

```bash
git push origin feature/modern-mcp-api
```

**Step 5: Create PR (optional)**

```bash
gh pr create --title "Migrate to modern MCP API" --body "## Summary
- Migrate from deprecated Server + setRequestHandler to McpServer + registerTool
- Add Zod schemas for runtime input validation
- Add tool annotations (readOnlyHint, destructiveHint, idempotentHint, openWorldHint)
- Add structuredContent to responses
- Add title field to all tools
- Extract tool handlers into src/tools/

## Test Plan
- [ ] npm test passes (26/26)
- [ ] Manual test with MCP Inspector
- [ ] Verify Claude Code can still use all 3 tools"
```

---

## Post-Migration Notes

### What Changed
| Before | After |
|--------|-------|
| `import { Server }` | `import { McpServer }` |
| `server.setRequestHandler(...)` | `server.registerTool(...)` |
| JSON Schema objects | Zod schemas |
| `as string` type casts | Automatic Zod validation |
| No annotations | Full annotations on all tools |
| Text-only responses | Text + structuredContent |

### What Didn't Change
- Tool names: `search_tools`, `get_tool_schema`, `execute_code`
- Tool parameters: Same shape
- Transport: stdio
- Existing tests: All should pass

### Future Improvements (Not in Scope)
- [ ] Add response_format parameter (JSON/Markdown)
- [ ] Add pagination metadata to search results
- [ ] Service prefix on tool names (evaluate if needed)
- [ ] Extract to src/tools/ directory structure
