/**
 * Parser-level type contracts for the adapter island (Phase 3).
 *
 * D-04 — `RenderNode` is deliberately separate from IR `TreeNode`
 *   (src/ir/schema.ts). Phase 5 owns the `adapter → IR` translator (toIR()).
 *   This file MUST NOT import from src/ir/, src/core/, or src/renderers/ —
 *   the adapter island stays one-directional (the rest of the codebase may
 *   import these types, but never the inverse).
 *
 * R8 (amended NEXT-04) — `ComponentDefinition` is the locked 13-field shape
 *   consumed by every downstream Wave 2/3 plan. The original R8 lock was 12
 *   fields; Phase 4 / NEXT-04 added `runtime` for a final count of 13.
 *   Adding a 14th field is a milestone-level change.
 *
 * No zod schemas live here (D-04). These are pure TypeScript types — the
 * parser output is internal; runtime validation lives at the IR boundary
 * (Phase 5) and at the MCP tool input boundary (Phase 2).
 */

import type { File } from "@babel/types";
import type { TsConfigResult } from "get-tsconfig";

// ──────────────────────────────────────────────────────────────────
// JsxAttribute — discriminated value union for JSX attributes
// (D-05 supporting type; concrete shape locked here per planner's
// discretion — minimum surface is `{ name, value }` where value
// discriminates literal vs expression vs spread).
// ──────────────────────────────────────────────────────────────────

/**
 * One attribute on a JSX element.
 *
 * D-05 — supporting type for `RenderNode { kind: "jsx" }`. Value is a
 * discriminated union so the consumer can distinguish source-text fallback
 * (`expression` / `spread`) from statically-resolved literals.
 */
export interface JsxAttribute {
  name: string;
  value:
    | { kind: "literal"; value: string | number | boolean | null }
    | { kind: "expression"; source: string }
    | { kind: "spread"; source: string };
}

// ──────────────────────────────────────────────────────────────────
// RenderNode — 7-kind discriminated union (D-05).
// Every variant carries `file: string` (forward-slash absolute) +
// `line: number` so Phase 5's toIR() is mechanical.
// ──────────────────────────────────────────────────────────────────

/**
 * Parser-level render flow node.
 *
 * D-04 — separate from IR `TreeNode`; Phase 5 owns the bridge.
 * D-05 — exactly 7 kinds reflecting AST reality (jsx is the single kind for
 *   both components and elements; `isComponent` flag distinguishes them).
 *   No `slot` kind here — slots are a Next.js routing concern (Phase 4).
 */
export type RenderNode =
  | {
      kind: "jsx";
      tag: string;
      isComponent: boolean;
      resolvedFrom?: string;
      attributes: JsxAttribute[];
      children: RenderNode[];
      file: string;
      line: number;
    }
  | {
      kind: "branch";
      condition: string;
      thenBranch: RenderNode | null;
      elseBranch: RenderNode | null;
      file: string;
      line: number;
    }
  | {
      kind: "list";
      item: RenderNode;
      iterableSource: string;
      file: string;
      line: number;
    }
  | {
      kind: "text";
      value: string;
      file: string;
      line: number;
    }
  | {
      kind: "fragment";
      children: RenderNode[];
      file: string;
      line: number;
    }
  | {
      kind: "spread";
      expression: string;
      file: string;
      line: number;
    }
  | {
      kind: "error";
      message: string;
      file: string;
      line: number;
    };

// ──────────────────────────────────────────────────────────────────
// PropSignature — minimal prop shape (D-06).
// `typeSlice` is the raw source of the type annotation; no resolution.
// `optional` derived from `name?: T` syntax.
// ──────────────────────────────────────────────────────────────────

/**
 * One prop on a component.
 *
 * D-06 — minimal v1 shape. No `defaultValue`, no `restElement` flag — Phase 5
 *   query tools have not requested them. Add only when concretely needed.
 * D-07 — for `function Card({ a, b: alias, ...rest }: Props)`, `name` is the
 *   local destructure name (`a`, `alias`, `rest`); `typeSlice` is the raw
 *   source of `Props` for every prop (we do NOT split per-field).
 */
export interface PropSignature {
  name: string;
  typeSlice: string;
  optional: boolean;
}

// ──────────────────────────────────────────────────────────────────
// ClassToken — discriminated className token (D-09).
// `cn`/`clsx`/`cva`/`twMerge` literal args become `literal`; everything
// non-statically-resolvable preserved as a single `raw` token.
// ──────────────────────────────────────────────────────────────────

