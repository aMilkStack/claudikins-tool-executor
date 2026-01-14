import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Resolve config relative to module location (not cwd) for plugin portability
const __dirname = dirname(fileURLToPath(import.meta.url));

export const ServerConfigSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  command: z.enum(["npx", "uvx", "node", "python"]),
  args: z.array(z.string()),
  env: z.record(z.string(), z.string()).optional(),
});

export const ToolExecutorConfigSchema = z.object({
  $schema: z.string().optional(),
  servers: z.array(ServerConfigSchema).min(1),
}).strict();

export type ToolExecutorConfig = z.infer<typeof ToolExecutorConfigSchema>;
export type ServerConfigFromFile = z.infer<typeof ServerConfigSchema>;

const CONFIG_FILENAMES = [
  "tool-executor.config.json",
  "tool-executor.config.js",
  ".tool-executorrc.json",
];

/**
 * Expand ${VAR} syntax in a string using process.env
 */
function expandEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return process.env[varName] || "";
  });
}

/**
 * Recursively expand env vars in an object
 */
function expandEnvVarsInObject(obj: unknown): unknown {
  if (typeof obj === "string") {
    return expandEnvVars(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(expandEnvVarsInObject);
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandEnvVarsInObject(value);
    }
    return result;
  }
  return obj;
}

export function findConfigFile(startDir: string = resolve(__dirname, "..")): string | null {
  for (const filename of CONFIG_FILENAMES) {
    const filepath = resolve(startDir, filename);
    if (existsSync(filepath)) {
      return filepath;
    }
  }
  return null;
}

export function loadConfig(configPath?: string): ToolExecutorConfig | null {
  const filepath = configPath || findConfigFile();

  if (!filepath || !existsSync(filepath)) {
    return null;
  }

  try {
    const content = readFileSync(filepath, "utf-8");
    const parsed = JSON.parse(content);
    const expanded = expandEnvVarsInObject(parsed);
    return ToolExecutorConfigSchema.parse(expanded);
  } catch (error) {
    console.error(`Failed to load config from ${filepath}:`, error);
    return null;
  }
}
