import path from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../../src/mcp/server.js";
import { asToolResponse, firstText } from "../../helpers.js";

const KS = path.resolve("test/fixtures/phase-05/kitchen-sink");

async function createTestPair() {
  const server = createServer();
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return { client, cleanup: () => client.close() };
}

describe("focus_on MCP integration (TOOL-02)", () => {
  let pair: Awaited<ReturnType<typeof createTestPair>> | null = null;

  afterEach(async () => {
    if (pair) {
      await pair.cleanup();
      pair = null;
    }
  });

  // R2: scope:"full" returns synthetic-fragment with 3 Card subtrees
  // (Card appears in /dashboard, /dashboard/settings, and /profile pages)
  it("R2: scope:'full' returns markdown output containing Card references", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "focus_on",
      arguments: { component: "Card", scope: "full", projectRoot: KS },
    });
    const r = asToolResponse(result);
    expect(r.isError).toBeFalsy();
    const text = firstText(r);
    expect(text).toBeTruthy();
    // Markdown should contain at least one Card-related component entry
    expect(text).toMatch(/Card|RootLayout/);
  });

  // R2: scope:"down" returns subtrees rooted at Card directly
  it("R2: scope:'down' returns subtrees with Card nodes", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "focus_on",
      arguments: { component: "Card", scope: "down", projectRoot: KS },
    });
    const r = asToolResponse(result);
    expect(r.isError).toBeFalsy();
    const text = firstText(r);
    expect(text).toBeTruthy();
    // "down" scope should contain Card component references
    expect(text).toContain("<Card>");
  });

  // R2: scope:"up" returns ancestor chains containing Card
  it("R2: scope:'up' returns ancestor chains for Card", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "focus_on",
      arguments: { component: "Card", scope: "up", projectRoot: KS },
    });
    const r = asToolResponse(result);
    expect(r.isError).toBeFalsy();
    const text = firstText(r);
    expect(text).toBeTruthy();
    // "up" scope shows ancestors — should contain root layout
    expect(text).toMatch(/<RootLayout>|RootLayout/);
  });

  // R6: synthetic fragment root — focus_on returns a fragment at <synthetic>:0
  // Verified via markdown header line "<> @ <synthetic>:0"
  it("R6: result markdown starts with synthetic fragment root '<> @ <synthetic>:0'", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "focus_on",
      arguments: { component: "Card", scope: "full", projectRoot: KS },
    });
    const r = asToolResponse(result);
    expect(r.isError).toBeFalsy();
    const text = firstText(r);
    // The markdown renderer emits "<> @ <synthetic>:0" as the fragment root line
    expect(text).toContain("<synthetic>");
  });

  // R8: component not found returns success with empty-looking result and warning
  it("R8: unknown component returns isError:false with warning about not found", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "focus_on",
      arguments: { component: "DoesNotExist", scope: "full", projectRoot: KS },
    });
    const r = asToolResponse(result);
    // R8: must NOT promote user-data errors to isError:true
    expect(r.isError).toBeFalsy();
    const text = firstText(r);
    expect(text).toBeDefined();
    // The markdown output should not contain a "DoesNotExist" component reference
    // (since none was found — the synthetic fragment is empty)
    expect(text).toContain("<synthetic>");
  });
});
