#!/usr/bin/env tsx
/**
 * Extract tool schemas from live MCP servers and generate YAML registry files
 *
 * Usage: npm run extract
 */

import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import yaml from "js-yaml";

/**
 * Server configuration with category mapping
 */
interface ServerConfig {
  name: string;
  displayName: string;
  command: string;
  args: string[];
  category: string;
  env?: Record<string, string>;
}

const SERVERS: ServerConfig[] = [
  // NPX servers (Node.js)
  { name: "notebooklm", displayName: "NotebookLM", command: "npx", args: ["-y", "notebooklm-mcp"], category: "knowledge" },
  { name: "sequentialThinking", displayName: "Sequential Thinking", command: "npx", args: ["-y", "@modelcontextprotocol/server-sequential-thinking"], category: "reasoning" },
  { name: "context7", displayName: "Context7", command: "npx", args: ["-y", "@upstash/context7-mcp"], category: "knowledge" },
  { name: "gemini", displayName: "Gemini", command: "npx", args: ["-y", "@rlabs-inc/gemini-mcp"], category: "ai-models", env: { GEMINI_API_KEY: process.env.GEMINI_API_KEY || "" } },
  { name: "shadcn", displayName: "shadcn", command: "npx", args: ["-y", "shadcn-ui-mcp-server"], category: "ui" },
  { name: "apify", displayName: "Apify", command: "npx", args: ["-y", "@apify/actors-mcp-server"], category: "web", env: { APIFY_TOKEN: process.env.APIFY_TOKEN || "" } },

  // UVX servers (Python)
  { name: "serena", displayName: "Serena", command: "uvx", args: ["--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server"], category: "code-nav" },
];

const REGISTRY_ROOT = join(process.cwd(), "registry");

/**
 * Connect to an MCP server and extract tool schemas
 */
async function extractFromServer(config: ServerConfig): Promise<void> {
  console.log(`\nConnecting to ${config.displayName}...`);

  const client = new Client(
    { name: "schema-extractor", version: "1.0.0" },
    { capabilities: {} }
  );

  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: { ...process.env, ...config.env } as Record<string, string>,
  });

  try {
    await client.connect(transport);
    console.log(`  Connected to ${config.displayName}`);

    // Get tool list
    const response = await client.listTools();
    const tools = response.tools || [];

    console.log(`  Found ${tools.length} tools`);

    if (tools.length === 0) {
      await client.close();
      return;
    }

    // Create category/server directory
    const serverDir = join(REGISTRY_ROOT, config.category, config.name);
    await mkdir(serverDir, { recursive: true });

    // Write each tool to YAML
    for (const tool of tools) {
      const toolDef = {
        name: tool.name,
        server: config.name,
        category: config.category,
        description: tool.description || "No description provided",
        inputSchema: tool.inputSchema || { type: "object", properties: {} },
        example: generateExample(config.name, tool.name, tool.inputSchema),
      };

      const yamlContent = yaml.dump(toolDef, {
        lineWidth: 120,
        noRefs: true,
      });

      const filePath = join(serverDir, `${sanitizeFilename(tool.name)}.yaml`);
      await writeFile(filePath, yamlContent, "utf-8");
      console.log(`    Wrote ${tool.name}`);
    }

    await client.close();
    console.log(`  Disconnected from ${config.displayName}`);
  } catch (error) {
    console.error(`  Failed to extract from ${config.displayName}:`, error instanceof Error ? error.message : error);
    try {
      await client.close();
    } catch {
      // Ignore close errors
    }
  }
}

/**
 * Generate a basic example for a tool
 */
function generateExample(serverName: string, toolName: string, inputSchema: unknown): string {
  const schema = inputSchema as { properties?: Record<string, { type?: string; description?: string }> };
  const props = schema?.properties || {};
  const propNames = Object.keys(props);

  if (propNames.length === 0) {
    return `await ${serverName}.${toolName}({});`;
  }

  const args = propNames
    .slice(0, 3) // Limit to first 3 properties for brevity
    .map((name) => {
      const prop = props[name];
      const placeholder = getPlaceholder(prop?.type, name);
      return `  ${name}: ${placeholder}`;
    })
    .join(",\n");

  return `await ${serverName}["${toolName}"]({\n${args}\n});`;
}

/**
 * Get a placeholder value for a property type
 */
function getPlaceholder(type: string | undefined, name: string): string {
  switch (type) {
    case "string":
      return `"<${name}>"`;
    case "number":
    case "integer":
      return "0";
    case "boolean":
      return "true";
    case "array":
      return "[]";
    case "object":
      return "{}";
    default:
      return `"<${name}>"`;
  }
}

/**
 * Sanitize a tool name for use as a filename
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log("Tool Schema Extractor");
  console.log("=====================");
  console.log(`Registry root: ${REGISTRY_ROOT}`);

  // Process servers sequentially to avoid overwhelming the system
  for (const server of SERVERS) {
    await extractFromServer(server);
  }

  console.log("\nDone!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
