---
phase: 03-parser-core-ast-resolution-extractors
reviewed: 2026-04-29T06:04:14Z
depth: standard
files_reviewed: 36
files_reviewed_list:
  - src/adapters/FrameworkAdapter.ts
  - src/adapters/next/NextJsAdapter.ts
  - src/adapters/types.ts
  - src/core/extractors/css-module.ts
  - src/core/extractors/index.ts
  - src/core/extractors/inline-style.ts
  - src/core/extractors/styled.ts
  - src/core/extractors/tailwind/index.ts
  - src/core/extractors/tailwind/layout-prefixes.ts
  - src/core/extractors/tailwind/resolve-args.ts
  - src/core/parser/index.ts
  - src/core/parser/plugins.ts
  - src/core/render-flow/component-detect.ts
  - src/core/render-flow/conditionals.ts
  - src/core/render-flow/index.ts
  - src/core/render-flow/lists.ts
  - src/core/resolver/barrel.ts
  - src/core/resolver/index.ts
  - src/core/resolver/node-modules.ts
  - src/core/resolver/relative.ts
  - src/core/resolver/tsconfig.ts
  - test/adapters/FrameworkAdapter.test.ts
  - test/adapters/next/NextJsAdapter.kitchen-sink.test.ts
  - test/adapters/next/NextJsAdapter.test.ts
  - test/adapters/types.test.ts
  - test/architecture/island.test.ts
  - test/core/extractors/css-module.test.ts
  - test/core/extractors/inline-style.test.ts
  - test/core/extractors/styled.test.ts
  - test/core/extractors/tailwind.test.ts
  - test/core/parser/parseFile.test.ts
  - test/core/render-flow/component-detect.test.ts
  - test/core/render-flow/walkRenderFlow.test.ts
  - test/core/resolver/barrel.test.ts
  - test/core/resolver/relative.test.ts
  - test/core/resolver/tsconfig-paths.test.ts
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-04-29T06:04:14Z
**Depth:** standard
**Files Reviewed:** 36
**Status:** issues_found

## Summary

Phase 03 delivers a coherent, well-documented Parser Core: AST parser with discriminated `ParseResult`, four-layer module resolver (`tsconfig` → relative → node_modules → barrel chase), four extractors (Tailwind, inline-style, CSS-Modules, styled-components), render-flow walker, and the `NextJsAdapter` that orchestrates them. The D-11 island invariant is enforced at two layers (Biome + architecture test). The `FrameworkAdapter` 5-method contract is locked and unit-asserted. The D-12 no-throw discipline holds across the resolver and parser.

The implementation matches its plan documents closely. No security issues, no critical bugs, no debug artifacts. All findings below are correctness gaps in edge cases (clsx-falsy semantics, bare re-export handling, spread-key collisions) plus minor code-quality observations. None block phase acceptance, but a handful warrant follow-up before downstream phases consume `ComponentDefinition` more broadly.

Performance is out of v1 scope; not flagged.

## Warnings

### WR-01: `clsx`/`cn` object-expression with `false` value emits spurious raw token

**File:** `src/core/extractors/tailwind/resolve-args.ts:66-86`
**Issue:** Within an `ObjectExpression` arg to `cn`/`clsx`, only `BooleanLiteral(true)` produces a literal token (line 75); everything else, including the canonical `{ active: false }` "skip this class" idiom, falls through to the trailing `out.push({ kind: "raw", source: sliceSource(source, prop as t.Node), ... })` on line 84. That means `cn({ foo: false })` emits `{ kind: "raw", source: "foo: false" }` — a class token for a class that is explicitly suppressed. With `fullClasses: false` this raw token still passes the filter (raw is always kept), so downstream consumers will see a class that should not exist.
**Fix:**
```ts
// inside the ObjectExpression branch, BEFORE the catch-all raw push:
if (t.isObjectProperty(prop) && !prop.computed) {
  const keyName = t.isIdentifier(prop.key)
    ? prop.key.name
    : t.isStringLiteral(prop.key)
      ? prop.key.value
      : null;
  if (keyName && t.isExpression(prop.value)) {
    if (t.isBooleanLiteral(prop.value)) {
      // true → emit literal tokens; false → drop entirely (clsx semantics)
      if (prop.value.value === true) {
        for (const tok of keyName.split(/\s+/).filter(Boolean)) {
          out.push({ kind: "literal", value: tok, file, line });
        }
      }
      continue; // <-- key change: skip the raw-fallback for both true AND false
    }
  }
}
out.push({ kind: "raw", source: sliceSource(source, prop as t.Node), file, line });
```

