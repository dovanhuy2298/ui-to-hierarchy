import type { Envelope, TreeNode } from "../../../src/ir/index.js";

const tree: TreeNode = {
  kind: "text",
  file: "app/page.tsx",
  line: 1,
  value: "hello",
};

export const singleLeaf: { tree: TreeNode; envelope: Envelope } = {
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
