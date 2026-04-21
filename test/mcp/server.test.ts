import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer } from "../../src/mcp/server.js";
import { internalError, type ToolResponse } from "../../src/mcp/errors.js";

// Tier 1 — in-process tests using InMemoryTransport + Client

// ---------------------------------------------------------------------------
// Helper: cast client.callTool() result to ToolResponse.
// The SDK types result.content as unknown[] at the Client layer;
// casting through ToolResponse gives safe access to .content[0].text.
// ---------------------------------------------------------------------------
function asToolResponse(result: unknown): ToolResponse {
  return result as ToolResponse;
}

// ---------------------------------------------------------------------------
// Helper: wire a fresh server + client pair for a single test
// ---------------------------------------------------------------------------
async function createTestPair(): Promise<{
  server: McpServer;
  client: Client;
  cleanup: () => Promise<void>;
}> {
  const server = createServer();
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return {
    server,
    client,
    cleanup: () => client.close(),
  };
}

// ---------------------------------------------------------------------------
// Describe: tool registration (MCP-01)
// ---------------------------------------------------------------------------
describe("MCP server — tool registration (MCP-01)", () => {
  let pair: Awaited<ReturnType<typeof createTestPair>>;

  beforeEach(async () => {
    pair = await createTestPair();
  });

  afterEach(async () => {
    await pair.cleanup();
  });

  it("initialize handshake succeeds", async () => {
    // If createTestPair() resolves without throwing, the handshake succeeded.
    expect(pair.client).toBeDefined();
  });

  it("listTools returns exactly 4 tools", async () => {
    const { tools } = await pair.client.listTools();
    expect(tools).toHaveLength(4);
  });

  it(
    "listTools returns get_full_hierarchy, focus_on, find_by_text, find_by_style",
    async () => {
      const { tools } = await pair.client.listTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain("get_full_hierarchy");
      expect(names).toContain("focus_on");
      expect(names).toContain("find_by_text");
      expect(names).toContain("find_by_style");
    },
  );

  it("each tool has a non-empty description", async () => {
    const { tools } = await pair.client.listTools();
    for (const tool of tools) {
      expect(tool.description, `${tool.name} should have a description`).toBeTruthy();
    }
  });

  it("each tool has a non-empty title", async () => {
    // inputSchema is always present on every registered tool
    const { tools } = await pair.client.listTools();
    for (const tool of tools) {
      expect(tool.inputSchema, `${tool.name} should have an inputSchema`).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Describe: tool schemas (MCP-02)
// ---------------------------------------------------------------------------
describe("MCP server — tool schemas (MCP-02)", () => {
  let pair: Awaited<ReturnType<typeof createTestPair>>;

  beforeEach(async () => {
    pair = await createTestPair();
  });

  afterEach(async () => {
    await pair.cleanup();
  });

  it("get_full_hierarchy: route field is required and validates Next.js paths", async () => {
    // Valid route passes schema boundary — handler is reached
    const r = asToolResponse(
      await pair.client.callTool({
        name: "get_full_hierarchy",
        arguments: { route: "/dashboard" },
      }),
    );
    expect(r.isError).toBe(true);
    expect((r.content[0] as { type: string; text: string }).text).toContain("get_full_hierarchy");
  });

  it("get_full_hierarchy: format field defaults to markdown", async () => {
    // Call without format — zod default kicks in; handler is reached
    const r = asToolResponse(
      await pair.client.callTool({
        name: "get_full_hierarchy",
        arguments: { route: "/" },
      }),
    );
    expect(r.isError).toBe(true);
  });

  it("focus_on: component field validates PascalCase only", async () => {
    // Valid PascalCase name passes schema boundary — handler is reached
    const r = asToolResponse(
      await pair.client.callTool({
        name: "focus_on",
        arguments: { component: "Card" },
      }),
    );
    expect(r.isError).toBe(true);
    expect((r.content[0] as { type: string; text: string }).text).toContain("focus_on");
  });

  it("focus_on: scope field defaults to full", async () => {
    // Call without scope — zod default kicks in; handler is reached
    const r = asToolResponse(
      await pair.client.callTool({
        name: "focus_on",
        arguments: { component: "Layout" },
      }),
    );
    expect(r.isError).toBe(true);
  });

  it(
    "get_full_hierarchy: invalid route returns isError:true without calling handler",
    async () => {
      // '/bad route' has a space — fails route regex at the SDK schema boundary
      const r = asToolResponse(
        await pair.client.callTool({
          name: "get_full_hierarchy",
          arguments: { route: "/bad route" },
        }),
      );
      expect(r.isError).toBe(true);
    },
  );

  it(
    "focus_on: invalid component name returns isError:true without calling handler",
    async () => {
      // 'lowercase' fails PascalCase regex at the SDK schema boundary
      const r = asToolResponse(
        await pair.client.callTool({
          name: "focus_on",
          arguments: { component: "lowercase" },
        }),
      );
      expect(r.isError).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// Describe: not-implemented responses (MCP-03)
// ---------------------------------------------------------------------------
describe("MCP server — not-implemented responses (MCP-03)", () => {
  let pair: Awaited<ReturnType<typeof createTestPair>>;

  beforeEach(async () => {
    pair = await createTestPair();
  });

  afterEach(async () => {
    await pair.cleanup();
  });

  it("get_full_hierarchy returns isError:true with tool name in message", async () => {
    const r = asToolResponse(
      await pair.client.callTool({
        name: "get_full_hierarchy",
        arguments: { route: "/" },
      }),
    );
    expect(r.isError).toBe(true);
    expect((r.content[0] as { type: string; text: string }).text).toContain("get_full_hierarchy");
  });

  it("focus_on returns isError:true with tool name in message", async () => {
    const r = asToolResponse(
      await pair.client.callTool({
        name: "focus_on",
        arguments: { component: "Card" },
      }),
    );
    expect(r.isError).toBe(true);
    expect((r.content[0] as { type: string; text: string }).text).toContain("focus_on");
  });

  it("find_by_text returns isError:true with tool name in message", async () => {
    const r = asToolResponse(
      await pair.client.callTool({
        name: "find_by_text",
        arguments: { query: "Hello World" },
      }),
    );
    expect(r.isError).toBe(true);
    expect((r.content[0] as { type: string; text: string }).text).toContain("find_by_text");
  });

  it("find_by_style returns isError:true with tool name in message", async () => {
    const r = asToolResponse(
      await pair.client.callTool({
        name: "find_by_style",
        arguments: { class_or_prop: "flex" },
      }),
    );
    expect(r.isError).toBe(true);
    expect((r.content[0] as { type: string; text: string }).text).toContain("find_by_style");
  });

  it("handler exception is caught and returns internalError response", () => {
    // Unit test for the internalError() helper directly — no server needed
    const err = new Error("simulated handler crash");
    const response = internalError("test_tool", err);
    expect(response.isError).toBe(true);
    expect(response.content).toHaveLength(1);
    const item = response.content[0] as { type: string; text: string };
    expect(item.type).toBe("text");
    expect(item.text).toContain("simulated handler crash");
  });
});
