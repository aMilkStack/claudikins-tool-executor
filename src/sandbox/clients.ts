import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { MCPClients, ServerConfig, ClientState, AuditLogEntry } from "../types.js";
import { loadConfig } from "../config.js";

const IDLE_TIMEOUT = 3 * 60 * 1000; // 3 minutes

/**
 * Default MCP server configurations (used when no config file found)
 */
const DEFAULT_CONFIGS: ServerConfig[] = [
  // NPX servers (Node.js)
  { name: "notebooklm", displayName: "NotebookLM", command: "npx", args: ["-y", "notebooklm-mcp"] },
  { name: "sequentialThinking", displayName: "Sequential Thinking", command: "npx", args: ["-y", "@modelcontextprotocol/server-sequential-thinking"] },
  { name: "context7", displayName: "Context7", command: "npx", args: ["-y", "@upstash/context7-mcp"] },
  { name: "gemini", displayName: "Gemini", command: "npx", args: ["-y", "@rlabs-inc/gemini-mcp"], env: { GEMINI_API_KEY: process.env.GEMINI_API_KEY || "" } },
  { name: "shadcn", displayName: "shadcn", command: "npx", args: ["-y", "shadcn-ui-mcp-server"] },
  { name: "mermaid", displayName: "Mermaid", command: "npx", args: ["-y", "mcp-mermaid"] },
  { name: "apify", displayName: "Apify", command: "npx", args: ["-y", "@apify/actors-mcp-server"], env: { APIFY_TOKEN: process.env.APIFY_TOKEN || "" } },

  // UVX servers (Python)
  { name: "serena", displayName: "Serena", command: "uvx", args: ["--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server"] },
  { name: "nanoBanana", displayName: "Nano Banana", command: "uvx", args: ["nanobanana-mcp-server@latest"], env: { GEMINI_API_KEY: process.env.GEMINI_API_KEY || "" } },
];

/**
 * Load server configs from file or use defaults
 */
function loadServerConfigs(): ServerConfig[] {
  const config = loadConfig();

  if (config) {
    console.error(`Loaded config with ${config.servers.length} servers`);
    return config.servers.map(s => ({
      name: s.name as keyof MCPClients,
      displayName: s.displayName,
      command: s.command,
      args: s.args,
      env: s.env,
    }));
  }

  console.error("No config file found, using default servers");
  return DEFAULT_CONFIGS;
}

/**
 * MCP server configurations - loaded from config file or defaults
 */
export const SERVER_CONFIGS: ServerConfig[] = loadServerConfigs();

/**
 * Client state tracking for lazy loading and lifecycle management
 */
const clientStates: Map<keyof MCPClients, ClientState> = new Map();

/**
 * Track in-flight connection promises to avoid duplicate connections
 */
const connectionPromises: Map<keyof MCPClients, Promise<Client | null>> = new Map();

/**
 * Audit log for all MCP calls
 */
const auditLog: AuditLogEntry[] = [];

/**
 * Initialize client states (all disconnected)
 */
export function initClientStates(): void {
  for (const config of SERVER_CONFIGS) {
    clientStates.set(config.name, {
      client: null,
      lastUsed: 0,
      connecting: false,
    });
  }
}

/**
 * Get a client, connecting lazily if needed
 */
export async function getClient(name: keyof MCPClients): Promise<Client | null> {
  const state = clientStates.get(name);
  if (!state) {
    console.error(`Unknown client: ${name}`);
    return null;
  }

  // Already connected
  if (state.client) {
    state.lastUsed = Date.now();
    return state.client;
  }

  // Connection already in progress - wait for it
  const existingPromise = connectionPromises.get(name);
  if (existingPromise) {
    return existingPromise;
  }

  // Start new connection
  const connectionPromise = connectClientInternal(name, state);
  connectionPromises.set(name, connectionPromise);

  try {
    return await connectionPromise;
  } finally {
    connectionPromises.delete(name);
  }
}

/**
 * Internal connection logic
 */
async function connectClientInternal(
  name: keyof MCPClients,
  state: ClientState
): Promise<Client | null> {
  const config = SERVER_CONFIGS.find((c) => c.name === name);
  if (!config) {
    return null;
  }

  try {
    const client = new Client(
      { name: `claudikins-${name}`, version: "1.0.0" },
      { capabilities: {} }
    );
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...process.env, ...config.env } as Record<string, string>,
    });
    await client.connect(transport);

    state.client = client;
    state.lastUsed = Date.now();
    console.error(`Connected: ${config.displayName}`);
    return client;
  } catch (error) {
    console.error(`Failed to connect ${config.displayName}:`, error);
    return null;
  }
}

/**
 * Disconnect a specific client
 */
export async function disconnectClient(name: keyof MCPClients): Promise<void> {
  const state = clientStates.get(name);
  if (!state?.client) return;

  try {
    await state.client.close();
    console.error(`Disconnected: ${name}`);
  } catch (error) {
    console.error(`Error disconnecting ${name}:`, error);
  }
  state.client = null;
  state.lastUsed = 0;
}

/**
 * Disconnect all clients
 */
export async function disconnectAll(): Promise<void> {
  const names = Array.from(clientStates.keys());
  await Promise.all(names.map(disconnectClient));
}

/**
 * Clean up idle clients (run periodically)
 */
export async function cleanupIdleClients(): Promise<void> {
  const now = Date.now();
  for (const [name, state] of clientStates) {
    if (state.client && now - state.lastUsed > IDLE_TIMEOUT) {
      await disconnectClient(name);
    }
  }
}

/**
 * Get list of currently connected clients
 */
export function getConnectedClients(): string[] {
  const connected: string[] = [];
  for (const [name, state] of clientStates) {
    if (state.client) {
      connected.push(name);
    }
  }
  return connected;
}

/**
 * Get list of all available clients (connected or not)
 */
export function getAvailableClients(): string[] {
  return SERVER_CONFIGS.map((c) => c.name);
}

/**
 * Log an MCP call for auditing
 */
export function logMcpCall(entry: AuditLogEntry): void {
  auditLog.push(entry);
  // Keep only last 1000 entries
  if (auditLog.length > 1000) {
    auditLog.shift();
  }
}

/**
 * Get recent audit log entries
 */
export function getAuditLog(limit = 100): AuditLogEntry[] {
  return auditLog.slice(-limit);
}

/**
 * Start the idle cleanup interval
 */
let cleanupInterval: NodeJS.Timeout | null = null;

export function startLifecycleManagement(): void {
  if (cleanupInterval) return;

  // Check for idle clients every minute
  cleanupInterval = setInterval(cleanupIdleClients, 60_000);

  // Clean shutdown handlers
  const shutdown = async () => {
    console.error("Shutting down...");
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }
    await disconnectAll();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/**
 * Stop lifecycle management (for testing)
 */
export function stopLifecycleManagement(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

// Auto-initialize client states at module load
initClientStates();
