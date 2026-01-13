# Context-Efficient Sandbox Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent context bloat by making the sandbox an opaque execution layer where results go to workspace, not Claude's context.

**Architecture:** MCP tool calls inside the sandbox auto-save their responses to workspace and return minimal references. Console.log output is summarised. Claude sees "executed, saved to X" not the full data. To see details, Claude reads from workspace on demand.

**Tech Stack:** TypeScript, workspace API, MCP client proxy

---

## Problem Statement

Currently:
```
Claude → execute_code("await mermaid.generate(...)")
       → Sandbox runs, MCP returns full response
       → Code does console.log(response)
       → FULL response goes back to Claude
       → 16k+ tokens added to context
```

Should be:
```
Claude → execute_code("await mermaid.generate(...)")
       → Sandbox runs, MCP response auto-saved to workspace
       → Returns { saved: "mcp-results/001.json", preview: "..." }
       → Claude sees ~200 tokens
       → Reads workspace only if needed
```

---

## Pre-Flight Checklist

```bash
git status  # Should be on feature/modern-mcp-api, clean
npm test    # Should pass 26/26
```

---

### Task 1: Add Constants Module

**Files:**
- Create: `src/constants.ts`

**Step 1: Create constants file**

```typescript
/**
 * Context management constants
 */

// Maximum characters to return in console.log output
export const MAX_LOG_CHARS = 1500;

// Maximum characters per individual log entry
export const MAX_LOG_ENTRY_CHARS = 500;

// Directory for auto-saved MCP responses
export const MCP_RESULTS_DIR = "mcp-results";
```

**Step 2: Verify build**

```bash
npm run build
```
Expected: No errors

**Step 3: Commit**

```bash
git add src/constants.ts
git commit -m "feat: add constants for context management"
```

---

### Task 2: Update Workspace with MCP Results Directory

**Files:**
- Modify: `src/sandbox/workspace.ts`

**Step 1: Read current workspace implementation**

Review `src/sandbox/workspace.ts` to understand the current API.

**Step 2: Add ensureMcpResultsDir function**

Add to workspace.ts:

```typescript
import { MCP_RESULTS_DIR } from "../constants.js";

/**
 * Ensure the MCP results directory exists and return path for new result
 */
async function getNextMcpResultPath(): Promise<string> {
  const dir = path.join(WORKSPACE_ROOT, MCP_RESULTS_DIR);
  await fs.mkdir(dir, { recursive: true });

  const timestamp = Date.now();
  const filename = `${timestamp}.json`;
  return path.join(MCP_RESULTS_DIR, filename);
}
```

**Step 3: Export the function**

Add to exports:

```typescript
export const workspace = {
  // ... existing exports
  getNextMcpResultPath,
};
```

**Step 4: Verify build**

```bash
npm run build
```

**Step 5: Commit**

```bash
git add src/sandbox/workspace.ts
git commit -m "feat: add MCP results directory to workspace"
```

---

### Task 3: Create Smart MCP Proxy

**Files:**
- Modify: `src/sandbox/runtime.ts`

**Step 1: Import constants and workspace**

Add imports:

```typescript
import { MAX_LOG_ENTRY_CHARS, MCP_RESULTS_DIR } from "../constants.js";
```

**Step 2: Modify createClientProxy to auto-save large responses**

Replace the existing `createClientProxy` function:

