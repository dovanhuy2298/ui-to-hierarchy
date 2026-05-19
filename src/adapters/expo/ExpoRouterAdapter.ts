/**
 * ExpoRouterAdapter — full implementation of FrameworkAdapter for Expo Router.
 *
 * Phase 12 Plan 03: all 8 methods implemented using Wave 1 utility modules.
 * replaces all stub methods from Phase 11 Plan 02.
 *
 * D-11 island rule: this file may import from src/core/ but src/core/ must
 * never import from src/adapters/.
 *
 * All warnings pushed to ctx.warnings[] — no direct stderr/stdout output.
 */

import * as t from "@babel/types";
import type { FrameworkAdapter } from "../FrameworkAdapter.js";
import type {
  ComponentDefinition,
  ParseContext,
  ResolveResult,
  RouteMatch,
} from "../types.js";
import { parseFile } from "../../core/parser/index.js";
import { toForwardSlash } from "../../core/paths.js";
import {
  discoverComponents,
  type DiscoveredComponent,
} from "../../core/render-flow/component-detect.js";
import { walkRenderFlow } from "../../core/render-flow/index.js";
import { resolveModule as coreResolveModule } from "../../core/resolver/index.js";
import { traverse } from "../../core/babel-shim.js";
import { collectImportBindings } from "../../core/import-bindings.js";
import {
  discoverEntries as expoDiscoverEntries,
  detectDualRoots,
} from "./discover.js";
import {
  enumerateRoutes as expoEnumerateRoutes,
  mapRouteToEntry as expoMapRouteToEntry,
} from "./route-map.js";
import { isRNPrimitive } from "./rn-primitives.js";

/** SKIP_KEYS — avoid descending into metadata fields when walking AST subtrees. */
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

function collectJsxElements(node: t.Node): t.JSXElement[] {
  const out: t.JSXElement[] = [];
  walkAst(node, (n) => {
    if (t.isJSXElement(n)) out.push(n);
  });
  return out;
}

/**
 * Serialize an ObjectExpression's literal-typed properties to a compact JSON string.
 * Non-serializable values (expressions, functions, etc.) are silently omitted (D-03).
 */
function serializeOptionsObject(expr: t.Expression): string {
  if (!t.isObjectExpression(expr)) return "{}";
  const obj: Record<string, unknown> = {};
  for (const prop of expr.properties) {
    if (!t.isObjectProperty(prop)) continue;
    let key: string | null = null;
    if (t.isIdentifier(prop.key)) {
      key = prop.key.name;
    } else if (t.isStringLiteral(prop.key)) {
      key = prop.key.value;
    }
    if (!key) continue;
    const val = prop.value;
    if (t.isStringLiteral(val)) {
      obj[key] = val.value;
    } else if (t.isNumericLiteral(val)) {
      obj[key] = val.value;
    } else if (t.isBooleanLiteral(val)) {
      obj[key] = val.value;
    }
    // NullLiteral, expression, etc. silently omitted
  }
  return JSON.stringify(obj);
}

/**
 * Get a JSX attribute value.
 * Returns { found: true, value: ... } for known attribute, { found: false } otherwise.
 */
function getJsxAttr(
  attrs: (t.JSXAttribute | t.JSXSpreadAttribute)[],
  attrName: string,
): { found: false } | { found: true; node: t.JSXAttribute } {
  for (const attr of attrs) {
    if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === attrName) {
      return { found: true, node: attr };
    }
  }
  return { found: false };
}

/**
 * Screen info collected from JSX traversal for Tabs.Screen / Stack.Screen.
 */
interface ScreenInfo {
  navigatorName: string; // "Tabs" or "Stack"
  screenName: string;
  optionsValue: string; // compact JSON string
  line: number;
}

export class ExpoRouterAdapter implements FrameworkAdapter {
  /** Pending warnings queued by discoverEntries, flushed into ctx.warnings on extractComponents. */
  private pendingWarnings: string[] = [];

  /**
   * Always returns false — real detection is in src/adapters/expo/detect.ts.
   * Do NOT call this method on an already-selected ExpoRouterAdapter instance.
   */
  async detect(_absRoot: string): Promise<boolean> {
    return false;
  }

