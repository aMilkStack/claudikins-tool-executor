import { readFile, writeFile, appendFile, unlink, readdir, mkdir as fsMkdir, stat as fsStat } from "node:fs/promises";
import { join, resolve, normalize } from "node:path";
import { glob as globFs } from "glob";
import { MCP_RESULTS_DIR } from "../constants.js";

const WORKSPACE_ROOT = resolve(process.cwd(), "workspace");

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
 * Ensure the MCP results directory exists and return path for new result
 */
async function getNextMcpResultPath(): Promise<string> {
  const dir = join(WORKSPACE_ROOT, MCP_RESULTS_DIR);
  await fsMkdir(dir, { recursive: true });

  const timestamp = Date.now();
  const filename = `${timestamp}.json`;
  return join(MCP_RESULTS_DIR, filename);
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
    } catch {
      return false;
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

  getNextMcpResultPath,
};

export type Workspace = typeof workspace;
