/**
 * walkRenderFlow — top-level OUT-04 render-flow walker.
 *
 * Given a function/class component body node, recursively descend into the
 * JSX returned and produce a `RenderNode` tree. Every AST form covered by
 * RESEARCH Pattern 7 maps to one of the 7 RenderNode kinds (D-05).
 *
 * Threat T-3-09: walker returns null for unrecognized node kinds rather than
 *   emitting `kind: "error"`. Calling code (Plan 06 — NextJsAdapter) decides
 *   whether to surface a parser warning or drop silently.
 */
import * as t from "@babel/types";
// biome-ignore lint/style/noRestrictedImports: type-only import; erased at compile time (D-11 island invariant unaffected)
import type { JsxAttribute, RenderNode } from "../../adapters/types.js";
import { walkConditional, walkLogical, type WalkFn } from "./conditionals.js";
import { isMapCall, walkList } from "./lists.js";

function sliceSource(source: string, node: t.Node): string {
  const start = node.start ?? 0;
  const end = node.end ?? start;
  return source.slice(start, end);
}

/** Recursive walker: any AST node → RenderNode (or null when no JSX). */
export const walk: WalkFn = (node, source, file) => {
  if (!node) return null;
  // JSX node families.
  if (t.isJSXElement(node)) return jsxElementToNode(node, source, file);
  if (t.isJSXFragment(node)) return jsxFragmentToNode(node, source, file);
  if (t.isJSXText(node)) {
    const v = node.value.replace(/\s+/g, " ").trim();
    if (!v) return null;
    return { kind: "text", value: v, file, line: node.loc?.start.line ?? 0 };
  }
  if (t.isJSXExpressionContainer(node)) return walk(node.expression, source, file);
  if (t.isJSXSpreadChild(node)) {
    return {
      kind: "spread",
      expression: sliceSource(source, node.expression),
      file,
      line: node.loc?.start.line ?? 0,
    };
  }
  // Conditional / logical control flow.
  if (t.isConditionalExpression(node)) return walkConditional(node, source, file, walk);
  if (t.isLogicalExpression(node)) return walkLogical(node, source, file, walk);
  // .map(arrow => ...) → list.
  if (isMapCall(node)) return walkList(node, source, file, walk);
  // String / template literal at JSX position → text.
  if (t.isStringLiteral(node)) {
    return { kind: "text", value: node.value, file, line: node.loc?.start.line ?? 0 };
  }
  // Function-like: descend into return value(s).
  if (
    t.isFunctionDeclaration(node) ||
    t.isFunctionExpression(node) ||
    t.isArrowFunctionExpression(node)
  ) {
    const body = (node as t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression)
      .body;
    if (t.isBlockStatement(body)) return walkBlock(body, source, file);
    return walk(body as t.Node, source, file);
  }
  // ClassMethod (e.g. render()) — descend into block.
  if (t.isClassMethod(node)) return walkBlock(node.body, source, file);
  // Pass-through wrappers.
  if (t.isParenthesizedExpression(node)) return walk(node.expression, source, file);
  if (
    t.isTSAsExpression(node) ||
    t.isTSNonNullExpression(node) ||
    t.isTSSatisfiesExpression(node)
  ) {
    return walk(node.expression, source, file);
  }
  return null;
};

/**
 * Walk a function body's BlockStatement and produce a RenderNode for the
 * first top-level branching/return statement.
 *
 * V1 LIMITATIONS (WR-05) — documented for downstream consumers:
 *
 *   1. **No symbolic-binding inlining.** Local `const`/`let` bindings to JSX
 *      expressions are NOT substituted. Pattern:
 *        const content = cond ? <A/> : <B/>;
 *        return <Wrapper>{content}</Wrapper>;
 *      will yield a `<Wrapper>` node with an Identifier-bearing child whose
 *      branching information (`<A/>` / `<B/>`) is invisible.
 *
 *   2. **First top-level `if`/`return` wins.** Iteration stops at the first
 *      `ReturnStatement` or `IfStatement` encountered. An `if` followed by a
 *      separate `return` produces only the `if`-branch — the trailing return
 *      is discarded.
 *
 *   3. **Only branching pattern recognized: early `return` inside `if`/`else`.**
 *      Switch statements, try/catch, throw-then-return, and short-circuit
 *      logic at statement scope are NOT modeled here (logical/conditional
 *      expressions ARE handled, but only at expression position).
 *
 * Resolving these requires a local-binding map and statement-flow analysis;
 * deferred to v2.
 */
