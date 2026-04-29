import * as t from "@babel/types";
// Type-only import of parser-level contract (ClassToken).
// The adapter island invariant (D-11) forbids runtime coupling; `import type`
// is erased at compile time and produces no runtime edge from src/core/ to
// src/adapters/.
// biome-ignore lint/style/noRestrictedImports: type-only import; erased at compile time (D-11 island invariant unaffected)
import type { ClassToken } from "../../../adapters/types.js";

const HELPER_NAMES = new Set(["cn", "clsx", "cva", "twMerge"]);

export function isClassHelperCall(node: t.Node): node is t.CallExpression {
  return (
    t.isCallExpression(node) && t.isIdentifier(node.callee) && HELPER_NAMES.has(node.callee.name)
  );
}

/**
 * Collect ClassToken[] from a className value expression. `source` is the original
 * file's text (used to extract raw slices for non-resolvable args).
 * `file` and `line` are stamped on every emitted token (forward-slash file).
 */
export function collectClassTokens(
  expr: t.Expression | null | undefined,
  source: string,
  file: string,
): ClassToken[] {
  if (!expr) return [];
  const out: ClassToken[] = [];
  walk(expr, source, file, out);
  return out;
}

function walk(node: t.Node, source: string, file: string, out: ClassToken[]): void {
  const line = node.loc?.start.line ?? 0;
  // String literal: split on whitespace into individual tokens
  if (t.isStringLiteral(node)) {
    for (const tok of node.value.split(/\s+/).filter(Boolean)) {
      out.push({ kind: "literal", value: tok, file, line });
    }
    return;
  }
  // Template literal with no interpolations
  if (t.isTemplateLiteral(node) && node.expressions.length === 0) {
    const raw = node.quasis.map((q) => q.value.cooked ?? q.value.raw).join("");
    for (const tok of raw.split(/\s+/).filter(Boolean)) {
      out.push({ kind: "literal", value: tok, file, line });
    }
    return;
  }
  // cn/clsx/cva/twMerge — recurse into args
  if (isClassHelperCall(node)) {
    for (const arg of node.arguments) {
      if (t.isExpression(arg)) walk(arg, source, file, out);
      else out.push({ kind: "raw", source: sliceSource(source, arg as t.Node), file, line });
    }
    return;
  }
  // Array literal — flatten
  if (t.isArrayExpression(node)) {
    for (const el of node.elements) {
      if (el && t.isExpression(el)) walk(el, source, file, out);
    }
    return;
  }
  // Object expression — keys with truthy literal value → literal token
  if (t.isObjectExpression(node)) {
    for (const prop of node.properties) {
      if (t.isObjectProperty(prop) && !prop.computed) {
        const keyName = t.isIdentifier(prop.key)
          ? prop.key.name
          : t.isStringLiteral(prop.key)
            ? prop.key.value
            : null;
        if (keyName && t.isExpression(prop.value)) {
          if (t.isBooleanLiteral(prop.value) && prop.value.value === true) {
            for (const tok of keyName.split(/\s+/).filter(Boolean)) {
              out.push({ kind: "literal", value: tok, file, line });
            }
            continue;
          }
        }
      }
      // Anything else (computed key, dynamic value, spread) → raw slice of the whole prop
      out.push({ kind: "raw", source: sliceSource(source, prop as t.Node), file, line });
    }
    return;
  }
  // Conditional / logical / member / identifier / template w/ interpolation / etc → raw
  out.push({ kind: "raw", source: sliceSource(source, node), file, line });
}

function sliceSource(source: string, node: t.Node): string {
  const start = node.start ?? 0;
  const end = node.end ?? start;
  return source.slice(start, end);
}