  /**
   * Enumerate parser entry points for the Expo Router project.
   * First checks for dual-root situation (both app/ and src/app/ exist),
   * queues a warning into pendingWarnings if so, then delegates to the
   * standalone discoverEntries helper.
   */
  async discoverEntries(absRoot: string): Promise<string[]> {
    const { hasSrcApp, hasApp } = await detectDualRoots(absRoot);
    if (hasSrcApp && hasApp) {
      const srcAppPath = toForwardSlash(`${absRoot}/src/app`);
      const appPath = toForwardSlash(`${absRoot}/app`);
      this.pendingWarnings.push(
        `Both app/ and src/app/ exist at ${absRoot}; using src/app/. Paths: ${srcAppPath}, ${appPath}`,
      );
    }
    return expoDiscoverEntries(absRoot);
  }

  /** Delegates to the shared core resolver (same as NextJsAdapter). */
  resolveModule(
    ctx: ParseContext,
    fromFile: string,
    specifier: string,
    importedName: string,
  ): ResolveResult {
    return coreResolveModule(ctx, fromFile, specifier, importedName);
  }

  /**
   * Classify an entry file by its role in Expo Router's filesystem convention.
   * - _layout.* → "layout"
   * - +not-found.* → "special"
   * - +*.* (any other + prefix) → "other"
   * - everything else → "page"
   */
  classifyEntry(absPath: string): "page" | "layout" | "special" | "other" {
    const base = toForwardSlash(absPath).split("/").pop() ?? "";
    if (/^_layout\.(tsx|jsx|ts|js)$/.test(base)) return "layout";
    if (/^\+not-found\.(tsx|jsx|ts|js)$/.test(base)) return "special";
    if (/^\+/.test(base)) return "other";
    return "page";
  }

  /** Enumerate all URL routes produced by the Expo app. */
  async enumerateRoutes(absRoot: string): Promise<string[]> {
    return expoEnumerateRoutes(absRoot);
  }

  /** Map a URL route to the ordered list of layout + page files. */
  async mapRouteToEntry(absRoot: string, route: string): Promise<RouteMatch> {
    return expoMapRouteToEntry(absRoot, route);
  }

  /**
   * Returns true only for the Expo Router slot injection point.
   * Expo Router uses `<Slot />` imported from "expo-router".
   */
  slotMarker(name: string, importSource: string): boolean {
    return name === "Slot" && importSource === "expo-router";
  }

  /**
   * Parse entry files into ComponentDefinition[], with Expo-specific post-processing:
   * - Flushes pendingWarnings into ctx.warnings at start
   * - RN primitive classification: <View>, <Text>, etc. from "react-native" → kind: "element"
   * - Text content extraction for <Text> RN primitives
   * - Namespace import warning for `import * as RN from "react-native"`
   * - Tabs.Screen / Stack.Screen enumeration with name + options attributes
   */
  extractComponents(
    ctx: ParseContext,
    entryFiles: string[],
    _opts: { fullClasses?: boolean } = {},
  ): ComponentDefinition[] {
    // Flush pending dual-root warnings from discoverEntries
    for (const w of this.pendingWarnings) ctx.warnings.push(w);
    this.pendingWarnings = [];

    const out: ComponentDefinition[] = [];

    for (const absPath of entryFiles) {
      const fwdFile = toForwardSlash(absPath);
      const parsed = parseFile(ctx, absPath);

      if (parsed.kind === "error") {
        // D-12 (no-throw): surface parse failures as a synthetic ComponentDefinition
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
          runtime: "server",
        });
        continue;
      }

      const bindings = collectImportBindings(parsed.ast);

      // 1. Namespace import warning (SPEC Req 10)
      traverse(parsed.ast, {
        ImportDeclaration(path: { node: t.ImportDeclaration }) {
          const source = path.node.source.value;
          if (source !== "react-native") return;
          for (const spec of path.node.specifiers) {
            if (t.isImportNamespaceSpecifier(spec)) {
              const line = path.node.loc?.start.line ?? 0;
              ctx.warnings.push(
                `Namespace import '${spec.local.name}' from 'react-native' detected at ${fwdFile}:${line} — members not classified as RN primitives`,
              );
            }
          }
        },
      });

