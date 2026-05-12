import * as t from "@babel/types";
// Type-only import of parser-level contracts (ParseContext, ResolveResult).
// `import type` is erased at compile time, preserving the D-11 island invariant.
// biome-ignore lint/style/noRestrictedImports: type-only import; erased at compile time (D-11 island invariant unaffected)
import type { ParseContext, ResolveResult } from "../../adapters/types.js";
import { traverse } from "../babel-shim.js";
import { parseFile } from "../parser/index.js";

/**
 * Barrel chase (PARSE-02).
 *
 * Walks `export { Foo } from "..."` and `export * from "..."` declarations
 * recursively until either the local declaration of `importedName` is
 * found, the chain hits node_modules, or a cycle is detected.
 *
 * Cycle handling (T-3-03 mitigation): a `visited: Set<string>` is carried
 * through every recursive call, keyed by file. If we re-enter a file in
 * the current branch we emit `{ ok: false, kind: "cycle", chain }` and
 * stop. Star-export branches FORK the visited set (`new Set(visited)`)
 * so siblings don't poison each other — a barrel may legitimately
 * `export *` from two siblings, neither of which is a cycle.
 *
 * Specifier resolution is INJECTED via `resolveSpecifier` to break the
 * import cycle with `./index.ts`. The injected function only resolves
 * `(fromFile, specifier) → file`; barrel-chasing the destination is
 * this module's job.
 */

type SpecifierResolver = (
  ctx: ParseContext,
  fromFile: string,
  specifier: string,
  importedName: string,
) => ResolveResult;

export function chaseBarrel(
  ctx: ParseContext,
  startFile: string,
  importedName: string,
  resolveSpecifier: SpecifierResolver,
  visited: Set<string> = new Set(),
): ResolveResult {
  if (visited.has(startFile)) {
    return { ok: false, kind: "cycle", chain: [...visited, startFile] };
  }
  visited.add(startFile);

  const parsed = parseFile(ctx, startFile);
  if (parsed.kind === "error") {
    return { ok: false, kind: "not-found", specifier: importedName, tried: [startFile] };
  }

  let foundLocal = false;
  let reExportFrom: { source: string; renamed: string } | null = null;
  const starExports: string[] = [];

  traverse(parsed.ast, {
    FunctionDeclaration(p: { node: t.FunctionDeclaration }) {
      if (p.node.id?.name === importedName) foundLocal = true;
    },
    VariableDeclarator(p: { node: t.VariableDeclarator }) {
      if (t.isIdentifier(p.node.id) && p.node.id.name === importedName) foundLocal = true;
    },
    ClassDeclaration(p: { node: t.ClassDeclaration }) {
      if (p.node.id?.name === importedName) foundLocal = true;
    },
    ExportNamedDeclaration(p: { node: t.ExportNamedDeclaration }) {
      const src = p.node.source;
      if (!src) return;
      for (const spec of p.node.specifiers) {
        if (t.isExportSpecifier(spec)) {
          const exportedName = t.isIdentifier(spec.exported)
            ? spec.exported.name
            : spec.exported.value;
          if (exportedName === importedName) {
            const renamed = t.isIdentifier(spec.local) ? spec.local.name : importedName;
            reExportFrom = { source: src.value, renamed };
          }
        }
      }
    },
    ExportAllDeclaration(p: { node: t.ExportAllDeclaration }) {
      starExports.push(p.node.source.value);
    },
  });

  if (foundLocal) {
    // POLISH-03 D-02/D-03: report the true declaration line of importedName
    // in this file. parseFile is ctx-cached (we just used it above), so this
    // lookup is free. declLines.get → undefined falls back to 1 per D-03.
    const line = parsed.declLines.get(importedName) ?? 1;
    return { ok: true, kind: "local", absolutePath: startFile, line };
  }

  if (reExportFrom) {
    const re = reExportFrom as { source: string; renamed: string };
    const next = resolveSpecifier(ctx, startFile, re.source, re.renamed);
    if (!next.ok) return next;
    if (next.kind === "external") return next;
    return chaseBarrel(ctx, next.absolutePath, re.renamed, resolveSpecifier, visited);
  }

  for (const starSource of starExports) {
    const next = resolveSpecifier(ctx, startFile, starSource, importedName);
    if (!next.ok) continue;
    if (next.kind === "external") continue;
    // Fork visited per branch so sibling stars don't poison each other,
    // but propagate cycles upward.
    const sub = chaseBarrel(
      ctx,
      next.absolutePath,
      importedName,
      resolveSpecifier,
      new Set(visited),
    );
    if (sub.ok) return sub;
    if (!sub.ok && sub.kind === "cycle") return sub;
  }

  return { ok: false, kind: "not-found", specifier: importedName, tried: [startFile] };
}
