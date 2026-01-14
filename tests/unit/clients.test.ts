import { describe, it, expect, beforeEach } from "vitest";
import {
  initClientStates,
  getAvailableClients,
  getConnectedClients,
  SERVER_CONFIGS,
} from "../../src/sandbox/clients.js";

describe("clients module", () => {
  beforeEach(() => {
    initClientStates();
  });

  describe("SERVER_CONFIGS", () => {
    it("should have 7 configured servers", () => {
      expect(SERVER_CONFIGS.length).toBe(7);
    });

    it("should have required fields for each server", () => {
      for (const config of SERVER_CONFIGS) {
        expect(config.name).toBeDefined();
        expect(config.displayName).toBeDefined();
        expect(config.command).toBeDefined();
        expect(config.args).toBeDefined();
        expect(Array.isArray(config.args)).toBe(true);
      }
    });

    it("should include expected servers", () => {
      const names = SERVER_CONFIGS.map(c => c.name);
      expect(names).toContain("serena");
      expect(names).toContain("gemini");
      expect(names).toContain("shadcn");
      expect(names).toContain("context7");
    });
  });

  describe("getAvailableClients", () => {
    it("should return all configured client names", () => {
      const available = getAvailableClients();

      expect(available.length).toBe(SERVER_CONFIGS.length);
      expect(available).toContain("serena");
      expect(available).toContain("gemini");
    });
  });

  describe("getConnectedClients", () => {
    it("should return empty array when no clients connected", () => {
      const connected = getConnectedClients();

      expect(connected).toEqual([]);
    });
  });

  describe("config loading", () => {
    it("should fall back to defaults when no config file", () => {
      // Default behavior - should have 7 servers
      expect(SERVER_CONFIGS.length).toBe(7);
    });
  });

  // Note: Testing actual connections would require mocking or integration tests
  // These tests focus on the synchronous state management functions
});
