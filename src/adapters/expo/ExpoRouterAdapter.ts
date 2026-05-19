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
import { parseExpression } from "@babel/parser";
import type { FrameworkAdapter } from "../FrameworkAdapter.js";
import type {
  ClassToken,
  ComponentDefinition,
  ParseContext,
  PropSignature,
  RenderNode,
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
import { parseStyleSheetCreate } from "../../core/styles/rn/stylesheet-create.js";
import { extractRNInlineStyle, extractNativeWindClassNames } from "../../core/styles/rn/style-prop.js";
import { flattenStyleArray } from "../../core/styles/rn/index.js";
import {
  discoverEntries as expoDiscoverEntries,
  detectDualRoots,
} from "./discover.js";
import {
  enumerateRoutes as expoEnumerateRoutes,
  mapRouteToEntry as expoMapRouteToEntry,
} from "./route-map.js";
import { isRNPrimitive } from "./rn-primitives.js";
import { detectExpoRouter } from "./detect.js";

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
   * Delegates to detectExpoRouter for proper framework detection.
   */
  async detect(absRoot: string): Promise<boolean> {
    const { detected } = await detectExpoRouter(absRoot);
    return detected;
  }

  /**
   * Enumerate parser entry points for the Expo Router project.
   * First checks for dual-root situation (both app/ and src/app/ exist),
   * queues a warning into pendingWarnings if so, then delegates to the
   * standalone discoverEntries helper.
   *
   * IMPORTANT: This method must only be called ONCE per adapter instance.
   * `pendingWarnings` accumulates across calls and is only flushed into the
   * first subsequent `extractComponents` call. Calling `discoverEntries`
   * multiple times will cause warnings to accumulate unboundedly and may
   * result in them being attributed to the wrong parse context.
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
    const globalStyleIndex = new Map<string, Map<string, string[]>>();

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

      // Build per-file StyleSheet.create index
      const fileWarnings: string[] = [];
      const fileStyleIndex = parseStyleSheetCreate(parsed.ast, parsed.source, fileWarnings, fwdFile);
      globalStyleIndex.set(fwdFile, fileStyleIndex);

      // One-hop StyleSheet import resolution (D-02/D-03)
      // Note: `bindings` maps JSX component imports, not StyleSheet variable imports.
      // StyleSheet vars (e.g., `const styles = StyleSheet.create(...)`) are VariableDeclarations,
      // not import bindings. The fileStyleIndex.has(localName) guard here is a no-op in practice
      // (StyleSheet var names rarely match component import names) but is kept as a safety net.
      for (const [localName, binding] of bindings) {
        if (fileStyleIndex.has(localName)) continue;
        if (!binding.source.startsWith(".")) continue;
        const resolved = coreResolveModule(ctx, fwdFile, binding.source, binding.importedName);
        if (!resolved.ok || resolved.kind !== "local") continue;
        const targetPath = toForwardSlash(resolved.absolutePath);
        let targetIndex = globalStyleIndex.get(targetPath);
        if (!targetIndex) {
          const targetParsed = parseFile(ctx, targetPath);
          if (targetParsed.kind === "error") {
            fileWarnings.push(`Failed to parse StyleSheet import at ${targetPath}: ${targetParsed.message}`);
            continue;
          }
          targetIndex = parseStyleSheetCreate(targetParsed.ast, targetParsed.source, fileWarnings, targetPath);
          globalStyleIndex.set(targetPath, targetIndex);
        }
        const importedKeys = targetIndex.get(binding.importedName);
        if (importedKeys) {
          fileStyleIndex.set(localName, importedKeys);
        } else {
          fileWarnings.push(
            `StyleSheet '${binding.importedName}' not found in imported file ${targetPath} — D-04 fallback at ${fwdFile}`,
          );
        }
      }

      for (const w of fileWarnings) ctx.warnings.push(w);

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

      // 2. screenInfos traversal deactivated (IN-01): populated but never used.
      // The ScreenInfo interface is kept for future propagation into ComponentDefinition.
      // Re-enable this block when screen metadata propagation is implemented.
      // const screenInfos: ScreenInfo[] = []; // deferred — see IN-01

      // 3. Discover components and post-process
      const components = discoverComponents(parsed.ast);
      for (const comp of components) {
        // NOTE: screenInfos propagation into ComponentDefinition is deferred (SPEC gap).
        const componentDef = this.buildComponentDefinition(
          comp,
          parsed.ast,
          parsed.source,
          fwdFile,
          bindings,
          fileStyleIndex,
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
    fileStyleIndex: Map<string, string[]>,
    ctx: ParseContext,
  ): ComponentDefinition {
    // 1. Render flow
    const renderFlow = walkRenderFlow(comp.body, source, file);

    // 2. Props
    const props = extractProps(comp.body, source);

    // 3. Text content
    const textContent = collectTextContent(renderFlow);

    // 4. Runtime boundary
    const firstDirective = ast.program.directives[0]?.value.value;
    const runtime: "server" | "client" =
      firstDirective === "use client" ? "client" : "server";

    // 5/6. Shared warnings + accumulators for style signals
    const localWarnings: string[] = [];
    const accumulatedClassNames: ClassToken[] = [];
    const accumulatedInlineStyles: Record<string, string | { raw: string }> = {};

    // 5. RN primitive post-processing on render flow (injects synthetic style signal attributes)
    const processedRenderFlow = postProcessRenderFlow(renderFlow, bindings, fileStyleIndex, localWarnings, file);

    // Walk the component body recursively to collect RN primitive JSX elements.
    // We cannot use traverse(comp.body, ...) because babel traverse requires a
    // Program/File root with scope. Instead we use a simple recursive visitor.
    collectRNPrimitiveStyles(
      comp.body,
      bindings,
      fileStyleIndex,
      source,
      file,
      localWarnings,
      accumulatedClassNames,
      accumulatedInlineStyles,
    );

    for (const w of localWarnings) ctx.warnings.push(w);

    // Deduplicate className tokens by value+file+line (CR-02 fix)
    const seen = new Set<string>();
    const dedupedClassNames = accumulatedClassNames.filter((tok) => {
      const key = `${tok.kind}:${tok.value}:${tok.file}:${tok.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      name: comp.name,
      file,
      line: comp.declarationLine,
      kind: comp.kind,
      wrappers: comp.wrappers,
      props,
      textContent,
      renderFlow: processedRenderFlow,
      classNames: dedupedClassNames,
      inlineStyles: accumulatedInlineStyles,
      cssModuleRefs: [],
      styledTemplates: [],
      runtime,
    };
  }
}

/**
 * Recursively collect RN style signals from all JSX elements within a component body node.
 * Uses a simple recursive AST walk (not babel traverse) because traverse requires a
 * Program/File root with scope.
 *
 * For each JSX element that is an RN primitive:
 *   - extractRNInlineStyle → merge into accumulatedInlineStyles (last-wins per WR-04)
 *   - extractNativeWindClassNames → append tokens to accumulatedClassNames
 *   - style array (style={[...]}) → flattenStyleArray → append keys to accumulatedClassNames
 */
function collectRNPrimitiveStyles(
  node: t.Node | null | undefined,
  bindings: Map<string, { source: string; importedName: string }>,
  fileStyleIndex: Map<string, string[]>,
  source: string,
  file: string,
  localWarnings: string[],
  accumulatedClassNames: ClassToken[],
  accumulatedInlineStyles: Record<string, string | { raw: string }>,
): void {
  if (!node) return;

  if (t.isJSXElement(node)) {
    const openingEl = node.openingElement;
    const nameNode = openingEl.name;
    if (t.isJSXIdentifier(nameNode)) {
      const tagName = nameNode.name;
      const binding = bindings.get(tagName);
      if (binding && isRNPrimitive(tagName, binding.source)) {
        const line = openingEl.loc?.start.line ?? 0;

        // a. Inline styles
        const inlineResult = extractRNInlineStyle(node, source);
        for (const [k, v] of Object.entries(inlineResult)) {
          accumulatedInlineStyles[k] = v;
        }

        // b. NativeWind classNames
        const classTokens = extractNativeWindClassNames(node, localWarnings, file, line);
        for (const token of classTokens) {
          accumulatedClassNames.push({ kind: "literal", value: token, file, line });
        }

        // c. Style array flattening
        const styleAttr = openingEl.attributes.find(
          (a): a is t.JSXAttribute =>
            t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name === "style",
        );
        if (
          styleAttr &&
          styleAttr.value &&
          t.isJSXExpressionContainer(styleAttr.value) &&
          t.isArrayExpression((styleAttr.value as t.JSXExpressionContainer).expression)
        ) {
          const arrayKeys = flattenStyleArray(
            styleAttr.value as t.JSXExpressionContainer,
            fileStyleIndex,
            source,
            localWarnings,
            file,
          );
          for (const key of arrayKeys) {
            accumulatedClassNames.push({ kind: "literal", value: key, file, line });
          }
        }
      }
    }
    // Recurse into children
    for (const child of node.children) {
      collectRNPrimitiveStyles(
        child as t.Node,
        bindings,
        fileStyleIndex,
        source,
        file,
        localWarnings,
        accumulatedClassNames,
        accumulatedInlineStyles,
      );
    }
    return;
  }

  if (t.isJSXFragment(node)) {
    for (const child of node.children) {
      collectRNPrimitiveStyles(
        child as t.Node,
        bindings,
        fileStyleIndex,
        source,
        file,
        localWarnings,
        accumulatedClassNames,
        accumulatedInlineStyles,
      );
    }
    return;
  }

  // For function-like nodes, recurse into body
  if (
    t.isFunctionDeclaration(node) ||
    t.isFunctionExpression(node) ||
    t.isArrowFunctionExpression(node)
  ) {
    collectRNPrimitiveStyles(
      node.body,
      bindings,
      fileStyleIndex,
      source,
      file,
      localWarnings,
      accumulatedClassNames,
      accumulatedInlineStyles,
    );
    return;
  }

  if (t.isBlockStatement(node)) {
    for (const stmt of node.body) {
      collectRNPrimitiveStyles(
        stmt,
        bindings,
        fileStyleIndex,
        source,
        file,
        localWarnings,
        accumulatedClassNames,
        accumulatedInlineStyles,
      );
    }
    return;
  }

  // WR-02: recurse into IfStatement consequent and alternate
  if (t.isIfStatement(node)) {
    collectRNPrimitiveStyles(
      node.consequent,
      bindings,
      fileStyleIndex,
      source,
      file,
      localWarnings,
      accumulatedClassNames,
      accumulatedInlineStyles,
    );
    collectRNPrimitiveStyles(
      node.alternate ?? null,
      bindings,
      fileStyleIndex,
      source,
      file,
      localWarnings,
      accumulatedClassNames,
      accumulatedInlineStyles,
    );
    return;
  }

  // WR-02: unwrap ExpressionStatement to reach its expression
  if (t.isExpressionStatement(node)) {
    collectRNPrimitiveStyles(
      node.expression,
      bindings,
      fileStyleIndex,
      source,
      file,
      localWarnings,
      accumulatedClassNames,
      accumulatedInlineStyles,
    );
    return;
  }

  if (t.isReturnStatement(node)) {
    collectRNPrimitiveStyles(
      node.argument ?? null,
      bindings,
      fileStyleIndex,
      source,
      file,
      localWarnings,
      accumulatedClassNames,
      accumulatedInlineStyles,
    );
    return;
  }

  if (t.isParenthesizedExpression(node)) {
    collectRNPrimitiveStyles(
      node.expression,
      bindings,
      fileStyleIndex,
      source,
      file,
      localWarnings,
      accumulatedClassNames,
      accumulatedInlineStyles,
    );
    return;
  }

  if (t.isJSXExpressionContainer(node) && !t.isJSXEmptyExpression(node.expression)) {
    collectRNPrimitiveStyles(
      node.expression,
      bindings,
      fileStyleIndex,
      source,
      file,
      localWarnings,
      accumulatedClassNames,
      accumulatedInlineStyles,
    );
    return;
  }

  if (t.isConditionalExpression(node)) {
    collectRNPrimitiveStyles(
      node.consequent,
      bindings,
      fileStyleIndex,
      source,
      file,
      localWarnings,
      accumulatedClassNames,
      accumulatedInlineStyles,
    );
    collectRNPrimitiveStyles(
      node.alternate,
      bindings,
      fileStyleIndex,
      source,
      file,
      localWarnings,
      accumulatedClassNames,
      accumulatedInlineStyles,
    );
    return;
  }

  if (t.isLogicalExpression(node)) {
    collectRNPrimitiveStyles(
      node.right,
      bindings,
      fileStyleIndex,
      source,
      file,
      localWarnings,
      accumulatedClassNames,
      accumulatedInlineStyles,
    );
    return;
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
  node: RenderNode | null,
  bindings: Map<string, { source: string; importedName: string }>,
  fileStyleIndex: Map<string, string[]>,
  warnings: string[],
  file: string,
): RenderNode {
  if (!node) {
    // WR-06: surface file context for actionable error messages
    return { kind: "error", message: "walkRenderFlow returned null", file, line: 0 };
  }
  return visitRenderNode(node, bindings, fileStyleIndex, warnings);
}

/**
 * Resolve style signal keys from a style expression string.
 * Handles:
 *   - ObjectExpression: returns property names as styleKeys (inline style)
 *   - ArrayExpression: resolves MemberExpression elements via fileStyleIndex (style array)
 * Returns { styleKeys, arrayKeys } where arrayKeys are StyleSheet variable keys.
 */
function resolveStyleExpressionKeys(
  expressionSource: string,
  fileStyleIndex: Map<string, string[]>,
  file: string,
  warnings: string[],
): { styleKeys: string[]; arrayKeys: string[] } {
  const styleKeys: string[] = [];
  const arrayKeys: string[] = [];
  try {
    const expr = parseExpression(expressionSource, { plugins: ["jsx", "typescript"] });
    if (expr.type === "ObjectExpression") {
      for (const prop of expr.properties) {
        if (prop.type === "ObjectProperty" && !prop.computed) {
          if (prop.key.type === "Identifier") styleKeys.push(prop.key.name);
          else if (prop.key.type === "StringLiteral") styleKeys.push(prop.key.value);
        }
      }
    } else if (expr.type === "ArrayExpression") {
      for (const el of expr.elements) {
        if (!el) continue;
        // MemberExpression or LogicalExpression(&&/||).right MemberExpression
        const memberEl =
          el.type === "MemberExpression"
            ? el
            : (el.type === "LogicalExpression" && el.right.type === "MemberExpression")
              ? el.right
              : null;
        if (
          memberEl &&
          memberEl.type === "MemberExpression" &&
          memberEl.object.type === "Identifier" &&
          memberEl.property.type === "Identifier"
        ) {
          const varName = memberEl.object.name;
          const accessedKey = memberEl.property.name;
          const indexKeys = fileStyleIndex.get(varName);
          if (indexKeys) {
            // Emit only the accessed key, not all keys in the stylesheet var (CR-01 fix)
            if (indexKeys.includes(accessedKey)) {
              arrayKeys.push(accessedKey);
            } else {
              warnings.push(`StyleSheet key '${accessedKey}' not found in var '${varName}' at ${file}`);
            }
          } else {
            warnings.push(`StyleSheet var '${varName}' not found in index at ${file}`);
          }
        }
      }
    }
  } catch (e) {
    warnings.push(`resolveStyleExpressionKeys: failed to parse expression "${expressionSource.slice(0, 60)}" — ${(e as Error).message}`);
  }
  return { styleKeys, arrayKeys };
}

function visitRenderNode(
  node: RenderNode,
  bindings: Map<string, { source: string; importedName: string }>,
  fileStyleIndex: Map<string, string[]>,
  warnings: string[],
): RenderNode {
  if (node.kind === "jsx") {
    const binding = bindings.get(node.tag);
    const isRN = binding ? isRNPrimitive(node.tag, binding.source) : false;

    // Process children recursively
    const processedChildren = node.children.map((child) =>
      visitRenderNode(child, bindings, fileStyleIndex, warnings),
    );

    if (isRN) {
      // RN primitive: override isComponent to false (it's an element)
      // For "Text": extract literal text content
      let syntheticAttrs = [...node.attributes];

      // Process style signal injection for RN primitives.
      // Strategy: inject individual className="<key>" attributes for each style key so that:
      //   1. scrapeStyleAttributes in Analyzer.ts picks them up as classNames for findByStyle
      //   2. The snapshot markdown shows each key individually (grep '"key"' matches ='key')
      //   3. No Analyzer.ts changes needed — className handling already exists
      //
      // Build list of syntheticAttrs without className (we'll rebuild it)
      const nonClassAttrs = node.attributes.filter((a) => a.name !== "className");
      const extraClassTokens: import("../types.js").JsxAttribute[] = [];

      for (const attr of node.attributes) {
        if (attr.name === "style" && attr.value.kind === "expression") {
          const { arrayKeys } = resolveStyleExpressionKeys(
            attr.value.source,
            fileStyleIndex,
            node.file,
            warnings,
          );
          // Inject each StyleSheet array key as its own className attribute
          for (const key of arrayKeys) {
            extraClassTokens.push({
              name: "className",
              value: { kind: "literal" as const, value: key },
            });
          }
        }
        if (
          attr.name === "className" &&
          attr.value.kind === "literal" &&
          typeof attr.value.value === "string"
        ) {
          // Strip NativeWind platform-variant prefixes (ios: / android: / web: / native:)
          const PLATFORM_VARIANT_RE = /(ios|android|web|native):/g;
          const stripped = attr.value.value
            .replace(PLATFORM_VARIANT_RE, "")
            .trim()
            .split(/\s+/)
            .filter(Boolean);
          // Inject each stripped token as its own className attribute
          for (const token of stripped) {
            extraClassTokens.push({
              name: "className",
              value: { kind: "literal" as const, value: token },
            });
          }
        }
      }

      // Rebuild syntheticAttrs: non-className attrs first, then all className tokens
      syntheticAttrs = [...nonClassAttrs, ...extraClassTokens];

      if (node.tag === "Text") {
        // Collect literal text from processed children (post-recursion, consistent with returned tree).
        const textParts: string[] = [];
        for (const child of processedChildren) {
          if (child.kind === "text" && child.value.trim()) {
            textParts.push(child.value.trim());
          }
        }
        const textValue = textParts.join(" ").trim();
        const result: import("../types.js").RenderNode = {
          ...node,
          isComponent: false,
          children: processedChildren,
          attributes: syntheticAttrs,
        };
        // Only add text if we extracted something (not dynamic children)
        if (textValue) {
          // We inject text via a synthetic attribute approach:
          // Since RenderNode jsx doesn't have a text field directly,
          // we embed it in attributes
          return {
            ...result,
            attributes: [
              ...syntheticAttrs,
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
        attributes: syntheticAttrs,
      };
    }

    return { ...node, children: processedChildren };
  }

  if (node.kind === "fragment") {
    return {
      ...node,
      children: node.children.map((child) => visitRenderNode(child, bindings, fileStyleIndex, warnings)),
    };
  }

  if (node.kind === "branch") {
    return {
      ...node,
      thenBranch: node.thenBranch ? visitRenderNode(node.thenBranch, bindings, fileStyleIndex, warnings) : null,
      elseBranch: node.elseBranch ? visitRenderNode(node.elseBranch, bindings, fileStyleIndex, warnings) : null,
    };
  }

  if (node.kind === "list") {
    return {
      ...node,
      item: visitRenderNode(node.item, bindings, fileStyleIndex, warnings),
    };
  }

  return node;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers copied from NextJsAdapter (kept internal to this file)
// ─────────────────────────────────────────────────────────────────────────────

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

  const typeSlice = readTypeSlice(param, source);

  if (t.isIdentifier(param)) {
    return [{ name: param.name, typeSlice, optional: !!param.optional }];
  }

  if (t.isAssignmentPattern(param) && t.isIdentifier(param.left)) {
    return [{ name: param.left.name, typeSlice, optional: true }];
  }

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
        optional = true;
      }
      if (localName) props.push({ name: localName, typeSlice, optional });
    } else if (t.isRestElement(p) && t.isIdentifier(p.argument)) {
      props.push({ name: p.argument.name, typeSlice, optional: false });
    }
  }
  return props;
}

function readTypeSlice(param: t.Node, source: string): string {
  if (t.isIdentifier(param) && param.typeAnnotation && t.isTSTypeAnnotation(param.typeAnnotation)) {
    return sliceSource(source, param.typeAnnotation.typeAnnotation);
  }
  if (
    t.isObjectPattern(param) &&
    param.typeAnnotation &&
    t.isTSTypeAnnotation(param.typeAnnotation)
  ) {
    return sliceSource(source, param.typeAnnotation.typeAnnotation);
  }
  if (t.isAssignmentPattern(param) && t.isObjectPattern(param.left)) {
    const left = param.left;
    if (left.typeAnnotation && t.isTSTypeAnnotation(left.typeAnnotation)) {
      return sliceSource(source, left.typeAnnotation.typeAnnotation);
    }
  }
  if (t.isAssignmentPattern(param) && t.isIdentifier(param.left)) {
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
  }
}

function sliceSource(source: string, node: t.Node): string {
  if (node.start == null || node.end == null) return "";
  return source.slice(node.start, node.end);
}
