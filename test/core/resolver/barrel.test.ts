import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ParseContext } from "../../../src/adapters/types.js";
import { resolveModule } from "../../../src/core/resolver/index.js";

function ctxFor(rootRel: string): ParseContext {
  return {
    resolvedRoot: path.resolve(rootRel),
    tsconfig: null,
    astCache: new Map(),
    resolverCache: new Map(),
    warnings: [],
  };
}

describe("PARSE-02 barrel chase", () => {
  it("chases shadcn-style barrel to source file", () => {
    const ctx = ctxFor("test/fixtures/parser/resolver/shadcn-barrel");
    const fromFile = path.resolve("test/fixtures/parser/resolver/shadcn-barrel/src/page.tsx");
    const r = resolveModule(ctx, fromFile, "@/components/ui", "Button");
    expect(r.ok && r.kind === "local").toBe(true);
    if (r.ok && r.kind === "local") {
      expect(r.absolutePath.endsWith("/components/ui/button.tsx")).toBe(true);
      expect(r.absolutePath.includes("\\")).toBe(false);
    }
  });

  it("emits cycle for a -> b -> a re-export cycle (no stack overflow)", () => {
    const ctx = ctxFor("test/fixtures/parser/resolver/barrel-cycle");
    const fromFile = path.resolve("test/fixtures/parser/resolver/barrel-cycle/src/page.tsx");
    const r = resolveModule(ctx, fromFile, "@/a", "Thing");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind === "cycle").toBe(true);
      if (r.kind === "cycle") {
        expect(r.chain.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("never throws on missing import — returns not-found", () => {
    const ctx = ctxFor("test/fixtures/parser/resolver/shadcn-barrel");
    const fromFile = path.resolve("test/fixtures/parser/resolver/shadcn-barrel/src/page.tsx");
    expect(() => resolveModule(ctx, fromFile, "@/does/not/exist", "Whatever")).not.toThrow();
    const r = resolveModule(ctx, fromFile, "@/does/not/exist", "Whatever");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("not-found");
  });
});
