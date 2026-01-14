---
name: te-config
description: Use this skill when users ask "add MCP server", "remove MCP", "configure tool executor", "add new tool", "environment variables for tool executor", "regenerate registry", or need to modify which MCP servers are available in the sandbox.
---

# Tool Executor Configuration

Configure which MCP servers are available in the Tool Executor sandbox. Serena is mandatory and cannot be removed.

## Architecture Overview

```
tool-executor.config.json  →  clients.ts loads configs  →  Sandbox exposes clients
                                    ↓
                           npm run extract  →  registry/ YAML files
```

## Configuration File

Create `tool-executor.config.json` in the project root:

```json
{
  "$schema": "./tool-executor.config.schema.json",
  "servers": [
    {
      "name": "serena",
      "displayName": "Serena",
      "command": "uvx",
      "args": ["--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server"]
    },
    {
      "name": "gemini",
      "displayName": "Gemini",
      "command": "npx",
      "args": ["-y", "@rlabs-inc/gemini-mcp"],
      "env": {
        "GEMINI_API_KEY": "${GEMINI_API_KEY}"
      }
    }
  ]
}
```

### Config File Locations (checked in order)
1. `tool-executor.config.json`
2. `tool-executor.config.js`
3. `.tool-executorrc.json`

## Adding a New MCP Server

### Step 1: Add to Configuration

```json
{
  "servers": [
    // ... existing servers ...
    {
      "name": "newServer",
      "displayName": "New Server",
      "command": "npx",
      "args": ["-y", "@example/new-mcp-server"],
      "env": {
        "API_KEY": "${NEW_SERVER_API_KEY}"
      }
    }
  ]
}
```

### Step 2: Add Type Definition

Edit `src/types.ts` to add the client type:

```typescript
export interface MCPClients {
  serena: Client | null;
  // ... existing clients ...
  newServer: Client | null;  // Add this
}
```

### Step 3: Regenerate Registry

```bash
npm run extract
```

This connects to all configured MCP servers and generates YAML files in `registry/`.

### Step 4: Rebuild and Restart

```bash
npm run build
# Restart Claude Code to pick up new MCP server
```

## Removing an MCP Server

**WARNING: Serena cannot be removed - it powers both search_tools and is available in the sandbox.**

### Step 1: Remove from Configuration

Delete the server entry from `tool-executor.config.json`.

### Step 2: Remove Type Definition

Remove from `src/types.ts` MCPClients interface.

### Step 3: Clean Registry

```bash
rm -rf registry/{category}/{serverName}/
npm run extract  # Regenerate remaining
```

### Step 4: Rebuild

```bash
npm run build
```

## Environment Variables

### Setting Environment Variables

Environment variables use `${VAR_NAME}` syntax in config:

```json
{
  "env": {
    "GEMINI_API_KEY": "${GEMINI_API_KEY}",
    "CUSTOM_VAR": "${MY_CUSTOM_VAR}"
  }
}
```

### Required Environment Variables

| Server | Variable | Purpose |
|--------|----------|---------|
| gemini | `GEMINI_API_KEY` | Google AI API key |
| apify | `APIFY_TOKEN` | Apify platform token |

### Setting Variables

**In Claude Code config (~/.claude.json):**
```json
{
  "mcpServers": {
    "tool-executor": {
      "env": {
        "GEMINI_API_KEY": "your-key-here",
        "APIFY_TOKEN": "your-token-here"
      }
    }
  }
}
```

**Or in shell:**
```bash
export GEMINI_API_KEY="your-key-here"
```

## Registry Management

### Registry Structure

```
registry/
├── ai-models/gemini/          # Gemini tools (AI queries, images, diagrams)
├── code-nav/serena/           # Serena tools
├── knowledge/context7/        # Context7 tools
├── knowledge/notebooklm/      # NotebookLM tools
├── reasoning/sequentialThinking/
├── ui/shadcn/                 # shadcn tools
└── web/apify/                 # Apify tools
```

### YAML Tool Definition Format

```yaml
name: tool_name
server: serverName
category: category-folder
description: >-
  What the tool does. Can be multi-line.

inputSchema:
  type: object
  properties:
    param1:
      type: string
      description: Parameter description
  required:
    - param1

example: |
  const result = await serverName.tool_name({ param1: "value" });
  console.log(result);

notes: |
  - Optional tips
  - Gotchas to be aware of
```

### Manual Registry Entry

If `npm run extract` fails for a server, create YAML files manually:

```bash
mkdir -p registry/{category}/{serverName}
```

Then create `registry/{category}/{serverName}/{tool-name}.yaml` with the format above.

### Re-indexing for Serena Search

Serena indexes the registry for semantic search. If search results seem stale:

```bash
# Re-run extraction to refresh YAML files
npm run extract

# Rebuild to pick up changes
npm run build
```

## Default Server Configurations

These are the built-in defaults if no config file exists:

| Name | Command | Package |
|------|---------|---------|
| serena | uvx | git+https://github.com/oraios/serena |
| context7 | npx | @upstash/context7-mcp |
| gemini | npx | @rlabs-inc/gemini-mcp |
| notebooklm | npx | notebooklm-mcp |
| shadcn | npx | shadcn-ui-mcp-server |
| apify | npx | @apify/actors-mcp-server |
| sequentialThinking | npx | @modelcontextprotocol/server-sequential-thinking |

## Source Code Reference

- `${CLAUDE_PLUGIN_ROOT}/src/sandbox/clients.ts` - Client configuration and lifecycle
- `${CLAUDE_PLUGIN_ROOT}/src/config.ts` - Config file loading
- `${CLAUDE_PLUGIN_ROOT}/src/types.ts` - Type definitions
- `${CLAUDE_PLUGIN_ROOT}/scripts/extract-schemas.ts` - Registry generation
