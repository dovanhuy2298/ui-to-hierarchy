import path from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../../src/mcp/server.js";
import { EnvelopeSchema } from "../../../src/ir/envelope.js";
import { asToolResponse, firstText } from "../../helpers.js";

const KS = path.resolve("test/fixtures/phase-05/kitchen-sink");
const PE = path.resolve("test/fixtures/phase-05/micro/parse-error");

async function createTestPair() {
  const server = createServer();
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return { client, cleanup: () => client.close() };
}

describe("get_full_hierarchy MCP integration (TOOL-01)", () => {
  let pair: Awaited<ReturnType<typeof createTestPair>> | null = null;

  afterEach(async () => {
    if (pair) {
      await pair.cleanup();
      pair = null;
    }
  });

  // R1: markdown format (default)
  it("R1: returns markdown output for /dashboard/settings", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "get_full_hierarchy",
      arguments: { route: "/dashboard/settings", projectRoot: KS },
    });
    const r = asToolResponse(result);
    expect(r.isError).toBeFalsy();
    const text = firstText(r);
    expect(text).toBeTruthy();
    // Markdown tree contains at least one component-style line
    expect(text).toMatch(/<\w+>/);
  });

  // R1: format:"json" produces EnvelopeSchema-valid envelope
  it("R1: format='json' produces EnvelopeSchema-valid envelope", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "get_full_hierarchy",
      arguments: { route: "/dashboard/settings", format: "json", projectRoot: KS },
    });
    const r = asToolResponse(result);
    expect(r.isError).toBeFalsy();
    const envelope = JSON.parse(firstText(r));
    // Must not throw — envelope passes the schema
    expect(() => EnvelopeSchema.parse(envelope)).not.toThrow();
    // Structural assertions
    expect(envelope.schemaVersion).toBe("1");
    expect(typeof envelope.resolvedRoot).toBe("string");
    expect(Array.isArray(envelope.warnings)).toBe(true);
    expect(envelope.tree).toBeDefined();
  });

  // R1: /dashboard/settings tree includes expected layout chain
  it("R1: dashboard/settings tree includes RootLayout, GroupLayout, DashboardLayout, SettingsPage", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "get_full_hierarchy",
      arguments: { route: "/dashboard/settings", format: "json", projectRoot: KS },
    });
    const r = asToolResponse(result);
    expect(r.isError).toBeFalsy();
    const envelope = JSON.parse(firstText(r));
    const json = JSON.stringify(envelope);
    expect(json).toContain('"name":"RootLayout"');
    expect(json).toContain('"name":"GroupLayout"');
    expect(json).toContain('"name":"DashboardLayout"');
    expect(json).toContain('"name":"SettingsPage"');
  });

  // R1: /login produces a kind:"slot", name:"modal" sibling node (parallel @modal slot)
  it("R1: /login produces kind:'slot', name:'modal' sibling node in the tree", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "get_full_hierarchy",
      arguments: { route: "/login", format: "json", projectRoot: KS },
    });
    const r = asToolResponse(result);
    expect(r.isError).toBeFalsy();
    const envelope = JSON.parse(firstText(r));
    const json = JSON.stringify(envelope);
    expect(json).toContain('"kind":"slot"');
    expect(json).toContain('"name":"modal"');
  });

  // R7: "use client" page component carries layoutHint:"client"
  it("R7: 'use client' page component carries layoutHint:'client'", async () => {
    pair = await createTestPair();
    // /style-test has StyleTestPage which starts with "use client"
    const result = await pair.client.callTool({
      name: "get_full_hierarchy",
      arguments: { route: "/style-test", format: "json", projectRoot: KS },
    });
    const r = asToolResponse(result);
    expect(r.isError).toBeFalsy();
    const envelope = JSON.parse(firstText(r));
    const json = JSON.stringify(envelope);
    expect(json).toContain('"name":"StyleTestPage"');
    // StyleTestPage is a "use client" component — its layoutHint must include "client"
    // The layoutHint field appears as a direct property of the StyleTestPage node object.
    expect(json).toContain('"layoutHint":"client"');
  });

  // R8: unknown route returns empty fragment + "route not matched" warning
  it("R8: /does-not-exist returns success with empty fragment + 'route not matched' warning", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "get_full_hierarchy",
      arguments: { route: "/does-not-exist", format: "json", projectRoot: KS },
    });
    const r = asToolResponse(result);
    // R8: must NOT promote user-data errors to isError:true
    expect(r.isError).toBeFalsy();
    const envelope = JSON.parse(firstText(r));
    expect(envelope.tree.kind).toBe("fragment");
    expect(envelope.tree.children).toEqual([]);
    expect(envelope.warnings.some((w: string) => /route not matched/.test(w))).toBe(true);
  });

  // R8: parse-error fixture surfaces error or warning without throwing at MCP level
  it("R8: parse-error fixture surfaces kind:'error' or warning; isError stays falsy", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "get_full_hierarchy",
      arguments: { route: "/", format: "json", projectRoot: PE },
    });
    const r = asToolResponse(result);
    // R8: must NOT throw at MCP level
    expect(r.isError).toBeFalsy();
    const envelope = JSON.parse(firstText(r));
    const json = JSON.stringify(envelope);
    // Either a kind:"error" node in the tree OR at least one warning
    expect(json.includes('"kind":"error"') || envelope.warnings.length > 0).toBe(true);
  });
});
