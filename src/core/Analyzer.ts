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
        return base;
      }

      return {
        kind: "element",
        tag: rn.tag,
        children: rn.children.map((c) => renderNodeToTreeNode(c, runtimeMap, sidecar)),
        file: fwdFile,
        line: rn.line,
      };
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
// Slot substitution (D-09/D-10)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recursively visit-and-clone a TreeNode tree, replacing the FIRST
 * kind:"slot" with name === slotName with the replacement tree.
 * Finite depth bounded by tree depth (T-05-02-03).
 * If no slot found, returns original tree unchanged (D-10 silent skip).
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
function attachParallelSlot(tree: TreeNode, slotName: string, slotTree: TreeNode): TreeNode {
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

  // If tree is not a component at top level, return unchanged
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
 * Collect all line numbers where `{children}` JSX expressions appear in an AST.
 * These are JSXExpressionContainer nodes whose expression is an Identifier named "children".
 */
function collectChildrenSlotLines(ast: t.File): Set<number> {
  const lines = new Set<number>();
  traverse(ast, {
    JSXExpressionContainer(path: { node: t.JSXExpressionContainer }) {
      const expr = path.node.expression;
      if (t.isIdentifier(expr) && expr.name === "children") {
        const line = path.node.loc?.start.line ?? 0;
        lines.add(line);
      }
    },
  });
  return lines;
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
function injectChildrenSlots(tree: TreeNode, slotLines: Set<number>, file: string): TreeNode {
  if (slotLines.size === 0) return tree;

  switch (tree.kind) {
    case "component": {
      // Recurse on existing children first
      const newChildren = tree.children.map((c) => injectChildrenSlots(c, slotLines, file));
      return { ...tree, children: newChildren };
    }
    case "element": {
      // Recurse into existing children first.
      const newChildren = tree.children.map((c) => injectChildrenSlots(c, slotLines, file));

      // Check if this element should receive a {children} slot injected.
      //
      // Case A: element currently has no children — inject a slot if any slotLine
      //   is on or after this element's opening tag line.
      //
      // Case B: element already has children (e.g. <div><Sidebar />{children}</div>)
      //   — inject a slot AFTER the last existing child when a slotLine is greater
      //   than the last child's line. This handles siblings like {children} following
      //   another JSX element in the same parent.
      if (slotLines.size > 0) {
        if (newChildren.length === 0) {
          // Case A — empty element
          for (const sl of slotLines) {
            if (sl >= tree.line) {
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
          const lastChildLine = Math.max(...newChildren.map((c) => c.line));
          for (const sl of slotLines) {
            if (sl > lastChildLine) {
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
      return { ...tree, children: tree.children.map((c) => injectChildrenSlots(c, slotLines, file)) };
    case "branch":
      return {
        ...tree,
        thenBranch: tree.thenBranch ? injectChildrenSlots(tree.thenBranch, slotLines, file) : null,
        elseBranch: tree.elseBranch ? injectChildrenSlots(tree.elseBranch, slotLines, file) : null,
      };
    case "list":
      return { ...tree, item: injectChildrenSlots(tree.item, slotLines, file) };
    default:
      return tree;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// File role helpers
// ─────────────────────────────────────────────────────────────────────────────

function isPageFile(absPath: string): boolean {
  const base = toForwardSlash(absPath).split("/").pop() ?? "";
  return /^page\.(tsx|jsx|ts|js)$/.test(base);
}

function isSpecialFile(absPath: string): boolean {
  const base = toForwardSlash(absPath).split("/").pop() ?? "";
  return /^(layout|template|loading|error|not-found|default)\.(tsx|jsx|ts|js)$/.test(base);
}

function isLayoutFile(absPath: string): boolean {
  const base = toForwardSlash(absPath).split("/").pop() ?? "";
  return /^layout\.(tsx|jsx|ts|js)$/.test(base);
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
  private readonly routeTreeCache = new Map<string, TreeNode>();

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

      // Pick the first non-parse-error component definition
      const def: ComponentDefinition | undefined = defs.find((d) => d.name !== "<parse-error>") ?? defs[0];
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
        const slotLines = collectChildrenSlotLines(cachedParse.ast);
        if (slotLines.size > 0) {
          bodyTree = injectChildrenSlots(bodyTree, slotLines, fwdFile);
        }
      }

      // Wrap in a kind:"component" node
      const base: TreeNode & { kind: "component" } = {
        kind: "component",
        name: def.name,
        children: bodyTree.kind === "fragment" ? bodyTree.children : [bodyTree],
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
      if (isPageFile(entries[i]!)) { pageFile = entries[i]; break; }
    }

    // Layout files only (skip template, loading, error, etc.)
    const layoutFiles = entries.filter((e) => isLayoutFile(e));

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
      tree = attachParallelSlot(tree, slotName, slotTree);
    }

    return tree;
  }

  /**
   * Get or build (and cache within-call) the full tree for a route.
   */
  private async getOrBuildRouteTree(route: string): Promise<{ tree: TreeNode; matched: boolean }> {
    const cached = this.routeTreeCache.get(route);
    if (cached) return { tree: cached, matched: true };

    let rm: RouteMatch;
    try {
      rm = await this.adapter.mapRouteToEntry(this.root, route);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.ctx.warnings.push(`route resolution error for ${route}: ${message}`);
      return { tree: buildFragmentRoot([]), matched: false };
    }

    if (!rm.matched) {
      return { tree: buildFragmentRoot([]), matched: false };
    }

    const tree = await this.buildRouteTree(rm);
    this.routeTreeCache.set(route, tree);
    return { tree, matched: true };
  }

  /**
   * Build the union IR across all routes in the project.
   * Returns one TreeNode per route. Uses within-call memoization.
   */
  private async buildUnionIR(): Promise<TreeNode[]> {
    let entries: string[];
    try {
      entries = await this.adapter.discoverEntries(this.root);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.ctx.warnings.push(`discoverEntries error: ${message}`);
      return [];
    }

    const routes = deriveRoutesFromEntries(entries, this.root);
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
        if (!warns.some((w) => w.includes("route not matched"))) {
          warns.push(`route not matched: ${args.route}`);
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
          if (candidates.length >= 5) break; // early exit (D-03)
        }
      }
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Route derivation from discovered entry files
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive unique route strings from discovered entry file paths.
 * Only page files contribute routes. Handles route groups, parallel routes, private folders.
 */
function deriveRoutesFromEntries(entries: string[], absRoot: string): string[] {
  const routes = new Set<string>();
  const fwdRoot = toForwardSlash(absRoot);

  // Find app root (app/ or src/app/)
  let appRoot: string | null = null;
  for (const dir of ["app", "src/app"]) {
    const candidate = `${fwdRoot}/${dir}`;
    if (entries.some((e) => toForwardSlash(e).startsWith(`${candidate}/`))) {
      appRoot = candidate;
      break;
    }
  }
  if (!appRoot) return [];

  for (const entry of entries) {
    const fwd = toForwardSlash(entry);
    if (!isPageFile(fwd)) continue;
    if (!fwd.startsWith(`${appRoot}/`)) continue;

    const rel = fwd.slice(appRoot.length + 1); // relative to app root
    const parts = rel.split("/");
    parts.pop(); // remove the page.tsx filename

    const routeSegments: string[] = [];
    let skip = false;
    for (const part of parts) {
      if (/^\(.+\)$/.test(part)) continue; // route group — transparent
      if (/^@/.test(part)) { skip = true; break; } // parallel route folder — not a route
      if (/^_/.test(part)) { skip = true; break; } // private folder
      routeSegments.push(part);
    }
    if (skip) continue;

    const route = routeSegments.length === 0 ? "/" : `/${routeSegments.join("/")}`;
    routes.add(route);
  }

  return Array.from(routes).sort();
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
    default:          return node;
  }
}