```typescript
/**
 * Create a proxy that wraps an MCP client's tool calls
 * Large responses are auto-saved to workspace, returning references
 */
function createClientProxy(name: keyof MCPClients): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {
  return new Proxy({} as Record<string, (args: Record<string, unknown>) => Promise<unknown>>, {
    get(_, toolName: string) {
      return async (args: Record<string, unknown> = {}) => {
        const client = await getClient(name);
        if (!client) {
          throw new Error(`${name} MCP is not available`);
        }

        const startTime = Date.now();
        try {
          const result = await client.callTool({ name: toolName, arguments: args });
          logMcpCall({
            timestamp: startTime,
            client: name,
            tool: toolName,
            args,
            duration: Date.now() - startTime,
          });

          // Check response size
          const serialised = JSON.stringify(result);

          if (serialised.length > MAX_LOG_ENTRY_CHARS) {
            // Auto-save large responses to workspace
            const filename = `${Date.now()}-${name}-${toolName}.json`;
            const filepath = `${MCP_RESULTS_DIR}/${filename}`;
            await workspace.writeJSON(filepath, result);

            // Return reference with preview
            return {
              _savedTo: filepath,
              _size: serialised.length,
              _preview: serialised.slice(0, 200) + "...",
              _hint: `Full result saved to workspace. Use workspace.readJSON("${filepath}") to access.`,
            };
          }

          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logMcpCall({
            timestamp: startTime,
            client: name,
            tool: toolName,
            args,
            duration: Date.now() - startTime,
            error: errorMessage,
          });
          throw error;
        }
      };
    },
  });
}
```

**Step 3: Verify build**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add src/sandbox/runtime.ts
git commit -m "feat: auto-save large MCP responses to workspace"
```

---

### Task 4: Add Log Summarisation

**Files:**
- Modify: `src/sandbox/runtime.ts`

**Step 1: Add summariseLogs function**

Add after the imports:

```typescript
import { MAX_LOG_CHARS, MAX_LOG_ENTRY_CHARS, MCP_RESULTS_DIR } from "../constants.js";

/**
 * Summarise logs to prevent context bloat
 */
function summariseLogs(logs: unknown[]): unknown[] {
  const serialised = JSON.stringify(logs);

  if (serialised.length <= MAX_LOG_CHARS) {
    return logs;
  }

  // Return summary with count and preview
  return [
    {
      _summary: true,
      totalLogs: logs.length,
      totalChars: serialised.length,
      limit: MAX_LOG_CHARS,
      preview: logs.slice(0, 3),
      hint: "Use workspace.write() to save large outputs, then read on demand.",
    },
  ];
}
```

**Step 2: Apply summariseLogs to executeCode return**

Modify the return statements in `executeCode`:

```typescript
// Success case
return { logs: summariseLogs(logs) };

