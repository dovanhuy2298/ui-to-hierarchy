import { describe, expect, it } from "vitest";
import { EnvelopeSchema } from "../../src/ir/index.js";
import { buildEnvelope, renderJson } from "../../src/renderers/index.js";
import { deepBranch, empty, kitchenSink, singleLeaf } from "../fixtures/ir/index.js";

describe("renderJson — inline snapshots", () => {
  it("empty fixture", () => {
    const out = renderJson(empty.tree, empty.envelope);
    expect(JSON.stringify(out)).not.toContain("\\\\");
    expect(out).toMatchInlineSnapshot(`
      {
        "generatedAt": "2026-04-20T12:34:56.000Z",
        "resolvedRoot": "/fixture/root",
        "schemaVersion": "1",
        "toolVersion": "0.1.0-test",
        "tree": {
          "children": [],
          "file": "app/page.tsx",
          "kind": "fragment",
          "line": 1,
        },
        "warnings": [],
      }
    `);
  });

  it("single-leaf fixture", () => {
    const out = renderJson(singleLeaf.tree, singleLeaf.envelope);
    expect(JSON.stringify(out)).not.toContain("\\\\");
    expect(out).toMatchInlineSnapshot(`
      {
        "generatedAt": "2026-04-20T12:34:56.000Z",
        "resolvedRoot": "/fixture/root",
        "schemaVersion": "1",
        "toolVersion": "0.1.0-test",
        "tree": {
          "file": "app/page.tsx",
          "kind": "text",
          "line": 1,
          "value": "hello",
        },
        "warnings": [],
      }
    `);
  });
});

describe("renderJson — schema validation", () => {
  for (const { name, fixture } of [
    { name: "kitchen-sink", fixture: kitchenSink },
    { name: "deep-branch", fixture: deepBranch },
    { name: "empty", fixture: empty },
    { name: "single-leaf", fixture: singleLeaf },
  ] as const) {
    it(`${name} envelope parses cleanly`, () => {
      const out = renderJson(fixture.tree, fixture.envelope);
      expect(() => EnvelopeSchema.parse(out)).not.toThrow();
      expect(JSON.stringify(out)).not.toContain("\\\\");
    });
  }
});

describe("buildEnvelope", () => {
  const leaf = singleLeaf.tree;

  it("defaults: resolvedRoot matches resolveRoot() equivalent; warnings empty; schemaVersion '1'", async () => {
    const { resolveRoot } = await import("../../src/core/resolve-root.js");
    const env = buildEnvelope(leaf);
    expect(env.schemaVersion).toBe("1");
    expect(env.warnings).toEqual([]);
    expect(env.resolvedRoot).toBe(resolveRoot());
    expect(typeof env.toolVersion).toBe("string");
    expect(env.toolVersion.length).toBeGreaterThan(0);
    // generatedAt is ISO 8601
    expect(() => new Date(env.generatedAt).toISOString()).not.toThrow();
  });

  it("resolvedRootOverride wins", () => {
    const env = buildEnvelope(leaf, { resolvedRootOverride: "/custom" });
    expect(env.resolvedRoot).toBe("/custom");
  });

  it("now override produces deterministic generatedAt", () => {
    const env = buildEnvelope(leaf, {
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(env.generatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("output parses against EnvelopeSchema", () => {
    const env = buildEnvelope(leaf, {
      resolvedRootOverride: "/fixture/root",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(() => EnvelopeSchema.parse(env)).not.toThrow();
  });
});
