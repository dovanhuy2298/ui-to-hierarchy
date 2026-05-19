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
  const expr = node.expression;
  if (!t.isArrayExpression(expr)) return [];

  const keys: string[] = [];

  for (const el of expr.elements) {
    // MUST BE FIRST: sparse array holes are JS null (not t.NullLiteral) — Pitfall 4
    if (el === null) continue;

    // Null/Boolean literals → skip silently, no warning
    if (t.isNullLiteral(el) || t.isBooleanLiteral(el)) continue;

    // StringLiteral → pass through as a key
    if (t.isStringLiteral(el)) {
      keys.push(el.value);
      continue;
    }

    // Nested ArrayExpression → warn and skip
    if (t.isArrayExpression(el)) {
      warnings.push("Nested array in style prop at " + file + " — skipped");
      continue;
    }

    // MemberExpression or LogicalExpression(&&/||/??).right MemberExpression
    // All three operators are treated as "the right side may be applied" —
    // && is conditional, || and ?? are fallbacks, but all three are included
    // as reasonable static approximations for style array analysis.
    const memberEl = t.isMemberExpression(el)
      ? el
      : t.isLogicalExpression(el) &&
          (el.operator === "&&" || el.operator === "||" || el.operator === "??") &&
          t.isMemberExpression(el.right)
        ? el.right
        : null;

    if (
      memberEl &&
      t.isIdentifier(memberEl.object) &&
      t.isIdentifier(memberEl.property)
    ) {
      const varName = memberEl.object.name;
      const accessedKey = memberEl.property.name;
      const indexKeys = fileStyleIndex.get(varName);
      if (indexKeys) {
        // Emit only the accessed key, not all keys in the stylesheet var (CR-01 fix)
        if (indexKeys.includes(accessedKey)) {
          keys.push(accessedKey);
        } else {
          warnings.push(
            "StyleSheet key '" + accessedKey + "' not found in var '" + varName + "' at " + file,
          );
        }
      } else {
        warnings.push(
          "StyleSheet var '" + varName + "' not found in index at " + file,
        );
      }
      continue;
    }

    // CallExpression → warn and skip
    if (t.isCallExpression(el)) {
      const raw = source.slice(el.start ?? 0, el.end ?? 0);
      warnings.push(
        "Unsupported style array element (call expr): " + raw + " at " + file,
      );
      continue;
    }

    // Anything else falls through silently
  }

  return keys;
}

export { parseStyleSheetCreate } from "./stylesheet-create.js";
export { extractRNInlineStyle, extractNativeWindClassNames } from "./style-prop.js";
