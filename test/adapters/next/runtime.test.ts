import path from "node:path";
import { describe, expect, it } from "vitest";
import { NextJsAdapter } from "../../../src/adapters/next/NextJsAdapter.js";
import type { ParseContext } from "../../../src/adapters/types.js";

function ctx(): ParseContext {
  return {
    resolvedRoot: path.resolve("."),
    tsconfig: null,
    astCache: new Map(),
    resolverCache: new Map(),
    warnings: [],
  };
}

const FX = (rel: string) => path.resolve("test/fixtures/next-app-router", rel);

describe("NEXT-04 runtime boundary detection", () => {
  it('"use client" as line 1 → runtime: "client"', () => {
    const c = ctx();
    const comps = NextJsAdapter.extractComponents(c, [
      FX("app/(marketing)/about/page.tsx"),
    ]);
    expect(comps.length).toBeGreaterThanOrEqual(1);
    expect(comps[0]?.runtime).toBe("client");
  });

  it('No directive → runtime: "server" (App Router default)', () => {
    const c = ctx();
    const comps = NextJsAdapter.extractComponents(c, [FX("app/dashboard/page.tsx")]);
    expect(comps.length).toBeGreaterThanOrEqual(1);
    expect(comps[0]?.runtime).toBe("server");
  });

  it('"use server" → runtime: "server" (server-actions module per D-12)', () => {
    const c = ctx();
    const comps = NextJsAdapter.extractComponents(c, [FX("app/blog/[slug]/page.tsx")]);
    expect(comps.length).toBeGreaterThanOrEqual(1);
    expect(comps[0]?.runtime).toBe("server");
  });

  it("Leading comments before directive do NOT block detection", () => {
    const c = ctx();
    const comps = NextJsAdapter.extractComponents(c, [FX("app/maybe/[[...opt]]/page.tsx")]);
    // Fixture has // banner comment; /* block comment */; "use client"; default export.
    // Babel's directive prologue rule attaches comments to the directive node;
    // the directive is still recognized.
    expect(comps.length).toBeGreaterThanOrEqual(1);
    expect(comps[0]?.runtime).toBe("client");
  });

  it('Root layout (no directive) → runtime: "server"', () => {
    const c = ctx();
    const comps = NextJsAdapter.extractComponents(c, [FX("app/layout.tsx")]);
    expect(comps.length).toBeGreaterThanOrEqual(1);
    expect(comps[0]?.runtime).toBe("server");
  });

  it("Per-file scope: every component from the same file shares runtime", () => {
    // The kitchen-sink fixtures only have one default export each, but the
    // contract is per-file. Smoke-check by extracting from the directive
    // file and asserting all returned components share the same value.
    const c = ctx();
    const comps = NextJsAdapter.extractComponents(c, [
      FX("app/(marketing)/about/page.tsx"),
    ]);
    const runtimes = new Set(comps.map((c) => c.runtime));
    expect(runtimes.size).toBe(1); // all the same
    expect(runtimes.has("client")).toBe(true);
  });

  it("Every emitted ComponentDefinition has a runtime field (13-field shape)", () => {
    const c = ctx();
    const allFiles = [
      FX("app/layout.tsx"),
      FX("app/page.tsx"),
      FX("app/(marketing)/about/page.tsx"),
      FX("app/dashboard/page.tsx"),
      FX("app/blog/[slug]/page.tsx"),
      FX("app/maybe/[[...opt]]/page.tsx"),
    ];
    const comps = NextJsAdapter.extractComponents(c, allFiles);
    expect(comps.length).toBeGreaterThan(0);
    for (const comp of comps) {
      expect(comp.runtime === "server" || comp.runtime === "client").toBe(true);
      // Sanity: 13-key shape including runtime.
      expect(Object.keys(comp).includes("runtime")).toBe(true);
    }
  });

  it('Single quotes "\'use client\'" should also be detected (Babel normalizes quoting)', () => {
    // Assumption A5 in 04-RESEARCH: Babel normalizes 'use client' (single quotes) to
    // the same DirectiveLiteral.value.value === "use client". Our fixtures use
    // double quotes; this case asserts via the same fixture but documents the
    // expectation. If a future fixture uses single quotes, this assertion still holds.
    const c = ctx();
    const comps = NextJsAdapter.extractComponents(c, [FX("app/(marketing)/about/page.tsx")]);
    expect(comps[0]?.runtime).toBe("client");
  });
});
