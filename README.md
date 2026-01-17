<p align="center">
  <img src="assets/banner.png" alt="Tool Executor - Programmatic MCP Execution for Claude Code" width="100%">
</p>

<p align="center">
  <a href="https://github.com/aMilkStack/claudikins-tool-executor/actions"><img src="https://img.shields.io/github/actions/workflow/status/aMilkStack/claudikins-tool-executor/ci.yml?style=flat-square" alt="Build Status"></a>
  <a href="https://www.npmjs.com/package/claudikins-tool-executor"><img src="https://img.shields.io/npm/v/claudikins-tool-executor?style=flat-square" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
</p>

<h1 align="center">Tool Executor</h1>

<p align="center">
  <strong>Programmatic MCP Execution for Claude Code</strong><br>
  <em>The API has batched tool calling. Claude Code gets serial execution. This bridges the gap.</em>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#the-3-primitives">The 3 Primitives</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#roadmap">Roadmap</a>
</p>

---

Anthropic's API users get [programmatic tool calling](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling) - Claude writes code, executes N tools in a sandbox, returns once. Claude Code users get serial execution and lazy loading. Tool Executor brings the API pattern to Claude Code.

| Aspect | Claude Code (stable) | Claude Code 2.1.7 | Tool Executor |
|--------|---------------------|------------------|---------------|
| **Schema Loading** | All upfront | Lazy (>10% threshold) | Lazy (search on demand) |
| **Execution** | Serial (pause per tool) | Serial (pause per tool) | Batched (N tools, 1 return) |
| **Output Handling** | Dumps to context | Dumps to context | Auto-saves to workspace |
| **Tool Awareness** | All schemas visible | "Search available" | Hook-injected guidance |

On stable versions: **98% token reduction** (48k → 1.1k for 10-tool workflows). On 2.1.7: schema loading is similar, but execution and output handling still save significant context.

---

## Quick Start

```bash
# Add the Claudikins marketplace
/marketplace add aMilkStack/claudikins-marketplace

# Install the plugin
/plugin install claudikins-tool-executor
```

Restart Claude Code. Done.

### First Workflow

```
Search for image generation tools, then generate a robot writing documentation.
```

Claude will:
1. Use `search_tools` to find relevant tools
2. Use `get_tool_schema` to load the exact parameters
3. Use `execute_code` to run the generation in one shot

---

## The 3 Primitives

Tool Executor exposes exactly 3 tools. Everything else happens inside the sandbox.

### `search_tools` - Find by Intent

Semantic search across 87+ wrapped tools. Powered by Serena embeddings with BM25 fallback.

```json
{ "query": "generate images", "limit": 5 }
```

Returns slim results: name, server, description. No schemas loaded until you need them.

### `get_tool_schema` - Load on Demand

Fetch the full JSON Schema for a specific tool before calling it.

```json
{ "name": "gemini_generateContent" }
```

Returns the complete `inputSchema` plus usage examples.

### `execute_code` - Run in Sandbox

TypeScript execution with pre-connected MCP clients. Write code that calls multiple tools, loops, branches - returns once.

```typescript
const result = await gemini["gemini_generateContent"]({
  prompt: "A robot writing documentation",
  aspectRatio: "16:9"
});

// Large responses auto-save to workspace
if (result._savedTo) {
  console.log(`Saved to: ${result._savedTo}`);
}
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                       Claude Code                            │
└─────────────────────────┬───────────────────────────────────┘
                          │ 3 tools (~1.1k tokens)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     Tool Executor                            │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐     │
│  │search_tools │  │get_tool_schema│  │  execute_code   │     │
│  └──────┬──────┘  └──────┬───────┘  └────────┬────────┘     │
│         │                │                    │              │
│         ▼                ▼                    ▼              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Registry (87 tool definitions)           │   │
│  │         Serena semantic search + BM25 fallback        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   Sandbox Runtime                     │   │
│  │   • Lazy MCP client connections (pooled)             │   │
│  │   • Auto-save large responses (>200 chars)           │   │
│  │   • TypeScript execution with timeout                │   │
│  └──────────────────────┬───────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   ┌─────────┐      ┌─────────┐       ┌─────────┐
   │ Gemini  │      │ Serena  │       │  Apify  │  ... (7 servers)
   └─────────┘      └─────────┘       └─────────┘
```

