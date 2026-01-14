import { readFile, writeFile, appendFile, unlink, readdir, mkdir as fsMkdir, stat as fsStat } from "node:fs/promises";
import { join, resolve, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { glob as globFs } from "glob";
import { MCP_RESULTS_DIR } from "../constants.js";

// Resolve workspace relative to module location (not cwd) for plugin portability
const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(__dirname, "..", "..", "workspace");

/**
 * Resolve a path within the workspace, blocking traversal attacks
 */
function resolvePath(relativePath: string): string {
  const normalized = normalize(relativePath);

  // Block absolute paths and traversal
  if (normalized.startsWith("/") || normalized.startsWith("..") || normalized.includes("/../")) {
    throw new Error(`Path traversal blocked: ${relativePath}`);
  }

  const fullPath = resolve(WORKSPACE_ROOT, normalized);

  // Double-check the resolved path is within workspace
  if (!fullPath.startsWith(WORKSPACE_ROOT)) {
    throw new Error(`Path traversal blocked: ${relativePath}`);
  }

  return fullPath;
}

/**
 * Clean up old MCP results (older than maxAge ms)
 * Default: 1 hour (3600000ms)
 */
async function cleanupMcpResults(maxAgeMs: number = 3600000): Promise<number> {
  const dir = join(WORKSPACE_ROOT, MCP_RESULTS_DIR);

  try {
    const files = await readdir(dir);
    const now = Date.now();
    let deleted = 0;

    for (const file of files) {
      const filepath = join(dir, file);
      const stats = await fsStat(filepath);

      if (now - stats.mtimeMs > maxAgeMs) {
        await unlink(filepath);
        deleted++;
      }
    }

    return deleted;
  } catch (err) {
    // ENOENT is expected if directory doesn't exist yet
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return 0;
    }
    // Log unexpected errors (permissions, disk full, etc.)
    console.error("cleanupMcpResults failed:", err);
    return 0;
  }
}

/**
 * Workspace API - all file operations scoped to ./workspace/
 */
export const workspace = {
  // Core operations

  async read(path: string): Promise<string> {
    const fullPath = resolvePath(path);
    return readFile(fullPath, "utf-8");
  },

  async write(path: string, data: string): Promise<void> {
    const fullPath = resolvePath(path);
    await writeFile(fullPath, data, "utf-8");
  },

  async append(path: string, data: string): Promise<void> {
    const fullPath = resolvePath(path);
    await appendFile(fullPath, data, "utf-8");
  },

  async delete(path: string): Promise<void> {
    const fullPath = resolvePath(path);
    await unlink(fullPath);
  },

  // JSON operations

  async readJSON<T = unknown>(path: string): Promise<T> {
    const content = await workspace.read(path);
    return JSON.parse(content) as T;
  },

  async writeJSON(path: string, data: unknown): Promise<void> {
    await workspace.write(path, JSON.stringify(data, null, 2));
  },

  // Binary operations

  async readBuffer(path: string): Promise<Buffer> {
    const fullPath = resolvePath(path);
    return readFile(fullPath);
  },

  async writeBuffer(path: string, data: Buffer): Promise<void> {
    const fullPath = resolvePath(path);
    await writeFile(fullPath, data);
  },

  // Directory operations

  async list(path = "."): Promise<string[]> {
    const fullPath = resolvePath(path);
    return readdir(fullPath);
  },

  async glob(pattern: string): Promise<string[]> {
    // Block dangerous patterns
    if (pattern.includes("..")) {
      throw new Error(`Glob traversal blocked: ${pattern}`);
    }

    const matches = await globFs(pattern, {
      cwd: WORKSPACE_ROOT,
      nodir: false,
    });

    return matches;
  },

  async mkdir(path: string): Promise<void> {
    const fullPath = resolvePath(path);
    await fsMkdir(fullPath, { recursive: true });
  },

  async exists(path: string): Promise<boolean> {
    try {
      const fullPath = resolvePath(path);
      await fsStat(fullPath);
      return true;
    } catch (err) {
      // ENOENT means file doesn't exist - expected
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      // Rethrow unexpected errors (permissions, etc.)
      throw err;
    }
  },

  // Metadata

  async stat(path: string): Promise<{ size: number; mtime: Date; isDir: boolean }> {
    const fullPath = resolvePath(path);
    const stats = await fsStat(fullPath);
    return {
      size: stats.size,
      mtime: stats.mtime,
      isDir: stats.isDirectory(),
    };
  },

  // MCP results management

  cleanupMcpResults,
};

export type Workspace = typeof workspace;
