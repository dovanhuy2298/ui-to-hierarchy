import type * as t from "@babel/types";
import { describe, expect, it } from "vitest";
import { flattenStyleArray } from "../../../../src/core/styles/rn/index.js";
import { parse } from "@babel/parser";
import { traverse } from "../../../../src/core/babel-shim.js";

/**
 * Build a JSXExpressionContainer from a style array source snippet.
 * Wraps the array in `<View style={${arraySrc}} />` and extracts the style attribute value.
 */
function buildArrayContainer(arraySrc: string): {
  node: t.JSXExpressionContainer;
  source: string;
} {
  const source = `<View style={${arraySrc}} />`;
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });
  let container: t.JSXExpressionContainer | null = null;
  traverse(ast, {
    JSXElement(path: { node: t.JSXElement }) {
      const styleAttr = path.node.openingElement.attributes.find(
        (a): a is t.JSXAttribute =>
          a.type === "JSXAttribute" &&
          a.name.type === "JSXIdentifier" &&
          a.name.name === "style",
      );
      if (styleAttr && styleAttr.value?.type === "JSXExpressionContainer") {
        container = styleAttr.value as t.JSXExpressionContainer;
      }
    },
  });
  if (!container) throw new Error("No JSXExpressionContainer found");
  return { node: container, source };
}

describe("RN-06 flattenStyleArray", () => {
  it("resolves MemberExpression styles.card to fileStyleIndex keys", () => {
    const { node, source } = buildArrayContainer("[styles.card]");
    const index = new Map([["styles", ["card", "bold"]]]);
    const warnings: string[] = [];
    const result = flattenStyleArray(node, index, source, warnings, "test.tsx");
    expect(result).toEqual(["card", "bold"]);
    expect(warnings).toHaveLength(0);
  });

  it("unions keys from two MemberExpression members styles.card + styles.bold", () => {
    const { node, source } = buildArrayContainer("[styles.card, styles.bold]");
    const index = new Map([["styles", ["card", "bold"]]]);
    const warnings: string[] = [];
    const result = flattenStyleArray(node, index, source, warnings, "test.tsx");
    // Same varName → keys appended twice (union, not dedup required by SPEC)
    expect(result).toContain("card");
    expect(result).toContain("bold");
    expect(warnings).toHaveLength(0);
  });

  it("includes right-side keys from LogicalExpression && conditional", () => {
    const { node, source } = buildArrayContainer("[active && styles.bold]");
    const index = new Map([["styles", ["card", "bold"]]]);
    const warnings: string[] = [];
    const result = flattenStyleArray(node, index, source, warnings, "test.tsx");
    expect(result).toContain("card");
    expect(result).toContain("bold");
    expect(warnings).toHaveLength(0);
  });

  it("includes right-side keys from LogicalExpression || conditional", () => {
    const { node, source } = buildArrayContainer("[a || styles.b]");
    const index = new Map([["styles", ["b", "c"]]]);
    const warnings: string[] = [];
    const result = flattenStyleArray(node, index, source, warnings, "test.tsx");
    expect(result).toContain("b");
    expect(result).toContain("c");
    expect(warnings).toHaveLength(0);
  });

  it("passes StringLiteral element through as a key", () => {
    const { node, source } = buildArrayContainer(`["text-lg"]`);
    const index = new Map<string, string[]>();
    const warnings: string[] = [];
    const result = flattenStyleArray(node, index, source, warnings, "test.tsx");
    expect(result).toEqual(["text-lg"]);
    expect(warnings).toHaveLength(0);
  });

  it("skips null sparse-array hole and BooleanLiteral false element", () => {
    const { node, source } = buildArrayContainer("[null, false, styles.card]");
    const index = new Map([["styles", ["card"]]]);
    const warnings: string[] = [];
    const result = flattenStyleArray(node, index, source, warnings, "test.tsx");
    expect(result).toEqual(["card"]);
    expect(warnings).toHaveLength(0);
  });

  it("warns on CallExpression element and skips it", () => {
    const { node, source } = buildArrayContainer("[fn()]");
    const index = new Map<string, string[]>();
    const warnings: string[] = [];
    const result = flattenStyleArray(node, index, source, warnings, "test.tsx");
    expect(result).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Unsupported style array element (call expr)");
    expect(warnings[0]).toContain("test.tsx");
  });

  it("warns on nested ArrayExpression element and skips it", () => {
    const { node, source } = buildArrayContainer("[[styles.a]]");
    const index = new Map([["styles", ["a"]]]);
    const warnings: string[] = [];
    const result = flattenStyleArray(node, index, source, warnings, "test.tsx");
    expect(result).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Nested array in style prop");
    expect(warnings[0]).toContain("test.tsx");
  });

  it("warns when MemberExpression varName not present in fileStyleIndex", () => {
    const { node, source } = buildArrayContainer("[unknown.foo]");
    const index = new Map<string, string[]>();
    const warnings: string[] = [];
    const result = flattenStyleArray(node, index, source, warnings, "test.tsx");
    expect(result).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("StyleSheet var 'unknown' not found in index");
    expect(warnings[0]).toContain("test.tsx");
  });
});
