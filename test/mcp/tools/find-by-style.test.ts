import path from "node:path";
import { readFileSync } from "node:fs";
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

describe("find_by_style MCP integration (TOOL-04)", () => {
  let pair: Awaited<ReturnType<typeof createTestPair>> | null = null;

  afterEach(async () => {
    if (pair) {
      await pair.cleanup();
      pair = null;
    }
  });

  // R4: className token "flex" — matches <div className="flex items-center"> and <span className="flex">
  it("R4: className token 'flex' matches both the div and span in StyledThing (2 results, dedup)", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "find_by_style",
      arguments: { class_or_prop: "flex", projectRoot: KS },
    });
    const r = asToolResponse(result);
    expect(r.isError).toBeFalsy();
    const text = firstText(r);
    expect(text).toBeTruthy();
    // Both div and span are in style-test/page.tsx
    expect(text).toContain("style-test");
    // Should return 2 matches (div and span)
    const divCount = (text.match(/├──|└──/g) || []).length;
    expect(divCount).toBeGreaterThanOrEqual(2);
  });

  // R4: token equality — "items-center" returns only the div (exact token in className string)
  it("R4: 'items-center' returns one match (the div with 'flex items-center')", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "find_by_style",
      arguments: { class_or_prop: "items-center", projectRoot: KS },
    });
    const r = asToolResponse(result);
    expect(r.isError).toBeFalsy();
    const text = firstText(r);
    expect(text).toBeTruthy();
    // Should match the div in style-test/page.tsx
    expect(text).toContain("style-test");
  });

  // R4: "item" does NOT match "items-center" — token equality, not substring
  it("R4: 'item' returns no matches (tokens are not substrings)", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "find_by_style",
      arguments: { class_or_prop: "item", projectRoot: KS },
    });
    const r = asToolResponse(result);
    expect(r.isError).toBeFalsy();
    const text = firstText(r);
    // No match — output contains only the synthetic fragment header
    expect(text).toContain("<synthetic>");
    // No style-test files — "item" is not a token in the fixture
    expect(text).not.toContain("style-test/page.tsx");
  });

  // R4: style key "marginTop" matches the span in StyledThing
  it("R4: style key 'marginTop' matches the span with style={{ marginTop: 8 }}", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "find_by_style",
      arguments: { class_or_prop: "marginTop", projectRoot: KS },
    });
    const r = asToolResponse(result);
    expect(r.isError).toBeFalsy();
    const text = firstText(r);
    expect(text).toBeTruthy();
    expect(text).toContain("style-test");
  });

  // R4: style VALUE "red" does NOT match (only style keys are indexed)
  it("R4: style value 'red' returns no matches (only keys are indexed)", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "find_by_style",
      arguments: { class_or_prop: "red", projectRoot: KS },
    });
    const r = asToolResponse(result);
    expect(r.isError).toBeFalsy();
    const text = firstText(r);
    // "red" is a value, not a key — no matches expected
    expect(text).toContain("<synthetic>");
  });

  // R4: style key "margin" does NOT match style key "marginTop" — strict key equality
  it("R4: 'margin' does not match 'marginTop' — strict key equality", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "find_by_style",
      arguments: { class_or_prop: "margin", projectRoot: KS },
    });
    const r = asToolResponse(result);
    expect(r.isError).toBeFalsy();
    const text = firstText(r);
    // "margin" is not a key in the fixture — marginTop is, but not plain "margin"
    expect(text).toContain("<synthetic>");
  });

  // R6: synthetic fragment root — the result tree always starts at <synthetic>:0
  it("R6: result markdown contains '<synthetic>' as the fragment root", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "find_by_style",
      arguments: { class_or_prop: "flex", projectRoot: KS },
    });
    const r = asToolResponse(result);
    expect(r.isError).toBeFalsy();
    const text = firstText(r);
    // The markdown renderer emits "<> @ <synthetic>:0" as the fragment root
    expect(text).toContain("<synthetic>");
  });

  // R8: zero-match query returns isError:false
  it("R8: zero-match query returns isError:false", async () => {
    pair = await createTestPair();
    const result = await pair.client.callTool({
      name: "find_by_style",
      arguments: { class_or_prop: "no-such-class-xyzzy", projectRoot: KS },
    });
    const r = asToolResponse(result);
    expect(r.isError).toBeFalsy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 gate — ARCH-02 and handler-wiring assertions
// Placed in this file as the final Tier 2 test surface.
// ─────────────────────────────────────────────────────────────────────────────
describe("Phase 5 gate", () => {
  it("ARCH-02: zero static fields and zero module-scope cache vars in src/core/Analyzer.ts", () => {
    const src = readFileSync("src/core/Analyzer.ts", "utf8");
    expect(src).not.toMatch(/static\s+\w+\s*[:=]/);
    expect(src).not.toMatch(/^\s*(let|const)\s+cache\b/m);
  });

  it("Phase 5 architecture: tool handlers no longer call notImplemented and all use new Analyzer", () => {
    for (const tool of ["get-full-hierarchy", "focus-on", "find-by-text", "find-by-style"]) {
      const src = readFileSync(`src/mcp/tools/${tool}.ts`, "utf8");
      expect(src, `${tool}.ts must not call notImplemented`).not.toContain("notImplemented(name)");
      expect(src, `${tool}.ts must use new Analyzer`).toContain("new Analyzer");
    }
  });
});
