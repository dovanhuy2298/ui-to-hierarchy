import { describe, expect, it } from "vitest";
import { EnvelopeSchema, TreeNodeSchema } from "../../src/ir/index.js";

describe("TreeNodeSchema", () => {
  it("accepts a component node with empty children", () => {
    expect(() =>
      TreeNodeSchema.parse({
        kind: "component",
        name: "Button",
        children: [],
        file: "src/Button.tsx",
        line: 10,
      }),
    ).not.toThrow();
  });

  it("accepts a branch with both thenBranch and elseBranch as text nodes", () => {
    expect(() =>
      TreeNodeSchema.parse({
        kind: "branch",
        condition: "isOpen",
        thenBranch: {
          kind: "text",
          value: "open",
          file: "a.tsx",
          line: 1,
        },
        elseBranch: {
          kind: "text",
          value: "closed",
          file: "a.tsx",
          line: 2,
        },
        file: "a.tsx",
        line: 0,
      }),
    ).not.toThrow();
  });

  it("accepts a list whose item is a component with nested element children (recursion)", () => {
    expect(() =>
      TreeNodeSchema.parse({
        kind: "list",
        item: {
          kind: "component",
          name: "Card",
          children: [
            {
              kind: "element",
              tag: "div",
              children: [
                {
                  kind: "text",
                  value: "hi",
                  file: "Card.tsx",
                  line: 3,
                },
              ],
              file: "Card.tsx",
              line: 2,
              layoutHint: "flex",
            },
          ],
          file: "Card.tsx",
          line: 1,
        },
        file: "List.tsx",
        line: 5,
      }),
    ).not.toThrow();
  });

  it("rejects an unknown kind with a zod error mentioning the discriminator", () => {
    let err: unknown;
    try {
      TreeNodeSchema.parse({ kind: "unknown", file: "x", line: 1 });
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(String(err)).toMatch(/kind/);
  });

  it("rejects a component with negative line", () => {
    expect(() =>
      TreeNodeSchema.parse({
        kind: "component",
        name: "A",
        children: [],
        file: "a.tsx",
        line: -1,
      }),
    ).toThrow();
  });

  it("rejects a component missing file", () => {
    expect(() =>
      TreeNodeSchema.parse({
        kind: "component",
        name: "A",
        children: [],
        line: 1,
      }),
    ).toThrow();
  });
});

describe("EnvelopeSchema", () => {
  const leafTree = {
    kind: "text" as const,
    value: "hello",
    file: "a.tsx",
    line: 0,
  };

  it("accepts a valid envelope", () => {
    expect(() =>
      EnvelopeSchema.parse({
        schemaVersion: "1",
        resolvedRoot: "/project",
        toolVersion: "0.1.0",
        generatedAt: "2026-04-20T10:00:00Z",
        warnings: [],
        tree: leafTree,
      }),
    ).not.toThrow();
  });

  it('rejects schemaVersion "2"', () => {
    expect(() =>
      EnvelopeSchema.parse({
        schemaVersion: "2",
        resolvedRoot: "/project",
        toolVersion: "0.1.0",
        generatedAt: "2026-04-20T10:00:00Z",
        warnings: [],
        tree: leafTree,
      }),
    ).toThrow();
  });

  it("rejects non-ISO generatedAt", () => {
    expect(() =>
      EnvelopeSchema.parse({
        schemaVersion: "1",
        resolvedRoot: "/project",
        toolVersion: "0.1.0",
        generatedAt: "yesterday",
        warnings: [],
        tree: leafTree,
      }),
    ).toThrow();
  });
});
