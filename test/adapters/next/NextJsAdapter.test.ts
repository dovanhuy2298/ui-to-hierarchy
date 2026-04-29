import path from "node:path";
import { describe, expect, it } from "vitest";
import { NextJsAdapter } from "../../../src/adapters/next/NextJsAdapter.js";
import type { ParseContext } from "../../../src/adapters/types.js";

function ctx(rootRel = "."): ParseContext {
  return {
    resolvedRoot: path.resolve(rootRel),
    tsconfig: null,
    astCache: new Map(),
    resolverCache: new Map(),
    warnings: [],
  };
}

describe("ARCH-01 / SPEC R7 NextJsAdapter", () => {
  it("implements 5 methods (FrameworkAdapter shape)", () => {
    expect(typeof NextJsAdapter.detect).toBe("function");
    expect(typeof NextJsAdapter.discoverEntries).toBe("function");
    expect(typeof NextJsAdapter.resolveModule).toBe("function");
    expect(typeof NextJsAdapter.extractComponents).toBe("function");
    expect(typeof NextJsAdapter.mapRouteToEntry).toBe("function");
  });

  it('detect / discoverEntries / mapRouteToEntry throw "not implemented in Phase 3"', () => {
    expect(() => NextJsAdapter.detect("/x")).toThrow(/not implemented in Phase 3/);
    expect(() => NextJsAdapter.discoverEntries("/x")).toThrow(/not implemented in Phase 3/);
    expect(() => NextJsAdapter.mapRouteToEntry("/x", "/")).toThrow(/not implemented in Phase 3/);
  });

  it("extractComponents returns ComponentDefinition[] on a simple function fixture", () => {
    const c = ctx();
    const comps = NextJsAdapter.extractComponents(c, [
      path.resolve("test/fixtures/parser/render-flow/ternary.tsx"),
    ]);
    expect(comps.length).toBeGreaterThanOrEqual(1);
    const T = comps.find((x) => x.name === "T");
    expect(T).toBeDefined();
    if (!T) return;
    expect(T.kind).toBe("function");
    expect(T.wrappers).toEqual([]);
    expect(T.renderFlow.kind).toBe("jsx");
    // Forward-slash discipline — emitted file path must contain no backslashes.
    expect(T.file.includes("\\")).toBe(false);
    // Locked R8 11-field shape (Object.keys length === 12 because the type
    // count is 12 — name, file, line, kind, wrappers, props, textContent,
    // renderFlow, classNames, inlineStyles, cssModuleRefs, styledTemplates).
    expect(Object.keys(T).sort()).toEqual(
      [
        "classNames",
        "cssModuleRefs",
        "file",
        "inlineStyles",
        "kind",
        "line",
        "name",
        "props",
        "renderFlow",
        "styledTemplates",
        "textContent",
        "wrappers",
      ].sort(),
    );
  });

  it("extractComponents preserves HOC wrappers (PARSE-04)", () => {
    const c = ctx();
    const comps = NextJsAdapter.extractComponents(c, [
      path.resolve("test/fixtures/parser/hoc/memo.tsx"),
    ]);
    const Foo = comps.find((x) => x.name === "Foo");
    expect(Foo).toBeDefined();
    if (!Foo) return;
    expect(Foo.wrappers).toEqual(["memo"]);
  });

  it("extractComponents NEVER throws on parse-error files (D-12)", () => {
    const c = ctx();
    const fixture = path.resolve("test/fixtures/parser/parse-errors/syntax-error.tsx");
    expect(() => NextJsAdapter.extractComponents(c, [fixture])).not.toThrow();
    const comps = NextJsAdapter.extractComponents(c, [fixture]);
    expect(comps.length).toBeGreaterThanOrEqual(1);
    // The parser may either fail outright (kind:"error" component synthesized
    // by NextJsAdapter) or recover (real components emitted with
    // renderFlow.kind === "error" if no JSX was found). In either case the
    // first component's renderFlow must be an "error" node.
    const first = comps[0];
    expect(first).toBeDefined();
    if (!first) return;
    expect(first.renderFlow.kind).toBe("error");
  });
});