**The SessionStart Hook**

Unlike native MCP, Tool Executor injects guidance every session. Claude knows:
- What MCP categories exist (ai-models, code-nav, web, knowledge)
- When to use MCP vs basic tools
- The exact search → schema → execute workflow

No guessing. No forgetting.

---

## Workspace Auto-Save

MCP tools often return large payloads. Web scrapes, code analysis, generated content - all eating context.

Tool Executor intercepts responses over 200 characters and saves them to workspace files. Your code receives a reference:

```typescript
const scrapeResult = await apify["apify_scrape"]({ url: "https://example.com" });

// Large response auto-saved
// { _savedTo: "mcp-results/1705312345678.json", _preview: "...", _size: 15234 }

// Read when needed
const fullData = await workspace.readJSON(scrapeResult._savedTo);
```

Context stays lean. Data stays accessible.

---

## Wrapped Servers

Pre-configured MCP servers available in the sandbox:

| Server | Category | Tools | Purpose |
|--------|----------|-------|---------|
| `gemini` | ai-models | 26 | Image/video generation, queries, analysis |
| `serena` | code-nav | 11 | Semantic code search, project navigation |
| `apify` | web | 17 | Web scraping, actor management |
| `context7` | knowledge | 9 | Context management |
| `notebooklm` | knowledge | 13 | Notebook analysis |
| `shadcn` | ui | 10 | UI component tools |
| `sequentialThinking` | reasoning | 1 | Step-by-step reasoning |

**87 tools. 3 exposed. 98% fewer tokens.**

---

## Configuration

Works out of the box. For custom servers, create `tool-executor.config.json`:

```json
{
  "servers": [
    {
      "name": "myserver",
      "displayName": "My Custom Server",
      "command": "npx",
      "args": ["-y", "my-mcp-package"],
      "env": {
        "API_KEY": "${MY_API_KEY}"
      }
    }
  ]
}
```

Some servers need API keys:

```bash
export GEMINI_API_KEY="your-key"
export APIFY_TOKEN="your-token"
```

---

## When NOT to Use This

Tool Executor optimises for breadth. Skip it if:

- **1-2 MCP servers only** - overhead isn't worth it
- **Streaming responses needed** - sandbox batches, doesn't stream
- **Production pipelines** - use direct SDK integration
- **Sub-100ms latency required** - sandbox adds startup time

---

## Roadmap

### Immediate

| Feature | Why |
|---------|-----|
| Structured `_savedTo` preview | Show type, length, keys instead of truncated text |
| Fluent `.full()` method | Zero-friction access to saved data |
| Actionable error messages | Include recovery steps, not just stack traces |

### Short-Term

| Feature | Why |
|---------|-----|
| Pre-indexed vector search | Remove Serena dependency for tool discovery |
| Generated type definitions | IDE autocomplete in execute_code snippets |
| Additional hookify rules | Catch common mistakes before they waste tokens |

### Medium-Term

| Feature | Why |
|---------|-----|
| Result streaming | Handle very large responses gracefully |
| Priority-based connection pooling | Smarter MCP client lifecycle |
| Intelligent caching layer | Reduce redundant MCP calls |

### Community Contributions Welcome

- [ ] Add `LICENSE` file (MIT declared in package.json)
- [ ] Add `tests/` directory (Vitest configured)
- [ ] Add `examples/` directory
- [ ] Add `CONTRIBUTING.md`
- [ ] Add `CHANGELOG.md`

---

## Skills & Hooks

As a Claude Code plugin:

**Skills:**
- `/te-doctor` - Diagnose connection issues
- `/te-guide` - Usage guidance and examples
- `/te-config` - Configuration help

**Hooks:**
- `SessionStart` - Injects tool guidance every session
- `UserPromptSubmit` - Activates discovery on relevant prompts

---

## Part of Claudikins

Tool Executor is one component of the Claudikins framework:

- **Tool Executor** - Programmatic MCP execution (you are here)
- **Automatic Context Manager** - Context handoff automation
- **Klaus** - Debugging with Germanic precision
- **GRFP** - README generation through dual-AI analysis

[View the marketplace](https://github.com/aMilkStack/claudikins-marketplace)

---

## License

[MIT](LICENSE)

---

<p align="center">
  <sub>Built by <a href="https://github.com/aMilkStack">Ethan Lee</a></sub>
</p>