/**
 * One className token captured from a JSX `className` attribute or
 * `cn`/`clsx`/`cva`/`twMerge` call argument.
 *
 * D-09 — return both literals and raw source slices (PITFALL 5.1). No
 *   symbolic execution / variant-table resolution in v1.
 */
export type ClassToken =
  | { kind: "literal"; value: string; file: string; line: number }
  | { kind: "raw"; source: string; file: string; line: number };

// ──────────────────────────────────────────────────────────────────
// CssModuleRef — `styles.foo` reference (R8 supporting type).
// No CSS file parsing in v1 — `source` is the import specifier only.
// ──────────────────────────────────────────────────────────────────

/**
 * One CSS Modules reference (`styles.foo` → `{ binding: "styles",
 * key: "foo", source: "./X.module.css" }`).
 *
 * R8 — supporting type for `ComponentDefinition.cssModuleRefs`. CSS file
 *   content parsing is deferred to v2.
 */
export interface CssModuleRef {
  binding: string;
  key: string;
  source: string;
}

// ──────────────────────────────────────────────────────────────────
// StyledTemplate — styled-components template literal capture (D-10).
// `body` is the template raw text with each `${...}` replaced by `{?}`.
// ──────────────────────────────────────────────────────────────────

/**
 * One styled-components template literal capture.
 *
 * D-10 — placeholder rule: every `${...}` interpolation in the template body
 *   is replaced by the literal string `{?}`. No theme-function resolution.
 *   Detection is identifier-based (callee is `styled`); no import-source
 *   verification in v1.
 */
export interface StyledTemplate {
  tag: string;
  body: string;
}

// ──────────────────────────────────────────────────────────────────
// ComponentDefinition — locked 13-field shape (R8 amended by NEXT-04).
// `runtime` is the framework-boundary field added in Phase 4 via
// NEXT-04 ("use client" / "use server" detection); it extended the
// original R8 12-field lock to 13.
// ──────────────────────────────────────────────────────────────────

/**
 * The parser's per-component output.
 *
 * R8 (amended NEXT-04) — locked 13-field shape. Adding a 14th field
 *   requires a milestone amendment. Field order (alphabetic-by-purpose):
 *     identity:   name, file, line, kind
 *     wrappers:   wrappers
 *     interface:  props, textContent
 *     render:     renderFlow
 *     styles:     classNames, inlineStyles, cssModuleRefs, styledTemplates
 *     boundary:   runtime
 *
 * Field count check (test/adapters/types.test.ts) asserts Object.keys(...) ===
 *   13 to catch accidental additions/removals.
 */
export interface ComponentDefinition {
  name: string;
  file: string;
  line: number;
  kind: "function" | "class";
  wrappers: string[];
  props: PropSignature[];
  textContent: string[];
  renderFlow: RenderNode;
  classNames: ClassToken[];
  /**
   * Per-component flat map of inline-style declarations.
   *
   * MERGE SEMANTICS — last-wins across elements (WR-04):
   * Multiple JSX elements within the same component contribute their
   * `style={{ ... }}` props into this single record. When two elements set
   * the same key (e.g. both have `style={{ margin: ... }}`), the LATER
   * element overwrites the earlier one silently. This is a deliberate v1
   * limitation imposed by the locked R8 11-field shape — per-element style
   * scoping would require a contract change.
   *
   * Spread elements (`...rest`) are captured under synthetic
   * `__spread_<n>` keys (monotonic counter, unique within an element).
   * Non-object style expressions collapse to a single `__raw__` key.
   *
   * Consumers must NOT assume this map represents any single element's
   * styles — treat it as a best-effort component-level signal only.
   */
  inlineStyles: Record<string, string | { raw: string }>;
  cssModuleRefs: CssModuleRef[];
  styledTemplates: StyledTemplate[];
  /**
   * Per-file Next.js runtime boundary (NEXT-04, D-10..D-13).
   * Read from `ast.program.directives[0]?.value.value`:
   *   - "use client" → "client"
   *   - "use server" or absent → "server" (App Router default)
   * Shared across every ComponentDefinition emitted from the same file.
   */
  runtime: "server" | "client";
}

// ──────────────────────────────────────────────────────────────────
// ResolveResult — discriminated union, never throws (D-12).
// `ambiguous` is reserved for future logic; currently unreachable but
// kept in the union so callers can pattern-match exhaustively.
// ──────────────────────────────────────────────────────────────────

