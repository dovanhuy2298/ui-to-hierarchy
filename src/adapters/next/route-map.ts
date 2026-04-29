/**
 * NextJsAdapter.mapRouteToEntry — Phase 4, NEXT-01/02/03.
 *
 * One tinyglobby enumeration → build segment tree → walk URL segments.
 * The tree is a local variable in matchRoute, GC'd on return (ARCH-02).
 *
 * D-12 no-throw: malformed route, missing app/, walk dead-end → empty
 * RouteMatch (`{ matched: false, entries: [], params: {}, slots: {} }`).
 *
 * Within-segment emission order: layout, template, loading, error,
 * notFound, default, page (page is appended last at the terminal node).
 *
 * Intercepting interpretation (v1): when building the tree, an
 * intercepting folder `(.)x` / `(..)x` / `(..)(..)x` / `(...)x` is
 * additionally registered as a synthetic alias under its `targetSegment`
 * name in the SAME parent's children map. This means navigating the
 * URL that matches the stripped target (e.g. `/photo/123`) may resolve
 * to either the regular target subtree OR the intercepting subtree —
 * whichever was registered first wins (insertion-order). This is a
 * deliberate v1 simplification: we do NOT simulate navigation context
 * (the "from where did the user navigate" signal that real Next.js
 * uses to decide whether to render the intercept). Acceptance only
 * requires that the intercepting page file is reachable via the tree.
 */

import { glob } from "tinyglobby";
import { toForwardSlash } from "../../core/paths.js";
import type { RouteMatch } from "../types.js";
import { resolveAppRoot } from "./discover.js";
import { classifySegment, type SegmentKind } from "./segments.js";

type SpecialKey =
  | "page"
  | "layout"
  | "template"
  | "loading"
  | "error"
  | "notFound"
  | "default";

interface SegmentNode {
  segment: SegmentKind;
  children: Map<string, SegmentNode>;
  files: Partial<Record<SpecialKey, string>>;
  parallelSiblings: Map<string, SegmentNode>;
}

const SPECIAL_ORDER: readonly Exclude<SpecialKey, "page">[] = [
  "layout",
  "template",
  "loading",
  "error",
  "notFound",
  "default",
] as const;

function cloneEmpty(): RouteMatch {
  return { matched: false, entries: [], params: {}, slots: {} };
}

function makeNode(segment: SegmentKind): SegmentNode {
  return {
    segment,
    children: new Map(),
    files: {},
    parallelSiblings: new Map(),
  };
}

function fileKey(filename: string): SpecialKey | null {
  const stem = filename.replace(/\.(tsx|jsx|ts|js)$/, "");
  switch (stem) {
    case "page":
      return "page";
    case "layout":
      return "layout";
    case "template":
      return "template";
    case "loading":
      return "loading";
    case "error":
      return "error";
    case "not-found":
      return "notFound";
    case "default":
      return "default";
    default:
      return null;
  }
}

function buildTree(absFwdFiles: string[], fwdAppRoot: string): SegmentNode {
  const root = makeNode({ kind: "static", name: "" });
  const prefix = fwdAppRoot.endsWith("/") ? fwdAppRoot : `${fwdAppRoot}/`;

  // Pass 1: insert every file into the tree, with parallel slot folders
  // initially placed in `children` keyed by raw folder name. We move them
  // to `parallelSiblings` in pass 2 (cleaner than mixing during insertion).
  for (const abs of absFwdFiles) {
    if (!abs.startsWith(prefix)) continue;
    const rel = abs.slice(prefix.length);
    const parts = rel.split("/");
    if (parts.length === 0) continue;
    const filename = parts.pop() as string;
    const key = fileKey(filename);
    if (!key) continue;

    let node = root;
    for (const folder of parts) {
      const seg = classifySegment(folder);
      // D-09 defense-in-depth: skip private folders during tree-build too
      if (seg.kind === "private") {
        node = makeNode(seg); // detached — file will be unreachable
        break;
      }
      let child = node.children.get(folder);
      if (!child) {
        child = makeNode(seg);
        node.children.set(folder, child);

        // Intercepting alias — register the same node under the stripped
        // target name so the URL walk resolves it (v1 interpretation).
        if (seg.kind === "intercepting") {
          if (!node.children.has(seg.targetSegment)) {
            node.children.set(seg.targetSegment, child);
          }
        }
      }
      node = child;
    }
    // skip files that were short-circuited into a private branch
    if (node.segment.kind === "private") continue;
    node.files[key] = abs;
  }

  // Pass 2: move @slot children into parallelSiblings (recursively).
  promoteParallel(root);
  return root;
}