function walkBlock(block: t.BlockStatement, source: string, file: string): RenderNode | null {
  for (const stmt of block.body) {
    if (t.isReturnStatement(stmt) && stmt.argument) return walk(stmt.argument, source, file);
    if (t.isIfStatement(stmt)) {
      const thenWalk = stmt.consequent ? walkStatement(stmt.consequent, source, file) : null;
      const elseWalk = stmt.alternate ? walkStatement(stmt.alternate, source, file) : null;
      return {
        kind: "branch",
        condition: sliceSource(source, stmt.test),
        thenBranch: thenWalk,
        elseBranch: elseWalk,
        file,
        line: stmt.loc?.start.line ?? 0,
      };
    }
  }
  return null;
}

function walkStatement(stmt: t.Statement, source: string, file: string): RenderNode | null {
  if (t.isReturnStatement(stmt) && stmt.argument) return walk(stmt.argument, source, file);
  if (t.isBlockStatement(stmt)) return walkBlock(stmt, source, file);
  if (t.isExpressionStatement(stmt)) return walk(stmt.expression, source, file);
  return null;
}

function jsxElementToNode(node: t.JSXElement, source: string, file: string): RenderNode {
  const tag = stringifyJsxName(node.openingElement.name);
  const isComponent = /^[A-Z]/.test(tag.split(".")[0] ?? "");
  const attributes: JsxAttribute[] = [];
  for (const attr of node.openingElement.attributes) {
    if (t.isJSXAttribute(attr)) {
      const name = t.isJSXIdentifier(attr.name) ? attr.name.name : "";
      let value: JsxAttribute["value"];
      if (attr.value === null || attr.value === undefined) {
        value = { kind: "literal", value: true };
      } else if (t.isStringLiteral(attr.value)) {
        value = { kind: "literal", value: attr.value.value };
      } else if (t.isJSXExpressionContainer(attr.value)) {
        value = { kind: "expression", source: sliceSource(source, attr.value.expression) };
      } else {
        value = { kind: "expression", source: sliceSource(source, attr.value as t.Node) };
      }
      attributes.push({ name, value });
    } else if (t.isJSXSpreadAttribute(attr)) {
      attributes.push({
        name: "",
        value: { kind: "spread", source: sliceSource(source, attr.argument) },
      });
    }
  }
  const children: RenderNode[] = [];
  for (const child of node.children) {
    const walked = walk(child as t.Node, source, file);
    if (walked) children.push(walked);
  }
  return {
    kind: "jsx",
    tag,
    isComponent,
    attributes,
    children,
    file,
    line: node.loc?.start.line ?? 0,
  };
}

function jsxFragmentToNode(node: t.JSXFragment, source: string, file: string): RenderNode {
  const children: RenderNode[] = [];
  for (const child of node.children) {
    const walked = walk(child as t.Node, source, file);
    if (walked) children.push(walked);
  }
  return { kind: "fragment", children, file, line: node.loc?.start.line ?? 0 };
}

function stringifyJsxName(name: t.JSXOpeningElement["name"]): string {
  if (t.isJSXIdentifier(name)) return name.name;
  if (t.isJSXMemberExpression(name)) {
    return `${stringifyJsxName(name.object as t.JSXOpeningElement["name"])}.${name.property.name}`;
  }
  if (t.isJSXNamespacedName(name)) return `${name.namespace.name}:${name.name.name}`;
  return "<unknown>";
}

/**
 * Public entry — walk a component body (function/class/arrow/method) into a
 * RenderNode. Always returns a node; emits `kind: "error"` if no JSX was found.
 */
export function walkRenderFlow(node: t.Node, source: string, file: string): RenderNode {
  const result = walk(node, source, file);
  if (result) return result;
  return {
    kind: "error",
    message: "no JSX render found",
    file,
    line: node.loc?.start.line ?? 0,
  };
}
