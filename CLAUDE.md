# Claudikins - Tool Executor and Sandbox

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Part of the Claudikins framework** — a modular ecosystem for Claude Code extensions.

## Project Status

**Complete** - Core implementation done, 43/43 tests passing.

## What This Is

An MCP server that wraps other MCP servers into a single interface with three tools:
- `search_tools` - Semantic search over tool definitions using Serena
- `get_tool_schema` - Get full inputSchema for a specific tool
- `execute_code` - TypeScript execution in a sandbox with pre-connected MCP clients

Reduces Claude Code context consumption from ~50k tokens to ~1.1k tokens by not loading tool definitions upfront.

## Architecture

```
Claude Code → Claudikins Tool Executor → Sandbox Runtime → All other MCPs
                    │
                    └── search_tools uses Serena for semantic search
```

## File Structure

```
src/
├── index.ts           # MCP server entry point (McpServer + registerTool)
├── schemas.ts         # Zod input schemas for all tools
├── types.ts           # Shared TypeScript types
├── search.ts          # Serena integration + local fallback
├── tools/             # Tool handlers (extracted from index.ts)
│   ├── index.ts       # Barrel export
│   ├── search.ts      # search_tools handler
│   ├── schema.ts      # get_tool_schema handler
│   └── execute.ts     # execute_code handler
└── sandbox/
    ├── clients.ts     # Lazy MCP client connections + lifecycle
    ├── runtime.ts     # Code execution with timeout
    └── workspace.ts   # Persistent file storage API
registry/              # 103 tool definitions (YAML) by category
workspace/             # Persistent state between executions
scripts/
└── extract-schemas.ts # Generate registry from live MCPs
tests/
├── unit/              # Workspace tests
└── integration/       # Execute code tests
```

## Wrapped MCP Servers (9)

| Server | Type | Purpose |
|--------|------|---------|
| serena | uvx | Semantic code search |
| context7 | npx | Library documentation |
| gemini | npx | AI model queries |
| notebooklm | npx | Research/notes |
| shadcn | npx | UI components |
| mermaid | npx | Diagram generation |
| apify | npx | Web scraping |
| sequentialThinking | npx | Reasoning chains |
| nanoBanana | uvx | Misc utilities |

## Development Commands

```bash
npm run build    # Compile TypeScript
npm run dev      # Watch mode
npm run extract  # Regenerate registry from MCPs
npm test         # Run all tests (43 tests)
```

## Claude Code Configuration

This MCP server is configured in `~/.claude.json` under the `mcpServers` key:

```json
{
  "mcpServers": {
    "tool-executor": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/claudikins-tool-executor/dist/index.js"],
      "env": {
        "GEMINI_API_KEY": "...",
        "APIFY_TOKEN": "..."
      }
    }
  }
}
```

**After code changes:** Run `npm run build` then restart Claude Code. The old MCP process is killed automatically when Claude Code disconnects (stdin close detection).

## Key Patterns

**Lazy Loading** - Clients connect on first use, disconnect after 3 mins idle (`clients.ts:5`)

**Dual Serena** - One instance for registry search, one available in sandbox. Prevents state conflicts.

**Proxy Pattern** - MCP clients exposed as `clientName.toolName(args)` via ES6 Proxy (`runtime.ts:11-46`)

## Adding New MCP Servers

1. Add config to `SERVER_CONFIGS` in `src/sandbox/clients.ts`
2. Run `npm run extract` or manually create YAML files in `registry/`
3. Rebuild: `npm run build`
4. Test: `search_tools` query for new tools

## Common Issues

**Serena not finding tools:** Check YAML file paths match pattern `category/server/tool.yaml`

**execute_code timeout:** Default 30s. Pass `timeout` param for long operations.

**MCP connection fails:** Server continues without that client. Check stderr logs.

## Learnings

*Project-specific mistakes go here.*

```
### [Date] - [Title]
**What happened**:
**Why it was wrong**:
**Rule**:
```

*(None yet)*