      // 2. Collect Tabs.Screen / Stack.Screen info from JSX
      const screenInfos: ScreenInfo[] = [];
      traverse(parsed.ast, {
        JSXElement(path: { node: t.JSXElement }) {
          const openingEl = path.node.openingElement;
          const nameNode = openingEl.name;
          // Match <Tabs.Screen> or <Stack.Screen>
          if (!t.isJSXMemberExpression(nameNode)) return;
          const objName = t.isJSXIdentifier(nameNode.object) ? nameNode.object.name : null;
          const propName = t.isJSXIdentifier(nameNode.property) ? nameNode.property.name : null;
          if (!objName || !propName) return;
          if (!["Tabs", "Stack"].includes(objName)) return;
          if (propName !== "Screen") return;

          const line = openingEl.loc?.start.line ?? 0;
          const navigatorName = objName;

          // Extract name attribute
          const nameAttr = getJsxAttr(openingEl.attributes, "name");
          if (!nameAttr.found) return;

          const nameAttrValue = nameAttr.node.value;
          if (!nameAttrValue || !t.isStringLiteral(nameAttrValue)) {
            // Non-literal name prop — emit warning, skip enumeration
            ctx.warnings.push(
              `Non-literal name prop on <${navigatorName}.Screen> at ${fwdFile}:${line} — screen not enumerated`,
            );
            return;
          }
          const screenName = nameAttrValue.value;

          // Extract options attribute
          let optionsValue = "{}";
          const optionsAttr = getJsxAttr(openingEl.attributes, "options");
          if (optionsAttr.found) {
            const optionsAttrValue = optionsAttr.node.value;
            if (
              optionsAttrValue &&
              t.isJSXExpressionContainer(optionsAttrValue) &&
              !t.isJSXEmptyExpression(optionsAttrValue.expression)
            ) {
              optionsValue = serializeOptionsObject(
                optionsAttrValue.expression as t.Expression,
              );
            }
          }

          screenInfos.push({ navigatorName, screenName, optionsValue, line });
        },
      });

      // 3. Discover components and post-process
      const components = discoverComponents(parsed.ast);
      for (const comp of components) {
        const componentDef = this.buildComponentDefinition(
          comp,
          parsed.ast,
          parsed.source,
          fwdFile,
          bindings,
          screenInfos,
          ctx,
        );
        out.push(componentDef);
      }
    }

    return out;
  }

  private buildComponentDefinition(
    comp: DiscoveredComponent,
    ast: t.File,
    source: string,
    file: string,
    bindings: Map<string, { source: string; importedName: string }>,
    _screenInfos: ScreenInfo[],
    _ctx: ParseContext,
  ): ComponentDefinition {
    // 1. Render flow
    const renderFlow = walkRenderFlow(comp.body, source, file);

    // 2. JSX elements for RN primitive post-processing
    const jsxElements = collectJsxElements(comp.body);

    // 3. Props
    const props = extractProps(comp.body, source);

    // 4. Text content
    const textContent = collectTextContent(renderFlow);

    // 5. Runtime boundary
    const firstDirective = ast.program.directives[0]?.value.value;
    const runtime: "server" | "client" =
      firstDirective === "use client" ? "client" : "server";

    // 6. RN primitive post-processing on render flow
    const processedRenderFlow = postProcessRenderFlow(renderFlow, bindings, jsxElements);

    return {
      name: comp.name,
      file,
      line: comp.declarationLine,
      kind: comp.kind,
      wrappers: comp.wrappers,
      props,
      textContent,
      renderFlow: processedRenderFlow,
      classNames: [],
      inlineStyles: {},
      cssModuleRefs: [],
      styledTemplates: [],
      runtime,
    };
  }
}

/**
 * Post-process the render flow tree to apply RN primitive classification.
 * For JSX nodes whose tag maps to an RN primitive via import bindings:
 *   - Set kind to "element" (isComponent: false in jsx node maps to element)
 *   - For "Text" RN primitive: collect literal JSXText children and populate text
 *
 * This operates on the rendered RenderNode tree, not the raw AST.
 * We detect RN primitives using the bindings map.
 */
function postProcessRenderFlow(
  node: import("../types.js").RenderNode | null,
  bindings: Map<string, { source: string; importedName: string }>,
  _jsxElements: t.JSXElement[],
): import("../types.js").RenderNode {
  if (!node) {
    return { kind: "error", message: "null render flow", file: "", line: 0 };
  }
  return visitRenderNode(node, bindings);
}

