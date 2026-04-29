import * as t from "@babel/types";
// biome-ignore lint/style/noRestrictedImports: type-only import; erased at compile time (D-11 island invariant unaffected)
import type { ClassToken } from "../../../adapters/types.js";
import { isLayoutClass } from "./layout-prefixes.js";
import { collectClassTokens } from "./resolve-args.js";

/**
 * Extract Tailwind className tokens from a single JSX element.
 *
 * `fullClasses` toggle (OUT-02):
 *  - `false` (default): only `kind: "literal"` tokens passing `isLayoutClass`
 *    survive. Every `kind: "raw"` token is preserved because we cannot
 *    statically evaluate it.
 *  - `true`: every token is returned.
 */
export function extractTailwindClasses(
  jsxElement: t.JSXElement,
  source: string,
  file: string,
  opts: { fullClasses?: boolean } = {},
): ClassToken[] {
  const attr = jsxElement.openingElement.attributes.find(
    (a): a is t.JSXAttribute =>
      t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name === "className",
  );
  if (!attr) return [];

  let expr: t.Expression | null = null;
  if (t.isStringLiteral(attr.value)) expr = attr.value;
  else if (t.isJSXExpressionContainer(attr.value) && t.isExpression(attr.value.expression)) {
    expr = attr.value.expression;
  }

  const tokens = collectClassTokens(expr, source, file);
  if (opts.fullClasses) return tokens;
  // Layout-only: keep all `raw` (cannot statically evaluate) + only layout literals
  return tokens.filter((tok) => tok.kind === "raw" || isLayoutClass(tok.value));
}
