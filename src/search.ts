import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "glob";
import yaml from "js-yaml";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ToolDefinition } from "./types.js";
import { initBM25, searchBM25, isBM25Ready } from "./bm25.js";

// Absolute path to registry, relative to this module (not cwd)
const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_ROOT = resolve(__dirname, "..", "registry");

/**
 * Dedicated Serena client for registry search (separate from sandbox)
 */
let registrySerena: Client | null = null;

/**
 * Track in-flight connection promise to avoid duplicate connections
 */
let connectionPromise: Promise<Client | null> | null = null;

/**
 * Get or create the registry Serena client
 */
async function getRegistrySerena(): Promise<Client | null> {
  // Already connected
  if (registrySerena) return registrySerena;

  // Connection already in progress - wait for it
  if (connectionPromise) {
    return connectionPromise;
  }

  // Start new connection
  connectionPromise = connectRegistrySerena();
  try {
    return await connectionPromise;
  } finally {
    connectionPromise = null;
  }
}

/**
 * Internal connection logic for registry Serena
 */
async function connectRegistrySerena(): Promise<Client | null> {
  try {
    const client = new Client(
      { name: "claudikins-registry-search", version: "1.0.0" },
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
  totalCount?: number;
  suggestion?: string;
  fallbackReason?: string;
}

/**
 * Load a tool definition from a YAML file
 */
export async function loadToolDefinition(filePath: string): Promise<ToolDefinition | null> {
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

    // Convert query to flexible regex with lookaheads for ANY order matching
    // "generate image banana" → "(?=.*generate)(?=.*image)(?=.*banana)"
    // This matches files containing ALL terms regardless of order
    const terms = query
      .split(/\s+/)
      .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); // escape regex chars

    // Use lookaheads so terms can appear in any order
    // Single term: just use it directly. Multiple terms: use lookaheads
    const pattern = terms.length === 1
      ? terms[0]
      : terms.map(t => `(?=.*${t})`).join('') + '.*';

    // Use Serena's search_for_pattern to find matches in registry
    // relative_path is "." since registry project is already activated
    const result = await serena.callTool({
      name: "search_for_pattern",
      arguments: {
        substring_pattern: pattern,
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
 * Load all tools for BM25 indexing
 */
async function loadAllTools(): Promise<ToolDefinition[]> {
  const files = await glob("**/*.{yaml,yml}", {
    cwd: REGISTRY_ROOT,
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
 * Search tools using local glob + text matching (fallback)
 */
async function searchLocally(query: string, limit: number): Promise<SearchResult[]> {
  // Try BM25 first (better ranking)
  if (!isBM25Ready()) {
    try {
      const allTools = await loadAllTools();
      initBM25(allTools);
      console.error(`BM25 index built with ${allTools.length} tools`);
    } catch (error) {
      console.error("Failed to initialize BM25:", error);
    }
  }

  if (isBM25Ready()) {
    const bm25Results = searchBM25(query, limit);
    if (bm25Results.length > 0) {
      return bm25Results.map((tool, idx) => ({
        tool,
        score: 1 - (idx * 0.01), // Decreasing score for ranking
      }));
    }
  }

  // Fall back to simple text matching
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(Boolean);

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
export async function searchTools(
  query: string,
  limit = 10,
  offset = 0
): Promise<SearchResponse> {
  // Request more results to support pagination
  const fetchLimit = offset + limit;

  // Try Serena first
  const serenaResults = await searchWithSerena(query, fetchLimit);

  if (serenaResults && serenaResults.length > 0) {
    const paginatedResults = serenaResults.slice(offset, offset + limit);
    return {
      results: paginatedResults,
      source: "serena",
      totalCount: serenaResults.length,
    };
  }

  // Fall back to local search
  const localResults = await searchLocally(query, fetchLimit);
  const fallbackReason = serenaResults === null
    ? "Serena unavailable - using text search"
    : "No semantic matches - using text search";

  if (localResults.length === 0) {
    return {
      results: [],
      source: "local",
      totalCount: 0,
      fallbackReason,
      suggestion: "Try broader terms like 'image', 'code search', 'diagram', or browse categories: game-dev, knowledge, ai-models, web, ui",
    };
  }

  const paginatedResults = localResults.slice(offset, offset + limit);
  return {
    results: paginatedResults,
    source: "local",
    totalCount: localResults.length,
    fallbackReason,
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
