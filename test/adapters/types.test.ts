import { describe, expect, it } from "vitest";
import type { ComponentDefinition } from "../../src/adapters/types.js";

/**
 * Structural assertion that `ComponentDefinition` carries exactly the 12
 * locked fields from SPEC R8 (name, file, line, kind, wrappers, props,
 * textContent, renderFlow, classNames, inlineStyles, cssModuleRefs,
 * styledTemplates). Build a literal that satisfies the type and count its
 * keys; if a 13th field is added (or one is removed), this fails.
 *
 * NOTE: Plan 03-01 originally said "11 fields" but the locked SPEC R8 shape
 * (and the plan's own field list) enumerates 12. Fixing here as Rule 1 bug
 * fix to match the actual locked surface.
 */
describe("SPEC R8 ComponentDefinition shape", () => {
  it("has all 12 locked fields", () => {
    const value: ComponentDefinition = {
      name: "X",
      file: "/a/b.tsx",
      line: 1,
      kind: "function",
      wrappers: [],
      props: [],
      textContent: [],
      renderFlow: { kind: "fragment", children: [], file: "/a/b.tsx", line: 1 },
      classNames: [],
      inlineStyles: {},
      cssModuleRefs: [],
      styledTemplates: [],
    };
    expect(Object.keys(value).sort()).toEqual(
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
    expect(Object.keys(value)).toHaveLength(12);
  });
});
