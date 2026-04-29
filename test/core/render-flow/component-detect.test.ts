/**
 * PARSE-04 acceptance: discoverComponents finds top-level function and class
 * components, and unwrapHocChain captures the full HOC stack in outer-to-inner
 * order. Drives the 5 HOC patterns + 3 class fixtures via it.each.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ParseContext } from "../../../src/adapters/types.js";
import { discoverComponents } from "../../../src/core/render-flow/component-detect.js";
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

function compsFor(fixtureRelDir: string, fixtureFile: string) {
  const ctx = makeCtx();
  const abs = path.resolve("test/fixtures/parser", fixtureRelDir, fixtureFile);
  const r = parseFile(ctx, abs);
  if (r.kind !== "ok") throw new Error(`parse failed: ${r.message}`);
  return discoverComponents(r.ast);
}

describe("PARSE-04 HOC unwrap", () => {
  it.each<[string, string[]]>([
    ["memo.tsx", ["memo"]],
    ["forward-ref.tsx", ["forwardRef"]],
    ["observer.tsx", ["observer"]],
    ["with-router.tsx", ["withRouter"]],
    ["xyz-hoc.tsx", ["xyzHOC"]],
  ])("%s → wrappers = %j", (file, expectedWrappers) => {
    const comps = compsFor("hoc", file);
    const foo = comps.find((c) => c.name === "Foo");
    expect(foo).toBeDefined();
    expect(foo?.wrappers).toEqual(expectedWrappers);
    expect(foo?.kind).toBe("function");
  });
});

describe("PARSE-04 class component extraction", () => {
  it.each([
    "extends-react-component.tsx",
    "extends-pure-component.tsx",
    "qualified.tsx",
  ])("%s → kind=class, wrappers=[]", (file) => {
    const comps = compsFor("classes", file);
    const foo = comps.find((c) => c.name === "Foo");
    expect(foo).toBeDefined();
    expect(foo?.kind).toBe("class");
    expect(foo?.wrappers).toEqual([]);
  });
});
