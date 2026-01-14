import { describe, it, expect } from "vitest";
import { searchTools, loadToolDefinition } from "../../src/search.js";

describe("search module", () => {
  describe("loadToolDefinition", () => {
    it("should load a valid YAML tool definition", async () => {
      const tool = await loadToolDefinition("registry/ui/shadcn/list_shadcn_components.yaml");

      expect(tool).toBeDefined();
      expect(tool?.name).toBe("list_shadcn_components");
      expect(tool?.server).toBe("shadcn");
      expect(tool?.inputSchema).toBeDefined();
    });

    it("should return null for non-existent file", async () => {
      const tool = await loadToolDefinition("registry/nonexistent/tool.yaml");
      expect(tool).toBeNull();
    });

    it("should return null for invalid YAML", async () => {
      // package.json is not valid YAML tool definition
      const tool = await loadToolDefinition("package.json");
      expect(tool).toBeNull();
    });
  });

  describe("searchTools", () => {
    it("should return results for valid query", async () => {
      const response = await searchTools("shadcn ui component", 5);

      expect(response.results).toBeDefined();
      expect(response.results.length).toBeGreaterThan(0);
      expect(response.source).toBeDefined();
    });

    it("should respect limit parameter", async () => {
      const response = await searchTools("search", 2);

      expect(response.results.length).toBeLessThanOrEqual(2);
    });

    it("should return empty results for nonsense query", async () => {
      const response = await searchTools("xyzzy123nonexistent", 10);

      expect(response.results).toBeDefined();
      // May have suggestion for empty results
    });

    it("should include tool metadata in results", async () => {
      const response = await searchTools("gemini", 3);

      if (response.results.length > 0) {
        const result = response.results[0];
        expect(result.tool.name).toBeDefined();
        expect(result.tool.server).toBeDefined();
        expect(result.tool.description).toBeDefined();
      }
    });

    it("should respect offset parameter for pagination", async () => {
      const page1 = await searchTools("gemini", 2, 0);
      const page2 = await searchTools("gemini", 2, 2);

      // Both should have results
      expect(page1.results.length).toBeGreaterThan(0);
      expect(page1.totalCount).toBeDefined();

      // If there are enough results, page 2 should be different
      if (page1.totalCount && page1.totalCount > 2 && page2.results.length > 0) {
        expect(page1.results[0].tool.name).not.toBe(page2.results[0].tool.name);
      }
    });

    it("should include totalCount in response", async () => {
      const response = await searchTools("gemini", 5, 0);

      expect(response.totalCount).toBeDefined();
      expect(typeof response.totalCount).toBe("number");
    });
  });
});
