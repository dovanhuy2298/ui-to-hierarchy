import * as t from "@babel/types";
// biome-ignore lint/style/noRestrictedImports: type-only import; erased at compile time (D-11 island invariant unaffected)
import type { CssModuleRef } from "../../adapters/types.js";
import { traverse } from "../babel-shim.js";

/**
 * Walk an entire AST collecting CSS Modules references.
 *
 * - First pass: every `import s from "./X.module.{css,scss,sass}"` (default or
 *   namespace) registers a binding → import-source map.
 * - Second pass: every non-computed `MemberExpression` whose `object` is a
 *   known binding emits `{ binding, key, source }`.
 *
 * No CSS file content parsing — `source` is the import specifier as-written.
 */
export function extractCssModuleRefs(ast: t.File): CssModuleRef[] {
  const bindings = new Map<string, string>(); // localBinding → import source
  traverse(ast, {
    ImportDeclaration(p: { node: t.ImportDeclaration }) {
      const src = p.node.source.value;
      if (!/\.module\.(css|scss|sass)$/.test(src)) return;
      for (const spec of p.node.specifiers) {
        if (t.isImportDefaultSpecifier(spec)) bindings.set(spec.local.name, src);
        else if (t.isImportNamespaceSpecifier(spec)) bindings.set(spec.local.name, src);
      }
    },
  });
  if (bindings.size === 0) return [];
  const out: CssModuleRef[] = [];
  traverse(ast, {
    MemberExpression(p: { node: t.MemberExpression }) {
      if (p.node.computed) return;
      if (!t.isIdentifier(p.node.object)) return;
      const binding = p.node.object.name;
      const source = bindings.get(binding);
      if (!source) return;
      if (!t.isIdentifier(p.node.property)) return;
      out.push({ binding, key: p.node.property.name, source });
    },
  });
  return out;
}
