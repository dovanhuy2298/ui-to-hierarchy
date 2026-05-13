/**
 * Analyzer — per-call orchestrator for IR queries (ARCH-02, D-01).
 *
 * Single-file orchestrator containing the Analyzer class, IR-build helpers,
 * slot-substitution algorithm, four query methods, buildFragmentRoot, hand-rolled
 * Levenshtein, and the per-element style sidecar.
 *
 * ARCH-02 contract: no static fields, no module-scope cache variables.
 * Every cache is an instance field; GC'd when the Analyzer instance is collected.
 *
 * D-01: all logic co-located here; splitting deferred until query primitives grow complex.
 * D-03: Levenshtein inline private function ≤30 LOC, no runtime dep.
 * D-07: every file: field passes through toForwardSlash before entering a TreeNode.
 * D-12: all user-data error paths return shape, never throw.
 */

// biome-ignore lint/style/noRestrictedImports: type-only import; erased at compile time (D-11 island invariant unaffected)
import type { ComponentDefinition, ParseContext, RenderNode, RouteMatch } from "../adapters/types.js";
// biome-ignore lint/style/noRestrictedImports: type-only import; erased at compile time (D-11 island invariant unaffected)
import type { FrameworkAdapter } from "../adapters/FrameworkAdapter.js";
import type { TreeNode } from "../ir/schema.js";
import * as t from "@babel/types";
import { parseExpression } from "@babel/parser";
import { traverse } from "./babel-shim.js";
import { toForwardSlash } from "./paths.js";

// ─────────────────────────────────────────────────────────────────────────────
// Style sidecar types (D-12, D-13)
// ─────────────────────────────────────────────────────────────────────────────

interface StyleEntry {
  classNames: string[];
  styleKeys: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Levenshtein (D-03 inline, ≤30 LOC, hand-rolled, no runtime dep)
// ─────────────────────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr.push(Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost));
    }
    prev = curr;
  }
  return prev[n]!;
}

// ─────────────────────────────────────────────────────────────────────────────
// Style sidecar scrape (D-13)
// ─────────────────────────────────────────────────────────────────────────────

