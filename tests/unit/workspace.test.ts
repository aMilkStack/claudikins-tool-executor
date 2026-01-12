import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { workspace } from "../../src/sandbox/workspace.js";
import { rm, mkdir } from "node:fs/promises";
import { join } from "node:path";

const TEST_WORKSPACE = join(process.cwd(), "workspace");

describe("workspace helpers", () => {
  beforeEach(async () => {
    // Ensure workspace exists and is clean
    await mkdir(TEST_WORKSPACE, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test files
    try {
      const files = await workspace.list();
      for (const file of files) {
        if (file !== ".gitkeep") {
          try {
            await workspace.delete(file);
          } catch {
            // Ignore - might be a directory
          }
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("path traversal protection", () => {
    it("should block absolute paths", async () => {
      await expect(workspace.read("/etc/passwd")).rejects.toThrow("Path traversal blocked");
    });

    it("should block parent directory traversal", async () => {
      await expect(workspace.read("../package.json")).rejects.toThrow("Path traversal blocked");
    });

    it("should block nested traversal", async () => {
      await expect(workspace.read("foo/../../package.json")).rejects.toThrow("Path traversal blocked");
    });

    it("should block glob traversal", async () => {
      await expect(workspace.glob("../**/*.json")).rejects.toThrow("Glob traversal blocked");
    });
  });

  describe("read/write operations", () => {
    it("should write and read text files", async () => {
      await workspace.write("test.txt", "hello world");
      const content = await workspace.read("test.txt");
      expect(content).toBe("hello world");
    });

    it("should append to files", async () => {
      await workspace.write("append.txt", "line1\n");
      await workspace.append("append.txt", "line2\n");
      const content = await workspace.read("append.txt");
      expect(content).toBe("line1\nline2\n");
    });

    it("should delete files", async () => {
      await workspace.write("delete-me.txt", "temp");
      expect(await workspace.exists("delete-me.txt")).toBe(true);
      await workspace.delete("delete-me.txt");
      expect(await workspace.exists("delete-me.txt")).toBe(false);
    });
  });

  describe("JSON operations", () => {
    it("should write and read JSON", async () => {
      const data = { name: "test", count: 42, nested: { value: true } };
      await workspace.writeJSON("data.json", data);
      const read = await workspace.readJSON("data.json");
      expect(read).toEqual(data);
    });
  });

  describe("directory operations", () => {
    it("should create directories", async () => {
      await workspace.mkdir("subdir/nested");
      expect(await workspace.exists("subdir/nested")).toBe(true);
    });

    it("should list directory contents", async () => {
      await workspace.write("file1.txt", "a");
      await workspace.write("file2.txt", "b");
      const files = await workspace.list();
      expect(files).toContain("file1.txt");
      expect(files).toContain("file2.txt");
    });

    it("should glob files", async () => {
      await workspace.write("a.json", "{}");
      await workspace.write("b.json", "{}");
      await workspace.write("c.txt", "text");
      const jsonFiles = await workspace.glob("*.json");
      expect(jsonFiles).toHaveLength(2);
      expect(jsonFiles).toContain("a.json");
      expect(jsonFiles).toContain("b.json");
    });
  });

  describe("metadata", () => {
    it("should return file stats", async () => {
      await workspace.write("stats.txt", "content");
      const stats = await workspace.stat("stats.txt");
      expect(stats.size).toBe(7); // "content" is 7 bytes
      expect(stats.isDir).toBe(false);
      expect(stats.mtime).toBeInstanceOf(Date);
    });

    it("should check existence", async () => {
      expect(await workspace.exists("nonexistent.txt")).toBe(false);
      await workspace.write("exists.txt", "yes");
      expect(await workspace.exists("exists.txt")).toBe(true);
    });
  });
});
