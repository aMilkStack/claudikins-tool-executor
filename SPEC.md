# Claudikins Tool Executor - Technical Specification

## Overview

**Part of the Claudikins framework** — A single MCP server that wraps all other MCP servers, providing Claude Code with efficient tool discovery and execution while reducing context consumption from ~47k tokens to ~1.1k tokens.

## Problem Statement

Claude Code loads all MCP tool definitions into context upfront. With 114+ tools across multiple servers, this consumes significant context space before any work begins. Additionally, intermediate tool results flow through Claude's context window, further inflating token usage.

## Solution

Claudikins Tool Executor provides two capabilities:

1. **search_tools** - Semantic search over tool definitions using Serena
2. **execute_code** - TypeScript execution in a sandbox with pre-connected MCP clients

Claude discovers tools by exploring a filesystem registry, writes code that calls multiple tools, and only receives the final output - intermediate results never enter his context.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Claude Code                          │
│  Only loads: Claudikins Tool Executor (~1.1k tokens)    │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│            Claudikins Tool Executor                     │
│                                                         │
│  search_tools ──────► Serena (semantic search)          │
│       │                    │                            │
│       │                    ▼                            │
│       │              ./registry/ (tool definitions)     │
│       │                                                 │
│  execute_code ──────► Sandbox Runtime                   │
│                       ├── Pre-connected MCP clients     │
│                       ├── Filesystem access             │
│                       └── workspace/ (persistent state) │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## MCP Servers Included