function promoteParallel(node: SegmentNode): void {
  const toMove: string[] = [];
  for (const [name, child] of node.children) {
    if (child.segment.kind === "parallel") toMove.push(name);
    promoteParallel(child);
  }
  for (const name of toMove) {
    const child = node.children.get(name)!;
    const slotName = child.segment.kind === "parallel" ? child.segment.slot : name;
    node.parallelSiblings.set(slotName, child);
    node.children.delete(name);
  }
}

/**
 * Harvest the node's special files (excluding `page`) into `out` in the
 * documented order: layout, template, loading, error, notFound, default.
 * `page` is appended separately at the terminal node by the walker.
 */
function harvestSpecials(node: SegmentNode, out: string[]): void {
  for (const k of SPECIAL_ORDER) {
    const f = node.files[k];
    if (f) out.push(f);
  }
}

/**
 * Recursively walk transparent group children at the same URL position,
 * harvesting their specials and recursing into their subtrees. Returns
 * a flat list of (effectiveNode, accumulatedEntriesFromGroups) pairs to
 * try matching against the next URL token.
 *
 * For simplicity we collect group-collapsed candidates in a list with
 * the accumulated entries each path contributes.
 */
function expandGroups(
  node: SegmentNode,
  acc: string[],
): Array<{ node: SegmentNode; pre: string[] }> {
  const result: Array<{ node: SegmentNode; pre: string[] }> = [
    { node, pre: acc },
  ];
  for (const child of node.children.values()) {
    if (child.segment.kind === "group") {
      const childPre = [...acc];
      harvestSpecials(child, childPre);
      // recurse — group inside group collapses too
      for (const expanded of expandGroups(child, childPre)) {
        result.push(expanded);
      }
    }
  }
  return result;
}

interface WalkOk {
  ok: true;
  entries: string[];
  params: Record<string, string | string[]>;
  slots: Record<string, string[]>;
}
type WalkResult = WalkOk | { ok: false };

/**
 * Run a slot sub-match against the same remaining URL segments under a
 * parallel-route subtree. Slot results live in `slots[slotName]`, never
 * in main entries.
 */
function walkSlot(slotRoot: SegmentNode, urlSegments: string[]): string[] {
  const r = walk(slotRoot, urlSegments, [], {});
  if (!r.ok) return [];
  // Promote any nested slot output to parent slots — for v1 simplicity
  // we discard nested slot output (rare and out-of-spec for v1 acceptance).
  return r.entries;
}

/**
 * Core walk. Consumes URL segments against `node` (which has already had
 * its own specials harvested into `entriesAcc` by the caller). Returns
 * a discriminated result.
 */
function walk(
  node: SegmentNode,
  urlSegments: string[],
  entriesIn: string[],
  paramsIn: Record<string, string | string[]>,
): WalkResult {
  // Harvest current node's specials (layouts/specials at this segment).
  const entries = [...entriesIn];
  harvestSpecials(node, entries);
  const params: Record<string, string | string[]> = { ...paramsIn };
  const slots: Record<string, string[]> = {};

  // Run any parallel-slot siblings registered AT THIS NODE against the
  // SAME remaining URL segments. Slot output lives in slots[slotName].
  for (const [slotName, slotNode] of node.parallelSiblings) {
    const slotEntries = walkSlot(slotNode, urlSegments);
    if (slotEntries.length > 0) {
      slots[slotName] = (slots[slotName] ?? []).concat(slotEntries);
    } else {
      // Always surface the slot key (empty array) so callers can detect it
      // attempted a sub-match. Tests check Array.isArray(slots.modal).
      if (!(slotName in slots)) slots[slotName] = [];
    }
  }

  // Terminal: no URL tokens remain.
  if (urlSegments.length === 0) {
    if (node.files.page) {
      entries.push(node.files.page);
      return { ok: true, entries, params, slots };
    }
    // Optional catch-all child with a page acts as parent-path match.
    for (const [, child] of expandGroupsAndChildren(node)) {
      if (child.segment.kind === "optional-catch-all" && child.files.page) {
        const branchEntries = [...entries];
        // Group transparency: harvest layouts of any groups we pass through.
        // (expandGroupsAndChildren already accounts for that via `pre`.)
        params[child.segment.param] = [];
        harvestSpecials(child, branchEntries);
        branchEntries.push(child.files.page);
        return { ok: true, entries: branchEntries, params, slots };
      }
    }
    return { ok: false };
  }

  const [token, ...rest] = urlSegments;

  // Try every group-collapsed candidate node at this position.
  for (const { node: cand, pre } of expandGroups(node, [])) {
    // For each candidate, attempt to match `token` against its children.
    for (const [, child] of cand.children) {
      const seg = child.segment;
      if (seg.kind === "private" || seg.kind === "parallel" || seg.kind === "group") {
        continue;
      }
      if (seg.kind === "static" && seg.name === token) {
        const r = walk(child, rest, [...entries, ...pre], params);
        if (r.ok) {
          mergeSlots(r, slots);
          return r;
        }
      } else if (seg.kind === "dynamic") {
        const nextParams = { ...params, [seg.param]: token! };
        const r = walk(child, rest, [...entries, ...pre], nextParams);
        if (r.ok) {
          mergeSlots(r, slots);
          return r;
        }
      } else if (seg.kind === "catch-all") {
        if (!child.files.page) continue;
        const all = [token!, ...rest];
        const branchEntries = [...entries, ...pre];
        harvestSpecials(child, branchEntries);
        branchEntries.push(child.files.page);
        const branchParams = { ...params, [seg.param]: all };
        // Slot sub-matches relative to child for the consumed-all case
        const branchSlots: Record<string, string[]> = { ...slots };
        for (const [slotName, slotNode] of child.parallelSiblings) {
          const slotEntries = walkSlot(slotNode, all);
          if (slotEntries.length > 0) {
            branchSlots[slotName] = (branchSlots[slotName] ?? []).concat(slotEntries);
          } else if (!(slotName in branchSlots)) {
            branchSlots[slotName] = [];
          }
        }
        return { ok: true, entries: branchEntries, params: branchParams, slots: branchSlots };
      } else if (seg.kind === "optional-catch-all") {
        if (!child.files.page) continue;
        const all = [token!, ...rest];
        const branchEntries = [...entries, ...pre];
        harvestSpecials(child, branchEntries);
        branchEntries.push(child.files.page);
        const branchParams = { ...params, [seg.param]: all };
        return { ok: true, entries: branchEntries, params: branchParams, slots };
      } else if (seg.kind === "intercepting") {
        // Intercepting: match by stripped target name (v1 alias only —
        // see file-header note). The alias was already registered by
        // buildTree under `seg.targetSegment`, so we only reach here when
        // iterating the original folder name; skip to avoid double-match.
        continue;
      }
    }
  }

  return { ok: false };
}

