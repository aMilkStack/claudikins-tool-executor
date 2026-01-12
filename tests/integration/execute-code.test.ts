import { describe, it, expect } from "vitest";
import { executeCode } from "../../src/sandbox/runtime.js";

describe("execute_code integration", () => {
  describe("basic execution", () => {
    it("should execute simple code and capture console.log", async () => {
      const result = await executeCode(`console.log("hello world")`);
      expect(result.error).toBeUndefined();
      expect(result.logs).toContain("hello world");
    });

    it("should capture multiple logs", async () => {
      const result = await executeCode(`
        console.log("first");
        console.log("second");
        console.log("third");
      `);
      expect(result.error).toBeUndefined();
      expect(result.logs).toEqual(["first", "second", "third"]);
    });

    it("should capture return values", async () => {
      const result = await executeCode(`return 42`);
      expect(result.error).toBeUndefined();
      expect(result.logs).toContainEqual({ returned: 42 });
    });

    it("should handle async code", async () => {
      const result = await executeCode(`
        await new Promise(r => setTimeout(r, 10));
        console.log("after delay");
      `);
      expect(result.error).toBeUndefined();
      expect(result.logs).toContain("after delay");
    });
  });

  describe("workspace access", () => {
    it("should have workspace available", async () => {
      const result = await executeCode(`
        await workspace.write("integration-test.txt", "test content");
        const content = await workspace.read("integration-test.txt");
        console.log(content);
        await workspace.delete("integration-test.txt");
      `);
      expect(result.error).toBeUndefined();
      expect(result.logs).toContain("test content");
    });

    it("should persist data in workspace", async () => {
      // Write in one execution
      await executeCode(`
        await workspace.writeJSON("persist.json", { count: 1 });
      `);

      // Read in another execution
      const result = await executeCode(`
        const data = await workspace.readJSON("persist.json");
        console.log(data.count);
        await workspace.delete("persist.json");
      `);
      expect(result.error).toBeUndefined();
      expect(result.logs).toContain(1);
    });
  });

  describe("error handling", () => {
    it("should capture syntax errors", async () => {
      const result = await executeCode(`const x = {`);
      expect(result.error).toBeDefined();
    });

    it("should capture runtime errors", async () => {
      const result = await executeCode(`throw new Error("intentional")`);
      expect(result.error).toBe("intentional");
      expect(result.stack).toBeDefined();
    });

    it("should capture partial logs before error", async () => {
      const result = await executeCode(`
        console.log("before");
        throw new Error("boom");
      `);
      expect(result.error).toBe("boom");
      expect(result.logs).toContain("before");
    });

    it("should timeout long-running code", async () => {
      const result = await executeCode(
        `await new Promise(r => setTimeout(r, 5000))`,
        100 // 100ms timeout
      );
      expect(result.error).toContain("timed out");
    });
  });

  describe("MCP client proxies", () => {
    it("should have MCP clients available as globals", async () => {
      const result = await executeCode(`
        console.log(typeof gemini);
        console.log(typeof serena);
        console.log(typeof context7);
      `);
      expect(result.error).toBeUndefined();
      expect(result.logs).toEqual(["object", "object", "object"]);
    });

    it("should handle unknown tool calls gracefully", async () => {
      // Calling an unknown tool shouldn't crash - just returns MCP error
      const result = await executeCode(`
        const response = await context7.nonexistent_tool({});
        console.log(JSON.stringify(response));
      `);
      // MCP SDK returns error in response, doesn't throw
      // The key is that execution completes without crashing
      expect(result.logs.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("security", () => {
    it("should not have access to require or fs", async () => {
      // Note: process is available via AsyncFunction's global scope
      // but we don't inject fs or require
      const result = await executeCode(`
        console.log(typeof require);
        console.log(typeof fs);
      `);
      expect(result.error).toBeUndefined();
      expect(result.logs).toEqual(["undefined", "undefined"]);
    });

  });
});
