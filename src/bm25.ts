import bm25 from "wink-bm25-text-search";
import nlp from "wink-nlp-utils";
import { ToolDefinition } from "./types.js";

let bm25Engine: ReturnType<typeof bm25> | null = null;
let indexedTools: ToolDefinition[] = [];
let isInitialized = false;

/**
 * Initialize the BM25 search engine with tool definitions
 */
export function initBM25(tools: ToolDefinition[]): void {
  bm25Engine = bm25();
  indexedTools = tools;

  // Configure for tool search - weight name higher than description
  bm25Engine.defineConfig({ fldWeights: { name: 3, description: 1, server: 1 } });

  // Use standard NLP preprocessing
  bm25Engine.definePrepTasks([
    nlp.string.lowerCase,
    nlp.string.tokenize0,
    nlp.tokens.removeWords,
    nlp.tokens.stem,
  ]);

  // Index all tools
  tools.forEach((tool, idx) => {
    bm25Engine!.addDoc({
      name: tool.name,
      description: tool.description,
      server: tool.server,
    }, idx);
  });

  bm25Engine.consolidate();
  isInitialized = true;
}

/**
 * Search tools using BM25
 * wink-bm25 returns [[docId: string, score: number], ...] tuples
 */
export function searchBM25(query: string, limit: number): ToolDefinition[] {
  if (!bm25Engine || !isInitialized) {
    return [];
  }

  // wink-bm25 types claim number[] but actually returns [string, number][]
  const results = bm25Engine.search(query, limit) as unknown as [string, number][];
  return results
    .map(([docId]) => indexedTools[parseInt(docId, 10)])
    .filter((tool): tool is ToolDefinition => tool !== undefined);
}

/**
 * Check if BM25 engine is ready
 */
export function isBM25Ready(): boolean {
  return isInitialized && bm25Engine !== null;
}

/**
 * Reset BM25 engine (for testing)
 */
export function resetBM25(): void {
  bm25Engine = null;
  indexedTools = [];
  isInitialized = false;
}
