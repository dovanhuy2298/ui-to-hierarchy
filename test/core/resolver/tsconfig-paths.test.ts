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

describe("PARSE-03 tsconfig paths", () => {
  it("resolves @/* alias on shadcn-barrel fixture", () => {
    const ctx = ctxFor("test/fixtures/parser/resolver/shadcn-barrel");
    const fromFile = path.resolve("test/fixtures/parser/resolver/shadcn-barrel/src/page.tsx");
    const r = resolveModule(ctx, fromFile, "@/components/ui", "Button");
    expect(r.ok).toBe(true);
    if (r.ok && r.kind === "local") {
      expect(r.absolutePath.endsWith("/components/ui/button.tsx")).toBe(true);
      expect(r.absolutePath.includes("\\")).toBe(false);
    }
  });

  it("resolves multi-target paths first-wins (Foo from src/, Bar from lib/)", () => {
    const ctx = ctxFor("test/fixtures/parser/resolver/multi-target");
    const fromFile = path.resolve("test/fixtures/parser/resolver/multi-target/page.tsx");
    const foo = resolveModule(ctx, fromFile, "@/components/Foo", "Foo");
    const bar = resolveModule(ctx, fromFile, "@/components/Bar", "Bar");
    expect(foo.ok && foo.kind === "local" && foo.absolutePath.endsWith("/src/components/Foo.tsx")).toBe(true);
    expect(bar.ok && bar.kind === "local" && bar.absolutePath.endsWith("/lib/components/Bar.tsx")).toBe(true);
  });

  it("honors tsconfig.extends chain", () => {
    const ctx = ctxFor("test/fixtures/parser/resolver/extends-chain");
    const fromFile = path.resolve("test/fixtures/parser/resolver/extends-chain/src/x.ts");
    const r = resolveModule(ctx, fromFile, "#config/x", "X");
    expect(r.ok).toBe(true);
    if (r.ok && r.kind === "local") {
      expect(r.absolutePath.endsWith("/src/x.ts")).toBe(true);
      expect(r.absolutePath.includes("\\")).toBe(false);
    }
  });

  it("D-03 cache: identical key returns same object on re-entry", () => {
    const ctx = ctxFor("test/fixtures/parser/resolver/shadcn-barrel");
    const fromFile = path.resolve("test/fixtures/parser/resolver/shadcn-barrel/src/page.tsx");
    const a = resolveModule(ctx, fromFile, "@/components/ui", "Button");
    const b = resolveModule(ctx, fromFile, "@/components/ui", "Button");
    expect(a).toBe(b);
  });
});