### WR-02: Resolver does not handle bare named re-export of imported binding

**File:** `src/core/resolver/index.ts:125-141` and `src/core/resolver/barrel.ts:62-80`
**Issue:** `doResolve` checks `FunctionDeclaration` / `VariableDeclarator` / `ClassDeclaration` for a local declaration of `importedName`. If the file pattern is:
```ts
import { Foo } from "./internal/foo";
export { Foo };
```
neither check matches (`Foo` is an `ImportSpecifier`, not a top-level decl). Control falls through to `chaseBarrel`, which only inspects `ExportNamedDeclaration` nodes that carry a `source` (the `export { Foo } from "..."` form). The bare `export { Foo }` has `source === null`, so it is skipped. Result: `{ ok: false, kind: "not-found" }` for a perfectly valid (and common) barrel-pattern.
**Fix:** In `doResolve` (or in `chaseBarrel`'s "find local" step), additionally collect `ImportDeclaration` specifiers and `ExportNamedDeclaration { source: null }` re-exports. When the bare `export { name }` references an imported binding, recurse into the original import source. Sketch:
```ts
// In doResolve, before falling back to chaseBarrel:
let importedFromSpecifier: string | null = null;
let renamedTo = importedName;
traverse(parsed.ast, {
  ExportNamedDeclaration(p) {
    if (p.node.source) return; // handled by chaseBarrel
    for (const spec of p.node.specifiers) {
      if (!t.isExportSpecifier(spec)) continue;
      const exportedName = t.isIdentifier(spec.exported) ? spec.exported.name : spec.exported.value;
      if (exportedName !== importedName) continue;
      const localName = t.isIdentifier(spec.local) ? spec.local.name : exportedName;
      // Find the matching ImportDeclaration in the same file
      // ... walk ImportDeclaration nodes for a specifier whose .local.name === localName
      // Set importedFromSpecifier + renamedTo accordingly.
    }
  },
});
if (importedFromSpecifier) {
  const next = resolveSpecifierToFile(ctx, fileResult.absolutePath, importedFromSpecifier);
  if (next.ok && next.kind === "local") {
    return chaseBarrel(ctx, next.absolutePath, renamedTo, resolveSpecifierToFile);
  }
  return next;
}
```

### WR-03: Inline-style spread-key collision when `start` offsets are absent

**File:** `src/core/extractors/inline-style.ts:28-30`
**Issue:** `out[`__spread_${prop.start ?? 0}`] = ...` collapses every spread element to the key `__spread_0` whenever `prop.start` is `undefined` (e.g. constructed AST, post-transform AST, or future Babel versions where `start` becomes nullable). Two spreads on the same element will silently overwrite each other, losing data.
**Fix:** Use a stable counter unique within the element:
```ts
let spreadIdx = 0;
for (const prop of expr.properties) {
  if (t.isSpreadElement(prop)) {
    out[`__spread_${spreadIdx++}`] = { raw: sliceSource(source, prop.argument) };
    continue;
  }
  // ...
}
```
A monotonic counter is also more meaningful as an index than the byte offset.

### WR-04: Multiple JSX elements' inline styles overwrite each other in `collectStyleSignals`

**File:** `src/core/extractors/index.ts:35-39`
**Issue:** `Object.assign(inlineStyles, extractInlineStyle(el, source))` flattens every element's style record into one component-level record. If two JSX elements in the same component each set `style={{ margin: ... }}`, only the last wins — the earlier element's value is silently lost. This is consistent with the locked R8 type (`inlineStyles: Record<string, ...>`), so it cannot be fixed without a contract change. However, the loss is silent and undocumented. Downstream consumers (Phase 5 IR translator) will assume `inlineStyles` is "the styles for the component" without realizing there's been a merge collision.
**Fix:** Either (a) document the merge semantics on the `ComponentDefinition.inlineStyles` field in `src/adapters/types.ts` with an explicit "last-wins across elements" note, or (b) push a `ctx.warnings` entry when a key is overwritten so the lossiness is observable:
```ts
for (const el of jsxElements) {
  classNames.push(...extractTailwindClasses(el, source, file, opts));
  const elStyles = extractInlineStyle(el, source);
  for (const [k, v] of Object.entries(elStyles)) {
    // Optionally: if (k in inlineStyles) ctx.warnings.push(`inline-style key collision: ${k} in ${file}`);
    inlineStyles[k] = v;
  }
}
```
Option (a) is the minimum viable fix; (b) is cleaner.

### WR-05: `walkBlock` only honors the FIRST top-level `return`/`if` and ignores variable bindings

**File:** `src/core/render-flow/index.ts:78-95`
**Issue:** The walker iterates statements and returns at the first `ReturnStatement` or `IfStatement`. Common patterns are missed:
```tsx
function Card() {
  const content = condition ? <A/> : <B/>;
  return <Wrapper>{content}</Wrapper>;  // <-- content's branch is invisible
}
```
The `Wrapper` JSX is captured but `content` is just an `Identifier` in attribute/child position; the `?:` branch information is lost. Also, an `if` followed by a `return` produces only the `if`-branch (the unconditional return is discarded). For Phase 3 this may be an accepted v1 limitation, but it should be documented in the file's header so consumers know not to expect symbolic-binding resolution.
**Fix:** Add explicit JSDoc on `walkBlock` calling out the v1 limitations: (1) variable bindings are not inlined; (2) the first `if`/`return` wins; (3) early `return` inside `if`/`else` is the only branching pattern recognized. Alternatively, build a minimal local-binding map and substitute Identifier references during `walk` — but that is a v2 expansion. Documentation alone is sufficient for v1.

## Info

### IN-01: `traverse` runs twice on the same AST in `extractCssModuleRefs`

**File:** `src/core/extractors/css-module.ts:18-41`
**Issue:** The function performs two full traversals of the AST — first to harvest `ImportDeclaration` bindings, then to harvest `MemberExpression` references. Combining into a single visitor avoids the second walk:
```ts
traverse(ast, {
  ImportDeclaration(p) { /* fill bindings */ },
  MemberExpression(p) {
    if (bindings.size === 0) return; // not yet populated; keep early-out cheap
    /* fill out */
  },
});
```
Babel visits in source order, so by the time `MemberExpression` fires for a `styles.foo` reference, the `ImportDeclaration` above it has already been visited. This is purely a code-quality observation; correctness is unchanged.

### IN-02: `ResolveResult { kind: "ambiguous" }` is unreachable in v1

**File:** `src/adapters/types.ts:237` and `src/core/resolver/index.ts`
**Issue:** The `ambiguous` variant is declared in the union but never produced anywhere in the resolver. The comment ("reserved for future logic; currently unreachable but kept in the union so callers can pattern-match exhaustively") justifies the choice, which is reasonable. Worth noting only so future maintainers do not assume it's a bug. No fix needed; consider a `// @internal: reserved for v2` annotation if the reservation is forgotten.

### IN-03: `tsconfig.ts loadTsconfigOnce` truthiness short-circuit is subtle

**File:** `src/core/resolver/tsconfig.ts:42-46`
**Issue:** The flag-set check at line 41 (`loadedFlag.has(ctx)`) is the primary "have we attempted load?" sentinel; the secondary check at 42 (`if (ctx.tsconfig !== null)`) treats any caller-pre-populated value as "loaded." This works, but reads as if the two checks could disagree. A single sentinel is clearer:
```ts
export function loadTsconfigOnce(ctx: ParseContext): TsConfigResult | null {
  if (loadedFlag.has(ctx)) return ctx.tsconfig;
  // Caller pre-population is honored by leaving ctx.tsconfig untouched if non-null.
  if (ctx.tsconfig === null) ctx.tsconfig = getTsconfig(ctx.resolvedRoot);
  loadedFlag.add(ctx);
  return ctx.tsconfig;
}
```
Functionally equivalent, but eliminates the readers' "wait, can these two diverge?" pause.

### IN-04: `parser/index.ts` casts `readonly ParserPlugin[]` via `as`

**File:** `src/core/parser/index.ts:46`
**Issue:** `plugins: PARSER_PLUGINS as ParserPlugin[]` discards the readonly modifier. `@babel/parser` does not mutate the plugins array, so this is safe in practice. A cleaner alternative is to widen the input slot via spread (`plugins: [...PARSER_PLUGINS]`) which preserves immutability of the source list and avoids the assertion. Negligible impact; included for completeness.

---

_Reviewed: 2026-04-29T06:04:14Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
