import type { Envelope, TreeNode } from "../../../src/ir/index.js";

const FILE = "app/page.tsx";

const tree: TreeNode = {
  kind: "component",
  name: "App",
  file: FILE,
  line: 1,
  layoutHint: "flex flex-col",
  children: [
    {
      kind: "element",
      tag: "div",
      file: FILE,
      line: 3,
      layoutHint: "p-6",
      children: [
        {
          kind: "text",
          file: FILE,
          line: 5,
          value: "Welcome",
        },
      ],
    },
    {
      kind: "branch",
      condition: "user",
      file: FILE,
      line: 8,
      thenBranch: {
        kind: "component",
        name: "Card",
        file: FILE,
        line: 9,
        layoutHint: "rounded-xl",
        children: [
          {
            kind: "fragment",
            file: FILE,
            line: 10,
            children: [
              {
                kind: "element",
                tag: "span",
                file: FILE,
                line: 11,
                children: [
                  {
                    kind: "text",
                    file: FILE,
                    line: 11,
                    value: "Hi",
                  },
                ],
              },
            ],
          },
          {
            kind: "spread",
            file: FILE,
            line: 12,
            expression: "props",
          },
        ],
      },
      elseBranch: {
        kind: "text",
        file: FILE,
        line: 14,
        value: "Login required",
      },
    },
    {
      kind: "list",
      file: FILE,
      line: 18,
      item: {
        kind: "component",
        name: "Row",
        file: FILE,
        line: 19,
        children: [],
      },
    },
    {
      kind: "slot",
      name: "children",
      file: FILE,
      line: 25,
    },
    {
      kind: "slot",
      name: "sidebar",
      file: FILE,
      line: 26,
    },
    {
      kind: "error",
      message: "parse failure: unexpected token",
      file: FILE,
      line: 30,
    },
  ],
};

export const kitchenSink: { tree: TreeNode; envelope: Envelope } = {
  tree,
  envelope: {
    schemaVersion: "1",
    resolvedRoot: "/fixture/root",
    toolVersion: "0.1.0-test",
    generatedAt: "2026-04-20T12:34:56.000Z",
    warnings: [],
    tree,
  },
};
