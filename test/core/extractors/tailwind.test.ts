import path from "node:path";
import * as t from "@babel/types";
import { describe, expect, it } from "vitest";
import type { ParseContext } from "../../../src/adapters/types.js";
import { traverse } from "../../../src/core/babel-shim.js";
import {
  isLayoutClass,
  stripVariants,
} from "../../../src/core/extractors/tailwind/layout-prefixes.js";
import { extractTailwindClasses } from "../../../src/core/extractors/tailwind/index.js";
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

function jsxElements(ast: t.File): t.JSXElement[] {
  const out: t.JSXElement[] = [];
  traverse(ast, {
    JSXElement(p: { node: t.JSXElement }) {
      out.push(p.node);
    },
  });
  return out;
}

describe("OUT-02 Tailwind layout-only filter (D-08)", () => {
  it("strips variants per D-08 regex", () => {
    expect(stripVariants("md:flex")).toBe("flex");
    expect(stripVariants("dark:hover:flex")).toBe("flex");
    expect(stripVariants("[&>svg]:size-6")).toBe("size-6");
  });

  it("classifies layout vs non-layout tokens", () => {
    expect(isLayoutClass("flex")).toBe(true);
    expect(isLayoutClass("md:flex-col")).toBe(true);
    expect(isLayoutClass("[&>svg]:size-6")).toBe(true);
    expect(isLayoutClass("p-4")).toBe(true);
    expect(isLayoutClass("text-red-500")).toBe(false);
    expect(isLayoutClass("rounded-md")).toBe(false);
    expect(isLayoutClass("hover:text-blue-500")).toBe(false);
  });

  it("default fullClasses=false keeps layout literals + all raw tokens", () => {
    const c = ctx();
    const r = parseFile(
      c,
      path.resolve("test/fixtures/parser/extractors/tailwind-only.tsx"),
    );
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const els = jsxElements(r.ast);
    const allTokens = els.flatMap((el) =>
      extractTailwindClasses(el, r.source, "tailwind-only.tsx", { fullClasses: false }),
    );
    const literalValues = allTokens
      .filter((tok) => tok.kind === "literal")
      .map((tok) => tok.value);
    expect(literalValues).toContain("flex");
    expect(literalValues).toContain("items-center");
    expect(literalValues).toContain("md:flex-col");
    expect(literalValues).toContain("[&>svg]:size-6");
    expect(literalValues).toContain("p-4");
    expect(literalValues).toContain("gap-2");
    expect(literalValues).not.toContain("text-red-500");
    expect(literalValues).not.toContain("rounded-md");
    expect(literalValues).not.toContain("hover:text-blue-500");
    // Raw tokens preserved (dynamic class reference / computed key)
    expect(allTokens.some((tok) => tok.kind === "raw")).toBe(true);
  });

  it("fullClasses=true returns every literal + raw token", () => {
    const c = ctx();
    const r = parseFile(
      c,
      path.resolve("test/fixtures/parser/extractors/tailwind-only.tsx"),
    );
    if (r.kind !== "ok") throw new Error("expected ok");
    const els = jsxElements(r.ast);
    const allTokens = els.flatMap((el) =>
      extractTailwindClasses(el, r.source, "tailwind-only.tsx", { fullClasses: true }),
    );
    const literals = allTokens
      .filter((tok) => tok.kind === "literal")
      .map((tok) => tok.value);
    expect(literals).toContain("text-red-500");
    expect(literals).toContain("rounded-md");
    expect(literals).toContain("hover:text-blue-500");
  });
});
