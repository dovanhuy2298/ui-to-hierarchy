import { describe, expect, it } from "vitest";
import { parseStyleSheetCreate } from "../../../../src/core/styles/rn/stylesheet-create.js";
import { parse } from "@babel/parser";

function parseSource(src: string) {
  return parse(src, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });
}

describe("RN-04 + RN-08 parseStyleSheetCreate", () => {
  it("extracts literal keys from in-file StyleSheet.create({...}) into varName→keys map", () => {
    const src = `
      import { StyleSheet } from "react-native";
      const styles = StyleSheet.create({ card: { padding: 8 }, bold: { fontWeight: "bold" } });
    `;
    const ast = parseSource(src);
    const warnings: string[] = [];
    const result = parseStyleSheetCreate(ast, src, warnings, "test.tsx");
    expect(result.get("styles")).toEqual(["card", "bold"]);
    expect(warnings).toHaveLength(0);
  });

  it("returns empty keys array for computed key {[k]:{}} with no warning per key — RN-08", () => {
    const src = `
      const dynamicKey = "foo";
      const s = StyleSheet.create({ [dynamicKey]: {} });
    `;
    const ast = parseSource(src);
    const warnings: string[] = [];
    const result = parseStyleSheetCreate(ast, src, warnings, "test.tsx");
    // Computed key is skipped (no entry in keys), but varName is still set
    expect(result.get("s")).toEqual([]);
    // No per-key warning emitted — keep noise low
    expect(warnings).toHaveLength(0);
  });

  it("returns no entry and emits warning when argument is factory call StyleSheet.create(getStyles()) — RN-08", () => {
    const src = `
      function getStyles() { return {}; }
      const s = StyleSheet.create(getStyles());
    `;
    const ast = parseSource(src);
    const warnings: string[] = [];
    const result = parseStyleSheetCreate(ast, src, warnings, "src/theme.ts");
    expect(result.has("s")).toBe(false);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Unsupported StyleSheet.create argument");
    expect(warnings[0]).toContain("src/theme.ts");
  });

  it("resolves one-hop import when caller passes pre-parsed AST (D-03 contract)", () => {
    // D-03: the function is filesystem-agnostic — it takes any pre-parsed AST.
    // Simulate a "remote" file's AST being passed in with a different file label.
    const remoteSrc = `
      const theme = StyleSheet.create({ ring: { borderWidth: 1 }, shadow: { elevation: 2 } });
    `;
    const ast = parseSource(remoteSrc);
    const warnings: string[] = [];
    const result = parseStyleSheetCreate(ast, remoteSrc, warnings, "src/theme.ts");
    expect(result.get("theme")).toEqual(["ring", "shadow"]);
    expect(warnings).toHaveLength(0);
  });

  it("returns empty Map and no warnings when no StyleSheet.create call exists", () => {
    const src = `const x = 1;`;
    const ast = parseSource(src);
    const warnings: string[] = [];
    const result = parseStyleSheetCreate(ast, src, warnings, "test.tsx");
    expect(result.size).toBe(0);
    expect(warnings).toHaveLength(0);
  });
});
