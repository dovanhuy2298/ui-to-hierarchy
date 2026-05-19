import type * as t from "@babel/types";
import { describe, expect, it } from "vitest";
import {
  extractRNInlineStyle,
  extractNativeWindClassNames,
} from "../../../../src/core/styles/rn/style-prop.js";
import { parse } from "@babel/parser";
import { traverse } from "../../../../src/core/babel-shim.js";

function firstJSXElement(source: string): t.JSXElement {
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });
  let found: t.JSXElement | null = null;
  traverse(ast, {
    JSXElement(path: { node: t.JSXElement }) {
      if (!found) found = path.node;
    },
  });
  if (!found) throw new Error("No JSXElement found in source");
  return found;
}

describe("RN-05 extractRNInlineStyle", () => {
  it("delegates to v1.0 extractInlineStyle for style={{fontWeight:'bold'}}", () => {
    const source = `<View style={{ fontWeight: "bold" }} />`;
    const el = firstJSXElement(source);
    const result = extractRNInlineStyle(el, source);
    expect(result.fontWeight).toBe("bold");
  });

  it("returns __raw__ sentinel for computed expr style={x}", () => {
    const source = `<View style={x} />`;
    const el = firstJSXElement(source);
    const result = extractRNInlineStyle(el, source);
    expect(result.__raw__).toEqual({ raw: "x" });
  });
});

describe("RN-07 extractNativeWindClassNames", () => {
  it("strips ios:/android:/web:/native: variants from className string and tokenizes on whitespace — yields p-4 p-2 text-lg", () => {
    const source = `<View className="ios:p-4 android:p-2 text-lg" />`;
    const el = firstJSXElement(source);
    const warnings: string[] = [];
    const result = extractNativeWindClassNames(el, warnings, "test.tsx", 1);
    expect(result).toEqual(["p-4", "p-2", "text-lg"]);
    expect(warnings).toHaveLength(0);
  });

  it("returns [] and pushes warning when className={tw`text-lg`} tagged template", () => {
    const source = `import { tw } from "nativewind"; const el = <View className={tw\`text-lg\`} />;`;
    const el = firstJSXElement(source);
    const warnings: string[] = [];
    const result = extractNativeWindClassNames(el, warnings, "src/comp.tsx", 5);
    expect(result).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("NativeWind tw");
    expect(warnings[0]).toContain("src/comp.tsx:5");
  });

  it("returns [] for missing className attribute", () => {
    const source = `<View />`;
    const el = firstJSXElement(source);
    const warnings: string[] = [];
    const result = extractNativeWindClassNames(el, warnings, "test.tsx", 1);
    expect(result).toEqual([]);
    expect(warnings).toHaveLength(0);
  });

  it("returns [] silently for JSXExpressionContainer with non-tagged expression", () => {
    const source = `<View className={someVar} />`;
    const el = firstJSXElement(source);
    const warnings: string[] = [];
    const result = extractNativeWindClassNames(el, warnings, "test.tsx", 1);
    expect(result).toEqual([]);
    expect(warnings).toHaveLength(0);
  });

  it("returns [] for empty className string after split", () => {
    const source = `<View className="" />`;
    const el = firstJSXElement(source);
    const warnings: string[] = [];
    const result = extractNativeWindClassNames(el, warnings, "test.tsx", 1);
    expect(result).toEqual([]);
    expect(warnings).toHaveLength(0);
  });
});
