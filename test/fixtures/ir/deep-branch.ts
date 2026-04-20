import type { Envelope, TreeNode } from "../../../src/ir/index.js";

const inner: TreeNode = {
  kind: "component",
  name: "Deep",
  file: "app/page.tsx",
  line: 5,
  children: [
    {
      kind: "text",
      file: "app/page.tsx",
      line: 6,
      value: "deep text",
    },
  ],
};

const tree: TreeNode = {
  kind: "branch",
  condition: "a",
  file: "app/page.tsx",
  line: 1,
  thenBranch: {
    kind: "branch",
    condition: "b",
    file: "app/page.tsx",
    line: 2,
    thenBranch: inner,
    elseBranch: null,
  },
  elseBranch: null,
};

export const deepBranch: { tree: TreeNode; envelope: Envelope } = {
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
