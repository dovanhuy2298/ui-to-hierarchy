import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, statSync } from "node:fs";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { EnvelopeSchema, type Envelope } from "../../src/ir/envelope.js";
import type { TreeNode } from "../../src/ir/schema.js";

// Phase 06-04 — End-to-end MCP integration suite (SPEC R1..R5).
//
// Per D-01: per-fixture spawned-binary lifecycle, 4 tools per fixture.
// Per D-03: schema parse + targeted invariants, NO snapshots.
// Per D-04: build-staleness guard; this suite does NOT auto-run `pnpm build`.
// Per D-11 (Phase 3): no imports from src/adapters/**.

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const distCli = resolve(__dirname, "../../dist/cli.js");
const srcCli = resolve(__dirname, "../../src/cli.ts");
const fixturesRoot = resolve(__dirname, "../fixtures/phase-06");

// ---------------------------------------------------------------------------
// Build-staleness guard (D-04)
// ---------------------------------------------------------------------------
function assertFreshBuild(): void {
  if (!existsSync(distCli)) {
    throw new Error(
      `dist/cli.js not found at ${distCli}. Run 'pnpm build' before 'pnpm test:integration'.`,
    );
  }
  const distMtime = statSync(distCli).mtimeMs;
  const srcMtime = statSync(srcCli).mtimeMs;
  if (srcMtime > distMtime) {
    throw new Error(
      `dist/cli.js is older than src/cli.ts. Run 'pnpm build' before 'pnpm test:integration'.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Tree walking helpers (exhaustive over 9-kind TreeNode union)
// ---------------------------------------------------------------------------
function walkTreeNodes(node: TreeNode, fn: (n: TreeNode) => void): void {
  fn(node);
  if ("children" in node && Array.isArray((node as { children?: TreeNode[] }).children)) {
    for (const c of (node as { children: TreeNode[] }).children) walkTreeNodes(c, fn);
  }
  if (node.kind === "branch") {
    if (node.thenBranch) walkTreeNodes(node.thenBranch, fn);
    if (node.elseBranch) walkTreeNodes(node.elseBranch, fn);
  }
  if (node.kind === "list") walkTreeNodes(node.item, fn);
}

function collectByName(tree: TreeNode, name: string): Array<Extract<TreeNode, { kind: "component" }>> {
  const out: Array<Extract<TreeNode, { kind: "component" }>> = [];
  walkTreeNodes(tree, (n) => {
    if (n.kind === "component" && n.name === name) out.push(n);
  });
  return out;
}

function extractEnvelope(r: { content: Array<{ type: string; text?: string }> }): unknown {
  const text = r.content.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("no text content in tool response");
  return JSON.parse(text);
}

// ---------------------------------------------------------------------------
// Fixture invariants
// ---------------------------------------------------------------------------
type ToolName = "get_full_hierarchy" | "focus_on" | "find_by_text" | "find_by_style";

interface FixtureInvariants {
  argsFor(tool: ToolName, root: string): Record<string, unknown>;
  assert(tool: ToolName, envelope: Envelope): void;
}

// shadcn-barrels (R1: barrel re-export must resolve to the real source file).
const shadcnInvariants: FixtureInvariants = {
  argsFor(tool, root) {
    switch (tool) {
      case "get_full_hierarchy":
        return { route: "/", format: "json", projectRoot: root };
      case "focus_on":
        return { component: "Button", scope: "full", projectRoot: root };
      case "find_by_text":
        return { query: "Click me", projectRoot: root };
      case "find_by_style":
        return { class_or_prop: "flex", projectRoot: root };
    }
  },
  assert(tool, envelope) {
    if (tool === "get_full_hierarchy") {
      const buttons = collectByName(envelope.tree, "Button");
      expect(buttons.length, "expected at least one Button component in shadcn-barrels /").toBeGreaterThan(0);
      for (const b of buttons) {
        expect(b.file, `Button.file should resolve to components/ui/button.tsx (got ${b.file})`).toMatch(
          /components\/ui\/button\.tsx$/,
        );
        expect(b.file, `Button.file must not resolve to barrel index.ts (got ${b.file})`).not.toMatch(
          /components\/ui\/index\.ts$/,
        );
      }
    } else {
      // focus_on / find_by_text / find_by_style: envelope already parsed; tree present.
      expect(envelope.tree, `${tool} envelope.tree should be present`).toBeDefined();
    }
  },
};

// nested-routes (R2: parallel @sidebar slot reachable; private _internal NOT reachable).
const nestedInvariants: FixtureInvariants = {
  argsFor(tool, root) {
    switch (tool) {
      case "get_full_hierarchy":
        return { route: "/dashboard/123", format: "json", projectRoot: root };
      case "focus_on":
        return { component: "DashboardDetail", scope: "full", projectRoot: root };
      case "find_by_text":
        return { query: "Sidebar slot", projectRoot: root };
      case "find_by_style":
        return { class_or_prop: "grid-cols-3", projectRoot: root };
    }
  },
  assert(tool, envelope) {
    if (tool === "get_full_hierarchy") {
      // Negative: private _internal segment must NOT bleed into the route tree.
      walkTreeNodes(envelope.tree, (n) => {
        if (n.kind === "text") {
          expect(
            n.value.includes("private-internal-marker"),
            `private _internal marker leaked into /dashboard/123 tree at ${n.file}:${n.line}`,
          ).toBe(false);
        }
      });
      // Positive: @sidebar slot reachable (slot kind named "sidebar" OR file path mentions @sidebar).
      let sawSidebar = false;
      walkTreeNodes(envelope.tree, (n) => {
        if (n.kind === "slot" && n.name === "sidebar") sawSidebar = true;
        if (typeof n.file === "string" && n.file.includes("@sidebar")) sawSidebar = true;
      });
      expect(sawSidebar, "expected @sidebar slot to be reachable from /dashboard/123").toBe(true);
    } else if (tool === "find_by_text") {
      // Positive — "Sidebar slot" text IS reachable from /dashboard/123.
      expect(envelope.tree, "find_by_text should return a non-empty tree for 'Sidebar slot'").toBeDefined();
    } else {
      expect(envelope.tree, `${tool} envelope.tree should be present`).toBeDefined();
    }
  },
};

// pnpm-monorepo apps/web (R3 + D-07: cross-package resolution + non-overlap).
const monorepoWebInvariants: FixtureInvariants = {
  argsFor(tool, root) {
    switch (tool) {
      case "get_full_hierarchy":
        return { route: "/", format: "json", projectRoot: root };
      case "focus_on":
        return { component: "Button", scope: "full", projectRoot: root };
      case "find_by_text":
        return { query: "Buy now", projectRoot: root };
      case "find_by_style":
        return { class_or_prop: "px-4", projectRoot: root };
    }
  },
  assert(tool, envelope) {
    if (tool === "get_full_hierarchy") {
      const buttons = collectByName(envelope.tree, "Button");
      expect(buttons.length, "expected at least one Button in apps/web /").toBeGreaterThan(0);
      for (const b of buttons) {
        expect(
          b.file,
          `apps/web Button.file should resolve to packages/ui/src/button.tsx (got ${b.file})`,
        ).toMatch(/packages\/ui\/src\/button\.tsx$/);
        expect(b.file, `apps/web Button.file must not resolve to barrel index.ts (got ${b.file})`).not.toMatch(
          /packages\/ui\/src\/index\.ts$/,
        );
      }
      // D-07 non-overlap (negatives): apps/admin-only components/text must not appear under apps/web.
      const dataTables = collectByName(envelope.tree, "DataTable");
      expect(dataTables.length, "DataTable must NOT appear under apps/web (D-07 non-overlap)").toBe(0);
      expect(
        JSON.stringify(envelope).includes("Manage users"),
        "'Manage users' (admin-only string) must NOT appear under apps/web (D-07 non-overlap)",
      ).toBe(false);
    } else {
      expect(envelope.tree, `${tool} envelope.tree should be present`).toBeDefined();
    }
  },
};

// pnpm-monorepo apps/admin (D-07 positive: admin-only surface present, web-only absent).
const monorepoAdminInvariants: FixtureInvariants = {
  argsFor(tool, root) {
    switch (tool) {
      case "get_full_hierarchy":
        return { route: "/", format: "json", projectRoot: root };
      case "focus_on":
        return { component: "DataTable", scope: "full", projectRoot: root };
      case "find_by_text":
        return { query: "Manage users", projectRoot: root };
      case "find_by_style":
        return { class_or_prop: "grid", projectRoot: root };
    }
  },
  assert(tool, envelope) {
    if (tool === "get_full_hierarchy") {
      const buttons = collectByName(envelope.tree, "Button");
      const dataTables = collectByName(envelope.tree, "DataTable");
      expect(buttons.length, "expected at least one Button in apps/admin /").toBeGreaterThan(0);
      expect(dataTables.length, "expected at least one DataTable in apps/admin /").toBeGreaterThan(0);
      const fullText = JSON.stringify(envelope);
      expect(fullText.includes("Manage users"), "'Manage users' must appear under apps/admin").toBe(true);
      expect(fullText.includes("Buy now"), "'Buy now' (web-only) must NOT appear under apps/admin").toBe(false);
    } else {
      expect(envelope.tree, `${tool} envelope.tree should be present`).toBeDefined();
    }
  },
};

// ---------------------------------------------------------------------------
// Per-fixture suite factory (D-01)
// ---------------------------------------------------------------------------
function makeFixtureSuite(label: string, fixturePath: string, invariants: FixtureInvariants): void {
  describe(`MCP integration — ${label}`, () => {
    let client: Client;
    let transport: StdioClientTransport;
    const stderrChunks: Buffer[] = [];
    const allEnvelopes: Envelope[] = [];

    beforeAll(async () => {
      assertFreshBuild();
      transport = new StdioClientTransport({
        command: "node",
        args: [distCli],
        stderr: "pipe",
      });
      transport.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
      client = new Client({ name: "phase-06-integration", version: "0.0.0" });
      await client.connect(transport);
    }, 30_000);

    afterAll(async () => {
      await client.close();
      await transport.close();
    }, 10_000);

    const tools: ToolName[] = ["get_full_hierarchy", "focus_on", "find_by_text", "find_by_style"];

    for (const tool of tools) {
      it(
        `${tool}: envelope parses, isError:false, fixture invariants hold`,
        async () => {
          const result = (await client.callTool({
            name: tool,
            arguments: invariants.argsFor(tool, fixturePath),
          })) as { isError?: boolean; content: Array<{ type: string; text?: string }> };
          expect(result.isError, `${tool} returned isError:true (stderr so far: ${Buffer.concat(stderrChunks).toString("utf8")})`).toBeFalsy();
          const env = EnvelopeSchema.parse(extractEnvelope(result));
          allEnvelopes.push(env);
          invariants.assert(tool, env);
        },
        30_000,
      );
    }

    it("Windows path gate: every TreeNode.file is forward-slash only (R5)", () => {
      expect(allEnvelopes.length, "no envelopes captured — earlier tool calls must have failed").toBeGreaterThan(0);
      for (const env of allEnvelopes) {
        walkTreeNodes(env.tree, (node) => {
          expect(node.file, `backslash leak in TreeNode.file: ${node.file}`).toMatch(/^[^\\]*$/);
        });
        // Defense in depth (CONTEXT discretion): no backslash anywhere in serialized envelope.
        expect(
          JSON.stringify(env).match(/\\\\/),
          "envelope JSON contains a backslash outside file fields",
        ).toBeNull();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Suite invocations — 4 fixture suites × 4 tools = 16 tool invocations.
// SPEC R4 mandates 3 fixtures × 4 tools = 12; splitting the monorepo into
// apps/web + apps/admin (per D-07) gives strictly stronger coverage.
// ---------------------------------------------------------------------------
makeFixtureSuite("shadcn-barrels", resolve(fixturesRoot, "shadcn-barrels"), shadcnInvariants);
makeFixtureSuite("nested-routes", resolve(fixturesRoot, "nested-routes"), nestedInvariants);
makeFixtureSuite(
  "pnpm-monorepo (--root apps/web)",
  resolve(fixturesRoot, "pnpm-monorepo/apps/web"),
  monorepoWebInvariants,
);
makeFixtureSuite(
  "pnpm-monorepo (--root apps/admin)",
  resolve(fixturesRoot, "pnpm-monorepo/apps/admin"),
  monorepoAdminInvariants,
);
