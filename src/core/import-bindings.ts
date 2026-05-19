/**
 * Import-binding collection utility (D-04/D-05).
 *
 * For a parsed module, return a map: localJsxName → { source, importedName }.
 * Covers:
 *   import { Foo } from "x"          → "Foo"     → { source: "x", importedName: "Foo" }
 *   import { Foo as Bar } from "x"   → "Bar"     → { source: "x", importedName: "Foo" }
 *   import Default from "x"          → "Default" → { source: "x", importedName: "default" }
 *   import * as Ns from "x"          → SKIPPED (Ns.Foo is multi-hop; v1 leaves it
 *                                      at the call-site per 06-DEBUG carve-out).
 *
 * Island rule: ZERO imports from src/adapters/ — this file is a core utility.
 * traverse must be imported from "./babel-shim.js" (never directly from @babel/traverse).
 */

import * as t from "@babel/types";
import { traverse } from "./babel-shim.js";

export interface ImportBinding {
  source: string;
  importedName: string;
}

export function collectImportBindings(ast: t.File): Map<string, ImportBinding> {
  const out = new Map<string, ImportBinding>();
  traverse(ast, {
    ImportDeclaration(path: { node: t.ImportDeclaration }) {
      const source = path.node.source.value;
      for (const spec of path.node.specifiers) {
        if (t.isImportSpecifier(spec)) {
          const localName = spec.local.name;
          const importedName = t.isIdentifier(spec.imported)
            ? spec.imported.name
            : spec.imported.value;
          out.set(localName, { source, importedName });
        } else if (t.isImportDefaultSpecifier(spec)) {
          out.set(spec.local.name, { source, importedName: "default" });
        }
        // ImportNamespaceSpecifier intentionally skipped (v1 carve-out).
      }
    },
  });
  return out;
}
