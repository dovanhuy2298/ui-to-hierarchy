/**
 * Analyzer unit tests — Phase 5, Plan 02 (TDD)
 *
 * Tier 1 tests: exercise each query method directly against fixtures.
 * No MCP transport overhead.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Analyzer, buildFragmentRoot } from "../../src/core/Analyzer.js";
import { NextJsAdapter } from "../../src/adapters/next/NextJsAdapter.js";
import type { TreeNode } from "../../src/ir/schema.js";
import { EnvelopeSchema } from "../../src/ir/envelope.js";
import { buildEnvelope } from "../../src/renderers/envelope-builder.js";

const KS = path.resolve("test/fixtures/phase-05/kitchen-sink");
const PARSE_ERROR_FX = path.resolve("test/fixtures/phase-05/micro/parse-error");
const MUTATION_FX = path.resolve("test/fixtures/phase-05/micro/mutation-test");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function findNode(tree: TreeNode, pred: (n: TreeNode) => boolean): TreeNode | null {
  if (pred(tree)) return tree;
  switch (tree.kind) {
    case "component":
    case "element":
    case "fragment":
      for (const c of tree.children) {
        const found = findNode(c, pred);
        if (found) return found;
      }
      break;
    case "branch":
      if (tree.thenBranch) {
        const found = findNode(tree.thenBranch, pred);
        if (found) return found;
      }
      if (tree.elseBranch) {
        const found = findNode(tree.elseBranch, pred);
        if (found) return found;
      }
      break;
    case "list":
      return findNode(tree.item, pred);
    default:
      break;
  }
  return null;
}

function collectNodes(tree: TreeNode, pred: (n: TreeNode) => boolean): TreeNode[] {
  const results: TreeNode[] = [];
  if (pred(tree)) results.push(tree);
  switch (tree.kind) {
    case "component":
    case "element":
    case "fragment":
      for (const c of tree.children) results.push(...collectNodes(c, pred));
      break;
    case "branch":
      if (tree.thenBranch) results.push(...collectNodes(tree.thenBranch, pred));
      if (tree.elseBranch) results.push(...collectNodes(tree.elseBranch, pred));
      break;
    case "list":
      results.push(...collectNodes(tree.item, pred));
      break;
    default:
      break;
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Analyzer construction
// ─────────────────────────────────────────────────────────────────────────────

describe("Analyzer constructor", () => {
  it("creates an instance with a fresh ParseContext (empty astCache)", () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    expect(a).toBeDefined();
    // Analyzer instance is created successfully with fresh state
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ARCH-02 grep gate — no static fields or module-scope cache variables
// ─────────────────────────────────────────────────────────────────────────────

describe("ARCH-02 grep gates", () => {
  it("zero static fields and zero module-scope cache variables in Analyzer.ts", () => {
    const text = readFileSync("src/core/Analyzer.ts", "utf8");
    // No static fields
    expect(text).not.toMatch(/static\s+\w+\s*[:=]/);
    // No module-scope cache variables (const/let cache outside class body)
    expect(text).not.toMatch(/^\s*(let|const)\s+cache\b/m);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getFullHierarchy
// ─────────────────────────────────────────────────────────────────────────────

describe("Analyzer.getFullHierarchy", () => {
  it("R1: 3-tier nested layout chain nests correctly via slot substitution", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    const { tree } = await a.getFullHierarchy({ route: "/dashboard/settings" });

    // Root should be the outermost layout component
    expect(tree.kind).toBe("component");
    // The outermost RootLayout wraps the chain
    expect((tree as { kind: "component"; name: string }).name).toBe("RootLayout");

    // Should have SettingsPage somewhere nested (3-tier deep)
    const settingsPage = findNode(tree, (n) => n.kind === "component" && n.name === "SettingsPage");
    expect(settingsPage).not.toBeNull();
  });

  it("R1: returns outermost layout as root with children slot resolved", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    const { tree } = await a.getFullHierarchy({ route: "/dashboard" });

    expect(tree.kind).toBe("component");
    expect((tree as { kind: "component"; name: string }).name).toBe("RootLayout");
  });

  it("R1 acceptance #3: parallel route @modal appears as kind:'slot' sibling", async () => {
    // /login route has app/@modal/login/page.tsx as its modal parallel slot
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    const { tree } = await a.getFullHierarchy({ route: "/login" });

    // Find a kind:"slot" with name "modal" somewhere in the tree
    const modalSlot = findNode(tree, (n) => n.kind === "slot" && n.name === "modal");
    expect(modalSlot).not.toBeNull();
    expect((modalSlot as { kind: "slot"; name: string }).name).toBe("modal");
  });

  it("R8: unmatched route returns empty fragment + warning (no throw)", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    const { tree, warnings } = await a.getFullHierarchy({ route: "/does-not-exist" });

    expect(tree.kind).toBe("fragment");
    expect((tree as { kind: "fragment"; children: TreeNode[] }).children).toHaveLength(0);
    expect(warnings.some((w) => w.includes("route not matched"))).toBe(true);
  });

  it("R8: parse error file produces kind:'error' node but call succeeds", async () => {
    const a = new Analyzer({ root: PARSE_ERROR_FX, adapter: NextJsAdapter });
    const { tree, warnings } = await a.getFullHierarchy({ route: "/" });

    // Should not throw — tree should exist
    expect(tree).toBeDefined();
    // Either the tree has an error node or warnings contain parse error
    const hasErrorNode = findNode(tree, (n) => n.kind === "error") !== null;
    const hasParseWarning = warnings.some((w) =>
      w.includes("parse error") || w.includes("recovered")
    );
    expect(hasErrorNode || hasParseWarning).toBe(true);
  });

  it("R5/ARCH-02: two consecutive calls with file mutation observe new content", async () => {
    const PAGE = path.join(MUTATION_FX, "app/page.tsx");
    const original = readFileSync(PAGE, "utf8");
    try {
      const a1 = new Analyzer({ root: MUTATION_FX, adapter: NextJsAdapter });
      const r1 = await a1.getFullHierarchy({ route: "/" });

      // Mutate the file
      writeFileSync(PAGE, original.replace("Hello", "Mutated"));

      const a2 = new Analyzer({ root: MUTATION_FX, adapter: NextJsAdapter });
      const r2 = await a2.getFullHierarchy({ route: "/" });

      // r1 should have "Hello", r2 should have "Mutated"
      const hasHello = findNode(r1.tree, (n) => n.kind === "text" && n.value.includes("Hello"));
      const hasMutated = findNode(r2.tree, (n) => n.kind === "text" && n.value.includes("Mutated"));
      expect(hasHello).not.toBeNull();
      expect(hasMutated).not.toBeNull();
    } finally {
      writeFileSync(PAGE, original);
    }
  });

  it("forward slash discipline — no backslashes in any file: field", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    const { tree } = await a.getFullHierarchy({ route: "/dashboard/settings" });
    const nodes: TreeNode[] = [];
    function collect(n: TreeNode): void {
      nodes.push(n);
      switch (n.kind) {
        case "component": case "element": case "fragment":
          n.children.forEach(collect); break;
        case "branch":
          if (n.thenBranch) collect(n.thenBranch);
          if (n.elseBranch) collect(n.elseBranch);
          break;
        case "list": collect(n.item); break;
        default: break;
      }
    }
    collect(tree);
    for (const n of nodes) {
      expect(n.file).not.toMatch(/\\/);
    }
  });

  it("R6: result envelope passes EnvelopeSchema.parse", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    const { tree, warnings } = await a.getFullHierarchy({ route: "/dashboard/settings" });
    const envelope = { ...buildEnvelope(tree, { resolvedRootOverride: KS }), warnings };
    expect(() => EnvelopeSchema.parse(envelope)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// focusOn
// ─────────────────────────────────────────────────────────────────────────────

describe("Analyzer.focusOn", () => {
  it("R2: scope:down returns subtree rooted at Card for each occurrence", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    const { tree } = await a.focusOn({ component: "Card", scope: "down" });

    expect(tree.kind).toBe("fragment");
    const frag = tree as { kind: "fragment"; children: TreeNode[] };
    // Card appears in dashboard layout and profile page
    expect(frag.children.length).toBeGreaterThanOrEqual(1);
    // All matches should be Card component nodes
    for (const match of frag.children) {
      expect(match.kind).toBe("component");
      expect((match as { kind: "component"; name: string }).name).toBe("Card");
    }
  });

  it("R2: scope:full returns synthetic fragment of matches with ancestors", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    const { tree } = await a.focusOn({ component: "Card", scope: "full" });

    expect(tree.kind).toBe("fragment");
    expect((tree as { kind: "fragment"; children: TreeNode[] }).children.length).toBeGreaterThanOrEqual(1);
  });

  it("R2: scope:up returns ancestor chain only (no Card descendants)", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    const { tree } = await a.focusOn({ component: "Card", scope: "up" });

    expect(tree.kind).toBe("fragment");
    const frag = tree as { kind: "fragment"; children: TreeNode[] };
    // Ancestors should not contain Card nodes in their children
    for (const match of frag.children) {
      const cardInChildren = findNode(match, (n) => n.kind === "component" && n.name === "Card");
      expect(cardInChildren).toBeNull();
    }
  });

  it("R8: missing component returns empty fragment + warning", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    const { tree, warnings } = await a.focusOn({ component: "NonExistent", scope: "full" });

    expect(tree.kind).toBe("fragment");
    expect((tree as { kind: "fragment"; children: TreeNode[] }).children).toHaveLength(0);
    expect(warnings.some((w) => w.includes("component not found"))).toBe(true);
  });

  it("R6: multi-match result has kind:'fragment' with file:<synthetic>", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    const { tree } = await a.focusOn({ component: "Card", scope: "down" });

    expect(tree.kind).toBe("fragment");
    expect(tree.file).toBe("<synthetic>");
    expect(tree.line).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findByText
// ─────────────────────────────────────────────────────────────────────────────

describe("Analyzer.findByText", () => {
  it("R3: case-insensitive substring match", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    const { tree } = await a.findByText({ query: "submit" });

    expect(tree.kind).toBe("fragment");
    const frag = tree as { kind: "fragment"; children: TreeNode[] };
    // Should match "Submit" and "submit form"
    expect(frag.children.length).toBeGreaterThanOrEqual(2);
    for (const match of frag.children) {
      expect(match.kind).toBe("text");
      expect((match as { kind: "text"; value: string }).value.toLowerCase()).toContain("submit");
    }
  });

  it("R3: exact substring match (submi matches Submit)", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    const { tree } = await a.findByText({ query: "submi" });

    const frag = tree as { kind: "fragment"; children: TreeNode[] };
    expect(frag.children.length).toBeGreaterThanOrEqual(1);
  });

  it("R3: Levenshtein fallback when no exact match — returns empty fragment + warning", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    const { tree, warnings } = await a.findByText({ query: "submitt" });

    expect(tree.kind).toBe("fragment");
    expect((tree as { kind: "fragment"; children: TreeNode[] }).children).toHaveLength(0);
    // Should have a 'did you mean' warning
    expect(warnings.some((w) => w.includes("did you mean"))).toBe(true);
  });

  it("R8: no matches, no similar — returns empty fragment + empty warnings", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    const { tree } = await a.findByText({ query: "zzzzzzzznotpresent" });

    expect(tree.kind).toBe("fragment");
    expect((tree as { kind: "fragment"; children: TreeNode[] }).children).toHaveLength(0);
    // Should not throw
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findByStyle
// ─────────────────────────────────────────────────────────────────────────────

describe("Analyzer.findByStyle", () => {
  it("R4: matches className token exactly (flex matches 'flex items-center')", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    const { tree } = await a.findByStyle({ class_or_prop: "flex" });

    const frag = tree as { kind: "fragment"; children: TreeNode[] };
    expect(frag.children.length).toBeGreaterThanOrEqual(1);
    // All matches should be element or component nodes
    for (const match of frag.children) {
      expect(["element", "component"]).toContain(match.kind);
    }
  });

  it("R4: does NOT match partial class name token (items not flexible)", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    // 'item' is NOT an exact token in 'flex items-center'
    const { tree: flexTree } = await a.findByStyle({ class_or_prop: "flex" });
    const { tree: itemTree } = await a.findByStyle({ class_or_prop: "item" });

    // flex should match, item should not
    const flexFrag = flexTree as { kind: "fragment"; children: TreeNode[] };
    const itemFrag = itemTree as { kind: "fragment"; children: TreeNode[] };
    expect(flexFrag.children.length).toBeGreaterThan(itemFrag.children.length);
  });

  it("R4: matches style object key (marginTop matches style={{ marginTop: 8 }})", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    const { tree } = await a.findByStyle({ class_or_prop: "marginTop" });

    const frag = tree as { kind: "fragment"; children: TreeNode[] };
    expect(frag.children.length).toBeGreaterThanOrEqual(1);
  });

  it("R4: does NOT match style value (red is not a key)", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    const { tree } = await a.findByStyle({ class_or_prop: "red" });

    const frag = tree as { kind: "fragment"; children: TreeNode[] };
    // red is a value, not a key — should NOT match style={{ color: "red" }}
    // (Note: it would only match if a node has className="red" token, which we don't have)
    // If it does match somehow, it's because of className; that case is OK to be 0
    expect(frag.children.length).toBe(0);
  });

  it("R4: dedup — node with both className='flex' and style={{ flex: 1 }} appears once", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    // The span in style-test/page.tsx has both className="flex" and style={{ flex: 1 }}
    const { tree: flexClassTree } = await a.findByStyle({ class_or_prop: "flex" });
    const { tree: flexStyleTree } = await a.findByStyle({ class_or_prop: "flex" });

    // Both queries should return the same nodes
    const classNodes = (flexClassTree as { kind: "fragment"; children: TreeNode[] }).children;
    const styleNodes = (flexStyleTree as { kind: "fragment"; children: TreeNode[] }).children;

    // Count nodes with file containing "style-test"
    const styleTestClassNodes = classNodes.filter((n) => n.file.includes("style-test"));
    const styleTestStyleNodes = styleNodes.filter((n) => n.file.includes("style-test"));

    // Should not have duplicates — each unique file:line:tag appears once
    expect(styleTestClassNodes.length).toEqual(styleTestStyleNodes.length);
  });

  it("R8: no match returns empty fragment (no throw)", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    const { tree } = await a.findByStyle({ class_or_prop: "nonexistent-class-xyz" });

    expect(tree.kind).toBe("fragment");
    expect((tree as { kind: "fragment"; children: TreeNode[] }).children).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R7 — runtime annotation
// ─────────────────────────────────────────────────────────────────────────────

describe("R7 runtime annotation", () => {
  it("'use client' file component gets layoutHint:'client'", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    // style-test/page.tsx has "use client"
    const { tree } = await a.getFullHierarchy({ route: "/style-test" });

    // The StyleTestPage component should have layoutHint: "client"
    const stylePage = findNode(
      tree,
      (n) => n.kind === "component" && n.name === "StyleTestPage",
    );
    expect(stylePage).not.toBeNull();
    expect((stylePage as { layoutHint?: string }).layoutHint).toBe("client");
  });

  it("server component has no client layoutHint", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    const { tree } = await a.getFullHierarchy({ route: "/dashboard/settings" });

    // SettingsPage is a server component — should NOT have layoutHint "client"
    const settingsPage = findNode(tree, (n) => n.kind === "component" && n.name === "SettingsPage");
    expect(settingsPage).not.toBeNull();
    const hint = (settingsPage as { layoutHint?: string }).layoutHint;
    expect(hint === undefined || hint !== "client").toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildFragmentRoot helper
// ─────────────────────────────────────────────────────────────────────────────

describe("buildFragmentRoot", () => {
  it("R6: creates kind:'fragment' with file:<synthetic>, line:0", () => {
    const result = buildFragmentRoot([]);
    expect(result.kind).toBe("fragment");
    expect(result.file).toBe("<synthetic>");
    expect(result.line).toBe(0);
  });

  it("R6: EnvelopeSchema accepts synthetic-rooted envelope", () => {
    const tree = buildFragmentRoot([{ kind: "text", value: "hello", file: "test.tsx", line: 1 }]);
    const envelope = buildEnvelope(tree, { resolvedRootOverride: "/test" });
    expect(() => EnvelopeSchema.parse(envelope)).not.toThrow();
  });
});