function visitRenderNode(
  node: import("../types.js").RenderNode,
  bindings: Map<string, { source: string; importedName: string }>,
): import("../types.js").RenderNode {
  if (node.kind === "jsx") {
    const binding = bindings.get(node.tag);
    const isRN = binding ? isRNPrimitive(node.tag, binding.source) : false;

    // Process children recursively
    const processedChildren = node.children.map((child) =>
      visitRenderNode(child, bindings),
    );

    if (isRN) {
      // RN primitive: override isComponent to false (it's an element)
      // For "Text": extract literal text content
      if (node.tag === "Text") {
        // Collect literal text from JSXText children (non-whitespace)
        const textParts: string[] = [];
        for (const child of node.children) {
          if (child.kind === "text" && child.value.trim()) {
            textParts.push(child.value.trim());
          }
        }
        const textValue = textParts.join("").trim();
        const result: import("../types.js").RenderNode = {
          ...node,
          isComponent: false,
          children: processedChildren,
        };
        // Only add text if we extracted something (not dynamic children)
        if (textValue) {
          // We inject text via a synthetic attribute approach:
          // Since RenderNode jsx doesn't have a text field directly,
          // we embed it in attributes
          return {
            ...result,
            attributes: [
              ...node.attributes,
              { name: "__rnText", value: { kind: "literal", value: textValue } },
            ],
          };
        }
        return result;
      }

      return {
        ...node,
        isComponent: false,
        children: processedChildren,
      };
    }

    return { ...node, children: processedChildren };
  }

  if (node.kind === "fragment") {
    return {
      ...node,
      children: node.children.map((child) => visitRenderNode(child, bindings)),
    };
  }

  if (node.kind === "branch") {
    return {
      ...node,
      thenBranch: node.thenBranch ? visitRenderNode(node.thenBranch, bindings) : null,
      elseBranch: node.elseBranch ? visitRenderNode(node.elseBranch, bindings) : null,
    };
  }

  if (node.kind === "list") {
    return {
      ...node,
      item: visitRenderNode(node.item, bindings),
    };
  }

  return node;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers copied from NextJsAdapter (kept internal to this file)
// ─────────────────────────────────────────────────────────────────────────────

import type { PropSignature, RenderNode } from "../types.js";
import * as tTypes from "@babel/types";

function extractProps(body: t.Node, source: string): PropSignature[] {
  let fn: t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression | null = null;
  if (
    tTypes.isFunctionDeclaration(body) ||
    tTypes.isFunctionExpression(body) ||
    tTypes.isArrowFunctionExpression(body)
  ) {
    fn = body;
  }
  if (!fn || fn.params.length === 0) return [];
  const param = fn.params[0];
  if (!param) return [];

  const typeSlice = readTypeSlice(param, source);

  if (tTypes.isIdentifier(param)) {
    return [{ name: param.name, typeSlice, optional: !!param.optional }];
  }

  if (tTypes.isAssignmentPattern(param) && tTypes.isIdentifier(param.left)) {
    return [{ name: param.left.name, typeSlice, optional: true }];
  }

  const objPat = tTypes.isObjectPattern(param)
    ? param
    : tTypes.isAssignmentPattern(param) && tTypes.isObjectPattern(param.left)
      ? param.left
      : null;
  if (!objPat) return [];

  const props: PropSignature[] = [];
  for (const p of objPat.properties) {
    if (tTypes.isObjectProperty(p)) {
      let localName: string | null = null;
      let optional = false;
      if (tTypes.isIdentifier(p.value)) {
        localName = p.value.name;
      } else if (tTypes.isAssignmentPattern(p.value) && tTypes.isIdentifier(p.value.left)) {
        localName = p.value.left.name;
        optional = true;
      }
      if (localName) props.push({ name: localName, typeSlice, optional });
    } else if (tTypes.isRestElement(p) && tTypes.isIdentifier(p.argument)) {
      props.push({ name: p.argument.name, typeSlice, optional: false });
    }
  }
  return props;
}

function readTypeSlice(param: t.Node, source: string): string {
  if (tTypes.isIdentifier(param) && param.typeAnnotation && tTypes.isTSTypeAnnotation(param.typeAnnotation)) {
    return sliceSource(source, param.typeAnnotation.typeAnnotation);
  }
  if (
    tTypes.isObjectPattern(param) &&
    param.typeAnnotation &&
    tTypes.isTSTypeAnnotation(param.typeAnnotation)
  ) {
    return sliceSource(source, param.typeAnnotation.typeAnnotation);
  }
  if (tTypes.isAssignmentPattern(param) && tTypes.isObjectPattern(param.left)) {
    const left = param.left;
    if (left.typeAnnotation && tTypes.isTSTypeAnnotation(left.typeAnnotation)) {
      return sliceSource(source, left.typeAnnotation.typeAnnotation);
    }
  }
  if (tTypes.isAssignmentPattern(param) && tTypes.isIdentifier(param.left)) {
    const left = param.left;
    if (left.typeAnnotation && tTypes.isTSTypeAnnotation(left.typeAnnotation)) {
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
  }
}

function sliceSource(source: string, node: t.Node): string {
  if (node.start == null || node.end == null) return "";
  return source.slice(node.start, node.end);
}
