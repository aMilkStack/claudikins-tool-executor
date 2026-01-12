import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "glob";
import yaml from "js-yaml";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ToolDefinition } from "./types.js";

// Absolute path to registry, relative to this module (not cwd)
const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_ROOT = resolve(__dirname, "..", "registry");

/**
 * Dedicated Serena client for registry search (separate from sandbox)
 */
let registrySerena: Client | null = null;
let registrySerenaConnecting = false;

/**
 * Get or create the registry Serena client
 */
async function getRegistrySerena(): Promise<Client | null> {
  if (registrySerena) return registrySerena;
  if (registrySerenaConnecting) {
    // Wait for existing connection attempt
    await new Promise(r => setTimeout(r, 100));
    return registrySerena;
  }

  registrySerenaConnecting = true;
  try {
    const client = new Client(
      { name: "tool-executor-registry-search", version: "1.0.0" },
      { capabilities: {} }
    );

    const transport = new StdioClientTransport({
      command: "uvx",
      args: ["--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server"],
      env: process.env as Record<string, string>,
    });

    await client.connect(transport);

    // Activate the registry project
    await client.callTool({
      name: "activate_project",
      arguments: { project: REGISTRY_ROOT },
    });

    registrySerena = client;
    console.error("Registry Serena connected and project activated");
    return client;
  } catch (error) {
    console.error("Failed to connect registry Serena:", error);
    return null;
  } finally {
    registrySerenaConnecting = false;
  }
}

/**
 * Search result from tool search
 */
export interface SearchResult {
  tool: ToolDefinition;
  score: number;
  matchContext?: string;
}

/**
 * Search response
 */
export interface SearchResponse {
  results: SearchResult[];
  source: "serena" | "local";
  suggestion?: string;
}

/**
 * Load a tool definition from a YAML file
 */
async function loadToolDefinition(filePath: string): Promise<ToolDefinition | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    const parsed = yaml.load(content) as ToolDefinition;

    // Validate required fields
    if (!parsed.name || !parsed.server || !parsed.description) {
      console.error(`Invalid tool definition: ${filePath}`);
      return null;
    }

    return parsed;
  } catch (error) {
    console.error(`Failed to load tool: ${filePath}`, error);
    return null;
  }
}

/**
 * Search tools using Registry Serena (dedicated instance for tool search)
 */
async function searchWithSerena(query: string, limit: number): Promise<SearchResult[] | null> {
  try {
    const serena = await getRegistrySerena();
    if (!serena) {
      return null;
    }

    // Use Serena's search_for_pattern to find matches in registry
    // relative_path is "." since registry project is already activated
    const result = await serena.callTool({
      name: "search_for_pattern",
      arguments: {
        substring_pattern: query,
        relative_path: ".",
        context_lines_before: 2,
        context_lines_after: 2,
      },
    });

    if (!result.content || !Array.isArray(result.content)) {
      return null;
    }

    // Parse Serena results and load corresponding tool definitions
    const results: SearchResult[] = [];
    const seenFiles = new Set<string>();

    for (const item of result.content) {
      if (item.type !== "text") continue;

      // Extract file paths from Serena output (relative to registry root)
      const text = item.text as string;
      // Match paths like "ui/mermaid/generate_diagram.yaml" or "knowledge/context7/query-docs.yaml"
      const fileMatches = text.match(/[a-z-]+\/[a-z]+\/[^\s:]+\.ya?ml/gi);

      if (fileMatches) {
        for (const match of fileMatches) {
          if (seenFiles.has(match)) continue;
          seenFiles.add(match);

          const fullPath = resolve(REGISTRY_ROOT, match);
          const tool = await loadToolDefinition(fullPath);
          if (tool) {
            results.push({
              tool,
              score: 1.0, // Serena doesn't provide scores
              matchContext: text.slice(0, 200),
            });
          }

          if (results.length >= limit) break;
        }
      }
    }

    return results;
  } catch (error) {
    console.error("Serena search failed:", error);
    return null;
  }
}

/**
 * Search tools using local glob + text matching (fallback)
 */
async function searchLocally(query: string, limit: number): Promise<SearchResult[]> {
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(Boolean);

  // Find all YAML files in registry
  const files = await glob("**/*.{yaml,yml}", {
    cwd: REGISTRY_ROOT,
    absolute: true,
  });

  const results: SearchResult[] = [];

  for (const file of files) {
    const tool = await loadToolDefinition(file);
    if (!tool) continue;

    // Score based on term matches
    const searchText = `${tool.name} ${tool.description} ${tool.category || ""} ${tool.server}`.toLowerCase();
    let score = 0;

    for (const term of queryTerms) {
      if (searchText.includes(term)) {
        score += 1;
        // Bonus for name/category match
        if (tool.name.toLowerCase().includes(term)) score += 2;
        if (tool.category?.toLowerCase().includes(term)) score += 1;
      }
    }

    if (score > 0) {
      results.push({
        tool,
        score: score / queryTerms.length,
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}

/**
 * Search for tools matching a query
 */
export async function searchTools(query: string, limit = 10): Promise<SearchResponse> {
  // Try Serena first
  const serenaResults = await searchWithSerena(query, limit);

  if (serenaResults && serenaResults.length > 0) {
    return {
      results: serenaResults,
      source: "serena",
    };
  }

  // Fall back to local search
  const localResults = await searchLocally(query, limit);

  if (localResults.length === 0) {
    return {
      results: [],
      source: "local",
      suggestion: "Try broader terms like 'image', 'code search', 'diagram', or browse categories: game-dev, knowledge, ai-models, web, ui",
    };
  }

  return {
    results: localResults,
    source: serenaResults === null ? "local" : "local", // local fallback
  };
}

/**
 * Get all available categories in the registry
 */
export async function getCategories(): Promise<string[]> {
  const files = await glob("*/", {
    cwd: REGISTRY_ROOT,
  });
  // Remove trailing slashes
  return files.map((f) => f.replace(/\/$/, ""));
}

/**
 * List all tools in a category
 */
export async function listToolsInCategory(category: string): Promise<ToolDefinition[]> {
  const categoryPath = resolve(REGISTRY_ROOT, category);
  const files = await glob("**/*.{yaml,yml}", {
    cwd: categoryPath,
    absolute: true,
  });

  const tools: ToolDefinition[] = [];
  for (const file of files) {
    const tool = await loadToolDefinition(file);
    if (tool) tools.push(tool);
  }

  return tools;
}

/**
 * Get a specific tool by name (for full schema retrieval)
 */
export async function getToolByName(toolName: string): Promise<ToolDefinition | null> {
  // Search all YAML files in registry
  const files = await glob("**/*.{yaml,yml}", {
    cwd: REGISTRY_ROOT,
    absolute: true,
  });

  for (const file of files) {
    const tool = await loadToolDefinition(file);
    if (tool && tool.name === toolName) {
      return tool;
    }
  }

  return null;
}

/**
 * Disconnect the registry Serena client (for cleanup)
 */
export async function disconnectRegistrySerena(): Promise<void> {
  if (registrySerena) {
    try {
      await registrySerena.close();
      console.error("Registry Serena disconnected");
    } catch (error) {
      console.error("Error disconnecting registry Serena:", error);
    }
    registrySerena = null;
  }
}
