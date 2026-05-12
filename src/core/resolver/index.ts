import * as t from "@babel/types";
// Type-only import of parser-level contracts (ParseContext, ResolveResult).
// `import type` is erased at compile time, preserving the D-11 island invariant.
// biome-ignore lint/style/noRestrictedImports: type-only import; erased at compile time (D-11 island invariant unaffected)
import type { ParseContext, ResolveResult } from "../../adapters/types.js";
import { traverse } from "../babel-shim.js";
import { parseFile } from "../parser/index.js";
import { toForwardSlash } from "../paths.js";
import { chaseBarrel } from "./barrel.js";
import { detectNodeModules, packageNameFromSpecifier } from "./node-modules.js";
import { joinRelative, probeFile } from "./relative.js";
import { getPathsMatcher } from "./tsconfig.js";

/**
 * resolveModule — module resolution entry point (D-12).
 *
 * NEVER throws. Every error path returns a `ResolveResult` discriminated
 * union variant. Composes four sub-modules:
 *
 *   1. tsconfig paths matcher (PARSE-03) — `@/foo`, `~/foo`, `#cfg/x`,
 *      multi-target arrays
 *   2. relative path probe (D-13) — `./foo`, `../bar`
 *   3. node_modules boundary detector — bare specifiers + resolved files
 *      that landed under `node_modules/`
 *   4. barrel chase (PARSE-02) — `export { Foo } from "./button"`
 *
 * Per-call cache (D-03) is keyed by `${fromFile}::${specifier}::${importedName}`.
 * The importedName MUST be part of the key because the same specifier may
 * resolve to different barrel-source files for different exports
 * (e.g. `@/components/ui` exports both Button and Card from different files).
 *
 * All emitted absolutePath values are forward-slash (toForwardSlash applied
 * at every emission site).
 *
 * T-3-02 disposition: this resolver emits absolute paths but does NOT
 * validate that they fall under `ctx.resolvedRoot`. Containment is the
 * caller's responsibility (NextJsAdapter, Plan 06).
 */

export function resolveModule(
  ctx: ParseContext,
  fromFile: string,
  specifier: string,
  importedName: string,
): ResolveResult {
  const key = `${fromFile}::${specifier}::${importedName}`;
  const cached = ctx.resolverCache.get(key);
  if (cached) return cached;

  const result = doResolve(ctx, fromFile, specifier, importedName);
  ctx.resolverCache.set(key, result);
  return result;
}

/**
 * Specifier-only resolution: produce a ResolveResult that points at a file
 * (or external/not-found), without considering importedName. Used both as
 * the first step of `doResolve` and as the injected resolver for
 * `chaseBarrel` re-export sources.
 */
function resolveSpecifierToFile(
  ctx: ParseContext,
  fromFile: string,
  specifier: string,
  importedName: string,
): ResolveResult {
  // 1. tsconfig paths
  const matcher = getPathsMatcher(ctx);
  const triedPaths: string[] = [];
  if (matcher) {
    const candidates = matcher(specifier);
    for (const cand of candidates) {
      triedPaths.push(cand);
      const hit = probeFile(cand);
      if (hit) {
        const fwd = toForwardSlash(hit);
        const ext = detectNodeModules(fwd);
        if (ext) return { ok: true, kind: "external", packageName: ext };
        // POLISH-03 D-02/D-03: read declaration line from parseFile.declLines.
        // parseFile is ctx-cached, so this is free on subsequent calls.
        const parsed = parseFile(ctx, fwd);
        const line =
          parsed.kind === "ok" ? (parsed.declLines.get(importedName) ?? 1) : 1;
        return { ok: true, kind: "local", absolutePath: fwd, line };
      }
    }
    // If the matcher produced candidates but none existed, fall through
    // to relative/bare attempts (the matcher may match but the file is
    // shadowed by a relative import path).
  }

  // 2. Relative
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    const base = joinRelative(fromFile, specifier);
    triedPaths.push(base);
    const hit = probeFile(base);
    if (hit) {
      const fwd = toForwardSlash(hit);
      const ext = detectNodeModules(fwd);
      if (ext) return { ok: true, kind: "external", packageName: ext };
      const parsed = parseFile(ctx, fwd);
      const line =
        parsed.kind === "ok" ? (parsed.declLines.get(importedName) ?? 1) : 1;
      return { ok: true, kind: "local", absolutePath: fwd, line };
    }
    return { ok: false, kind: "not-found", specifier, tried: triedPaths };
  }

  // 3. Bare specifier — node_modules without resolution (D-12 external).
  const pkg = packageNameFromSpecifier(specifier);
  if (pkg) return { ok: true, kind: "external", packageName: pkg };

  return { ok: false, kind: "not-found", specifier, tried: triedPaths };
}

