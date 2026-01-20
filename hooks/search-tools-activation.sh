#!/bin/bash
# MCP Tool Discovery Activation Hook
# Ensures Claude uses search_tools before defaulting to basic tools

# Build the system message
read -r -d '' MESSAGE <<'PROMPT'
INSTRUCTION: MANDATORY MCP TOOL DISCOVERY SEQUENCE

You have access to a tool-executor MCP that wraps 7 specialized MCP servers with 96 tools.
BEFORE using basic tools (Read, Grep, Glob, Bash), you MUST check if a better tool exists.

## Step 1 - EVALUATE (think about this):
Could any of these MCP categories help with this task?

| Category | Server | Capabilities |
|----------|--------|--------------|
| code-nav | Serena (28 tools) | Symbol search, refactoring, code analysis, persistent memory, pattern search, shell execution |
| knowledge | Context7, NotebookLM | Library docs lookup, notebook Q&A, research management |
| ai-models | Gemini (37 tools) | Deep research agent, brainstorming (Claude+Gemini), code analysis, structured output, 4K image generation + multi-turn editing, video generation, thinking levels, summarization, Google search, URL/document analysis |
| reasoning | Sequential-thinking | Multi-step reasoning with thought chains |
| ui | shadcn | Component search, examples, implementation details |
| web | Apify | Actor-based web scraping, RAG browser, data extraction |

## Step 2 - SEARCH (do this if any category might help):
```
mcp__tool-executor__search_tools({ query: "describe what you need" })
```

## Step 3 - USE or FALLBACK:
- If search_tools finds a relevant tool → use get_tool_schema then execute_code
- If no relevant MCP tool exists → proceed with basic tools

## CRITICAL RULES:
1. NEVER skip to basic tools without considering Step 1
2. If task involves: docs lookup, code search, web data, UI generation, or complex reasoning
   → You MUST run search_tools first
3. Basic tools (Read/Grep/Glob) are for simple file operations ONLY
4. When in doubt, search first - it costs nothing

## Quick Reference - When to ALWAYS search_tools:
- "Find where X is defined/used" → Serena symbol search & references
- "Refactor this code" → Serena rename_symbol, replace_symbol_body
- "What's the API for library Y?" → Context7 docs lookup
- "Research topic Z thoroughly" → Gemini deep-research agent
- "Help me brainstorm/ideate" → Gemini brainstorming (Claude+Gemini collab)
- "Analyze this code" → Gemini code analysis (security, quality, performance)
- "Extract structured data" → Gemini structured output with schema
- "Summarize this content" → Gemini summarization
- "Generate/edit an image" → Gemini 4K image generation + multi-turn editing
- "Help me think through this" → Sequential-thinking
- "Build a UI component" → shadcn examples & details
- "Scrape data from website" → Apify actors

Proceed with your task, following this sequence.
PROMPT

# Output JSON with systemMessage for Claude to see
# Escape the message for JSON (newlines, quotes)
ESCAPED=$(echo "$MESSAGE" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')

cat <<EOF
{
  "continue": true,
  "suppressOutput": false,
  "systemMessage": $ESCAPED
}
EOF
