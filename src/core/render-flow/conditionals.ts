/**
 * OUT-04 conditional render walkers.
 *
 * `walkConditional` and `walkLogical` each emit a `RenderNode { kind: "branch" }`
 * variant per the OUT-04 mapping table (RESEARCH Pattern 7). The recursive
 * `walk` callback is passed in by the caller (src/core/render-flow/index.ts) to
 * break the import cycle.
 *
 * D-05 — branch.condition stores the raw source slice of the test/left node so
 *   downstream consumers can reproduce the user's exact textual condition (incl.
 *   `!cond` / `!!cond` negation prefixes — sliceSource preserves those verbatim).
 */
import type * as t from "@babel/types";
// biome-ignore lint/style/noRestrictedImports: type-only import; erased at compile time (D-11 island invariant unaffected)
import type { RenderNode } from "../../adapters/types.js";

export type WalkFn = (node: t.Node, source: string, file: string) => RenderNode | null;

function sliceSource(source: string, node: t.Node): string {
  const start = node.start ?? 0;
  const end = node.end ?? start;
  return source.slice(start, end);
}

/** ConditionalExpression: `cond ? a : b`. */
export function walkConditional(
  node: t.ConditionalExpression,
  source: string,
  file: string,
  walk: WalkFn,
): RenderNode {
  return {
    kind: "branch",
    condition: sliceSource(source, node.test),
    thenBranch: walk(node.consequent, source, file),
    elseBranch: walk(node.alternate, source, file),
    file,
    line: node.loc?.start.line ?? 0,
  };
}

/**
 * LogicalExpression — `&&`, `||`, `??`.
 *
 * SPEC R6: sliceSource preserves the leading `!` / `!!` prefix on the left
 * operand verbatim, so no special UnaryExpression unwrap is needed — the
 * negation is already captured in the slice of `node.left`.
 */
export function walkLogical(
  node: t.LogicalExpression,
  source: string,
  file: string,
  walk: WalkFn,
): RenderNode {
  const line = node.loc?.start.line ?? 0;
  if (node.operator === "&&") {
    return {
      kind: "branch",
      condition: sliceSource(source, node.left),
      thenBranch: walk(node.right, source, file),
      elseBranch: null,
      file,
      line,
    };
  }
  // `||` and `??`: "fallback if left is falsy / nullish" → then = walk(left), else = walk(right).
  return {
    kind: "branch",
    condition: sliceSource(source, node.left),
    thenBranch: walk(node.left, source, file),
    elseBranch: walk(node.right, source, file),
    file,
    line,
  };
}
