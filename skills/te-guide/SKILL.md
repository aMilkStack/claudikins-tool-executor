---
name: te-guide
description: Use this skill when users ask "how does tool executor work", "how to use execute_code", "workspace API", "MCP client examples", "search_tools examples", "context-efficient patterns", or need guidance writing code for the Tool Executor sandbox.
---

# Claudikins Tool Executor Guide

The Tool Executor wraps 7 MCP servers into 3 context-efficient tools. Master this workflow to reduce token consumption from ~50k to ~1.1k.

## The Three-Tool Workflow

```
search_tools → get_tool_schema → execute_code
```

### Step 1: Search for Tools

Find relevant tools with semantic search:

```typescript
const result = await mcp__tool-executor__search_tools({
  query: "generate diagram",
  limit: 5
});
// Returns: { results: [{ name, server, description }], source, has_more }
```

**Search tips:**
- Use natural language: "create flowchart", "fetch webpage", "AI reasoning"
- Results are slim - just name, server, one-liner
- Use `offset` for pagination when `has_more` is true

### Step 2: Get Full Schema

Before calling a tool, get its complete specification:

```typescript
const schema = await mcp__tool-executor__get_tool_schema({
  name: "gemini_generateContent"
});
// Returns: { name, server, description, inputSchema, example, notes }
```

**Why this step matters:**
- `inputSchema` shows all parameters, types, and required fields
- `example` shows working code you can adapt
- `notes` contains gotchas and tips

### Step 3: Execute Code

Run TypeScript in the sandbox with pre-connected MCP clients:

```typescript
const result = await mcp__tool-executor__execute_code({
  code: `
    const response = await gemini.gemini_generateContent({
      prompt: "Create a flowchart description for user authentication"
    });
    console.log("Generated:", response._savedTo || "inline");
  `,
  timeout: 30000
});
```

## Available MCP Clients

All clients are pre-connected and available as globals:

| Client | Purpose |
|--------|---------|
| `serena` | Semantic code search (REQUIRED - cannot be removed) |
| `context7` | Library documentation lookup |
| `gemini` | AI model queries, image generation, diagrams |
| `notebooklm` | Research and notes |
| `shadcn` | UI component generation |
| `apify` | Web scraping |
| `sequentialThinking` | Reasoning chains |

### Client Usage Pattern

```typescript
// All clients use the same pattern:
const result = await clientName.tool_name({ param: value });

// Examples:
await serena.find_symbol({ name_path: "MyClass" });
await gemini.query_gemini({ prompt: "Explain this code" });
await context7.resolve_library_id({ libraryName: "react" });
```

## Workspace API

Persistent file storage scoped to `./workspace/`. All paths are protected against traversal.

### Text Operations
```typescript
await workspace.write("notes.txt", "Hello world");
const content = await workspace.read("notes.txt");
await workspace.append("log.txt", "New line\n");
await workspace.delete("temp.txt");
```

### JSON Operations
```typescript
await workspace.writeJSON("data.json", { key: "value" });
const data = await workspace.readJSON("data.json");
```

### Binary Operations
```typescript
await workspace.writeBuffer("image.png", buffer);
const buffer = await workspace.readBuffer("image.png");
```

### Directory Operations
```typescript
const files = await workspace.list("subdir");
const matches = await workspace.glob("**/*.json");
await workspace.mkdir("nested/path");
```

### Metadata
```typescript
const exists = await workspace.exists("file.txt");
const stats = await workspace.stat("file.txt");
// stats: { size: number, mtime: Date, isDir: boolean }
```

### MCP Results Cleanup
```typescript
// Clean up auto-saved MCP responses older than 1 hour
const deleted = await workspace.cleanupMcpResults();
```

## Context-Efficient Patterns

### Auto-Save for Large Responses

MCP responses over 200 characters are automatically saved to workspace:

```typescript
const response = await context7.get_library_docs({
  context7CompatibleLibraryID: "/react/react"
});

// If large, response becomes:
// { _savedTo: "mcp-results/1234.json", _size: 5000, _preview: "...", _hint: "..." }

// Read full result when needed:
const full = await workspace.readJSON(response._savedTo);
```

### Console Output Summarisation

Total console output over 500 characters is summarised. Keep logs concise:

```typescript
// Good - concise logs
console.log("Created 5 files");
console.log("Done");

// Avoid - verbose output that gets truncated
console.log(JSON.stringify(largeObject, null, 2));
```

### Batch Operations

Minimise round-trips by batching work:

```typescript
// Good - single execution with multiple operations
await mcp__tool-executor__execute_code({
  code: `
    const [lib1, lib2] = await Promise.all([
      context7.resolve_library_id({ libraryName: "react" }),
      context7.resolve_library_id({ libraryName: "vue" })
    ]);
    console.log("Resolved both");
  `
});
```

## Common Patterns

### Generate Content with Gemini
```typescript
const response = await gemini.gemini_generateContent({
  prompt: `Create a detailed flowchart description:
    - User submits request
    - Search for relevant tools
    - Get tool schema
    - Execute code in sandbox
  `
});
await workspace.write("flowchart.md", response.content[0].text);
console.log("Saved flowchart.md");
```

### Search Codebase with Serena
```typescript
const results = await serena.find_symbol({ name_path: "executeCode" });
console.log("Found:", results.content[0].text);
```

### AI-Assisted Analysis
```typescript
const code = await workspace.read("analysis-target.ts");
const analysis = await gemini.query_gemini({
  prompt: `Analyse this code for potential issues:\n\n${code}`
});
await workspace.write("analysis.md", analysis.content[0].text);
```

## Error Handling

Errors in execute_code return structured results:

```typescript
const result = await mcp__tool-executor__execute_code({
  code: `throw new Error("Something broke")`
});
// result: { logs: [...], error: "Something broke", stack: "..." }
```

**Common errors:**
- **Timeout**: Increase `timeout` parameter or chunk work
- **MCP connection failed**: Check server is configured, try later
- **Path traversal blocked**: Workspace paths must stay within `./workspace/`

## Source Code Reference

For implementation details, see:
- `${CLAUDE_PLUGIN_ROOT}/src/sandbox/runtime.ts` - Execution engine
- `${CLAUDE_PLUGIN_ROOT}/src/sandbox/workspace.ts` - Workspace API
- `${CLAUDE_PLUGIN_ROOT}/src/sandbox/clients.ts` - MCP client management
- `${CLAUDE_PLUGIN_ROOT}/src/search.ts` - Tool search implementation
