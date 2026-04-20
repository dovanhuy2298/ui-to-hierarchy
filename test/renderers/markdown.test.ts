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
