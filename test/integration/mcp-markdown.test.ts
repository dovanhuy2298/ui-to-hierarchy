import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { spawnMcpClient } from "./_helpers.js";

// Phase 08-04 — POLISH-02 integration coverage for `format: "markdown"`.
//
// Per SPEC POLISH-02 and D-05/D-06/D-07 in 08-CONTEXT.md:
//   - Sibling file to mcp-e2e.test.ts; keeps that file JSON-focused (D-05).
//   - Uses shared spawn helper from _helpers.ts (D-06).
//   - Two fixtures: phase-05/micro + phase-05/kitchen-sink (D-07).
//   - Each case asserts: (a) at least one tree glyph, (b) every non-comment
//     line contains ` @ ` separator, (c) output contains no backslash (Windows guard).
//
// Tool choice: get_full_hierarchy — the simplest tool that drives renderMarkdown
// end-to-end across the wire.

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// micro: mutation-test has a valid root app/page.tsx (route: "/").
// kitchen-sink: has no root app/page.tsx (only sub-routes like /feed, /login).
// Per plan task-2 fallback: choose a route whose page.tsx exists. /feed is the
// minimal, no-imports route — exercises renderMarkdown without depending on
// any imported component resolution path.
interface MarkdownFixture {
  label: string;
  fixturePath: string;
  route: string;
}

const fixtures: MarkdownFixture[] = [
  {
    label: "phase-05/micro/mutation-test",
    fixturePath: resolve(__dirname, "../fixtures/phase-05/micro/mutation-test"),
    route: "/",
  },
  {
    label: "phase-05/kitchen-sink (route: /feed)",
    fixturePath: resolve(__dirname, "../fixtures/phase-05/kitchen-sink"),
    route: "/feed",
  },
];

function assertMarkdownContract(out: string, label: string): void {
  // (a) At least one tree glyph (├──, └──, or │) must be present.
  expect(out, `${label}: expected at least one tree glyph (├/└/│)`).toMatch(/[├└│]/);

  // (b) Every non-comment, non-empty line must contain the ` @ ` file:line separator.
  const lines = out.split("\n");
  for (const line of lines) {
    if (line.length === 0) continue;
    if (line.startsWith("<!--")) continue;
    expect(
      line,
      `${label}: non-comment line missing ' @ ' separator → ${JSON.stringify(line)}`,
    ).toContain(" @ ");
  }

  // (c) Backslash guard (D-07) — critical on Windows. No literal "\" anywhere.
  expect(out, `${label}: output must not contain a literal backslash`).not.toContain("\\");
}

for (const fx of fixtures) {
  describe(`MCP markdown integration — ${fx.label}`, () => {
    let client: Client;
    let transport: StdioClientTransport;
    let stderrChunks: Buffer[] = [];

    beforeAll(async () => {
      const spawned = await spawnMcpClient("phase-08-markdown-integration");
      client = spawned.client;
      transport = spawned.transport;
      stderrChunks = spawned.stderrChunks;
    }, 30_000);

    afterAll(async () => {
      await client.close();
      await transport.close();
    }, 10_000);

    it(
      "get_full_hierarchy: markdown output passes glyph + @-separator + no-backslash guards",
      async () => {
        const result = (await client.callTool({
          name: "get_full_hierarchy",
          arguments: {
            route: fx.route,
            format: "markdown",
            projectRoot: fx.fixturePath,
          },
        })) as { isError?: boolean; content: Array<{ type: string; text?: string }> };

        expect(
          result.isError,
          `${fx.label}: tool returned isError:true (stderr: ${Buffer.concat(stderrChunks).toString("utf8")})`,
        ).toBeFalsy();

        const out = result.content.find((c) => c.type === "text")?.text;
        expect(out, `${fx.label}: no text content in tool response`).toBeDefined();

        // Markdown is a raw string, NOT JSON. Do not parse.
        assertMarkdownContract(out as string, fx.label);
      },
      30_000,
    );
  });
}
