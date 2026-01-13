import { z } from "zod";

/**
 * Input schema for search_tools
 */
export const SearchToolsInputSchema = z.object({
  query: z.string()
    .min(1, "Query cannot be empty")
    .describe("Search query for finding relevant tools"),
  limit: z.number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum results to return (default: 10)"),
}).strict();

export type SearchToolsInput = z.infer<typeof SearchToolsInputSchema>;

/**
 * Input schema for get_tool_schema
 */
export const GetToolSchemaInputSchema = z.object({
  name: z.string()
    .min(1, "Tool name cannot be empty")
    .describe("Tool name (from search_tools results)"),
}).strict();

export type GetToolSchemaInput = z.infer<typeof GetToolSchemaInputSchema>;

/**
 * Input schema for execute_code
 */
export const ExecuteCodeInputSchema = z.object({
  code: z.string()
    .min(1, "Code cannot be empty")
    .describe("TypeScript/JavaScript code to execute"),
  timeout: z.number()
    .int()
    .min(1000)
    .max(600000)
    .default(30000)
    .describe("Execution timeout in ms (default: 30000)"),
}).strict();

export type ExecuteCodeInput = z.infer<typeof ExecuteCodeInputSchema>;
