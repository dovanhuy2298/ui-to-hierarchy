import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ParseContext } from "../../../src/adapters/types.js";
import { extractStyledTemplates } from "../../../src/core/extractors/styled.js";
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

describe("OUT-03 styled-components extractor (D-10)", () => {
  it("captures styled.tag + styled(Component) with {?} placeholder", () => {
    const c = ctx();
    const r = parseFile(c, path.resolve("test/fixtures/parser/extractors/styled.tsx"));
    if (r.kind !== "ok") throw new Error("expected ok");
    const tpls = extractStyledTemplates(r.ast, r.source);
    expect(
      tpls.some(
        (tpl) =>
          tpl.tag === "div" &&
          tpl.body.includes("{?}") &&
          tpl.body.includes("color: red"),
      ),
    ).toBe(true);
    expect(
      tpls.some((tpl) => tpl.tag === "Box" && tpl.body.includes("background: blue")),
    ).toBe(true);
    // Interpolation placeholder rule: ${...} replaced by literal "{?}"
    expect(tpls.find((tpl) => tpl.tag === "div")?.body).toMatch(/\{\?\}/);
  });
});
