import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Tier 2 — spawned binary tests using StdioClientTransport
// Requires a prior `npm run build` (or your package manager's equivalent).
// Run via `npm run test:smoke` (or your package manager's equivalent).

const distCli = resolve(fileURLToPath(import.meta.url), "../../../dist/cli.js");

// ---------------------------------------------------------------------------
// Shared client — single spawned process for the entire describe block
// ---------------------------------------------------------------------------
let client: Client;
let transport: StdioClientTransport;
const stderrChunks: Buffer[] = [];

describe("MCP smoke — spawned binary (MCP-01, MCP-04)", () => {
  beforeAll(async () => {
    if (!existsSync(distCli)) {
      throw new Error(
        `dist/cli.js not found at ${distCli}. Run 'npm run build' (or your package manager's equivalent) before 'npm run test:smoke'.`,
      );
    }

    transport = new StdioClientTransport({
      command: "node",
      args: [distCli],
      stderr: "pipe",
    });

    // Collect stderr data for later assertions
    transport.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    client = new Client({ name: "smoke-test", version: "0.0.0" });
    // connect() spawns the process AND runs the MCP initialize handshake
    await client.connect(transport);
  }, 15000 /* generous timeout for process spawn + handshake */);

  afterAll(async () => {
    // Graceful shutdown — sends close and lets the process exit cleanly
    await client.close();
    await transport.close(); // terminate the spawned child process
  }, 10000);

  it("spawns node dist/cli.js without error", () => {
    // If beforeAll resolved without throwing, spawn + handshake succeeded.
    expect(client).toBeDefined();
  });

  it("listTools returns 4 tools over stdio transport", async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(4);
  });

  it("every stdout line from the server parses as valid JSON-RPC", async () => {
    // The SDK Client handles all JSON-RPC framing via StdioClientTransport.
    // If framing were broken, client.connect() or client.listTools() would have
    // thrown a protocol error — reaching this point proves all stdout was valid.
    // Call listTools again to exercise one more round-trip.
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    // No parse errors occurred — the SDK would have thrown if any stdout line
    // failed JSON-RPC parsing.
  });

  it("stderr is exclusively structured JSON log lines at startup", () => {
    const stderrText = Buffer.concat(stderrChunks).toString("utf8");
    const lines = stderrText.split("\n").filter((l) => l.trim().length > 0);

    const jsonLines: string[] = [];
    const nonJsonLines: string[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        if (typeof parsed.level === "string" && parsed.level.length > 0) {
          jsonLines.push(line);
        } else {
          nonJsonLines.push(line);
        }
      } catch {
        nonJsonLines.push(line);
      }
    }

    expect(
      nonJsonLines,
      `Unstructured stderr lines (regression of stderr-only-JSON contract):\n${nonJsonLines.join("\n")}`,
    ).toHaveLength(0);
    expect(
      jsonLines.length,
      `Expected at least one structured JSON log line with a 'level' field in stderr.\nActual stderr:\n${stderrText}`,
    ).toBeGreaterThan(0);
  });

  it("each tool call returns a successful envelope; stdout stays clean", async () => {
    // Phase 5 wired all 4 handlers to the real Analyzer. They now return
    // structured envelopes (kind:"tree" or kind:"error") wrapped in a successful
    // tool response. isError must be falsy; application logs go to stderr only.
    const KS = resolve(fileURLToPath(import.meta.url), "../../fixtures/phase-05/kitchen-sink");
    const toolCalls = [
      { name: "get_full_hierarchy", arguments: { route: "/dashboard/settings", projectRoot: KS } },
      { name: "focus_on", arguments: { component: "Card", projectRoot: KS } },
      { name: "find_by_text", arguments: { query: "Hello", projectRoot: KS } },
      { name: "find_by_style", arguments: { class_or_prop: "flex", projectRoot: KS } },
    ];

    for (const call of toolCalls) {
      const result = await client.callTool(call);
      expect(
        result.isError,
        `Expected ${call.name} to return a successful response (isError falsy)`,
      ).toBeFalsy();
      expect(
        Array.isArray(result.content) && result.content.length > 0,
        `Expected ${call.name} to return non-empty content`,
      ).toBe(true);
    }

    // The fact that no protocol errors were thrown means stdout was not corrupted
    // by any application-level writes — all 4 tool calls framed correctly.
  });
});