function scrapeStyleAttributes(
  rn: RenderNode & { kind: "jsx" },
  sidecar: Map<string, StyleEntry>,
): void {
  const key = `${toForwardSlash(rn.file)}:${rn.line}:${rn.tag}`;
  const classNames: string[] = [];
  const styleKeys: string[] = [];

  for (const attr of rn.attributes) {
    if (
      attr.name === "className" &&
      attr.value.kind === "literal" &&
      typeof attr.value.value === "string"
    ) {
      classNames.push(...attr.value.value.split(/\s+/).filter(Boolean));
    }
    if (attr.name === "style" && attr.value.kind === "expression") {
      // Parse style expression to extract top-level object keys. Drop silently on failure (D-14).
      try {
        const expr = parseExpression(attr.value.source, { plugins: ["jsx", "typescript"] });
        if (expr.type === "ObjectExpression") {
          for (const prop of expr.properties) {
            if (prop.type === "ObjectProperty" && !prop.computed) {
              if (prop.key.type === "Identifier") styleKeys.push(prop.key.name);
              else if (prop.key.type === "StringLiteral") styleKeys.push(prop.key.value);
            }
          }
        }
      } catch {
        // drop silently per D-14
      }
    }
  }

  sidecar.set(key, {
    classNames: Array.from(new Set(classNames)),
    styleKeys: Array.from(new Set(styleKeys)),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Literal-string attribute extraction (DEBUG #3 — TreeNode.attributes population)
//
// v1 carve-out: only `kind:"literal"` attributes whose value is a string survive.
// Expression attributes, spread attributes, and non-string literals (number /
// boolean / null) are dropped. Mirrors the literal-string filter in
// scrapeStyleAttributes; both can coexist (style sidecar is orthogonal —
// findByStyle reads styleIndex, not TreeNode.attributes).
// ─────────────────────────────────────────────────────────────────────────────

function extractLiteralAttributes(
  rn: RenderNode & { kind: "jsx" },
): Array<{ name: string; value: string }> | undefined {
  const out: Array<{ name: string; value: string }> = [];
  for (const attr of rn.attributes) {
    if (attr.value.kind === "literal" && typeof attr.value.value === "string") {
      out.push({ name: attr.name, value: attr.value.value });
    }
  }
  return out.length > 0 ? out : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Import-binding collection (DEBUG #2 — resolver wiring fix)
//
// For a parsed module, return a map: localJsxName → { source, importedName }.
// Covers:
//   import { Foo } from "x"          → "Foo"     → { source: "x", importedName: "Foo" }
//   import { Foo as Bar } from "x"   → "Bar"     → { source: "x", importedName: "Foo" }
//   import Default from "x"          → "Default" → { source: "x", importedName: "default" }
//   import * as Ns from "x"          → SKIPPED (Ns.Foo is multi-hop; v1 leaves it
//                                      at the call-site per 06-DEBUG carve-out).
// ─────────────────────────────────────────────────────────────────────────────

interface ImportBinding {
  source: string;
  importedName: string;
}

function collectImportBindings(ast: t.File): Map<string, ImportBinding> {
  const out = new Map<string, ImportBinding>();
  traverse(ast, {
    ImportDeclaration(path: { node: t.ImportDeclaration }) {
      const source = path.node.source.value;
      for (const spec of path.node.specifiers) {
        if (t.isImportSpecifier(spec)) {
          const localName = spec.local.name;
          const importedName = t.isIdentifier(spec.imported)
            ? spec.imported.name
            : spec.imported.value;
          out.set(localName, { source, importedName });
        } else if (t.isImportDefaultSpecifier(spec)) {
          out.set(spec.local.name, { source, importedName: "default" });
        }
        // ImportNamespaceSpecifier intentionally skipped (v1 carve-out).
      }
    },
  });
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// RenderNode → TreeNode translation (D-04/D-05/D-06)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Translate a RenderNode (parser output) to a TreeNode (IR).
 * - runtimeMap: component name → "client" | "server" for D-08 layoutHint propagation.
 * - sidecar: populated in-place for style scan (D-13).
 * - D-07: every file: field passes through toForwardSlash.
 */
function renderNodeToTreeNode(
  rn: RenderNode,
  runtimeMap: Map<string, "client" | "server">,
  sidecar: Map<string, StyleEntry>,
): TreeNode {
  switch (rn.kind) {
    case "jsx": {
      scrapeStyleAttributes(rn, sidecar);
      const fwdFile = toForwardSlash(rn.file);

      const literalAttrs = extractLiteralAttributes(rn);

      if (rn.isComponent) {
        const isClient = runtimeMap.get(rn.tag) === "client";
        const base: TreeNode & { kind: "component" } = {
          kind: "component",
          name: rn.tag,
          children: rn.children.map((c) => renderNodeToTreeNode(c, runtimeMap, sidecar)),
          file: fwdFile,
          line: rn.line,
        };
        if (isClient) base.layoutHint = "client";
        if (literalAttrs) base.attributes = literalAttrs;
        return base;
      }

      const base: TreeNode & { kind: "element" } = {
        kind: "element",
        tag: rn.tag,
        children: rn.children.map((c) => renderNodeToTreeNode(c, runtimeMap, sidecar)),
        file: fwdFile,
        line: rn.line,
      };
      if (literalAttrs) base.attributes = literalAttrs;
      return base;
    }

    case "text":
      return { kind: "text", value: rn.value, file: toForwardSlash(rn.file), line: rn.line };

    case "branch":
      return {
        kind: "branch",
        condition: rn.condition,
        thenBranch: rn.thenBranch ? renderNodeToTreeNode(rn.thenBranch, runtimeMap, sidecar) : null,
        elseBranch: rn.elseBranch ? renderNodeToTreeNode(rn.elseBranch, runtimeMap, sidecar) : null,
        file: toForwardSlash(rn.file),
        line: rn.line,
      };

    case "list":
      return {
        kind: "list",
        item: renderNodeToTreeNode(rn.item, runtimeMap, sidecar),
        file: toForwardSlash(rn.file),
        line: rn.line,
      };

    case "fragment":
      return {
        kind: "fragment",
        children: rn.children.map((c) => renderNodeToTreeNode(c, runtimeMap, sidecar)),
        file: toForwardSlash(rn.file),
        line: rn.line,
      };

    case "spread":
      return {
        kind: "spread",
        expression: rn.expression,
        file: toForwardSlash(rn.file),
        line: rn.line,
      };

    case "error":
      return {
        kind: "error",
        message: rn.message,
        file: toForwardSlash(rn.file),
        line: rn.line,
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolver post-pass (DEBUG #2 — fix Button.file pointing at consumer)
//
// For every `kind:"component"` TreeNode produced from an `isComponent` JSX
// callsite, look up its tag name in the entry's import-binding map and call
// `adapter.resolveModule`. On a successful local resolution, override the
// node's `file` AND `line` (POLISH-03 D-02/D-03/D-04: ResolveResult.local now
// carries the true declaration line, sourced from ParseResult.declLines, with
// fallback to 1 when the name is absent or the file failed to parse). On
// `ok:false` failures, append a warning. On `ok:true, kind:"external"`
// (node_modules), leave the node alone silently.
//
// The override does NOT cascade into children — a component's TreeNode
// children are JSX expressions passed AS PROPS in the calling file (e.g.
// `<Layout><Page/></Layout>`); their file:line still belongs to the consumer.
// ─────────────────────────────────────────────────────────────────────────────

function resolveComponentCallsites(
  tree: TreeNode,
  bindings: Map<string, ImportBinding>,
  fromFile: string,
  adapter: FrameworkAdapter,
  ctx: ParseContext,
): TreeNode {
  switch (tree.kind) {
    case "component": {
      const newChildren = tree.children.map((c) =>
        resolveComponentCallsites(c, bindings, fromFile, adapter, ctx),
      );
      const binding = bindings.get(tree.name);
      if (!binding) {
        // Locally declared, namespaced import (Ns.Foo), or unknown — leave file unchanged.
        return { ...tree, children: newChildren };
      }
      let result;
      try {
        result = adapter.resolveModule(ctx, fromFile, binding.source, binding.importedName);
      } catch (err: unknown) {
        // R8: never throw out of the IR build path. Treat as a soft failure.
        const message = err instanceof Error ? err.message : String(err);
        ctx.warnings.push(
          `resolver threw for component '${tree.name}' from '${binding.source}' at ${tree.file}:${tree.line}: ${message}`,
        );
        return { ...tree, children: newChildren };
      }
      if (result.ok && result.kind === "local") {
        return {
          ...tree,
          children: newChildren,
          file: toForwardSlash(result.absolutePath),
          line: result.line,
        };
      }
      if (!result.ok) {
        ctx.warnings.push(
          `unresolved component '${tree.name}' from '${binding.source}' at ${tree.file}:${tree.line}`,
        );
      }
      // external or unresolved: preserve call-site file:line.
      return { ...tree, children: newChildren };
    }
    case "element":
      return {
        ...tree,
        children: tree.children.map((c) =>
          resolveComponentCallsites(c, bindings, fromFile, adapter, ctx),
        ),
      };
    case "fragment":
      return {
        ...tree,
        children: tree.children.map((c) =>
          resolveComponentCallsites(c, bindings, fromFile, adapter, ctx),
        ),
      };
    case "branch":
      return {
        ...tree,
        thenBranch: tree.thenBranch
          ? resolveComponentCallsites(tree.thenBranch, bindings, fromFile, adapter, ctx)
          : null,
        elseBranch: tree.elseBranch
          ? resolveComponentCallsites(tree.elseBranch, bindings, fromFile, adapter, ctx)
          : null,
      };
    case "list":
      return {
        ...tree,
        item: resolveComponentCallsites(tree.item, bindings, fromFile, adapter, ctx),
      };
    default:
      return tree;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Slot substitution (D-09/D-10)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recursively visit-and-clone a TreeNode tree, replacing ALL
 * kind:"slot" nodes with name === slotName with the replacement tree.
 * Finite depth bounded by tree depth (T-05-02-03).
 * If no slot found, returns original tree unchanged (D-10 silent skip).
 *
 * Replaces all matches because in React/Next.js, `{children}` is a single
 * binding — every reference must resolve to the same subtree.
 */
function replaceSlot(tree: TreeNode, slotName: string, replacement: TreeNode): TreeNode {
  if (tree.kind === "slot" && tree.name === slotName) {
    return replacement;
  }

  switch (tree.kind) {
    case "component":
      return { ...tree, children: tree.children.map((c) => replaceSlot(c, slotName, replacement)) };
    case "element":
      return { ...tree, children: tree.children.map((c) => replaceSlot(c, slotName, replacement)) };
    case "fragment":
      return { ...tree, children: tree.children.map((c) => replaceSlot(c, slotName, replacement)) };
    case "branch":
      return {
        ...tree,
        thenBranch: tree.thenBranch ? replaceSlot(tree.thenBranch, slotName, replacement) : null,
        elseBranch: tree.elseBranch ? replaceSlot(tree.elseBranch, slotName, replacement) : null,
      };
    case "list":
      return { ...tree, item: replaceSlot(tree.item, slotName, replacement) };
    default:
      return tree;
  }
}

/**
 * Attach a parallel-route slot as a sibling inside the outermost component's children.
 * Since TreeNode kind:"slot" has no children field, we represent the slot + its content
 * by appending a kind:"slot" marker node alongside the slotTree fragment as siblings.
 * The slot marker is a kind:"slot" node; the slot content follows as a kind:"fragment".
 * D-10: lexicographic order after "children" slot is managed by the caller.
 */
function attachParallelSlot(
  tree: TreeNode,
  slotName: string,
  slotTree: TreeNode,
  warnings: string[],
): TreeNode {
  const slotMarker: TreeNode = {
    kind: "slot",
    name: slotName,
    file: "<synthetic>",
    line: 0,
  };

  // Find the outermost component and append the slot marker + content fragment
  if (tree.kind === "component") {
    return {
      ...tree,
      children: [
        ...tree.children,
        slotMarker,
        slotTree,
      ],
    };
  }

  // WR-03: tree is not a component at top level — slot data would be silently
  // dropped. Surface a diagnostic so consumers can detect the correctness loss
  // (e.g. when buildRouteTree falls back to buildFragmentRoot([]) because no
  // page file matched, parallel slots like @sidebar / @modal vanish).
  warnings.push(
    `parallel slot '@${slotName}' could not be attached: route tree root is kind:'${tree.kind}', not 'component'`,
  );
  return tree;
}

// ─────────────────────────────────────────────────────────────────────────────
// Children-slot injection
//
// The render-flow walker returns null for `{children}` JSXExpressionContainers
// (Identifier "children" has no JSX handler). This means layout files end up
// with elements that have empty children arrays — no slot anchor.
//
// Fix: use the cached AST (populated by extractComponents via parseFile) to
// find JSXExpressionContainers wrapping `Identifier("children")` and collect
// their line numbers. Then post-process the translated TreeNode to inject
// kind:"slot", name:"children" at those positions.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find the name of the default-exported component in a parsed file (WR-02).
 *
 * Recognized forms:
 *   - `export default function Foo() {}`   → "Foo"
 *   - `export default class Foo {}`        → "Foo"
 *   - `export default Foo`                 → "Foo" (Identifier reference)
 *   - `export default memo(Foo)`           → "Foo" (peels HOC-style wrappers)
 *   - `export { Foo as default }`          → "Foo"
 * Returns undefined when the default export does not resolve to a single
 * named component (e.g. anonymous function, object expression).
 */
function findDefaultExportName(ast: t.File): string | undefined {
  for (const node of ast.program.body) {
    if (t.isExportDefaultDeclaration(node)) {
      const decl = node.declaration;
      if ((t.isFunctionDeclaration(decl) || t.isClassDeclaration(decl)) && decl.id) {
        return decl.id.name;
      }
      if (t.isIdentifier(decl)) return decl.name;
      // Peel call-expression wrappers (memo, forwardRef, etc.) until we hit
      // an Identifier; we don't restrict to known HOC names because the
      // intent here is just "which name does the default export point at".
      let cur: t.Node = decl;
      while (t.isCallExpression(cur)) {
        const arg = cur.arguments[0];
        if (!arg) break;
        cur = arg as t.Node;
      }
      if (t.isIdentifier(cur)) return cur.name;
      return undefined;
    }
    if (t.isExportNamedDeclaration(node)) {
      for (const spec of node.specifiers) {
        if (t.isExportSpecifier(spec)) {
          const exported = spec.exported;
          const exportedName = t.isIdentifier(exported) ? exported.name : exported.value;
          if (exportedName === "default" && t.isIdentifier(spec.local)) {
            return spec.local.name;
          }
        }
      }
    }
  }
  return undefined;
}


/**
 * Build a map from JSXElement opening-tag line → closing-tag line (WR-01).
 *
 * Used by injectChildrenSlots to bound Case A's `sl >= tree.line` check on
 * BOTH ends, so an empty element on line 5 cannot claim a `{children}`
 * literal on line 80 from an unrelated subtree. Self-closing elements
 * collapse to a single-line range (open === close).
 *
 * Only the FIRST element starting on a given line is recorded — collisions
 * across nested elements opening on the same source line are exceedingly
 * rare (typical when the user hand-writes JSX that way), and the trade-off
 * for v1 is to keep the heuristic simple. Future: key by (openLine, openCol).
 */
function collectElementLineRanges(ast: t.File): Map<number, number> {
  const ranges = new Map<number, number>();
  traverse(ast, {
    JSXElement(path: { node: t.JSXElement }) {
      const open = path.node.loc?.start.line;
      if (!open) return;
      // Closing element line if present, else opening element end (self-closing).
      const close =
        path.node.closingElement?.loc?.end.line ??
        path.node.openingElement.loc?.end.line ??
        open;
      if (!ranges.has(open)) ranges.set(open, close);
    },
  });
  return ranges;
}

/**
 * Post-process a TreeNode tree to inject kind:"slot", name:"children" nodes
 * at positions where `{children}` appeared in the source.
 * Uses slotLines (line numbers from the AST) to find the right insertion points.
 *
 * Strategy: for each element/component node in the tree, if the node's line + 1
 * (the body line) matches a slot line, or any child line matches, inject a
 * children slot into that element's children array.
 *
 * Simpler: walk the element tree; for element nodes whose children are EMPTY
 * and whose line is within the range of a children-slot line, inject the slot.
 * This uses a parent-line to children-slot-line range check.
 */
function injectChildrenSlots(
  tree: TreeNode,
  slotLines: Set<number>,
  file: string,
  elementRanges: Map<number, number>,
): TreeNode {
  if (slotLines.size === 0) return tree;

  switch (tree.kind) {
    case "component": {
      // Recurse on existing children first
      const newChildren = tree.children.map((c) =>
        injectChildrenSlots(c, slotLines, file, elementRanges),
      );
      return { ...tree, children: newChildren };
    }
    case "element": {
      // Recurse into existing children first.
      const newChildren = tree.children.map((c) =>
        injectChildrenSlots(c, slotLines, file, elementRanges),
      );

      // Check if this element should receive a {children} slot injected.
      //
      // Case A: element currently has no children — inject a slot if any slotLine
      //   is on or after this element's opening tag line.
      //
      // Case B: element already has children (e.g. <div><Sidebar />{children}</div>)
      //   — inject a slot AFTER the last existing child when a slotLine is greater
      //   than the last child's line. This handles siblings like {children} following
      //   another JSX element in the same parent.
      // WR-01 stopgap: consume each slotLine as it is injected so a single
      // {children} expression cannot be assigned to multiple elements. The set
      // is mutated in-place, which is safe because injectChildrenSlots is
      // called once per layout file (via buildTreeForEntry).
      if (slotLines.size > 0) {
        if (newChildren.length === 0) {
          // Case A — empty element. WR-01: bound `sl >= tree.line` on BOTH
          // ends using the element's source-level closing-tag line so an
          // empty element on line 5 cannot claim a `{children}` literal on
          // line 80 of an unrelated subtree. Falls back to the open line
          // (self-closing) when no range is recorded for this element.
          const closeLine = elementRanges.get(tree.line) ?? tree.line;
          for (const sl of slotLines) {
            if (sl >= tree.line && sl <= closeLine) {
              slotLines.delete(sl);
              const slotNode: TreeNode = {
                kind: "slot",
                name: "children",
                file,
                line: sl,
              };
              return { ...tree, children: [slotNode] };
            }
          }
        } else {
          // Case B — element already has children; check if any slotLine falls
          // after the last child's line (meaning {children} is a sibling after them).
          // WR-04: filter synthetic line:0 nodes (buildFragmentRoot, attachParallelSlot
          // produce these). If only synthetic nodes are present, lastChildLine collapses
          // to 0 and any positive slotLine would satisfy `sl > lastChildLine`, claiming
          // the slot inappropriately. Skip Case B in that scenario.
          const realChildLines = newChildren.map((c) => c.line).filter((n) => n > 0);
          if (realChildLines.length === 0) {
            return { ...tree, children: newChildren };
          }
          const lastChildLine = Math.max(0, ...realChildLines);
          for (const sl of slotLines) {
            if (sl > lastChildLine) {
              slotLines.delete(sl);
              const slotNode: TreeNode = {
                kind: "slot",
                name: "children",
                file,
                line: sl,
              };
              return { ...tree, children: [...newChildren, slotNode] };
            }
          }
        }
      }
      return { ...tree, children: newChildren };
    }
    case "fragment":
      return {
        ...tree,
        children: tree.children.map((c) =>
          injectChildrenSlots(c, slotLines, file, elementRanges),
        ),
      };
    case "branch":
      return {
        ...tree,
        thenBranch: tree.thenBranch
          ? injectChildrenSlots(tree.thenBranch, slotLines, file, elementRanges)
          : null,
        elseBranch: tree.elseBranch
          ? injectChildrenSlots(tree.elseBranch, slotLines, file, elementRanges)
          : null,
      };
    case "list":
      return { ...tree, item: injectChildrenSlots(tree.item, slotLines, file, elementRanges) };
    default:
      return tree;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree walker helpers for queries
// ─────────────────────────────────────────────────────────────────────────────

function walkTree(tree: TreeNode, visitor: (n: TreeNode) => void): void {
  visitor(tree);
  switch (tree.kind) {
    case "component":
    case "element":
    case "fragment":
      for (const c of tree.children) walkTree(c, visitor);
      break;
    case "branch":
      if (tree.thenBranch) walkTree(tree.thenBranch, visitor);
      if (tree.elseBranch) walkTree(tree.elseBranch, visitor);
      break;
    case "list":
      walkTree(tree.item, visitor);
      break;
    default:
      break;
  }
}

function collectWithAncestors(
  tree: TreeNode,
  ancestors: TreeNode[],
  pred: (n: TreeNode) => boolean,
  out: Array<{ ancestors: TreeNode[]; match: TreeNode }>,
): void {
  if (pred(tree)) {
    out.push({ ancestors: [...ancestors], match: tree });
  }
  const nextAnc = [...ancestors, tree];
  switch (tree.kind) {
    case "component":
    case "element":
    case "fragment":
      for (const c of tree.children) collectWithAncestors(c, nextAnc, pred, out);
      break;
    case "branch":
      if (tree.thenBranch) collectWithAncestors(tree.thenBranch, nextAnc, pred, out);
      if (tree.elseBranch) collectWithAncestors(tree.elseBranch, nextAnc, pred, out);
      break;
    case "list":
      collectWithAncestors(tree.item, nextAnc, pred, out);
      break;
    default:
      break;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a synthetic fragment root for multi-match envelopes (R6).
 * file: "<synthetic>", line: 0 per SPEC.
 */
export function buildFragmentRoot(matches: TreeNode[]): TreeNode {
  return { kind: "fragment", file: "<synthetic>", line: 0, children: matches };
}

// ─────────────────────────────────────────────────────────────────────────────
// Analyzer class (D-01, ARCH-02)
// ─────────────────────────────────────────────────────────────────────────────

export class Analyzer {
  /** Per-call parse context (ARCH-02 — never static, never module-scope). */
  private readonly ctx: ParseContext;

  /** Adapter reference — only FrameworkAdapter interface used (island rule). */
  private readonly adapter: FrameworkAdapter;

  /** Resolved project root. */
  private readonly root: string;

  /**
   * Style sidecar — instance Map keyed by file:line:tag (D-12).
   * Populated during IR-build; queried by findByStyle.
   */
  private readonly styleIndex = new Map<string, StyleEntry>();

  /**
   * Within-call route tree cache (Claude's Discretion — ARCH-02 allows within-call memoization).
   */
  private readonly routeTreeCache = new Map<string, { tree: TreeNode; matched: boolean }>();

  constructor(opts: { root: string; adapter: FrameworkAdapter }) {
    this.root = opts.root;
    this.adapter = opts.adapter;
    this.ctx = {
      resolvedRoot: opts.root,
      tsconfig: null,
      astCache: new Map(),
      resolverCache: new Map(),
      warnings: [],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private IR-build helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Build a TreeNode for a single entry file.
   * Wraps the default-export's renderFlow into a kind:"component" node.
   * On parse error, returns a kind:"error" node (D-12 no-throw).
   */
  private buildTreeForEntry(
    absFile: string,
    runtimeMap: Map<string, "client" | "server">,
  ): TreeNode {
    try {
      const defs = this.adapter.extractComponents(this.ctx, [absFile]);

      if (defs.length === 0) {
        return {
          kind: "error",
          message: `no components found in ${toForwardSlash(absFile)}`,
          file: toForwardSlash(absFile),
          line: 0,
        };
      }

      // WR-02: prefer the default-export's component definition.
      // The ComponentDefinition shape is locked at 13 fields (R8) and cannot
      // carry an `isDefault` flag, so we compute the default-export's name
      // from the cached AST and match by name. Falls back to the first
      // non-parse-error definition (legacy behavior) when no default export
      // is detectable, then to defs[0] for fully-degenerate inputs.
      const fwdAbs = toForwardSlash(absFile);
      const cachedForDefault = this.ctx.astCache.get(fwdAbs);
      const defaultExportName =
        cachedForDefault && cachedForDefault.kind === "ok"
          ? findDefaultExportName(cachedForDefault.ast)
          : undefined;
      const def: ComponentDefinition | undefined =
        (defaultExportName
          ? defs.find((d) => d.name === defaultExportName && d.name !== "<parse-error>")
          : undefined) ??
        defs.find((d) => d.name !== "<parse-error>") ??
        defs[0];
      if (!def) {
        return { kind: "error", message: "no component definition", file: toForwardSlash(absFile), line: 0 };
      }

      if (def.name === "<parse-error>") {
        const errMsg = def.renderFlow.kind === "error" ? def.renderFlow.message : "parse error";
        this.ctx.warnings.push(`parse error in ${toForwardSlash(absFile)}: ${errMsg}`);
        return { kind: "error", message: errMsg, file: toForwardSlash(absFile), line: def.line };
      }

      // Populate runtimeMap for this component (D-08)
      runtimeMap.set(def.name, def.runtime);

      // Translate renderFlow to TreeNode
      let bodyTree = renderNodeToTreeNode(def.renderFlow, runtimeMap, this.styleIndex);

      // Inject children slots where {children} identifiers appear in the source.
      // The render-flow walker silently drops {children} JSXExpressionContainers
      // (Identifier nodes return null from walk()). We recover them from the cached AST.
      const fwdFile = toForwardSlash(absFile);
      const cachedParse = this.ctx.astCache.get(fwdFile);
      if (cachedParse && cachedParse.kind === "ok") {
        const slotLines = this.collectChildrenSlotLines(cachedParse.ast);
        if (slotLines.size > 0) {
          // WR-01: thread element open→close line ranges so empty-element slot
          // injection is bounded on both ends by the element's source extent.
          const elementRanges = collectElementLineRanges(cachedParse.ast);
          bodyTree = injectChildrenSlots(bodyTree, slotLines, fwdFile, elementRanges);
        }

        // DEBUG #2 fix: resolve component callsites to their definition files.
        // Walks the body tree and overrides file/line on every kind:"component"
        // node whose tag resolves locally via tsconfig paths + barrel chase.
        const bindings = collectImportBindings(cachedParse.ast);
        if (bindings.size > 0) {
          bodyTree = resolveComponentCallsites(
            bodyTree,
            bindings,
            absFile,
            this.adapter,
            this.ctx,
          );
        }
      }

      // Wrap in a kind:"component" node. Preserve fragment wrappers in the IR
      // (consumers walk through the fragment naturally; flattening is the
      // renderer's job, not the IR's). This keeps the original fragment node's
      // file/line metadata intact for round-trip use cases.
      const base: TreeNode & { kind: "component" } = {
        kind: "component",
        name: def.name,
        children: [bodyTree],
        file: toForwardSlash(def.file),
        line: def.line,
      };
      if (def.runtime === "client") base.layoutHint = "client";
      return base;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.ctx.warnings.push(`adapter error for ${toForwardSlash(absFile)}: ${message}`);
      return { kind: "error", message, file: toForwardSlash(absFile), line: 0 };
    }
  }

  /**
   * Build the full layout-chain + page tree for a matched route.
   * D-09 inside-out slot substitution algorithm.
   */
  private async buildRouteTree(rm: RouteMatch): Promise<TreeNode> {
    const entries = rm.entries;
    const runtimeMap = new Map<string, "client" | "server">();

    // Identify the page file (last page.tsx in entries)
    let pageFile: string | undefined;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (this.adapter.classifyEntry(entries[i]!) === "page") { pageFile = entries[i]; break; }
    }

    // Layout files only (skip template, loading, error, etc.)
    const layoutFiles = entries.filter((e) => this.adapter.classifyEntry(e) === "layout");

    // Build page tree
    let tree: TreeNode = pageFile
      ? this.buildTreeForEntry(pageFile, runtimeMap)
      : buildFragmentRoot([]);

    // D-09 inside-out wrap: layouts are root-down in entries, reverse to get innermost first
    for (let i = layoutFiles.length - 1; i >= 0; i--) {
      const layoutTree = this.buildTreeForEntry(layoutFiles[i]!, runtimeMap);
      tree = replaceSlot(layoutTree, "children", tree);
    }

    // D-10: attach parallel-route slots as sibling nodes (lexicographic order)
    const slotNames = Object.keys(rm.slots).sort();
    for (const slotName of slotNames) {
      const slotEntries = rm.slots[slotName];
      if (!slotEntries || slotEntries.length === 0) continue;

      const slotRm: RouteMatch = {
        matched: true,
        entries: slotEntries,
        params: rm.params,
        slots: {},
      };
      const slotTree = await this.buildRouteTree(slotRm);
      tree = attachParallelSlot(tree, slotName, slotTree, this.ctx.warnings);
    }

    return tree;
  }

  /**
   * Get or build (and cache within-call) the full tree for a route.
   */
  private async getOrBuildRouteTree(route: string): Promise<{ tree: TreeNode; matched: boolean }> {
    const cached = this.routeTreeCache.get(route);
    if (cached) return cached;

    let rm: RouteMatch;
    try {
      rm = await this.adapter.mapRouteToEntry(this.root, route);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.ctx.warnings.push(`route resolution error for ${route}: ${message}`);
      const result = { tree: buildFragmentRoot([]), matched: false };
      this.routeTreeCache.set(route, result);
      return result;
    }

    if (!rm.matched) {
      const result = { tree: buildFragmentRoot([]), matched: false };
      this.routeTreeCache.set(route, result);
      return result;
    }

    const tree = await this.buildRouteTree(rm);
    const result = { tree, matched: true };
    this.routeTreeCache.set(route, result);
    return result;
  }

  /**
   * Build the union IR across all routes in the project.
   * Returns one TreeNode per route. Uses within-call memoization.
   */
  private async buildUnionIR(): Promise<TreeNode[]> {
    let routes: string[];
    try {
      routes = await this.adapter.enumerateRoutes(this.root);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.ctx.warnings.push(`enumerateRoutes error: ${message}`);
      return [];
    }

    const trees: TreeNode[] = [];

    for (const route of routes) {
      const { tree, matched } = await this.getOrBuildRouteTree(route);
      if (matched) trees.push(tree);
    }

    return trees;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Query methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * TOOL-01 — get_full_hierarchy
   * Returns the layout chain + page subtree for a route via slot substitution.
   * R8: no-throw on bad route or parse errors.
   */
  async getFullHierarchy(args: { route: string }): Promise<{ tree: TreeNode; warnings: string[] }> {
    try {
      const { tree, matched } = await this.getOrBuildRouteTree(args.route);
      if (!matched) {
        const warns = [...this.ctx.warnings];
        const expected = `route not matched: ${args.route}`;
        if (!warns.includes(expected)) {
          warns.push(expected);
        }
        return { tree: buildFragmentRoot([]), warnings: warns };
      }
      return { tree, warnings: [...this.ctx.warnings] };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.ctx.warnings.push(`getFullHierarchy error: ${message}`);
      return { tree: buildFragmentRoot([]), warnings: [...this.ctx.warnings] };
    }
  }

  /**
   * TOOL-02 — focus_on
   * Walks the union IR, finds occurrences of a named component,
   * returns subtrees or ancestor chains depending on scope.
   * R8: no-throw.
   */
  async focusOn(args: {
    component: string;
    scope: "up" | "full" | "down";
  }): Promise<{ tree: TreeNode; warnings: string[] }> {
    try {
      const unionTrees = await this.buildUnionIR();
      const pred = (n: TreeNode) => n.kind === "component" && n.name === args.component;
      const matchResults: TreeNode[] = [];

      for (const routeTree of unionTrees) {
        const pairs: Array<{ ancestors: TreeNode[]; match: TreeNode }> = [];
        collectWithAncestors(routeTree, [], pred, pairs);

        for (const { ancestors, match } of pairs) {
          if (args.scope === "down") {
            matchResults.push(match);
          } else if (args.scope === "up") {
            if (ancestors.length === 0) {
              matchResults.push(buildFragmentRoot([]));
            } else {
              matchResults.push(buildAncestorChain(ancestors));
            }
          } else {
            // full: ancestors + subtree
            if (ancestors.length === 0) {
              matchResults.push(match);
            } else {
              matchResults.push(buildAncestorChainWithLeaf(ancestors, match));
            }
          }
        }
      }

      if (matchResults.length === 0) {
        return {
          tree: buildFragmentRoot([]),
          warnings: [...this.ctx.warnings, `component not found: ${args.component}`],
        };
      }

      return { tree: buildFragmentRoot(matchResults), warnings: [...this.ctx.warnings] };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.ctx.warnings.push(`focusOn error: ${message}`);
      return { tree: buildFragmentRoot([]), warnings: [...this.ctx.warnings] };
    }
  }

  /**
   * TOOL-03 — find_by_text
   * Case-insensitive substring match on kind:"text" nodes.
   * Levenshtein ≤2 fallback on zero matches.
   * R8: no-throw.
   */
  async findByText(args: { query: string }): Promise<{ tree: TreeNode; warnings: string[] }> {
    try {
      const unionTrees = await this.buildUnionIR();
      const queryLower = args.query.toLowerCase();
      const matchNodes: TreeNode[] = [];
      const allTextNodes: Array<{ value: string; file: string; line: number }> = [];

      for (const routeTree of unionTrees) {
        walkTree(routeTree, (n) => {
          if (n.kind === "text") {
            allTextNodes.push({ value: n.value, file: n.file, line: n.line });
            if (n.value.toLowerCase().includes(queryLower)) {
              matchNodes.push(n);
            }
          }
          // DEBUG #3 — also match against literal-string attribute values on
          // component/element nodes. The matched node itself is returned (not a
          // synthetic text node) so file:line points at the JSX element that
          // carries the prop.
          if ((n.kind === "component" || n.kind === "element") && n.attributes) {
            for (const attr of n.attributes) {
              allTextNodes.push({ value: attr.value, file: n.file, line: n.line });
              if (attr.value.toLowerCase().includes(queryLower)) {
                matchNodes.push(n);
                break; // one match per node — avoid duplicate pushes if multiple attrs match
              }
            }
          }
        });
      }

      if (matchNodes.length > 0) {
        return { tree: buildFragmentRoot(matchNodes), warnings: [...this.ctx.warnings] };
      }

      // Levenshtein fallback (D-03)
      const warnings = [...this.ctx.warnings];
      const candidates: Array<{ dist: number; value: string; file: string; line: number }> = [];
      for (const { value, file, line } of allTextNodes) {
        const dist = levenshtein(queryLower, value.toLowerCase());
        if (dist <= 2) {
          candidates.push({ dist, value, file, line });
        }
      }
      // Sort by distance, then take top 5 — collecting all ≤2 candidates first
      // ensures a distance-1 hit is never dropped in favor of distance-2 hits
      // discovered earlier (D-03 bound is on candidate count, not discovery order).
      candidates.sort((a, b) => a.dist - b.dist);
      for (const c of candidates.slice(0, 5)) {
        warnings.push(`no exact match — did you mean: "${c.value}" @ ${c.file}:${c.line}`);
      }

      return { tree: buildFragmentRoot([]), warnings };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.ctx.warnings.push(`findByText error: ${message}`);
      return { tree: buildFragmentRoot([]), warnings: [...this.ctx.warnings] };
    }
  }

  /**
   * TOOL-04 — find_by_style
   * Matches className tokens (exact) or style object keys.
   * Dedup by file:line:tag (D-12). R8: no-throw.
   */
  async findByStyle(args: { class_or_prop: string }): Promise<{ tree: TreeNode; warnings: string[] }> {
    try {
      // Build union IR to populate the style sidecar
      const unionTrees = await this.buildUnionIR();

      const matchKeys = new Set<string>();
      for (const [key, entry] of this.styleIndex) {
        if (
          entry.classNames.includes(args.class_or_prop) ||
          entry.styleKeys.includes(args.class_or_prop)
        ) {
          matchKeys.add(key);
        }
      }

      if (matchKeys.size === 0) {
        return { tree: buildFragmentRoot([]), warnings: [...this.ctx.warnings] };
      }

      // Locate matching TreeNodes in union IR by composite key
      const seenKeys = new Set<string>();
      const matchNodes: TreeNode[] = [];

      for (const routeTree of unionTrees) {
        walkTree(routeTree, (n) => {
          if (n.kind !== "element" && n.kind !== "component") return;
          const tag = n.kind === "element" ? n.tag : n.name;
          const nodeKey = `${n.file}:${n.line}:${tag}`;
          if (matchKeys.has(nodeKey) && !seenKeys.has(nodeKey)) {
            seenKeys.add(nodeKey);
            matchNodes.push(n);
          }
        });
      }

      return { tree: buildFragmentRoot(matchNodes), warnings: [...this.ctx.warnings] };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.ctx.warnings.push(`findByStyle error: ${message}`);
      return { tree: buildFragmentRoot([]), warnings: [...this.ctx.warnings] };
    }
  }

  /**
   * Collect all line numbers where slot injection points appear in an AST.
   * Uses adapter.slotMarker to determine which JSXExpressionContainer identifiers
   * count as slot injection points (Next.js: "children"; Expo Router: "Slot").
   */
  private collectChildrenSlotLines(ast: t.File): Set<number> {
    const lines = new Set<number>();
    // `this` is not available inside @babel/traverse visitor callbacks (the
    // traverse function calls visitors without binding them to the outer class
    // instance). Capture adapter in a local variable before entering traverse.
    const adapter = this.adapter;
    const bindings = collectImportBindings(ast);
    traverse(ast, {
      JSXExpressionContainer(path: { node: t.JSXExpressionContainer }) {
        const expr = path.node.expression;
        if (t.isIdentifier(expr)) {
          const binding = bindings.get(expr.name);
          const importSource = binding?.source ?? "";
          if (adapter.slotMarker(expr.name, importSource)) {
            const line = path.node.loc?.start.line ?? 0;
            lines.add(line);
          }
        }
      },
    });
    return lines;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ancestor chain builders for focusOn
// ─────────────────────────────────────────────────────────────────────────────

function buildAncestorChain(ancestors: TreeNode[]): TreeNode {
  if (ancestors.length === 0) return buildFragmentRoot([]);
  let current: TreeNode = nodeWithChildren(ancestors[ancestors.length - 1]!, []);
  for (let i = ancestors.length - 2; i >= 0; i--) {
    current = nodeWithChildren(ancestors[i]!, [current]);
  }
  return current;
}

function buildAncestorChainWithLeaf(ancestors: TreeNode[], match: TreeNode): TreeNode {
  if (ancestors.length === 0) return match;
  let current: TreeNode = nodeWithChildren(ancestors[ancestors.length - 1]!, [match]);
  for (let i = ancestors.length - 2; i >= 0; i--) {
    current = nodeWithChildren(ancestors[i]!, [current]);
  }
  return current;
}

function nodeWithChildren(node: TreeNode, children: TreeNode[]): TreeNode {
  switch (node.kind) {
    case "component": return { ...node, children };
    case "element":   return { ...node, children };
    case "fragment":  return { ...node, children };
    case "branch":
      // Preserve the branch structure; nest the descendant chain in thenBranch.
      return { ...node, thenBranch: children[0] ?? null, elseBranch: null };
    case "list":
      return children[0] ? { ...node, item: children[0] } : node;
    default:
      return node;
  }
}
