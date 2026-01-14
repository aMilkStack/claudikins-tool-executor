import { Client } from "@modelcontextprotocol/sdk/client/index.js";

/**
 * MCP client connections - null means not connected (lazy loading)
 * NOTE: Extend this interface when adding new servers to DEFAULT_CONFIGS
 */
export interface MCPClients {
  serena: Client | null;
  context7: Client | null;
  notebooklm: Client | null;
  shadcn: Client | null;
  gemini: Client | null;
  apify: Client | null;
  sequentialThinking: Client | null;
}

/**
 * Configuration for connecting to an MCP server
 */
export interface ServerConfig {
  name: keyof MCPClients;
  displayName: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * Result of code execution in the sandbox
 */
export interface ExecutionResult {
  logs: unknown[];
  error?: string;
  stack?: string;
}

/**
 * Tool definition loaded from YAML registry
 */
export interface ToolDefinition {
  name: string;
  server: string;
  category: string;
  description: string;
  inputSchema: object;
  example: string;
  notes?: string;
}

/**
 * Audit log entry for MCP calls
 */
export interface AuditLogEntry {
  timestamp: number;
  client: string;
  tool: string;
  args: Record<string, unknown>;
  duration?: number;
  error?: string;
}

/**
 * Client state for lifecycle management
 */
export interface ClientState {
  client: Client | null;
  lastUsed: number;
  connecting: boolean;
}