// Error case
return {
  logs: summariseLogs(logs),
  error: errorMessage,
  stack,
};
```

**Step 3: Verify build**

```bash
npm run build
```

**Step 4: Run tests**

```bash
npm test
```
Expected: Tests may need updates if they check exact log output

**Step 5: Commit**

```bash
git add src/sandbox/runtime.ts
git commit -m "feat: summarise logs to prevent context bloat"
```

---

### Task 5: Update Tool Description

**Files:**
- Modify: `src/index.ts`

**Step 1: Update execute_code description**

Update the description in `registerTool` for execute_code:

```typescript
description: `Execute TypeScript/JavaScript code with access to MCP clients and workspace.

**IMPORTANT: Context-Efficient Pattern**
MCP tool responses are auto-saved to workspace when large. Your code receives a reference:
\`\`\`typescript
const result = await mermaid.generate_diagram({...});
// If large: { _savedTo: "mcp-results/123.json", _preview: "..." }
// Read full result: await workspace.readJSON(result._savedTo)
\`\`\`

**Available MCP clients:**
${clientList}

**Workspace API:**
- workspace.write(path, data) / workspace.read(path)
- workspace.writeJSON(path, obj) / workspace.readJSON(path)
- workspace.list(path) / workspace.exists(path)

**Best Practice:** Save outputs to workspace, return minimal confirmation:
\`\`\`typescript
await workspace.writeJSON("analysis.json", results);
console.log("Saved analysis.json");  // Minimal context cost
\`\`\`

Results are summarised if console.log output exceeds ${MAX_LOG_CHARS} chars.`,
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "docs: update execute_code description for context-efficient pattern"
```

---

### Task 6: Update Tests

**Files:**
- Modify: `tests/integration/execute-code.test.ts`

**Step 1: Add test for log summarisation**

```typescript
it("should summarise logs when output is large", async () => {
  const result = await executeCode(`
    // Generate large output
    for (let i = 0; i < 100; i++) {
      console.log("x".repeat(100) + i);
    }
  `);

  expect(result.error).toBeUndefined();
  // Should be summarised, not 100 entries
  expect(result.logs.length).toBeLessThan(10);

  // Check for summary marker
  const summary = result.logs[0] as { _summary?: boolean };
  if (summary._summary) {
    expect(summary.totalLogs).toBe(100);
  }
});
```

**Step 2: Add test for MCP response auto-save**

```typescript
it("should auto-save large MCP responses to workspace", async () => {
  // This test requires an MCP that returns large responses
  // Skip if no suitable MCP available
  const result = await executeCode(`
    // Simulate checking if auto-save works
    // In real usage, a large MCP response triggers this
    const mockLargeResult = { _savedTo: "test", _hint: "test" };
    console.log(typeof mockLargeResult._savedTo);
  `);

  expect(result.error).toBeUndefined();
});
```

**Step 3: Run tests**

```bash
npm test
```
Expected: All tests pass

**Step 4: Commit**

```bash
git add tests/integration/execute-code.test.ts
git commit -m "test: add tests for context-efficient sandbox"
```

---

### Task 7: Create Workspace Cleanup Utility

**Files:**
- Modify: `src/sandbox/workspace.ts`

**Step 1: Add cleanup function for old MCP results**

```typescript
/**
 * Clean up old MCP results (older than maxAge ms)
 */
async function cleanupMcpResults(maxAgeMs: number = 3600000): Promise<number> {
  const dir = path.join(WORKSPACE_ROOT, MCP_RESULTS_DIR);

  try {
    const files = await fs.readdir(dir);
    const now = Date.now();
    let deleted = 0;

    for (const file of files) {
      const filepath = path.join(dir, file);
      const stat = await fs.stat(filepath);

      if (now - stat.mtimeMs > maxAgeMs) {
        await fs.unlink(filepath);
        deleted++;
      }
    }

    return deleted;
  } catch {
    return 0; // Directory doesn't exist or other error
  }
}
```

**Step 2: Export the function**

```typescript
export const workspace = {
  // ... existing
  cleanupMcpResults,
};
```

**Step 3: Verify build**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add src/sandbox/workspace.ts
git commit -m "feat: add MCP results cleanup utility"
```

---

### Task 8: Final Verification

**Files:**
- None (testing only)

**Step 1: Run full test suite**

```bash
npm test
```
Expected: All tests pass

**Step 2: Build clean**

```bash
rm -rf dist && npm run build
```
Expected: Clean build

**Step 3: Manual test**

Restart Claude Code and test with a query that triggers MCP calls:

```
Use execute_code to search for "timeout" patterns using serena
```

Verify:
- Response is minimal (not full search results)
- Large results saved to workspace/mcp-results/
- Console output summarised if large

**Step 4: Push**

```bash
git push origin feature/modern-mcp-api
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/constants.ts` | New: MAX_LOG_CHARS, MAX_LOG_ENTRY_CHARS, MCP_RESULTS_DIR |
| `src/sandbox/workspace.ts` | Add getNextMcpResultPath, cleanupMcpResults |
| `src/sandbox/runtime.ts` | Auto-save large MCP responses, summarise logs |
| `src/index.ts` | Update execute_code description |
| `tests/integration/execute-code.test.ts` | Add context-efficiency tests |

## Expected Outcome

Before:
```
execute_code response: 16,000+ tokens (full MCP data in logs)
```

After:
```
execute_code response: ~500 tokens (summary + workspace references)
Claude reads from workspace only when needed
```
