import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getClient, logMcpCall, SERVER_CONFIGS } from "./clients.js";
import { workspace } from "./workspace.js";
import { ExecutionResult, MCPClients } from "../types.js";
import { MAX_LOG_ENTRY_CHARS, MCP_RESULTS_DIR } from "../constants.js";

const DEFAULT_TIMEOUT = 30_000; // 30 seconds

/**
 * Create a proxy that wraps an MCP client's tool calls
 * Large responses are auto-saved to workspace, returning references
 */
function createClientProxy(name: keyof MCPClients): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {
  return new Proxy({} as Record<string, (args: Record<string, unknown>) => Promise<unknown>>, {
    get(_, toolName: string) {
      return async (args: Record<string, unknown> = {}) => {
        const client = await getClient(name);
        if (!client) {
          throw new Error(`${name} MCP is not available`);
        }

        const startTime = Date.now();
        try {
          const result = await client.callTool({ name: toolName, arguments: args });
          logMcpCall({
            timestamp: startTime,
            client: name,
            tool: toolName,
            args,
            duration: Date.now() - startTime,
          });

          // Check response size
          const serialised = JSON.stringify(result);

          if (serialised.length > MAX_LOG_ENTRY_CHARS) {
            // Auto-save large responses to workspace
            const filename = `${Date.now()}-${name}-${toolName}.json`;
            const filepath = `${MCP_RESULTS_DIR}/${filename}`;
            await workspace.mkdir(MCP_RESULTS_DIR);
            await workspace.writeJSON(filepath, result);

            // Return reference with preview
            return {
              _savedTo: filepath,
              _size: serialised.length,
              _preview: serialised.slice(0, 200) + "...",
              _hint: `Full result saved to workspace. Use workspace.readJSON("${filepath}") to access.`,
            };
          }

          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logMcpCall({
            timestamp: startTime,
            client: name,
            tool: toolName,
            args,
            duration: Date.now() - startTime,
            error: errorMessage,
          });
          throw error;
        }
      };
    },
  });
}

/**
 * Minimal console interface for sandbox
 */
interface SandboxConsole {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

/**
 * Create a mock console that captures output
 */
function createMockConsole(): { console: SandboxConsole; logs: unknown[] } {
  const logs: unknown[] = [];

  const mockConsole: SandboxConsole = {
    log: (...args: unknown[]) => { logs.push(args.length === 1 ? args[0] : args); },
    info: (...args: unknown[]) => { logs.push({ level: "info", data: args }); },
    warn: (...args: unknown[]) => { logs.push({ level: "warn", data: args }); },
    error: (...args: unknown[]) => { logs.push({ level: "error", data: args }); },
    debug: (...args: unknown[]) => { logs.push({ level: "debug", data: args }); },
  };

  return { console: mockConsole, logs };
}

/**
 * Build the sandbox globals object with all MCP clients and workspace
 */
function buildSandboxGlobals(mockConsole: SandboxConsole): Record<string, unknown> {
  const globals: Record<string, unknown> = {
    console: mockConsole,
    workspace,
  };

  // Add all MCP client proxies
  for (const config of SERVER_CONFIGS) {
    globals[config.name] = createClientProxy(config.name);
  }

  return globals;
}

/**
 * Execute TypeScript/JavaScript code in a sandboxed environment
 */
export async function executeCode(
  code: string,
  timeout = DEFAULT_TIMEOUT
): Promise<ExecutionResult> {
  const { console: mockConsole, logs } = createMockConsole();
  const globals = buildSandboxGlobals(mockConsole);

  // Build the async function with injected globals
  const globalNames = Object.keys(globals);
  const globalValues = Object.values(globals);

  try {
    // Create async function with globals as parameters
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
      ...args: string[]
    ) => (...args: unknown[]) => Promise<unknown>;

    const fn = new AsyncFunction(...globalNames, code);

    // Execute with timeout
    const result = await Promise.race([
      fn(...globalValues),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Execution timed out after ${timeout}ms`)), timeout)
      ),
    ]);

    // If the code returned something, add it to logs
    if (result !== undefined) {
      logs.push({ returned: result });
    }

    return { logs };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    return {
      logs,
      error: errorMessage,
      stack,
    };
  }
}

/**
 * Get a list of available MCP clients (for error messages)
 */
export function getAvailableClientNames(): string[] {
  return SERVER_CONFIGS.map((c) => c.name);
}
