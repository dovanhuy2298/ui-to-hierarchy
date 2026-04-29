/**
 * NextJsAdapter — Phase 3 final integration (ARCH-01 + SPEC R7/R8).
 *
 * The only `FrameworkAdapter` implementation v1 ships. Phase 3 fills in two
 * methods for real:
 *   - `resolveModule(...)` delegates to the core resolver (Plan 03).
 *   - `extractComponents(...)` orchestrates parseFile + discoverComponents +
 *     walkRenderFlow + collectStyleSignals, producing a `ComponentDefinition[]`
 *     with all 11 SPEC R8 fields populated (D-12: never throws).
 *
 * The remaining three methods (`detect`, `discoverEntries`, `mapRouteToEntry`)
 * each raise `Error("not implemented in Phase 3")` per SPEC R7; Phase 4
 * fills them in with Next.js routing semantics.
 *
 * This file lives in the adapters island and is permitted to runtime-import
 * from src/core/. The reverse direction is blocked by the architecture test
 * (test/architecture/island.test.ts).
 */

import * as t from "@babel/types";
import type { FrameworkAdapter } from "../FrameworkAdapter.js";
import type {
  ComponentDefinition,
  ParseContext,
  PropSignature,
  RenderNode,
  ResolveResult,
} from "../types.js";
import { collectStyleSignals } from "../../core/extractors/index.js";
import { parseFile } from "../../core/parser/index.js";
import { toForwardSlash } from "../../core/paths.js";
import {
  discoverComponents,
  type DiscoveredComponent,
} from "../../core/render-flow/component-detect.js";
import { walkRenderFlow } from "../../core/render-flow/index.js";
import { resolveModule as coreResolveModule } from "../../core/resolver/index.js";

export const NextJsAdapter: FrameworkAdapter = {
  detect(_absRoot: string): boolean {
    throw new Error("not implemented in Phase 3");
  },

  discoverEntries(_absRoot: string): string[] {
    throw new Error("not implemented in Phase 3");
  },

  mapRouteToEntry(_absRoot: string, _route: string): string[] {
    throw new Error("not implemented in Phase 3");
  },

  resolveModule(
    ctx: ParseContext,
    fromFile: string,
    specifier: string,
    importedName: string,
  ): ResolveResult {
    return coreResolveModule(ctx, fromFile, specifier, importedName);
  },

  extractComponents(
    ctx: ParseContext,
    entryFiles: string[],
    opts: { fullClasses?: boolean } = {},
  ): ComponentDefinition[] {
    const out: ComponentDefinition[] = [];
    for (const absPath of entryFiles) {
      const fwdFile = toForwardSlash(absPath);
      const parsed = parseFile(ctx, absPath);
      if (parsed.kind === "error") {
        // D-12 (no-throw): surface parse failures as a synthetic
        // ComponentDefinition with a kind:"error" renderFlow.
        out.push({
          name: "<parse-error>",
          file: fwdFile,
          line: parsed.line,
          kind: "function",
          wrappers: [],
          props: [],
          textContent: [],
          renderFlow: {
            kind: "error",
            message: parsed.message,
            file: fwdFile,
            line: parsed.line,
          },
          classNames: [],
          inlineStyles: {},
          cssModuleRefs: [],
          styledTemplates: [],
        });
        continue;
      }
      const components = discoverComponents(parsed.ast);
      for (const comp of components) {
        out.push(buildComponentDefinition(comp, parsed.ast, parsed.source, fwdFile, opts));
      }
    }
    return out;
  },
};

function buildComponentDefinition(
  comp: DiscoveredComponent,
  ast: t.File,
  source: string,
  file: string,
  opts: { fullClasses?: boolean },
): ComponentDefinition {
  // 1. Render flow walked from the component body.
  const renderFlow = walkRenderFlow(comp.body, source, file);

  // 2. Collect every JSXElement reachable from the component body for
  //    per-element style signal extraction (Tailwind, inline-style).
  const jsxElements = collectJsxElements(comp.body);

  // 3. Style signals — Tailwind + inline are per-element; CSS-Modules +
  //    styled-components are file-level (whole AST).
  const styleSignals = collectStyleSignals(ast, jsxElements, source, file, opts);

  // 4. Props — minimal D-06/D-07 extraction from the component's first param.
  const props = extractProps(comp.body, source);

  // 5. textContent — string literals in JSXText, harvested from the walked tree.
  const textContent = collectTextContent(renderFlow);

  return {
    name: comp.name,
    file,
    line: comp.declarationLine,
    kind: comp.kind,
    wrappers: comp.wrappers,
    props,
    textContent,
    renderFlow,
    classNames: styleSignals.classNames,
    inlineStyles: styleSignals.inlineStyles,
    cssModuleRefs: styleSignals.cssModuleRefs,
    styledTemplates: styleSignals.styledTemplates,
  };
}

/**
 * Hand-rolled JSXElement harvester. We avoid `@babel/traverse` here because
 * it expects a Program/File root; wrapping arbitrary subtrees in a synthetic
 * Program is fragile (only Expression nodes wrap cleanly). A direct recursive
 * walk over enumerable child fields covers every AST shape uniformly.
 */
