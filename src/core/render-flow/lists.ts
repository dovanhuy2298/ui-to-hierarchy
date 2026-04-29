/**
 * OUT-04 list walker — detects `items.map(item => <X />)` and emits
 * `RenderNode { kind: "list" }`. Body forms supported:
 *   - Arrow with expression body: `items.map((it) => <X />)`
 *   - Arrow with block body containing a return: `items.map((it) => { return <X />; })`
 *   - FunctionExpression with block body and return.
 */
import * as t from "@babel/types";
// biome-ignore lint/style/noRestrictedImports: type-only import; erased at compile time (D-11 island invariant unaffected)
import type { RenderNode } from "../../adapters/types.js";
import type { WalkFn } from "./conditionals.js";

function sliceSource(source: string, node: t.Node): string {
  const start = node.start ?? 0;
  const end = node.end ?? start;
  return source.slice(start, end);
}

/** Predicate: is this CallExpression a `<obj>.map(<fn>)` shape? */
export function isMapCall(node: t.Node): node is t.CallExpression {
  return (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    !node.callee.computed &&
    t.isIdentifier(node.callee.property) &&
    node.callee.property.name === "map" &&
    node.arguments.length >= 1 &&
    (t.isArrowFunctionExpression(node.arguments[0]) || t.isFunctionExpression(node.arguments[0]))
  );
}

export function walkList(
  node: t.CallExpression,
  source: string,
  file: string,
  walk: WalkFn,
): RenderNode | null {
  if (!isMapCall(node)) return null;
  const cb = node.arguments[0] as t.ArrowFunctionExpression | t.FunctionExpression;

  // Resolve the body the callback returns.
  let body: t.Node;
  if (t.isArrowFunctionExpression(cb)) {
    body = cb.body;
    if (t.isBlockStatement(body)) {
      const ret = body.body.find((s) => t.isReturnStatement(s)) as t.ReturnStatement | undefined;
      body = ret?.argument ?? body;
    }
  } else {
    const ret = cb.body.body.find((s) => t.isReturnStatement(s)) as t.ReturnStatement | undefined;
    body = ret?.argument ?? cb.body;
  }

  const line = node.loc?.start.line ?? 0;
  const item = walk(body, source, file) ?? {
    kind: "error" as const,
    message: "list item produced no JSX",
    file,
    line: cb.loc?.start.line ?? line,
  };
  const callee = node.callee as t.MemberExpression;
  const iterableSource = callee.object ? sliceSource(source, callee.object) : "";
  return {
    kind: "list",
    item,
    iterableSource,
    file,
    line,
  };
}
