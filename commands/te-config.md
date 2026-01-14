---
name: te-config
description: Configure Tool Executor - add/remove MCP servers, set environment variables
argument-hint: "[add|remove|list|env]"
allowed-tools:
  - Read
  - Edit
  - Write
  - Bash
  - Skill
---

# Tool Executor Configuration

Load the te-config skill and help the user modify the Tool Executor configuration.

Based on the argument:
- "add" → Guide through adding a new MCP server
- "remove" → Guide through removing an MCP server (warn: Serena cannot be removed)
- "list" → Show currently configured servers from clients.ts or config file
- "env" → Help configure environment variables
- No argument → Show overview of configuration options

After any configuration changes, remind the user to:
1. Run `npm run build`
2. Restart Claude Code
