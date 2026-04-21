import { describe, it } from "vitest";

// Tier 2 — spawned binary tests using StdioClientTransport
// Requires prior `pnpm build`. Run via `pnpm run test:smoke`.
// Stubs filled in by plan 02-05.

describe("MCP smoke — spawned binary (MCP-01, MCP-04)", () => {
  it.todo("spawns node dist/cli.js without error");
  it.todo("listTools returns 4 tools over stdio transport");
  it.todo("every stdout line from the server parses as valid JSON-RPC");
  it.todo("stderr contains at least one structured JSON log line at startup");
  it.todo("each tool call returns isError:true on stderr, not stdout");
});
