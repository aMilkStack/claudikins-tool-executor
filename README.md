# Tool Executor MCP

A wrapper pattern for consolidating multiple MCP servers into a single, context-efficient interface.

## Why?

**Context is precious.** Loading MCP servers directly into Claude Code consumes tokens for every tool definition — often 25%+ of your context window before you've even started.

This wrapper reduces tool definitions to just **3 tools**, with semantic search to find what you need on demand.

| Setup | Tools | Tokens | Context Used |
|-------|-------|--------|--------------|
| Direct MCP (example: 9 servers) | 102 | ~50,000 | 25% |
| **Wrapper** | **3** | **~800** | **0.4%** |

## How It Works

Instead of loading all tool schemas upfront, the wrapper exposes three tools:

1. **`search_tools`** — Semantic search over tool definitions
2. **`get_tool_schema`** — Fetch the full schema for a specific tool when needed
3. **`execute_code`** — Run TypeScript with pre-connected MCP clients

```
Claude Code → tool_executor MCP → Sandbox Runtime → Your MCP servers
                    │
                    └── search_tools uses Serena for semantic search
                        (separate instance from the sandbox Serena)
```

**Note on Serena:** The wrapper uses two separate Serena instances:
- **Registry Serena** — powers `search_tools`, indexes the `registry/` folder (tool definitions)
- **Sandbox Serena** — available in `execute_code`, indexes *your* project (wherever you're working)

They're intentionally separate: one finds tools, the other analyses your codebase. No project confusion.

## Quick Start

### Prerequisites

- **Node.js 18+**
- **Python 3.10+ with uv** — only if using uvx-based MCPs

### Setup

```bash
git clone https://github.com/yourusername/tool-executor-mcp.git
cd tool-executor-mcp
npm install
npm run build
```

### Configure Claude Code

Add to `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "tool-executor": {
      "command": "node",
      "args": ["/absolute/path/to/tool-executor-mcp/dist/index.js"],
      "env": {
        "YOUR_API_KEY": "if-needed"
      }
    }
  }
}
```

## Customising Your MCP Stack

This repo includes a starter configuration. **You'll want to swap in your own MCPs.**

### Step 1: Edit Server Configs

Open `src/sandbox/clients.ts` and modify `SERVER_CONFIGS`:

```typescript
export const SERVER_CONFIGS: ServerConfig[] = [
  // NPX servers (auto-downloaded via npm)
  {
    name: "myserver",           // Used in execute_code as: await myserver.tool_name()
    displayName: "My Server",   // For logs
    command: "npx",
    args: ["-y", "my-mcp-package"]
  },

  // With environment variables
  {
    name: "openai",
    displayName: "OpenAI",
    command: "npx",
    args: ["-y", "openai-mcp"],
    env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY || "" }
  },

  // UVX servers (Python, auto-downloaded via uv)
  {
    name: "pythonserver",
    displayName: "Python Server",
    command: "uvx",
    args: ["some-python-mcp"]
  },

  // Local/custom servers
  {
    name: "custom",
    displayName: "Custom",
    command: "node",
    args: ["/path/to/your/server.js"]
  },
];
```

### Step 2: Generate Tool Registry

```bash
npm run extract
```

This connects to each MCP server, extracts tool schemas, and saves them as YAML files in `registry/`.

**How search indexing works:** The `registry/` folder is a Serena project (see `.serena/project.yml`). The `search_tools` function uses its own dedicated Serena instance that indexes the registry on first connect.

**After adding new tools:** Restart Claude Code. The Registry Serena (used by `search_tools`) is separate from the Sandbox Serena (used by `execute_code`) — re-indexing one doesn't affect the other.

The local fallback search (when Serena is unavailable) scans the filesystem directly and always sees new files immediately.

### Step 3: Rebuild

```bash
npm run build
```

### Step 4: Update Claude Code Config

Pass any required environment variables in your `mcp.json`:

```json
{
  "mcpServers": {
    "tool-executor": {
      "command": "node",
      "args": ["/path/to/dist/index.js"],
      "env": {
        "OPENAI_API_KEY": "sk-...",
        "OTHER_KEY": "..."
      }
    }
  }
}
```

## Usage

```typescript
// 1. Find relevant tools
const tools = await search_tools({ query: "generate diagram" });

// 2. Get schema if needed
const schema = await get_tool_schema({ name: "generate_mermaid_diagram" });

// 3. Execute
await execute_code({
  code: `
    const result = await mermaid.generate_mermaid_diagram({
      diagram: "graph LR; A-->B"
    });
    console.log(result);
  `
});
```

## Starter Configuration

This repo ships with 9 example MCP servers as a starting point:

| Server | Type | Tools | Purpose |
|--------|------|-------|---------|
| Serena | uvx | 29 | Semantic code search |
| Gemini | npx | 37 | AI model queries |
| NotebookLM | npx | 16 | Research & notes |
| Apify | npx | 7 | Web scraping |
| nanoBanana | uvx | 4 | Misc utilities |
| Context7 | npx | 2 | Library documentation |
| Mermaid | npx | 2 | Diagram generation |
| shadcn | npx | 4 | UI components |
| sequentialThinking | npx | 1 | Reasoning chains |

**Required env vars for starter config:**
- `GEMINI_API_KEY` — for Gemini and nanoBanana
- `APIFY_TOKEN` — for Apify

## Registry Structure

Tool definitions live in `registry/` organised by category:

```
registry/
├── code-nav/
│   └── serena/
│       ├── search_for_pattern.yaml
│       └── find_symbol.yaml
├── ai-models/
│   └── gemini/
│       └── generate_content.yaml
└── ...
```

Each YAML file contains:
- `name` — tool name
- `server` — which MCP client to use
- `description` — for semantic search
- `inputSchema` — full JSON schema
- `example` — usage snippet

You can manually create these files or use `npm run extract` to generate them automatically.

## Architecture

- **Lazy Loading** — Clients connect on first use, disconnect after 3 mins idle
- **Dual Serena** — One instance powers `search_tools`, another is available in the sandbox. Keeps tool discovery separate from your code analysis
- **Proxy Pattern** — MCP clients exposed as `clientName.toolName(args)` in sandbox
- **Workspace API** — Persistent file storage between executions via `workspace.*`

## Development

```bash
npm run dev          # Watch mode
npm run extract      # Regenerate registry from live MCPs
npm test             # Run tests
```

## License

MIT
