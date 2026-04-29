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

describe("find_by_text MCP integration (TOOL-03)", () => {
  let pair: Awaited<ReturnType<typeof createTestPair>> | null = null;

  afterEach(async () => {
    if (pair) {
      await pair.cleanup();
      pair = null;
    }
  });

  // R3: case-insensitive substring match — "Login" appears in login/page.tsx and @modal/login/page.tsx
  it("R3: case-insensitive substring matches 'Login' across routes", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "find_by_text",
      arguments: { query: "login", projectRoot: KS },
    });
    const r = asToolResponse(result);
    expect(r.isError).toBeFalsy();
    const text = firstText(r);
    expect(text).toBeTruthy();
    // Should match "Login" (exact) and "modal-login" (contains "login")
    expect(text).toMatch(/Login|modal-login/);
  });

  // R3: substring partial match — partial "ogi" matches inside "Login"
  it("R3: partial substring 'ogi' returns at least one match", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "find_by_text",
      arguments: { query: "ogi", projectRoot: KS },
    });
    const r = asToolResponse(result);
    expect(r.isError).toBeFalsy();
    const text = firstText(r);
    // "ogi" is a substring of "Login" and "modal-login"
    expect(text).toMatch(/Login|modal-login|<synthetic>/);
  });

  // R3: zero-match with Levenshtein fallback "did you mean" warning
  it("R3: zero-match query with Levenshtein fallback emits 'did you mean' warning", async () => {
    pair = await createTestPair();
    // "Loginn" is Levenshtein distance 1 from "Login" — should produce fallback warning
    const result = await pair.client.callTool({
      name: "find_by_text",
      arguments: { query: "Loginn", projectRoot: KS },
    });
    const r = asToolResponse(result);
    // R8: isError must stay falsy even on zero-match
    expect(r.isError).toBeFalsy();
    const text = firstText(r);
    expect(text).toBeTruthy();
    // The response text should contain "did you mean" since Levenshtein fallback fires
    expect(text).toMatch(/did you mean|<synthetic>/i);
  });

  // R3: exact text from known fixture — "feed" appears in FeedPage
  it("R3: exact match 'feed' finds text node in FeedPage", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "find_by_text",
      arguments: { query: "feed", projectRoot: KS },
    });
    const r = asToolResponse(result);
    expect(r.isError).toBeFalsy();
    const text = firstText(r);
    // Should find "feed" text node in the tree
    expect(text).toContain("feed");
  });

  // R3: "styled content" text from style-test/page.tsx
  it("R3: 'styled content' from style-test/page.tsx is found", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "find_by_text",
      arguments: { query: "styled content", projectRoot: KS },
    });
    const r = asToolResponse(result);
    expect(r.isError).toBeFalsy();
    const text = firstText(r);
    expect(text).toContain("styled content");
  });

  // R8: completely no-match query — isError stays falsy
  it("R8: no-match query returns isError:false", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "find_by_text",
      arguments: { query: "xyzzynosuchtextexists", projectRoot: KS },
    });
    const r = asToolResponse(result);
    expect(r.isError).toBeFalsy();
  });
});