### Local Installs
| Server | Source | Purpose |
|--------|--------|---------|
| godot-mcp | [Coding-Solo/godot-mcp](https://github.com/Coding-Solo/godot-mcp) | Godot game engine integration |

### NPX Packages  
| Server | Package | Purpose |
|--------|---------|---------|
| serena | serena-mcp | Semantic code search/navigation |
| notebooklm-mcp | [jacob-bd/notebooklm-mcp](https://github.com/jacob-bd/notebooklm-mcp) | NotebookLM integration |
| shadcn | shadcn-mcp | UI component generation |
| context7 | context7-mcp | Up-to-date library documentation |
| nano-banana | nano-banana | Utility tools |
| github | @anthropic/github-mcp | GitHub integration |
| mermaid | mermaid-mcp | Diagram generation |
| huggingface | huggingface-mcp | Model inference, datasets |
| apify | apify-mcp | Web scraping, automation |
| fetch | @modelcontextprotocol/server-fetch | Web content fetching |
| memory | @modelcontextprotocol/server-memory | Knowledge graph persistence |
| sequential-thinking | @modelcontextprotocol/server-sequential-thinking | Chain of thought reasoning |
| gemini | gemini-mcp | Google Gemini integration |
| stackoverflow | stackoverflow-mcp | Stack Overflow search |
| sentry | sentry-mcp | Error tracking, debugging (free tier available) |

**Total: 16 MCPs wrapped → 2 tools exposed to Claude**

---

## Tool Definitions

### search_tools

Semantic search over all available MCP tools using Serena.

```typescript
{
  name: "search_tools",
  description: "Semantic search for MCP tools. Returns matching tool definitions with schemas and examples. Use before execute_code to find the right tools for your task.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Natural language description of what you want to do"
      },
      limit: {
        type: "number",
        description: "Max results to return (default: 5)"
      }
    },
    required: ["query"]
  }
}
```

**Implementation:** Calls Serena's semantic search against `./registry/`.

### execute_code

Execute TypeScript in a sandboxed environment with MCP clients pre-connected.

```typescript
{
  name: "execute_code",
  description: "Execute TypeScript code in sandbox with MCP servers available as pre-connected clients. Explore ./registry/ to discover tools. Use ./workspace/ for persistent state between calls.",
  inputSchema: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description: "TypeScript code to execute. MCP clients available: godot, serena, notebooklm, comfyui, github, shadcn, context7, augments, nanoBanana"
      }
    },
    required: ["code"]
  }
}
```

---

## Registry Structure

```
./registry/
├── code-navigation/
│   └── serena/
│       ├── index.ts              # Server info + tool list
│       ├── find_symbol.ts        # Schema + example
│       ├── search_codebase.ts
│       └── ...
├── game-dev/
│   ├── godot-mcp/
│   │   ├── index.ts
│   │   ├── create_scene.ts
│   │   ├── add_node.ts
│   │   └── ...
│   └── comfyui-mcp/
│       ├── index.ts
│       └── ...
├── knowledge/
│   └── notebooklm-mcp/
│       ├── index.ts
│       ├── create_notebook.ts
│       └── ...
├── source-control/
│   └── github/
│       ├── index.ts
│       └── ...
├── ui/
│   └── shadcn/
│       ├── index.ts
│       └── ...
└── misc/
    ├── context7/
    ├── augments/
    └── nano-banana/
```

### Tool File Format

```typescript
// registry/game-dev/godot-mcp/add_node.ts

export const tool = {
  name: "add_node",
  server: "godot-mcp",
  category: "game-dev",
  description: "Add a node to an existing scene in a Godot project",
  inputSchema: {
    type: "object",
    properties: {
      projectPath: { type: "string", description: "Path to Godot project" },
      scenePath: { type: "string", description: "Path to scene file (.tscn)" },
      nodeType: { type: "string", description: "Node type (Node2D, Sprite2D, etc)" },
      nodeName: { type: "string", description: "Name for the new node" },
      parentPath: { type: "string", description: "Path to parent node (optional)" }
    },
    required: ["projectPath", "scenePath", "nodeType", "nodeName"]
  }
};

export const example = `
await godot.add_node({
  projectPath: "/home/ethan/games/hells-gift-shop",
  scenePath: "scenes/shop.tscn",
  nodeType: "Sprite2D",
  nodeName: "ShopkeeperSprite"
});
`;

export const notes = `
- nodeType must be a valid Godot class name
- parentPath uses Godot node path syntax (e.g., "Root/UI/Panel")
- If parentPath omitted, adds to scene root
`;
```

### Index File Format

```typescript
// registry/game-dev/godot-mcp/index.ts

export const server = {
  name: "godot-mcp",
  description: "Godot game engine integration - scene management, node creation, GDScript, project configuration",
  category: "game-dev",
  tools: [
    "add_node",
    "create_scene", 
    "delete_node",
    "get_node_properties",
    "set_node_properties",
    "run_gdscript",
    "get_project_settings",
    "set_project_settings"
  ]
};
```

---

## Sandbox Runtime

### Environment

Node.js runtime with:
- TypeScript execution via esbuild or ts-node
- Pre-connected MCP clients as global variables
- Filesystem access to `./registry/` and `./workspace/`
- AsyncFunction for code execution

### Pre-Connected Clients

```typescript
// sandbox/clients.ts

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

interface MCPClients {
  godot: Client;
  serena: Client;
  notebooklm: Client;
  github: Client;
  shadcn: Client;
  context7: Client;
  nanoBanana: Client;
  mermaid: Client;
  huggingface: Client;
  apify: Client;
  fetch: Client;
  memory: Client;
  sequentialThinking: Client;
  gemini: Client;
  stackoverflow: Client;
  sentry: Client;
}

export async function connectAll(): Promise<MCPClients> {
  return {
    // Local installs
    godot: await connect("godot-mcp", "npx", ["-y", "godot-mcp"]),
    
    // NPX packages
    serena: await connect("serena", "npx", ["-y", "serena-mcp"]),
    notebooklm: await connect("notebooklm", "npx", ["-y", "notebooklm-mcp"]),
    github: await connect("github", "npx", ["-y", "@anthropic/github-mcp"]),
    shadcn: await connect("shadcn", "npx", ["-y", "shadcn-mcp"]),
    context7: await connect("context7", "npx", ["-y", "context7-mcp"]),
    nanoBanana: await connect("nano-banana", "npx", ["-y", "nano-banana"]),
    mermaid: await connect("mermaid", "npx", ["-y", "mermaid-mcp"]),
    huggingface: await connect("huggingface", "npx", ["-y", "huggingface-mcp"]),
    apify: await connect("apify", "npx", ["-y", "apify-mcp"]),
    fetch: await connect("fetch", "npx", ["-y", "@modelcontextprotocol/server-fetch"]),
    memory: await connect("memory", "npx", ["-y", "@modelcontextprotocol/server-memory"]),
    sequentialThinking: await connect("sequential-thinking", "npx", ["-y", "@modelcontextprotocol/server-sequential-thinking"]),
    gemini: await connect("gemini", "npx", ["-y", "gemini-mcp"]),
    stackoverflow: await connect("stackoverflow", "npx", ["-y", "stackoverflow-mcp"]),
    sentry: await connect("sentry", "npx", ["-y", "sentry-mcp"]),
  };
}

async function connect(name: string, command: string, args: string[]): Promise<Client> {
  const client = new Client({ name: `claudikins-${name}`, version: "1.0.0" });
  const transport = new StdioClientTransport({ command, args });
  await client.connect(transport);
  return client;
}
```

### Code Execution

```typescript
// sandbox/runtime.ts

import { MCPClients } from "./clients.js";

export async function executeCode(code: string, clients: MCPClients): Promise<unknown> {
  // Capture console.log output
  const logs: unknown[] = [];
  const mockConsole = {
    log: (...args: unknown[]) => logs.push(args.length === 1 ? args[0] : args),
    error: (...args: unknown[]) => logs.push({ error: args }),
  };

  // Wrap each client to simplify tool calls
  const wrappedClients = wrapClients(clients);

  // Execute code with clients available
  const fn = new AsyncFunction(
    "console",
    "godot", "serena", "notebooklm", "github", 
    "shadcn", "context7", "nanoBanana", "mermaid",
    "huggingface", "apify", "fetch", "memory",
    "sequentialThinking", "gemini", "stackoverflow", "sentry",
    "fs", "workspace",
    code
  );

  await fn(
    mockConsole,
    wrappedClients.godot,
    wrappedClients.serena,
    wrappedClients.notebooklm,
    wrappedClients.github,
    wrappedClients.shadcn,
    wrappedClients.context7,
    wrappedClients.nanoBanana,
    wrappedClients.mermaid,
    wrappedClients.huggingface,
    wrappedClients.apify,
    wrappedClients.fetch,
    wrappedClients.memory,
    wrappedClients.sequentialThinking,
    wrappedClients.gemini,
    wrappedClients.stackoverflow,
    wrappedClients.sentry,
    fs.promises,
    "./workspace"
  );

  return logs;
}

function wrapClients(clients: MCPClients) {
  // Wrap each client so Claude can call tools directly:
  // await godot.add_node({ ... }) instead of client.callTool("add_node", { ... })
  const wrapped: Record<string, Record<string, Function>> = {};
  
  for (const [name, client] of Object.entries(clients)) {
    wrapped[name] = new Proxy({}, {
      get: (_, toolName: string) => {
        return async (args: Record<string, unknown>) => {
          const result = await client.callTool({ name: toolName, arguments: args });
          return result.content;
        };
      }
    });
  }
  
  return wrapped;
}
```

---

## MCP Server Implementation

```typescript
// src/index.ts

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { connectAll } from "./sandbox/clients.js";
import { executeCode } from "./sandbox/runtime.js";
import { searchTools } from "./search.js";

const server = new Server(
  { name: "@claudikins/tool-executor", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

let clients: MCPClients;

server.setRequestHandler("tools/list", async () => ({
  tools: [
    {
      name: "search_tools",
      description: "Semantic search for MCP tools. Returns matching tool definitions with schemas and examples.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "What you want to do" },
          limit: { type: "number", description: "Max results (default: 5)" }
        },
        required: ["query"]
      }
    },
    {
      name: "execute_code",
      description: "Execute TypeScript in sandbox with MCP servers. Clients: godot, serena, notebooklm, comfyui, github, shadcn, context7, augments, nanoBanana. Use ./workspace/ for state.",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "TypeScript code to execute" }
        },
        required: ["code"]
      }
    }
  ]
}));

server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "search_tools") {
    const results = await searchTools(args.query, args.limit ?? 5, clients.serena);
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }

  if (name === "execute_code") {
    try {
      const output = await executeCode(args.code, clients);
      return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  clients = await connectAll();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
```

---

## Search Implementation

```typescript
// src/search.ts

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import * as fs from "fs/promises";
import * as path from "path";

const REGISTRY_PATH = "./registry";

export async function searchTools(
  query: string, 
  limit: number,
  serena: Client
): Promise<ToolResult[]> {
  // Use Serena for semantic search over registry
  const result = await serena.callTool({
    name: "search_codebase",
    arguments: {
      query,
      path: REGISTRY_PATH,
      filePattern: "*.ts",
      limit
    }
  });

  // Parse results and load full tool definitions
  const matches = parseSerenaResults(result.content);
  const tools: ToolResult[] = [];

  for (const match of matches.slice(0, limit)) {
    const content = await fs.readFile(match.filePath, "utf-8");
    const toolDef = extractToolDefinition(content);
    if (toolDef) {
      tools.push(toolDef);
    }
  }

  return tools;
}

interface ToolResult {
  name: string;
  server: string;
  category: string;
  description: string;
  inputSchema: object;
  example: string;
  notes?: string;
}

function parseSerenaResults(content: unknown): Array<{ filePath: string }> {
  // Parse Serena's response format - implementation depends on actual output
  return [];
}

function extractToolDefinition(fileContent: string): ToolResult | null {
  // Parse TypeScript file to extract tool, example, notes exports
  // Could use regex, AST parsing, or dynamic import
  return null;
}
```

---

## Workspace Persistence

The `./workspace/` directory persists between `execute_code` calls within a session:

```typescript
// First call - save state
execute_code({
  code: `
    const data = await notebooklm.get_all_notebooks();
    await fs.writeFile('./workspace/notebooks.json', JSON.stringify(data));
    console.log("Saved", data.length, "notebooks");
  `
})

// Later call - use saved state
execute_code({
  code: `
    const data = JSON.parse(await fs.readFile('./workspace/notebooks.json', 'utf-8'));
    const notebook = data.find(n => n.title.includes('PixelMilk'));
    console.log(notebook);
  `
})
```

---

## Error Handling

### Connection Failures

If an MCP server fails to connect at startup, log warning but continue:

```typescript
execute_code({ code: `await brokenServer.doThing()` })
// Returns: { error: "Server 'brokenServer' is not connected. Available: godot, serena, ..." }
```

### Code Execution Errors

Catch and return with stack trace:

```typescript
execute_code({ code: `throw new Error("oops")` })
// Returns: { error: "oops", stack: "Error: oops\n    at ..." }
```

### Timeout

Default 30 second timeout per execution. Configurable per call if needed.

---

## Bootstrap Hook Tracking (Experimental)

To determine how Claude best learns about the system, plant fingerprinted hooks:

| Location | Wording | Fingerprint |
|----------|---------|-------------|
| execute_code description | "MCP integrations available at ./registry/" | A |
| CLAUDE.md | "Tool registry located in ./registry/" | B |
| Skill file | "Discover tools in the ./registry/ directory" | C |
| ./registry/README.md | "Available MCP servers under ./registry/" | D |

Log first registry access per session to gather data on which hook works best.

---

## File Structure

```
~/.claude/claudikins-tool-executor/
├── package.json
├── tsconfig.json
├── SPEC.md
├── CLAUDE.md
├── src/
│   ├── index.ts
│   ├── search.ts
│   └── sandbox/
│       ├── clients.ts
│       └── runtime.ts
├── registry/
│   ├── code-navigation/
│   ├── game-dev/
│   ├── knowledge/
│   ├── source-control/
│   ├── ui/
│   ├── misc/
│   └── README.md
├── workspace/
└── scripts/
    └── extract-schemas.ts
```

---

## Token Budget

| Component | Tokens |
|-----------|--------|
| search_tools definition | ~150 |
| execute_code definition | ~200 |
| MCP server overhead | ~450 |
| **Total initial context** | **~1,100** |

| Action | Token Cost |
|--------|------------|
| search_tools call | ~200-500 |
| execute_code call | ~100-300 |
| Full tool exploration | ~2000 |

**Comparison:** 16 MCPs with ~200+ tools = ~50,000+ tokens if loaded directly vs ~1.1k tokens with Claudikins Tool Executor

---

## User Prompt Hook (CLAUDE.md)

Add to project CLAUDE.md for consistent tool usage:

```markdown
## Tool Usage Protocol

Before any task, always:

1. **search_tools** - Find relevant MCP tools for the task
2. **serena** - Semantic code search for existing implementations  
3. **context7** - Check up-to-date docs for third-party libraries
4. **sequential-thinking** - Use for any decision making or complex reasoning

Read the CLAUDE.md root file before starting work.

Before adding any prompt, type "/grounding" first.
Example: `/grounding now implement the auth flow`
```
