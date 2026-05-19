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
  // Wave 1: implement per RESEARCH Pattern 3 (regex /(ios|android|web|native):/g)
  void jsxElement;
  void warnings;
  void file;
  void line;
  return [];
}
