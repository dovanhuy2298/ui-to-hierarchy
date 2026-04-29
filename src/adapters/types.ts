/**
 * Parser-level type contracts (Phase 3).
 *
 * Authority: SPEC R8 (ComponentDefinition 11-field shape), D-04 (RenderNode
 * separate from IR TreeNode; Phase 5 owns toIR()), D-05 (RenderNode 7-kind
 * union), D-06 (file/line on every RenderNode variant), D-09 (ComponentDefinition
 * field set locked), D-12 (ResolveResult discriminated union, never throws).
 *
 * NOTE (Plan 03-02): This file is owned by Plan 03-01 (wave 1, parallel
 * worktree). Plan 03-02 emits an identical copy so its parser primitive can
 * compile in isolation. Both worktrees produce byte-identical content; the
 * orchestrator merge is clean.
 */

import type { File } from "@babel/types";
import type { TsConfigResult } from "get-tsconfig";

// ──────────────────────────────────────────────────────────────────
// RenderNode — 7-kind discriminated union (D-05). Every variant
// carries `file: string` (forward-slash absolute) + `line: number` (D-06).
// ──────────────────────────────────────────────────────────────────

export interface JsxAttribute {
  name: string;
  value:
    | { kind: "literal"; value: string | number | boolean | null }
    | { kind: "expression"; source: string }
    | { kind: "spread"; source: string };
}

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
  | { kind: "list"; item: RenderNode; iterableSource: string; file: string; line: number }
  | { kind: "text"; value: string; file: string; line: number }
  | { kind: "fragment"; children: RenderNode[]; file: string; line: number }
  | { kind: "spread"; expression: string; file: string; line: number }
  | { kind: "error"; message: string; file: string; line: number };

// ──────────────────────────────────────────────────────────────────
// ComponentDefinition — locked 11-field shape (SPEC R8, D-09).
// `runtime` is deliberately absent — Phase 4 layers it via NEXT-04.
// ──────────────────────────────────────────────────────────────────

export interface PropSignature {
  name: string;
  typeSlice: string;
  optional: boolean;
}

export type ClassToken =
  | { kind: "literal"; value: string; file: string; line: number }
  | { kind: "raw"; source: string; file: string; line: number };

export interface CssModuleRef {
  binding: string;
  key: string;
  source: string;
}

export interface StyledTemplate {
  tag: string;
  body: string;
}

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
  inlineStyles: Record<string, string | { raw: string }>;
  cssModuleRefs: CssModuleRef[];
  styledTemplates: StyledTemplate[];
}

// ──────────────────────────────────────────────────────────────────
// Resolver result — discriminated union, never throws (D-12).
// ──────────────────────────────────────────────────────────────────

export type ResolveResult =
  | { ok: true; kind: "local"; absolutePath: string }
  | { ok: true; kind: "external"; packageName: string }
  | { ok: false; kind: "cycle"; chain: string[] }
  | { ok: false; kind: "not-found"; specifier: string; tried: string[] }
  | { ok: false; kind: "ambiguous"; specifier: string; candidates: string[] };

// ──────────────────────────────────────────────────────────────────
// Parser primitive output (D-02 cache value).
// ──────────────────────────────────────────────────────────────────

export type ParseResult =
  | { kind: "ok"; ast: File; source: string }
  | { kind: "error"; message: string; line: number };

// ──────────────────────────────────────────────────────────────────
// ParseContext — pure-function state envelope (D-01). Built fresh per
// NextJsAdapter.extractComponents() call. astCache key is a forward-slash
// absolute path; resolverCache key is `${fromFile}::${specifier}::${importedName}`.
// ──────────────────────────────────────────────────────────────────

export interface ParseContext {
  resolvedRoot: string;
  tsconfig: TsConfigResult | null;
  astCache: Map<string, ParseResult>;
  resolverCache: Map<string, ResolveResult>;
  warnings: string[];
}
