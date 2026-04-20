import type { Envelope, TreeNode } from "../ir/index.js";

/**
 * renderJson — pure structural combiner (D-15). Returns the envelope with its
 * `tree` field replaced by the provided tree. Exists as a named function so
 * Phase 2 MCP tool handlers have a stable signature.
 */
export function renderJson(tree: TreeNode, envelope: Envelope): Envelope {
  return { ...envelope, tree };
}
