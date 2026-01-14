# Context-Efficient Pattern

Claudikins Tool Executor automatically manages context by saving large MCP responses to disk and returning slim references.

## How It Works

When an MCP tool returns a response larger than the threshold:

1. **Auto-save**: Response saved to `workspace/mcp-results/<timestamp>.json`
2. **Reference returned**: Your code receives `{ _savedTo: "mcp-results/123.json", _preview: "First 500 chars..." }`
3. **On-demand access**: Read full data with `workspace.readJSON(result._savedTo)`

## Example

```typescript
// Large response auto-saved
const result = await gemini["gemini-deep-research"]({ topic: "quantum computing" });
// result = { _savedTo: "mcp-results/abc123.json", _preview: "Quantum computing is..." }

// Access full data when needed
const fullData = await workspace.readJSON(result._savedTo);
console.log(fullData.content);
```

## Benefits

- **Context stays lean**: Claude sees the preview, not 50KB of JSON
- **Data not lost**: Full response available on disk
- **Automatic**: No code changes needed

## Configuration

Constants in `src/constants.ts`:
- `MAX_LOG_CHARS`: Maximum console.log output (default: 1500 chars)
- `MAX_LOG_ENTRY_CHARS`: Maximum per-entry log size (default: 500 chars)
- `MCP_RESULTS_DIR`: Where results are saved (default: "mcp-results")

## Cleanup

Results accumulate over time. Clean up with:

```typescript
await workspace.cleanupMcpResults(24); // Delete files older than 24 hours
```

Or manually:

```bash
rm -rf workspace/mcp-results/*
```

## When It Triggers

The auto-save triggers when:
- MCP tool response exceeds ~5KB
- Response contains structured data (arrays, nested objects)

Small responses (strings, simple objects) are returned directly without saving.

## Workspace API

The `workspace` object provides persistent storage:

```typescript
// Write/read text files
await workspace.write("notes.txt", "Hello world");
const text = await workspace.read("notes.txt");

// Write/read JSON
await workspace.writeJSON("data.json", { foo: "bar" });
const obj = await workspace.readJSON("data.json");

// List files
const files = await workspace.list("mcp-results");

// Check existence
if (await workspace.exists("data.json")) { ... }

// Cleanup old MCP results
await workspace.cleanupMcpResults(24); // Hours
```

## Best Practice

Save outputs to workspace and return minimal confirmation to keep Claude's context lean:

```typescript
// Good - minimal context cost
const results = await someExpensiveOperation();
await workspace.writeJSON("analysis.json", results);
console.log("Saved analysis.json with", results.length, "items");

// Avoid - floods context with data
console.log(JSON.stringify(results, null, 2)); // Don't do this!
```