function* expandGroupsAndChildren(
  node: SegmentNode,
): Iterable<[string, SegmentNode]> {
  for (const entry of node.children) yield entry;
  for (const child of node.children.values()) {
    if (child.segment.kind === "group") {
      yield* expandGroupsAndChildren(child);
    }
  }
}

function mergeSlots(into: WalkOk, parent: Record<string, string[]>): void {
  for (const [k, v] of Object.entries(parent)) {
    if (!(k in into.slots)) {
      into.slots[k] = v;
    } else {
      into.slots[k] = (into.slots[k] ?? []).concat(v);
    }
  }
}

export async function matchRoute(absRoot: string, route: string): Promise<RouteMatch> {
  // D-12: malformed input
  if (typeof route !== "string" || !route.startsWith("/")) {
    return cloneEmpty();
  }
  const segments = route.split("/").filter(Boolean);
  if (segments.some((s) => s === "." || s === "..")) return cloneEmpty();

  let appRoot: string | null;
  try {
    appRoot = await resolveAppRoot(absRoot);
  } catch {
    return cloneEmpty();
  }
  if (!appRoot) return cloneEmpty();
  const fwdAppRoot = toForwardSlash(appRoot);

  let files: string[];
  try {
    files = await glob(
      ["**/{page,layout,template,loading,error,not-found,default}.{tsx,jsx,ts,js}"],
      {
        cwd: appRoot,
        absolute: true,
        ignore: ["**/_*/**", "**/node_modules/**"],
        dot: false,
      },
    );
  } catch {
    return cloneEmpty();
  }
  const fwdFiles = files.map(toForwardSlash);

  const tree = buildTree(fwdFiles, fwdAppRoot);
  const r = walk(tree, segments, [], {});

  // Whenever a parallel-slot subtree exists at root, surface the slot key
  // (with its matched sub-entries or `[]`) regardless of main-match outcome.
  // Slot output NEVER leaks into main `entries` (T-04-13).
  const rootSlots: Record<string, string[]> = {};
  for (const [slotName, slotNode] of tree.parallelSiblings) {
    rootSlots[slotName] = walkSlot(slotNode, segments);
  }

  if (!r.ok) {
    // No main match — but if any root slot matched, the URL is still
    // "reachable" via the slot. We keep matched:false (D-03 conservative)
    // and surface the slots map so callers can introspect.
    const empty = cloneEmpty();
    empty.slots = rootSlots;
    return empty;
  }

  // Merge root-level slot probe into walker's slot output (root probe wins
  // when the walker did not register the same key).
  const mergedSlots: Record<string, string[]> = { ...rootSlots, ...r.slots };
  for (const [k, v] of Object.entries(rootSlots)) {
    if (k in r.slots) {
      // Walker had a finer-grained answer; keep it.
      mergedSlots[k] = r.slots[k]!;
    } else {
      mergedSlots[k] = v;
    }
  }

  return {
    matched: true,
    entries: r.entries,
    params: r.params,
    slots: mergedSlots,
  };
}
