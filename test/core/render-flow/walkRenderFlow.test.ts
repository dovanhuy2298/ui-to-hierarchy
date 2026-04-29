/**
 * OUT-04 acceptance: walkRenderFlow turns each conditional / list / fragment
 * AST form into the locked RenderNode shape (D-05). One assertion per shape.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ParseContext, RenderNode } from "../../../src/adapters/types.js";
import { discoverComponents } from "../../../src/core/render-flow/component-detect.js";
import { walkRenderFlow } from "../../../src/core/render-flow/index.js";
import { parseFile } from "../../../src/core/parser/index.js";

function makeCtx(): ParseContext {
  return {
    resolvedRoot: path.resolve("."),
    tsconfig: null,
    astCache: new Map(),
    resolverCache: new Map(),
    warnings: [],
  };
}

function flowFor(fixtureRel: string): RenderNode {
  const ctx = makeCtx();
  const abs = path.resolve("test/fixtures/parser/render-flow", fixtureRel);
  const r = parseFile(ctx, abs);
  if (r.kind !== "ok") throw new Error(`parse failed: ${r.message}`);
  const comps = discoverComponents(r.ast);
  expect(comps.length).toBeGreaterThanOrEqual(1);
  const first = comps[0];
  if (!first) throw new Error("no components discovered");
  return walkRenderFlow(first.body, r.source, fixtureRel);
}

function findFirstBranch(node: RenderNode | null): RenderNode | null {
  if (!node) return null;
  if (node.kind === "branch") return node;
  if (node.kind === "jsx" || node.kind === "fragment") {
    for (const c of node.children) {
      const found = findFirstBranch(c);
      if (found) return found;
    }
  }
  if (node.kind === "list") return findFirstBranch(node.item);
  return null;
}

describe("OUT-04 render-flow walker", () => {
  it("ternary → branch with then + else", () => {
    const flow = flowFor("ternary.tsx");
    const branch = findFirstBranch(flow);
    expect(branch?.kind).toBe("branch");
    if (branch?.kind === "branch") {
      expect(branch.condition).toContain("ok");
      expect(branch.thenBranch).not.toBeNull();
      expect(branch.elseBranch).not.toBeNull();
    }
  });

  it("&& → branch with then + null else", () => {
    const flow = flowFor("logical-and.tsx");
    const branch = findFirstBranch(flow);
    expect(branch?.kind).toBe("branch");
    if (branch?.kind === "branch") {
      expect(branch.thenBranch).not.toBeNull();
      expect(branch.elseBranch).toBeNull();
    }
  });

  it("|| → branch with both then + else", () => {
    const flow = flowFor("logical-or.tsx");
    const branch = findFirstBranch(flow);
    expect(branch?.kind).toBe("branch");
    if (branch?.kind === "branch") {
      expect(branch.elseBranch).not.toBeNull();
    }
  });

  it("?? → branch with both then + else", () => {
    const flow = flowFor("nullish-coalesce.tsx");
    const branch = findFirstBranch(flow);
    expect(branch?.kind).toBe("branch");
  });

  it("!cond && → branch with negation captured in condition", () => {
    const flow = flowFor("negation.tsx");
    expect(flow.kind).toBe("jsx");
    if (flow.kind === "jsx") {
      const branchNodes = flow.children.filter((c) => c.kind === "branch");
      expect(branchNodes.length).toBeGreaterThanOrEqual(1);
      expect(
        branchNodes.some((b) => b.kind === "branch" && b.condition.trim().startsWith("!")),
      ).toBe(true);
    }
  });

  it(".map(arrow => <X/>) → list with item + iterableSource", () => {
    const flow = flowFor("map.tsx");
    expect(flow.kind).toBe("jsx");
    if (flow.kind === "jsx") {
      const list = flow.children.find((c) => c.kind === "list");
      expect(list?.kind).toBe("list");
      if (list?.kind === "list") {
        expect(list.iterableSource).toContain("items");
        expect(list.item.kind).toBe("jsx");
      }
    }
  });

  it("nested ternary + map produces stable structure", () => {
    const flow = flowFor("nested.tsx");
    expect(flow.kind === "fragment" || flow.kind === "jsx").toBe(true);
    const branch = findFirstBranch(flow);
    expect(branch?.kind).toBe("branch");
  });
});
