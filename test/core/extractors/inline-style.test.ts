import path from "node:path";
import type * as t from "@babel/types";
import { describe, expect, it } from "vitest";
import type { ParseContext } from "../../../src/adapters/types.js";
import { traverse } from "../../../src/core/babel-shim.js";
import { extractInlineStyle } from "../../../src/core/extractors/inline-style.js";
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

describe("OUT-03 inline style extractor", () => {
  it("captures literal pairs and raw-slices computed values", () => {
    const c = ctx();
    const r = parseFile(
      c,
      path.resolve("test/fixtures/parser/extractors/inline-style.tsx"),
    );
    if (r.kind !== "ok") throw new Error("expected ok");
    let result: Record<string, unknown> = {};
    traverse(r.ast, {
      JSXElement(p: { node: t.JSXElement }) {
        if (Object.keys(result).length === 0) {
          result = extractInlineStyle(p.node, r.source);
        }
      },
    });
    expect(result.color).toBe("red");
    expect(result.padding).toBe("8");
    expect(result.fontSize).toEqual({ raw: "dyn" });
    // Spread element captured under a synthetic key
    expect(Object.keys(result).some((k) => k.startsWith("__spread_"))).toBe(true);
  });
});