function doResolve(
  ctx: ParseContext,
  fromFile: string,
  specifier: string,
  importedName: string,
): ResolveResult {
  const fileResult = resolveSpecifierToFile(ctx, fromFile, specifier, importedName);
  if (!fileResult.ok) return fileResult;
  if (fileResult.kind === "external") return fileResult;

  // Local file found — does it declare importedName itself, or is it a barrel?
  const parsed = parseFile(ctx, fileResult.absolutePath);
  if (parsed.kind === "error") {
    return { ok: false, kind: "not-found", specifier, tried: [fileResult.absolutePath] };
  }

  let foundLocal = false;
  // Track bare `export { Name }` (no `from`) re-exports of imported bindings.
  // Map: importDeclaration source -> imported name within that import that maps to `importedName`.
  // Also track ImportDeclaration specifiers so we can correlate a bare export back to its import.
  type BareReExport = { source: string; importedFromSource: string };
  let bareReExport: BareReExport | null = null;
  // Collect imports first, then exports — but in a single traverse for efficiency.
  // Babel visits in source order, so we accumulate imports as we see them and
  // resolve `export { X }` against the imports collected so far (sufficient because
  // declarations precede their `export { ... }` in valid ES modules — but we also
  // do a second-pass safety net by collecting all imports first via a simple Map).
  const importLocalToSource = new Map<string, string>(); // local name -> import source
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
    ImportDeclaration(p: { node: t.ImportDeclaration }) {
      const src = p.node.source.value;
      for (const spec of p.node.specifiers) {
        // ImportSpecifier, ImportDefaultSpecifier, ImportNamespaceSpecifier all have `.local`.
        const localName = spec.local.name;
        importLocalToSource.set(localName, src);
      }
    },
    ExportNamedDeclaration(p: { node: t.ExportNamedDeclaration }) {
      if (p.node.source) return; // re-export-from form is handled by chaseBarrel
      for (const spec of p.node.specifiers) {
        if (!t.isExportSpecifier(spec)) continue;
        const exportedName = t.isIdentifier(spec.exported)
          ? spec.exported.name
          : spec.exported.value;
        if (exportedName !== importedName) continue;
        const localName = t.isIdentifier(spec.local) ? spec.local.name : exportedName;
        const importSrc = importLocalToSource.get(localName);
        if (importSrc) {
          bareReExport = { source: importSrc, importedFromSource: localName };
        }
      }
    },
  });

  if (foundLocal) return fileResult;

  // Bare named re-export of an imported binding:
  //   import { Foo } from "./internal/foo"; export { Foo };
  // Recurse into the original import source.
  if (bareReExport) {
    const re = bareReExport as BareReExport;
    const next = resolveSpecifierToFile(ctx, fileResult.absolutePath, re.source, re.importedFromSource);
    if (!next.ok) return next;
    if (next.kind === "external") return next;
    return chaseBarrel(ctx, next.absolutePath, re.importedFromSource, resolveSpecifierToFile);
  }

  // Barrel chase
  return chaseBarrel(ctx, fileResult.absolutePath, importedName, resolveSpecifierToFile);
}
