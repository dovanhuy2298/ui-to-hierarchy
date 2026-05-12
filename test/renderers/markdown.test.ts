import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../../src/renderers/index.js";
import { deepBranch, empty, kitchenSink, singleLeaf } from "../fixtures/ir/index.js";

const cases = [
  { name: "kitchen-sink", fixture: kitchenSink },
  { name: "empty", fixture: empty },
  { name: "single-leaf", fixture: singleLeaf },
  { name: "deep-branch", fixture: deepBranch },
] as const;

describe("renderMarkdown — snapshots", () => {
  for (const { name, fixture } of cases) {
    it(`matches snapshot for ${name}`, async () => {
      const out = renderMarkdown(fixture.tree, fixture.envelope);
      expect(out).not.toContain("\\");
      expect(out).toContain(" @ ");
      await expect(out).toMatchFileSnapshot(`./__snapshots__/markdown-${name}.md`);
    });
  }

  describe("warnings prefix", () => {
    it("emits one <!-- warning: ... --> line per warning + blank separator before the tree", () => {
      const envelope = { ...singleLeaf.envelope, warnings: ["a", "b"] };
      const out = renderMarkdown(singleLeaf.tree, envelope);
      const rootLine = renderMarkdown(singleLeaf.tree, singleLeaf.envelope);
      expect(out.startsWith("<!-- warning: a -->\n<!-- warning: b -->\n\n")).toBe(
        true,
      );
      expect(out).toBe(`<!-- warning: a -->\n<!-- warning: b -->\n\n${rootLine}`);
      expect(out).not.toContain("\\");
    });

    it("emits no prefix and no leading blank when warnings is empty (byte-identical to v1.0)", () => {
      const out = renderMarkdown(singleLeaf.tree, singleLeaf.envelope);
      expect(out.startsWith("<!--")).toBe(false);
      expect(out.startsWith("\n")).toBe(false);
    });
  });

  it("kitchen-sink contains all required substrings", () => {
    const out = renderMarkdown(kitchenSink.tree, kitchenSink.envelope);
    const required = [
      "<App>",
      "flex flex-col",
      " @ app/page.tsx:1",
      "├──",
      "└──",
      "│",
      "<Card>",
      "<>",
      "{...props}",
      "? user",
      ".map",
      "{children}",
      "@sidebar",
      "! parse failure: unexpected token",
    ];
    for (const s of required) {
      expect(out, `expected output to contain: ${s}`).toContain(s);
    }
  });
});
