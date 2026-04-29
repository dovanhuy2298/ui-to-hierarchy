import * as t from "@babel/types";

/**
 * Extract a JSX element's `style={{...}}` attribute as a Record.
 *
 * Literal values (string/number/boolean/null) become string values; computed
 * values, member access, calls, etc. collapse to `{ raw: <source slice> }`
 * per D-09. Spread elements are captured under synthetic `__spread_<offset>`
 * keys so the consumer still sees them.
 *
 * Inline-style capture is NOT affected by `fullClasses` (only Tailwind is).
 */
export function extractInlineStyle(
  jsxElement: t.JSXElement,
  source: string,
): Record<string, string | { raw: string }> {
  const attr = jsxElement.openingElement.attributes.find(
    (a): a is t.JSXAttribute =>
      t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name === "style",
  );
  if (!attr || !t.isJSXExpressionContainer(attr.value)) return {};
  const expr = attr.value.expression;
  if (!t.isObjectExpression(expr)) {
    return { __raw__: { raw: sliceSource(source, expr as t.Node) } };
  }
  const out: Record<string, string | { raw: string }> = {};
  let spreadIdx = 0;
  for (const prop of expr.properties) {
    if (t.isSpreadElement(prop)) {
      // Use a monotonic counter (not byte offset) to ensure each spread within
      // the same element gets a unique key even when prop.start is unavailable
      // (e.g. constructed AST or transformed AST where positions are stripped).
      out[`__spread_${spreadIdx++}`] = { raw: sliceSource(source, prop.argument) };
      continue;
    }
    if (!t.isObjectProperty(prop) || prop.computed) continue;
    const keyName = t.isIdentifier(prop.key)
      ? prop.key.name
      : t.isStringLiteral(prop.key)
        ? prop.key.value
        : null;
    if (!keyName) continue;
    if (t.isStringLiteral(prop.value)) out[keyName] = prop.value.value;
    else if (t.isNumericLiteral(prop.value)) out[keyName] = String(prop.value.value);
    else if (t.isBooleanLiteral(prop.value)) out[keyName] = String(prop.value.value);
    else if (t.isNullLiteral(prop.value)) out[keyName] = "null";
    else out[keyName] = { raw: sliceSource(source, prop.value as t.Node) };
  }
  return out;
}

function sliceSource(source: string, node: t.Node): string {
  const start = node.start ?? 0;
  const end = node.end ?? start;
  return source.slice(start, end);
}
