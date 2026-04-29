import path from "node:path";
import { describe, expect, it } from "vitest";
import { NextJsAdapter } from "../../../src/adapters/next/NextJsAdapter.js";
import type { ParseContext } from "../../../src/adapters/types.js";

const FIXTURE = path.resolve("test/fixtures/parser/extractors/kitchen-sink.tsx");

function ctx(): ParseContext {
  return {
    resolvedRoot: path.resolve("."),
    tsconfig: null,
    astCache: new Map(),
    resolverCache: new Map(),
    warnings: [],
  };
}

describe("Kitchen-sink end-to-end (SPEC R5 acceptance)", () => {
  it("produces a ComponentDefinition with all four style fields populated", () => {
    const c = ctx();
    const comps = NextJsAdapter.extractComponents(c, [FIXTURE]);
    const ks = comps.find((x) => x.name === "KS");
    expect(ks).toBeDefined();
    if (!ks) return;

    // Tailwind classNames — layout literals survive the default filter; the
    // "text-red-500" non-layout literal is filtered out unless fullClasses=true.
    const literals = ks.classNames
      .filter((cl) => cl.kind === "literal")
      .map((cl) => (cl.kind === "literal" ? cl.value : ""));
    expect(literals).toContain("flex");
    expect(literals).toContain("p-4");
    expect(literals).not.toContain("text-red-500");

    // Inline style — `style={{ margin: 8 }}` becomes `{ margin: "8" }` (numeric→string).
    expect(ks.inlineStyles.margin).toBe("8");

    // CSS Modules ref — `<span className={styles.label}>` is captured.
    expect(
      ks.cssModuleRefs.some((r) => r.binding === "styles" && r.key === "label"),
    ).toBe(true);

    // styled-components template — `Wrapper = styled.section\`border: ...\${...}\``
    // body has `${...}` replaced by `{?}` placeholder per D-10.
    expect(
      ks.styledTemplates.some(
        (s) => s.tag === "section" && s.body.includes("border:") && s.body.includes("{?}"),
      ),
    ).toBe(true);

    // renderFlow root — kitchen-sink returns a JSX element (Wrapper).
    expect(ks.renderFlow.kind).toBe("jsx");
  });

  it("fullClasses=true reveals non-layout Tailwind tokens", () => {
    const c = ctx();
    const comps = NextJsAdapter.extractComponents(c, [FIXTURE], { fullClasses: true });
    const ks = comps.find((x) => x.name === "KS");
    expect(ks).toBeDefined();
    if (!ks) return;
    const literals = ks.classNames
      .filter((cl) => cl.kind === "literal")
      .map((cl) => (cl.kind === "literal" ? cl.value : ""));
    expect(literals).toContain("text-red-500");
    expect(literals).toContain("flex");
  });
});
