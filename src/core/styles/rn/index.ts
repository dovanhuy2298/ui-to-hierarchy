/**
 * RN style-array flattening utility (RN-06) + barrel re-exports for the rn/ island.
 *
 * flattenStyleArray — given the JSXExpressionContainer that holds a React Native
 * `style={[...]}` array expression, resolve each element to a list of CSS-property
 * key strings by consulting the fileStyleIndex (built by parseStyleSheetCreate).
 *
 * Supported element kinds (≥ 8 cases, implemented in Wave 1):
 *   MemberExpression  styles.card           → lookup in fileStyleIndex
 *   LogicalExpression cond && styles.card   → right-side keys included
 *   LogicalExpression cond || styles.card   → right-side keys included
 *   StringLiteral     "padding"             → passed through as a key
 *   Null / false      null / false           → skipped silently
 *   SpreadElement     ...extra              → warn + skip (cannot resolve statically)
 *   CallExpression    getStyles()           → warn + skip
 *   Nested Array      [styles.a, styles.b]  → warn + skip
 *
 * Island rule: ZERO imports from src/adapters/ — this file is a core utility.
 * traverse must be imported from "../../babel-shim.js" (never directly from @babel/traverse).
 */

import * as t from "@babel/types";

export function flattenStyleArray(
  node: t.JSXExpressionContainer,
  fileStyleIndex: Map<string, string[]>,
  source: string,
  warnings: string[],
  file: string,
): string[] {
  // Wave 1: implement per RESEARCH Pattern 2 (null-check before t.is*; ≥ 8 cases)
  void node;
  void fileStyleIndex;
  void source;
  void warnings;
  void file;
  return [];
}

export { parseStyleSheetCreate } from "./stylesheet-create.js";
export { extractRNInlineStyle, extractNativeWindClassNames } from "./style-prop.js";
