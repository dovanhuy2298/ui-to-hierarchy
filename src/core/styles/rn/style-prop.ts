/**
 * RN style-prop extraction utilities (RN-05 / RN-07).
 *
 * extractRNInlineStyle — thin delegation to the v1.0 extractInlineStyle
 * contract (D-09).  Returns a Record of CSS-style property → value pairs,
 * collapsing computed values to `{ raw: <source slice> }`.  This intentionally
 * reuses the existing extractor so React Native props share identical semantics
 * with the web extraction path.  No reimplementation.
 *
 * extractNativeWindClassNames — reads the `className` JSX attribute on an RN
 * element and tokenizes it, stripping NativeWind platform-variant prefixes
 * (ios: / android: / web: / native:).  Returns [] for any attribute value that
 * cannot be statically resolved (tagged templates, expressions) and emits a
 * raw warning.
 *
 * Island rule: ZERO imports from src/adapters/ — this file is a core utility.
 * traverse must be imported from "../../babel-shim.js" (never directly from @babel/traverse).
 */

import * as t from "@babel/types";
import { extractInlineStyle } from "../../extractors/inline-style.js";

export function extractRNInlineStyle(
  jsxElement: t.JSXElement,
  source: string,
): Record<string, string | { raw: string }> {
  return extractInlineStyle(jsxElement, source);
}

export function extractNativeWindClassNames(
  jsxElement: t.JSXElement,
  warnings: string[],
  file: string,
  line: number,
): string[] {
  // Find the className attribute on the JSX element
  const attr = jsxElement.openingElement.attributes.find(
    (a): a is t.JSXAttribute =>
      t.isJSXAttribute(a) &&
      t.isJSXIdentifier(a.name) &&
      a.name.name === "className",
  );
  if (!attr) return [];

  const val = attr.value;

  // Branch on val type FIRST (Pitfall 5: never run regex on tagged template content)
  if (t.isStringLiteral(val)) {
    const PLATFORM_VARIANT_RE = /(?:ios|android|web|native):(\S+)/g;
    const stripped = val.value.replace(PLATFORM_VARIANT_RE, "$1");
    return stripped.trim().split(/\s+/).filter(Boolean);
  }

  if (t.isJSXExpressionContainer(val)) {
    const expr = val.expression;
    if (t.isTaggedTemplateExpression(expr)) {
      warnings.push(
        "NativeWind tw` ` tagged template not supported — use className string at " +
          file +
          ":" +
          line,
      );
      return [];
    }
    // Other expressions (variables, concatenations) → silently unsupported until v1.3
    return [];
  }

  return [];
}
