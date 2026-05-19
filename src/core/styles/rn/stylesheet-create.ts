/**
 * RN StyleSheet.create() index builder (D-03 / RN-04 / RN-08).
 *
 * For a parsed module, traverse the AST and locate every
 * `StyleSheet.create({ ... })` call-expression assigned to a local variable.
 * Return a map: varName → string[] of top-level keys defined in that object.
 *
 * Supported:
 *   - In-file literal object: `const styles = StyleSheet.create({ card: {...}, text: {...} })`
 *   - One-hop import: caller resolves the imported file's AST and passes it in (D-03 contract).
 *
 * Unsupported (degrade to empty map + raw warning — RN-08):
 *   - Computed keys:    `StyleSheet.create({ [k]: { ... } })`
 *   - Factory call:     `StyleSheet.create(getStyles())`
 *   - Hook return:      `StyleSheet.create(useStyles())`
 *   - Two-hop import:   caller cannot follow more than one hop.
 *
 * Island rule: ZERO imports from src/adapters/ — this file is a core utility.
 * traverse must be imported from "../../babel-shim.js" (never directly from @babel/traverse).
 */

import * as t from "@babel/types";
import { traverse } from "../../babel-shim.js";

export function parseStyleSheetCreate(
  ast: t.File,
  source: string,
  warnings: string[],
  file: string,
): Map<string, string[]> {
  const out = new Map<string, string[]>();

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;

      // Match StyleSheet.create(...)
      if (
        !t.isMemberExpression(callee) ||
        !t.isIdentifier(callee.object, { name: "StyleSheet" }) ||
        !t.isIdentifier(callee.property, { name: "create" })
      ) {
        return;
      }

      const arg = path.node.arguments[0];
      if (!arg) return;

      // Resolve varName via parentPath — the CallExpression's parent is VariableDeclarator
      const parent = path.parentPath?.node;
      if (
        !parent ||
        !t.isVariableDeclarator(parent) ||
        !t.isIdentifier(parent.id)
      ) {
        // Not assigned to a variable — skip silently (no varName to index)
        return;
      }
      const varName = parent.id.name;

      // RN-08: non-ObjectExpression argument → emit warning and skip entry
      if (!t.isObjectExpression(arg)) {
        const raw = source.slice(arg.start ?? 0, arg.end ?? 0);
        warnings.push(
          "Unsupported StyleSheet.create argument: " + raw + " at " + file,
        );
        return;
      }

      // Extract top-level literal keys from the object expression
      const keys: string[] = [];
      for (const prop of arg.properties) {
        if (!t.isObjectProperty(prop) || prop.computed) continue;
        const key = t.isIdentifier(prop.key)
          ? prop.key.name
          : t.isStringLiteral(prop.key)
            ? prop.key.value
            : null;
        if (key) keys.push(key);
      }
      out.set(varName, keys);
    },
  });

  return out;
}
