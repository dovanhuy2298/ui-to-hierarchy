import { readFile } from "node:fs/promises";
import { glob } from "tinyglobby";
import { describe, expect, it } from "vitest";

/**
 * ARCH-01 island invariant — D-11 layer 2.
 *
 * Layer 1 is Biome's `noRestrictedImports` rule (biome.json) which fails IDE
 * + lint CI for static imports. Layer 2 (this test) walks every TS file under
 * the three island roots and asserts no `from "..."` static import nor
 * `import("...")` dynamic import resolves into `adapters/`. Catches
 * dynamic imports + string-built specifiers that the lint rule can miss.
 *
 * Single-shot reporting: ALL violations are collected into one array so a
 * single failure surfaces every offender at once.
 */
describe("ARCH-01 island invariant (D-11 layer 2)", () => {
  it("no file under src/core, src/ir, src/renderers imports from src/adapters", async () => {
    const files = await glob(["src/core/**/*.ts", "src/ir/**/*.ts", "src/renderers/**/*.ts"], {
      absolute: false,
    });
    const violations: string[] = [];
    const staticRe = /from\s+["'][^"']*\/adapters(?:["'\/])/;
    const dynRe = /import\s*\(\s*["'][^"']*\/adapters/;
    for (const f of files) {
      const text = await readFile(f, "utf8");
      if (staticRe.test(text) || dynRe.test(text)) violations.push(f);
    }
    expect(violations).toEqual([]);
  });
});
