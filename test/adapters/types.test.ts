import { describe, expect, it } from "vitest";
import type { ComponentDefinition } from "../../src/adapters/types.js";

/**
 * Structural assertion that `ComponentDefinition` carries exactly the 13
 * locked fields from SPEC R8 + NEXT-04 (name, file, line, kind, wrappers,
 * props, textContent, renderFlow, classNames, inlineStyles, cssModuleRefs,
 * styledTemplates, runtime). Build a literal that satisfies the type and
 * count its keys; if a 14th field is added (or one is removed), this fails.
 *
 * NOTE: Plan 03-01 originally said "11 fields" but the locked SPEC R8 shape
 * (and the plan's own field list) enumerates 12. Phase 4 plan 04-01 then
 * appended `runtime: "server" | "client"` (NEXT-04) for a final count of 13.
 */
describe("SPEC R8 ComponentDefinition shape", () => {
  it("has all 13 locked fields", () => {
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
      runtime: "server",
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
        "runtime",
        "styledTemplates",
        "textContent",
        "wrappers",
      ].sort(),
    );
    expect(Object.keys(value)).toHaveLength(13);
  });
});
