#!/usr/bin/env node
import { Command } from "commander";
import { existsSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

const program = new Command();

program
  .name("tool-executor")
  .description("CLI for tool-executor-mcp-server")
  .version("1.0.0");

program
  .command("doctor")
  .description("Check environment and dependencies")
  .action(async () => {
    console.log("🔍 Checking environment...\n");

    // Check Node version
    const nodeVersion = process.version;
    const nodeMajor = parseInt(nodeVersion.slice(1).split(".")[0]);
    console.log(`Node.js: ${nodeVersion} ${nodeMajor >= 18 ? "✅" : "❌ (need 18+)"}`);

    // Check for Python/uv (for uvx servers)
    try {
      execSync("which uvx", { stdio: "pipe" });
      console.log("uvx: ✅ Found");
    } catch {
      console.log("uvx: ⚠️ Not found (optional, needed for Python MCP servers)");
    }

    // Check for config file
    const configExists = existsSync(resolve(process.cwd(), "tool-executor.config.json"));
    console.log(`Config file: ${configExists ? "✅ Found" : "⚠️ Not found (using defaults)"}`);

    // Check for registry
    const registryExists = existsSync(resolve(process.cwd(), "registry"));
    console.log(`Registry: ${registryExists ? "✅ Found" : "❌ Not found"}`);

    console.log("\n✨ Doctor complete");
  });

program
  .command("init")
  .description("Initialize a new tool-executor configuration")
  .action(async () => {
    const configPath = resolve(process.cwd(), "tool-executor.config.json");

    if (existsSync(configPath)) {
      console.log("⚠️ Config file already exists");
      return;
    }

    const { writeFileSync } = await import("fs");
    const defaultConfig = {
      servers: [
        {
          name: "example",
          displayName: "Example Server",
          command: "npx",
          args: ["-y", "example-mcp-server"],
        },
      ],
    };

    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log("✅ Created tool-executor.config.json");
    console.log("   Edit this file to add your MCP servers, then run: npm run extract");
  });

program.parse();
