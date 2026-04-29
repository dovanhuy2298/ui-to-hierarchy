import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ParseContext } from "../../../src/adapters/types.js";
import { extractCssModuleRefs } from "../../../src/core/extractors/css-module.js";
import { parseFile } from "../../../src/core/parser/index.js";

function ctx(): ParseContext {
  return {
    resolvedRoot: path.resolve("."),
    tsconfig: null,
    astCache: new Map(),
    resolverCache: new Map(),
    warnings: [],
  };
}

describe("OUT-03 CSS Modules ref extractor", () => {
  it("emits binding/key/source for each styles.X member access", () => {
    const c = ctx();
    const r = parseFile(
      c,
      path.resolve("test/fixtures/parser/extractors/css-module.tsx"),
    );
    if (r.kind !== "ok") throw new Error("expected ok");
    const refs = extractCssModuleRefs(r.ast);
    expect(refs.length).toBeGreaterThanOrEqual(3);
    expect(
      refs.some(
        (x) =>
          x.binding === "styles" && x.key === "root" && x.source.endsWith(".module.css"),
      ),
    ).toBe(true);
    expect(refs.some((x) => x.binding === "styles" && x.key === "title")).toBe(true);
    expect(refs.some((x) => x.binding === "nsStyles" && x.key === "italic")).toBe(true);
  });
});
