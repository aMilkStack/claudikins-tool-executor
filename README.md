<p align="center">
  <img src="banner.png" alt="Claudikins - Semantic Discovery & Code Sandbox" width="100%">
</p>

# Claudikins - Tool Executor and Sandbox

**Part of the Claudikins framework** — A wrapper pattern for consolidating multiple MCP servers into a single, context-efficient interface.

## Why?

**Context is precious.** Loading MCP servers directly into Claude Code consumes tokens for every tool definition — often 25%+ of your context window before you've even started.

This wrapper reduces tool definitions to just **3 tools**, with semantic search to find what you need on demand.

| Setup | Tools | Tokens | Context Used |
|-------|-------|--------|--------------|
| Direct MCP (example: 9 servers) | 102 | ~50,000 | 25% |
| **Wrapper** | **3** | **~1.1k** | **0.5%** |

## How It Works

Instead of loading all tool schemas upfront, the wrapper exposes three tools:

1. **`search_tools`** — Semantic search over tool definitions
2. **`get_tool_schema`** — Fetch the full schema for a specific tool when needed
3. **`execute_code`** — Run TypeScript with pre-connected MCP clients

```
Claude Code → Claudikins Tool Executor → Sandbox Runtime → Your MCP servers
                    │
                    └── search_tools uses Serena for semantic search
                        (separate instance from the sandbox Serena)
```

**Note on Serena:** The wrapper uses two separate Serena instances:
- **Registry Serena** — powers `search_tools`, indexes the `registry/` folder (tool definitions)
- **Sandbox Serena** — available in `execute_code`, indexes *your* project (wherever you're working)

They're intentionally separate: one finds tools, the other analyses your codebase. No project confusion.