function collectJsxElements(node: t.Node): t.JSXElement[] {
  const out: t.JSXElement[] = [];
  walkAst(node, (n) => {
    if (t.isJSXElement(n)) out.push(n);
  });
  return out;
}

/** Skip these keys when descending — they hold position metadata, not children. */
const SKIP_KEYS: ReadonlySet<string> = new Set([
  "loc",
  "start",
  "end",
  "range",
  "leadingComments",
  "trailingComments",
  "innerComments",
  "extra",
]);

function walkAst(node: t.Node | null | undefined, visit: (n: t.Node) => void): void {
  if (!node) return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const child = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(child)) {
      for (const c of child) {
        if (isAstNode(c)) walkAst(c as t.Node, visit);
      }
    } else if (isAstNode(child)) {
      walkAst(child as t.Node, visit);
    }
  }
}

function isAstNode(value: unknown): boolean {
  return (
    !!value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string"
  );
}

/**
 * D-06 + D-07 minimal prop extraction.
 *
 *   function Card(props: Props)               → [{ name: "props", typeSlice: "Props", optional: false }]
 *   function Card({ a, b: alias, ...rest }: Props)
 *                                              → three entries, all sharing typeSlice "Props"
 *   function Card({ a = 1 }: Props)            → [{ name: "a", typeSlice: "Props", optional: true }]
 *
 * Class components and HOC-Identifier bodies fall through to []. Class prop
 * signatures are tracked via the class's TS generic (out of scope for Phase 3
 * — R8 leaves this for v2).
 */
function extractProps(body: t.Node, source: string): PropSignature[] {
  let fn: t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression | null = null;
  if (
    t.isFunctionDeclaration(body) ||
    t.isFunctionExpression(body) ||
    t.isArrowFunctionExpression(body)
  ) {
    fn = body;
  }
  if (!fn || fn.params.length === 0) return [];
  const param = fn.params[0];
  if (!param) return [];

  // Capture the type slice once — shared across every destructured field (D-07).
  const typeSlice = readTypeSlice(param, source);

  // `function Card(props: Props)` — pure positional → single synthetic entry.
  if (t.isIdentifier(param)) {
    return [{ name: param.name, typeSlice, optional: !!param.optional }];
  }

  // `function Card({ a, b: alias, ...rest }: Props)` — destructure.
  const objPat = t.isObjectPattern(param)
    ? param
    : t.isAssignmentPattern(param) && t.isObjectPattern(param.left)
      ? param.left
      : null;
  if (!objPat) return [];

  const props: PropSignature[] = [];
  for (const p of objPat.properties) {
    if (t.isObjectProperty(p)) {
      let localName: string | null = null;
      let optional = false;
      if (t.isIdentifier(p.value)) {
        localName = p.value.name;
      } else if (t.isAssignmentPattern(p.value) && t.isIdentifier(p.value.left)) {
        localName = p.value.left.name;
        optional = true; // default value implies optional in JS surface
      }
      if (localName) props.push({ name: localName, typeSlice, optional });
    } else if (t.isRestElement(p) && t.isIdentifier(p.argument)) {
      props.push({ name: p.argument.name, typeSlice, optional: false });
    }
  }
  return props;
}

function readTypeSlice(param: t.Node, source: string): string {
  // Identifier with type annotation: `props: Props`
  if (t.isIdentifier(param) && param.typeAnnotation && t.isTSTypeAnnotation(param.typeAnnotation)) {
    return sliceSource(source, param.typeAnnotation.typeAnnotation);
  }
  // ObjectPattern with type annotation: `{ a }: Props`
  if (
    t.isObjectPattern(param) &&
    param.typeAnnotation &&
    t.isTSTypeAnnotation(param.typeAnnotation)
  ) {
    return sliceSource(source, param.typeAnnotation.typeAnnotation);
  }
  // AssignmentPattern wrapping ObjectPattern: `{ a } = {} : Props` — the type
  // annotation hangs off the left ObjectPattern in TS-Babel.
  if (t.isAssignmentPattern(param) && t.isObjectPattern(param.left)) {
    const left = param.left;
    if (left.typeAnnotation && t.isTSTypeAnnotation(left.typeAnnotation)) {
      return sliceSource(source, left.typeAnnotation.typeAnnotation);
    }
  }
  return "";
}

function collectTextContent(node: RenderNode | null): string[] {
  if (!node) return [];
  const out: string[] = [];
  visit(node);
  return out;

  function visit(n: RenderNode | null): void {
    if (!n) return;
    if (n.kind === "text") {
      out.push(n.value);
      return;
    }
    if (n.kind === "jsx" || n.kind === "fragment") {
      for (const c of n.children) visit(c);
      return;
    }
    if (n.kind === "branch") {
      visit(n.thenBranch);
      visit(n.elseBranch);
      return;
    }
    if (n.kind === "list") {
      visit(n.item);
      return;
    }
    // kind: "spread" | "error" — no nested text.
  }
}

function sliceSource(source: string, node: t.Node): string {
  const start = node.start ?? 0;
  const end = node.end ?? start;
  return source.slice(start, end);
}