/**
 * Output of `FrameworkAdapter.resolveModule(...)`.
 *
 * D-12 — `resolveModule` returns this discriminated union and never throws.
 *   Callers (`extractComponents`) decide whether to emit a
 *   `RenderNode { kind: "error" }` or drop the import silently.
 * D-13 — `not-found` carries the list of probed paths (`tried`) for
 *   diagnostic surfacing in `ctx.warnings`.
 *
 * D-02 (Phase 8 / POLISH-03) — the `local` variant additionally carries
 *   `line`: the true declaration line of `importedName` in `absolutePath`,
 *   sourced from `ParseResult.declLines` (populated by parseFile). Falls
 *   back to `1` per D-03 when the name is absent from declLines (anonymous
 *   default exports, re-export indirection not recorded) or when the target
 *   file fails to parse.
 */
export type ResolveResult =
  | { ok: true; kind: "local"; absolutePath: string; line: number }
  | { ok: true; kind: "external"; packageName: string }
  | { ok: false; kind: "cycle"; chain: string[] }
  | { ok: false; kind: "not-found"; specifier: string; tried: string[] }
  | { ok: false; kind: "ambiguous"; specifier: string; candidates: string[] };

// ──────────────────────────────────────────────────────────────────
// RouteMatch — Phase 4 mapRouteToEntry return type (D-01..D-04).
// Flat four-field record; D-12 no-throw collapses every failure to
// { matched: false, entries: [], params: {}, slots: {} }.
// ──────────────────────────────────────────────────────────────────

/**
 * Output of `FrameworkAdapter.mapRouteToEntry(...)`.
 *
 * D-01 — co-located with adapter types; Phase 5's toIR() imports from here.
 * D-02 — flat four fields (no tagged-object entries; role recoverable from filename).
 * D-03 — no-match shape: `{ matched: false, entries: [], params: {}, slots: {} }`.
 * D-12 — no-throw; any error (malformed route, missing app/, etc.) collapses
 *   to the no-match shape.
 *
 * `entries` is forward-slash absolute, root-down, with sibling special files
 * (`template.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `default.tsx`)
 * inlined at their segment position. `slots` keys are the parallel-route
 * folder name minus `@` (dynamic, not enum).
 */
export interface RouteMatch {
  matched: boolean;
  entries: string[];
  params: Record<string, string | string[]>;
  slots: Record<string, string[]>;
}

// ──────────────────────────────────────────────────────────────────
// ParseResult — parser primitive output (D-02 cache value).
// ──────────────────────────────────────────────────────────────────

/**
 * Output of `parseFile(ctx, absPath)` and the value type stored in
 * `ParseContext.astCache`.
 *
 * D-02 — cache value is the discriminated union, so re-entries to the same
 *   file (barrel chase) don't re-parse and don't re-throw.
 *
 * D-01 (Phase 8 / POLISH-03) — the `ok` variant additionally carries
 *   `declLines`: a per-file map from a top-level binding name to its
 *   declaration line (`loc.start.line`). Populated by `parseFile` during the
 *   existing single parse pass so downstream `resolveModule` callers can read
 *   the true component declaration line with zero extra parses. Covered names:
 *   named `FunctionDeclaration`, named `VariableDeclarator` with arrow/function
 *   init, `ClassDeclaration`, and re-exported `ExportSpecifier` names.
 *   Anonymous default exports are intentionally absent — callers fall back to
 *   `line: 1` (D-03).
 */
export type ParseResult =
  | { kind: "ok"; ast: File; source: string; declLines: Map<string, number> }
  | { kind: "error"; message: string; line: number };

// ──────────────────────────────────────────────────────────────────
// ParseContext — pure-function state envelope (D-01).
// Built fresh per `NextJsAdapter.extractComponents()` call.
//   - astCache keyed by forward-slash absolute path (D-02)
//   - resolverCache keyed by `${fromFile}::${specifier}::${importedName}` (D-03)
// ──────────────────────────────────────────────────────────────────

/**
 * State envelope threaded through every parser/resolver/extractor function.
 *
 * D-01 — pure functions only; no class instances at the parser level.
 * D-02 — per-call `astCache`; garbage-collected when the context goes out
 *   of scope. Honors ARCH-02 ("no cross-call cache in v1").
 * D-03 — per-call `resolverCache` keyed by the (fromFile, specifier,
 *   importedName) tuple.
 *
 * `warnings` is the in-band channel surfaced in the MCP envelope — `core/`
 * modules MUST push to this rather than calling `console.*` (stdio safety).
 */
export interface ParseContext {
  resolvedRoot: string;
  tsconfig: TsConfigResult | null;
  astCache: Map<string, ParseResult>;
  resolverCache: Map<string, ResolveResult>;
  warnings: string[];
}
