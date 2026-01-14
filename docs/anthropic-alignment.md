# Alignment with Anthropic Tool Patterns

Claudikins Tool Executor implements patterns that align with Anthropic's recommended approaches for tool use and code execution.

## Pattern Comparison

| Anthropic Pattern | Our Implementation |
|-------------------|-------------------|
| Code execution sandbox | `execute_code` sandbox |
| Tool search/discovery | `search_tools` via Serena + BM25 |
| Deferred schema loading | `get_tool_schema` on demand |
| Tools callable from code | MCP client proxies in sandbox |
| Programmatic Tool Calling | Claude writes code that calls tools |

## Key Insight

We independently developed the same architecture that Anthropic recommends for "Programmatic Tool Calling":

> "PTC allows Claude to write code that calls tools programmatically within the execution container, rather than requiring round-trips through the model for each tool invocation."

Our `execute_code` tool does exactly this - Claude writes TypeScript that orchestrates multiple MCP tools in a single execution.

## Architecture Alignment

### Tool Discovery
- **Anthropic**: Tool search with deferred schema loading
- **Us**: `search_tools` returns slim results, `get_tool_schema` fetches full schema

### Code Execution
- **Anthropic**: Sandboxed execution environment
- **Us**: TypeScript sandbox with timeout, output capture, error handling

### Tool Invocation
- **Anthropic**: Tools callable from within execution
- **Us**: MCP clients exposed as `clientName.toolName(args)` proxies

### Context Management
- **Anthropic**: Minimise tool definitions in context
- **Us**: 3 tools visible instead of 100+, ~800 tokens vs ~50k

## Implementation Differences

| Aspect | Anthropic API | Our Approach |
|--------|---------------|--------------|
| Execution | Server-side containers | Local sandbox |
| Transport | API beta headers | MCP protocol |
| Tool visibility | `defer_loading` flag | Always 3 tools visible |
| Files | Files API upload/download | workspace API |
| Target | API developers | Claude Code CLI users |

## Why Both Exist

- **Anthropic API**: For developers building with raw API calls
- **Claudikins Tool Executor**: For Claude Code CLI users who want the same patterns

We're CLI-native; they're API-native. Same patterns, different transports.

## Benefits of This Approach

1. **Reduced context consumption** - 60x reduction in tool definition tokens
2. **Batched operations** - Multiple tool calls in single execution
3. **Code-driven workflows** - Claude writes logic, not just calls
4. **Persistent state** - workspace API for data between executions
5. **Self-service discovery** - Claude searches for tools as needed
