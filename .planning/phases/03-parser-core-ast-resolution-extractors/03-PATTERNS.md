# Phase 3: Parser Core (AST + Resolution + Extractors) — Pattern Map

**Mapped:** 2026-04-29
**Files analyzed:** 27 new source/test files + 1 modified (biome.json)
**Analogs found:** 22 / 27 (5 files have no direct analog — see "No Analog Found")

Two analog families dominate this phase:

1. **`generate-component-hierarchy.ts`** (repo root, the prototype) — the
   load-bearing reference for nearly every parser/resolver/extractor/render-flow
   file. Most logic ports 1:1; only the **emit shape** changes (raw nodes →
   typed `RenderNode` / `ComponentDefinition`) and `node.type === "X"` strings
   become `t.isX(...)` type guards.
2. **`src/mcp/`** (Phase 2) and **`src/ir/`, `src/core/`** (Phase 1) —
   conventions for module shape: `.js` extension on relative imports, ESM-only,
   pure functions, JSDoc decision references (`D-XX`, `R8`), `toForwardSlash`
   discipline, no class instances at module level.

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `src/adapters/types.ts` | model (types) | request-response | `src/ir/schema.ts` | role-match (no zod here per D-04) |
| `src/adapters/FrameworkAdapter.ts` | interface contract | request-response | `src/mcp/tools/index.ts` (`ToolModule` shape) | role-match |
| `src/adapters/next/NextJsAdapter.ts` | orchestrator (adapter) | request-response | `generate-component-hierarchy.ts` `analyzeFile` + `main` | exact |
| `src/core/parser/index.ts` | pure traversal primitive | transform | prototype `parseAst` + `analyzeFile` parse block (lines 121-127, 388-396) | exact |
| `src/core/parser/plugins.ts` | config constant | — | prototype `parseAst` plugin array (line 125) | exact |
| `src/core/resolver/index.ts` | resolver orchestrator | transform | prototype `resolveImportToFile` (lines 472-483) | exact |
| `src/core/resolver/tsconfig.ts` | resolver helper | I/O + cache | prototype `resolveAliasImport` (lines 457-464) — but replace with `get-tsconfig` | partial (logic differs; structure analogous) |
| `src/core/resolver/relative.ts` | utility | file probe | prototype extension probe loop (lines 475-482) | exact |
| `src/core/resolver/barrel.ts` | pure traversal | recursion + cycle guard | none in prototype (new logic) — closest is `collectImports` traversal shape (lines 187-205) | role-match |
| `src/core/resolver/node-modules.ts` | utility | string predicate | prototype `isProjectImportSource` (lines 466-470, inverse logic) | role-match |
| `src/core/extractors/index.ts` | orchestrator (style signals) | transform | prototype `summarizeElementLayout` (lines 578-601) | role-match (splits prototype into 4 modules) |
| `src/core/extractors/tailwind/index.ts` | extractor | transform | prototype className branch in `summarizeElementLayout` (lines 583-594) | exact |
| `src/core/extractors/tailwind/resolve-args.ts` | pure traversal | transform | prototype `collectClassTokensFromExpression` (lines 486-542) | exact |
| `src/core/extractors/tailwind/layout-prefixes.ts` | config + utility | predicate | prototype `LAYOUT_CLASS_PREFIXES` + `LAYOUT_CLASS_EXACT` + `isLayoutClass` + `filterLayoutClasses` (lines 69-82, 174-183) | exact (D-08 supersedes the list itself) |
| `src/core/extractors/inline-style.ts` | extractor | transform | prototype `summarizeStyleExpression` + `STYLE_KEYS` (lines 84-93, 544-576) | exact |
| `src/core/extractors/css-module.ts` | extractor | transform | none in prototype (new) — closest is `collectImports` (lines 187-205) for the import side | role-match |
| `src/core/extractors/styled.ts` | extractor | transform | none in prototype (new) — pure new logic from Pattern 9 in 03-RESEARCH.md | no analog |
| `src/core/render-flow/index.ts` | pure traversal | transform | prototype `extractRenderFlow` + `findJsxInExpression` + `findReturnJsxInStatement` (lines 228-356) | exact |
| `src/core/render-flow/conditionals.ts` | pure traversal | branch emit | prototype `buildRenderFlowFromStatement` IfStatement / SwitchStatement branches (lines 317-348) + ConditionalExpression / LogicalExpression unwrap (lines 246-249, 516-522) | exact |
| `src/core/render-flow/lists.ts` | pure traversal | list emit | prototype lacks dedicated `.map` handling — closest is generic `CallExpression` recursion (lines 749-755) | role-match (new logic) |
| `src/core/render-flow/component-detect.ts` | pure traversal | discovery | prototype `analyzeFile` traverse block (lines 419-437) + `unwrapComponentFunction` (lines 358-371) + `resolveWrapperTarget` (lines 373-385) | exact |
| `biome.json` (modify) | config | — | existing `noRestrictedImports` block (lines 29-49) — already in place; verify scope | exact |
| `test/architecture/island.test.ts` | test (architecture) | scan | none in repo (new) — pattern from D-11 layer 2 | no analog |
| `test/adapters/types.test.ts` | test (structural) | type assertion | none in repo (new) | no analog |
| `test/adapters/FrameworkAdapter.test.ts` | test (interface) | type assertion | none in repo (new) | no analog |
| `test/adapters/next/NextJsAdapter.test.ts` | test (e2e fixture) | snapshot | none direct; convention from `src/mcp/server.ts` (vitest patterns there) | role-match |
| `test/core/parser/parseFile.test.ts` | test (unit) | snapshot | same convention | role-match |
| `test/core/resolver/{barrel,tsconfig}.test.ts` | test (unit) | fixture-driven | same convention | role-match |
| `test/core/extractors/*.test.ts` | test (unit + snapshot) | snapshot | same convention | role-match |
| `test/core/render-flow/walkRenderFlow.test.ts` | test (file snapshot) | `toMatchFileSnapshot` | same convention | role-match |
| `test/fixtures/parser/**` | fixture data | static | none in repo (new) — D-14/D-15 lock the layout | no analog |

## Pattern Assignments

### `src/adapters/types.ts` (model — types only, no zod per D-04)

**Analog:** `src/ir/schema.ts`

**What to copy from analog:**

- The shape of a discriminated union that carries `file: string` + `line: number`
  on every variant (Phase 1 D-06/D-07).
- The "explicit TypeScript type alias FIRST, zod schema second" pattern — but
  Phase 3 keeps **only** the type alias (D-04 says no user-facing zod here).
- JSDoc rationale comments referencing decision IDs (`D-04`, `R8`).

**Type-alias pattern** (`src/ir/schema.ts:11-79`):

```typescript
export type TreeNode =
  | {
      kind: "component";
      name: string;
      children: TreeNode[];
      file: string;
      line: number;
      layoutHint?: string;
    }
  | {
      kind: "branch";
      condition: string;
      thenBranch: TreeNode | null;
      elseBranch: TreeNode | null;
      file: string;
      line: number;
      layoutHint?: string;
    }
  // ... 7 more variants, each with file/line at the bottom
```

**Port plan for Phase 3 `RenderNode`** (D-05 — 7 kinds, parser-shaped):

- Mirror this exact shape but use the 7 kinds locked in CONTEXT.md D-05
  (`jsx`, `branch`, `list`, `text`, `fragment`, `spread`, `error`).
- `file` is forward-slash absolute (resolver guarantee), not relative as in IR.
- Add `JsxAttribute`, `ClassToken`, `PropSignature`, `ResolveResult`,
  `ParseContext`, `ParseResult`, `ComponentDefinition` (R8 11-field shape) in
  the same file. No zod schemas — pure TS.

**Documentation marker** (mirror `src/ir/schema.ts:1-11`):

```typescript
/**
 * RenderNode — parser-level render flow (D-04, D-05).
 *
 * Deliberately separate from IR `TreeNode` (src/ir/schema.ts).
 * Phase 5 owns the adapter→IR translator (toIR()).
 */
```

---

### `src/adapters/FrameworkAdapter.ts` (interface)

**Analog:** `src/mcp/tools/index.ts` (the `ToolModule` interface — same role: a
locked surface contract collected once and consumed everywhere).

**Pattern — interface with JSDoc per method** (from RESEARCH.md "FrameworkAdapter
interface — locked surface" lines 982-1010):

```typescript
import type { ComponentDefinition, ResolveResult, ParseContext } from "./types.js";

export interface FrameworkAdapter {
  /** Test whether a project root looks like this framework's project (Phase 4). */
  detect(absRoot: string): Promise<boolean> | boolean;

  /** Enumerate parser entry points for the project (Phase 4). */
  discoverEntries(absRoot: string): Promise<string[]> | string[];

  /** Resolve an import specifier from a file to an absolute path or external boundary (Phase 3). */
  resolveModule(
    ctx: ParseContext,
    fromFile: string,
    specifier: string,
    importedName: string,
  ): ResolveResult;

  /** Parse one or more entry files into ComponentDefinition[] (Phase 3). */
  extractComponents(
    ctx: ParseContext,
    entryFiles: string[],
    opts?: { fullClasses?: boolean },
  ): ComponentDefinition[];

  /** Map a route string to the entry file(s) responsible for rendering it (Phase 4). */
  mapRouteToEntry(absRoot: string, route: string): Promise<string[]> | string[];
}
```

**Test-side analog** (`src/mcp/tools/index.ts:34`):

```typescript
export const tools: readonly ToolModule[] = [getFullHierarchy, focusOn, findByText, findByStyle];
```

A vitest test for the 5-method interface count can mirror the convention from
Phase 2 where `tools.length` is the structural assertion source. For Phase 3,
the method count is asserted via `keyof FrameworkAdapter` exhaustive switch or
`Object.keys` of a stub instance.

---

### `src/adapters/next/NextJsAdapter.ts` (orchestrator — Phase 3 implements 2/5)

**Analog:** `generate-component-hierarchy.ts` (prototype) — `analyzeFile`
(lines 388-454) + the body of `main()` (lines 633-933) is the canonical
orchestration shape. Specifically the "build context, parse, traverse, register
components" flow.

**Imports pattern** (port from prototype lines 1-7, but ESM with `.js` per
Phase 1+2 conventions):

```typescript
import { parseFile } from "../../core/parser/index.js";
import { resolveModule } from "../../core/resolver/index.js";
import { walkRenderFlow } from "../../core/render-flow/index.js";
import { collectStyleSignals } from "../../core/extractors/index.js";
import { traverse } from "../../core/babel-shim.js";
import * as t from "@babel/types";
import { toForwardSlash } from "../../core/paths.js";
import type {
  ComponentDefinition, ParseContext, ResolveResult,
} from "../types.js";
import type { FrameworkAdapter } from "../FrameworkAdapter.ts";  // type-only — interface only
```

**Stub shape for Phase 4 methods** — mirror `src/mcp/errors.ts:9-19`
(`notImplemented`):

```typescript
detect(): never {
  throw new Error("not implemented in Phase 3");
}
discoverEntries(): never {
  throw new Error("not implemented in Phase 3");
}
mapRouteToEntry(): never {
  throw new Error("not implemented in Phase 3");
}
```

**Component registration loop** — port from prototype lines 419-437:

```typescript
// PROTOTYPE (port + replace string types with t.isX guards):
traverse(ast, {
  FunctionDeclaration(nodePath: any) {
    if (nodePath.node.id?.name) registerComponent(nodePath.node.id.name, nodePath.node);
  },
  VariableDeclarator(nodePath: any) {
    if (nodePath.node.id?.type !== "Identifier" || !nodePath.node.init) return;
    const componentFn = unwrapComponentFunction(nodePath.node.init);
    if (componentFn) registerComponent(nodePath.node.id.name, componentFn);
  },
  ExportDefaultDeclaration(nodePath: any) { /* ... */ },
});
```

**Port:** drop `nodePath: any`, use `NodePath<t.FunctionDeclaration>` etc.;
replace `nodePath.node.id?.type !== "Identifier"` with `!t.isIdentifier(...)`.
ADD a `ClassDeclaration` visitor (new — see RESEARCH.md Pattern 6 lines 627-653)
which the prototype does not have.

**HOC unwrap chain** — port + extend prototype `unwrapComponentFunction`
(lines 358-371) and `resolveWrapperTarget` (lines 373-385) with the locked
HOC name set + regex pair (RESEARCH.md Pattern 5 lines 593-623, D-08 + SPEC R4).

**Error handling pattern** — discriminated union, never throw (D-12). Mirror
the discipline from `src/mcp/errors.ts` but at the parser level: every code
path returns `ResolveResult` or pushes to `ctx.warnings`; only truly
unrecoverable bugs propagate.

---

### `src/core/parser/index.ts` (parse primitive)

**Analog:** prototype `parseAst` (lines 121-127) + `analyzeFile` parse block
(lines 388-396).

**Prototype excerpt — what to keep:**

```typescript
// generate-component-hierarchy.ts:121-127
function parseAst(source: string, filename: string) {
  return parse(source, {
    sourceType: "module",
    sourceFilename: filename,
    plugins: ["jsx", "typescript", "classProperties", "decorators-legacy", "dynamicImport", "topLevelAwait"],
  });
}

// generate-component-hierarchy.ts:388-396
const source = await Bun.file(filePath).text();
let ast;
try {
  ast = parseAst(source, filePath);
} catch (parseError: any) {
  console.error(`[warn] skipping unparseable file ${rel(filePath)}: ${parseError?.message ?? String(parseError)}`);
  return null;
}
```

**Port plan:**

1. Replace plugin array with `PARSER_PLUGINS` from `./plugins.js` (full SPEC
   set — adds 4 plugins the prototype lacks).
2. Add `errorRecovery: true` (PARSE-01).
3. Replace `Bun.file(...).text()` with `readFileSync(absPath, "utf8")` from
   `node:fs`.
4. Replace `console.error` warning with `ctx.warnings.push(...)` (D-01) —
   stdio safety per Phase 2 D-08 (`src/mcp/log.ts` is reserved for diagnostics;
   in-band warnings go on the envelope).
5. Wrap with per-call AST cache (D-02): check `ctx.astCache` before parsing,
   write success or failure as a `ParseResult` discriminated union.
6. Apply `toForwardSlash(absPath)` as the cache key.

**Reference shape from RESEARCH.md** (lines 396-448 — already worked out):

```typescript
export type ParseResult =
  | { kind: "ok"; ast: File; source: string }
  | { kind: "error"; message: string; line: number };

export function parseFile(ctx: ParseContext, absPath: string): ParseResult {
  const norm = toForwardSlash(absPath);
  const cached = ctx.astCache.get(norm);
  if (cached) return cached;
  // ... readFileSync → parse with errorRecovery:true → cache + return
}
```

**Forward-slash discipline** — copy from `src/core/paths.ts:15-17`:

```typescript
import { toForwardSlash } from "../paths.js";
// every emitted path: toForwardSlash(absPath)
```

---

### `src/core/parser/plugins.ts` (constant)

**Analog:** prototype `parseAst` plugin list (line 125).

**Prototype excerpt:**

```typescript
plugins: ["jsx", "typescript", "classProperties", "decorators-legacy", "dynamicImport", "topLevelAwait"]
```

**Port plan (DO NOT copy verbatim):** SPEC R1 / PARSE-01 locks a 10-item
plugin list — adds `classPrivateProperties`, `classPrivateMethods`,
`importAssertions`, `explicitResourceManagement` to the prototype's 6.

```typescript
// src/core/parser/plugins.ts
import type { ParserPlugin } from "@babel/parser";

export const PARSER_PLUGINS: readonly ParserPlugin[] = [
  "jsx",
  "typescript",
  "decorators-legacy",
  "classProperties",
  "classPrivateProperties",
  "classPrivateMethods",
  "dynamicImport",
  "topLevelAwait",
  "importAssertions",
  "explicitResourceManagement",
];
```

---

### `src/core/resolver/index.ts` + `tsconfig.ts` + `relative.ts` (resolver suite)

**Analogs:** prototype `resolveAliasImport` (lines 457-464), `resolveImportToFile`
(lines 472-483), `isProjectImportSource` (lines 466-470).

**Prototype `resolveAliasImport` (lines 457-464) — REPLACE with `get-tsconfig`:**

```typescript
function resolveAliasImport(source: string) {
  for (const [prefix, target] of Object.entries(aliasMap)) {
    if (!prefix || !target) continue;
    if (source === prefix) return path.resolve(PROJECT_ROOT, target);
    if (source.startsWith(`${prefix}/`)) return path.resolve(PROJECT_ROOT, target, source.slice(prefix.length + 1));
  }
  return null;
}
```

**Port plan:** scrap entirely. CLAUDE.md forbids `tsconfig-paths`; `get-tsconfig`
is the locked replacement. Use `createPathsMatcher` from RESEARCH.md
"Pattern 3" lines 481-503 + "Code Examples" lines 916-931:

```typescript
// src/core/resolver/tsconfig.ts
import { getTsconfig, createPathsMatcher } from "get-tsconfig";

export function getOrLoadTsconfig(ctx: ParseContext) {
  if (ctx.tsconfig === undefined) {
    ctx.tsconfig = getTsconfig(ctx.resolvedRoot);
  }
  return ctx.tsconfig;
}

export function getOrBuildPathsMatcher(ctx: ParseContext) {
  const tsconfig = getOrLoadTsconfig(ctx);
  return tsconfig ? createPathsMatcher(tsconfig) : null;
}
```

**Prototype `resolveImportToFile` extension probe (lines 472-483) — KEEP:**

```typescript
async function resolveImportToFile(fromFile: string, source: string) {
  const basePath = source.startsWith(".") ? path.resolve(path.dirname(fromFile), source) : resolveAliasImport(source);
  if (!basePath) return null;
  if (await Bun.file(basePath).exists()) return basePath;
  for (const ext of EXTENSIONS) {
    if (await Bun.file(`${basePath}${ext}`).exists()) return `${basePath}${ext}`;
  }
  for (const ext of EXTENSIONS) {
    if (await Bun.file(path.join(basePath, `index${ext}`)).exists()) return path.join(basePath, `index${ext}`);
  }
  return null;
}
```

**Port plan for `src/core/resolver/relative.ts`:**

1. Replace `Bun.file(...).exists()` with `existsSync(...)` from `node:fs`.
2. Make synchronous (resolver is sync per RESEARCH.md "Code Examples"
   lines 944-959).
3. Wrap return through `toForwardSlash` (D-07).
4. Use the EXT probe order from D-13 / RESEARCH.md lines 940-959:
   `[".ts", ".tsx", ".js", ".jsx"]` for both basePath-extension and `/index.<ext>`.

**`src/core/resolver/node-modules.ts` — port from RESEARCH.md "Code Examples"
lines 962-977** (no direct prototype analog; prototype's `isProjectImportSource`
is the inverse predicate):

```typescript
function isExternalPath(absPath: string): boolean {
  return toForwardSlash(absPath).includes("/node_modules/");
}
function packageNameFromSpecifier(specifier: string): string {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.slice(0, 2).join("/");
  }
  return specifier.split("/")[0];
}
```

**Resolver `index.ts` orchestrator — discriminated union return (D-12, never
throws):** see RESEARCH.md `ResolveResult` shape lines 113-119. Cache hits via
`ctx.resolverCache` keyed `${fromFile}::${specifier}::${importedName}` (D-03).

---

### `src/core/resolver/barrel.ts` (NEW logic — no prototype analog)

**Closest analog:** prototype `collectImports` (lines 187-205) — same
"traverse for ImportDeclaration / ExportNamedDeclaration / ExportAllDeclaration"
shape, but the prototype doesn't recurse.

**Prototype `collectImports` traversal shape (lines 187-205):**

```typescript
function collectImports(ast: any) {
  const imports = new Map<string, JSImport>();
  traverse(ast, {
    ImportDeclaration(nodePath: any) {
      const source = nodePath.node.source.value;
      for (const spec of nodePath.node.specifiers ?? []) {
        if (spec.type === "ImportDefaultSpecifier") { /* ... */ }
        else if (spec.type === "ImportNamespaceSpecifier") { /* ... */ }
        else if (spec.type === "ImportSpecifier") {
          imports.set(spec.local.name, {
            source, kind: "named",
            importedName: spec.imported.type === "Identifier" ? spec.imported.name : spec.imported.value,
          });
        }
      }
    },
  });
  return imports;
}
```

**Port plan:** copy the traversal shape, but visit `ExportNamedDeclaration` /
`ExportAllDeclaration` (the prototype only visits `ImportDeclaration`).
RESEARCH.md "Pattern 4 — Barrel chase with cycle guard" lines 510-584 has the
worked-out implementation. Key features the prototype lacks:

1. **Cycle guard** via `visited: Set<string>` carried through recursion.
2. **Rename through `ExportSpecifier`**: when the barrel does
   `export { internalFoo as Foo } from "./impl"`, recurse with `spec.local.name`
   not `spec.exported.name` (PITFALL 3 in RESEARCH.md).
3. **`ExportAllDeclaration` star-export fan-out**: try each branch; ambiguous
   if multiple succeed (D-12 reserved kind).
4. Stop at `node_modules` boundary → emit `external` (PARSE-02).

Reuse `parseFile(ctx, ...)` (already cached in `ctx.astCache`, so re-entries
to the same barrel during chase are O(1)) and `t.isIdentifier`,
`t.isExportSpecifier` from `@babel/types`.

---

### `src/core/extractors/tailwind/resolve-args.ts` (cn / clsx / cva / twMerge walker)

**Analog:** prototype `collectClassTokensFromExpression` (lines 486-542). This
is one of the most directly portable functions.

**Prototype excerpt (lines 486-542) — port the shape:**

```typescript
function collectClassTokensFromExpression(node: any, bindings: Map<string, any>, source: string, seen = new Set<string>(), out: string[] = []): string[] {
  const current = unwrapExpression(node);
  if (!current) return out;
  if (current.type === "StringLiteral") { pushClassTokens(out, current.value); return out; }
  if (current.type === "TemplateLiteral") {
    for (const quasi of current.quasis ?? []) pushClassTokens(out, quasi.value?.cooked ?? quasi.value?.raw ?? "");
    for (const expr of current.expressions ?? []) collectClassTokensFromExpression(expr, bindings, source, seen, out);
    return out;
  }
  if (current.type === "Identifier") {
    if (!bindings.has(current.name) || seen.has(current.name)) return out;
    seen.add(current.name);
    collectClassTokensFromExpression(bindings.get(current.name), bindings, source, seen, out);
    seen.delete(current.name);
    return out;
  }
  // ... ArrayExpression, ObjectExpression, ConditionalExpression, LogicalExpression,
  // CallExpression, ArrowFunction, MemberExpression branches
}
```

**Port plan (D-09 — discriminated `ClassToken`):**

1. Replace `out: string[]` with `out: ClassToken[]` (literal vs raw union).
2. String literals + interpolation-free quasi values → `{ kind: "literal", value, file, line }`.
3. Object keys with truthy literal values (e.g. `{ "p-4": true }`) → `literal`.
4. Anything not statically resolvable (Identifier without binding, MemberExpression,
   ConditionalExpression with non-literal branches, TemplateLiteral with
   interpolation, etc.) → single `{ kind: "raw", source: sourceSlice(...), ... }`.
5. **Pitfall 6** (RESEARCH.md lines 868-873): for `cn(condition && "active")`,
   record BOTH the inner literal AND the whole conditional as raw — most
   signal for the agent.
6. Replace string `node.type === "X"` checks with `t.isStringLiteral(...)`,
   `t.isTemplateLiteral(...)`, etc. — non-negotiable per CLAUDE.md.
7. Drop the `pushClassTokens(out, raw)` regex fallback (lines 539-541) — it's
   the prototype's "best effort" path; D-09 says raw source preserved as a
   single `raw` token.

---

### `src/core/extractors/tailwind/layout-prefixes.ts` (D-08 prefix list + variant strip)

**Analog:** prototype `LAYOUT_CLASS_PREFIXES` + `LAYOUT_CLASS_EXACT` +
`isLayoutClass` + `filterLayoutClasses` (lines 69-82, 174-183).

**Prototype excerpt — what to PARTIALLY port:**

```typescript
// generate-component-hierarchy.ts:174-178
function isLayoutClass(token: string) {
  const base = token.replace(/^(?:[a-zA-Z0-9_-]+:)+/, "");
  return LAYOUT_CLASS_EXACT.has(base) || LAYOUT_CLASS_PREFIXES.some(p => base.startsWith(p));
}
```

**Port plan:**

1. **Use D-08's prefix list, NOT the prototype's** (CONTEXT.md D-08 is canonical;
   the prototype list is partly redundant with the new prefix-only design and
   misses Tailwind v4 `size-`).
2. **Use the regex from D-08** which handles arbitrary variants `[&>svg]:size-6`
   — the prototype regex `^(?:[a-zA-Z0-9_-]+:)+` does NOT handle `[...]:`.

```typescript
// src/core/extractors/tailwind/layout-prefixes.ts (canonical from RESEARCH.md lines 681-708)
export const LAYOUT_PREFIXES: readonly string[] = [
  "flex", "grid", "gap", "m", "p", "w", "h", "min-w", "min-h", "max-w", "max-h",
  "top", "right", "bottom", "left", "inset",
  "place-", "justify-", "items-", "self-", "content-",
  "basis-", "grow", "shrink", "order", "col-", "row-",
  "space-", "divide-",
  "absolute", "relative", "fixed", "sticky", "static",
  "hidden", "block", "inline", "inline-block", "inline-flex", "inline-grid",
  "overflow-", "z-",
  "size-",
];

export const VARIANT_PREFIX_RE = /^(?:\[[^\]]+\]|[a-zA-Z0-9_-]+):/;

export function stripVariants(token: string): string {
  let s = token;
  while (VARIANT_PREFIX_RE.test(s)) s = s.replace(VARIANT_PREFIX_RE, "");
  return s;
}

export function isLayoutToken(token: string): boolean {
  const base = stripVariants(token);
  return LAYOUT_PREFIXES.some((p) =>
    p.endsWith("-") ? base.startsWith(p) : (base === p || base.startsWith(`${p}-`)),
  );
}
```

---

### `src/core/extractors/inline-style.ts`

**Analog:** prototype `summarizeStyleExpression` + `STYLE_KEYS` (lines 84-93,
544-576).

**Prototype excerpt (lines 558-568) — port:**

```typescript
if (current.type === "ObjectExpression") {
  for (const prop of current.properties ?? []) {
    if (prop?.type !== "ObjectProperty") continue;
    let key = null;
    if (!prop.computed && prop.key.type === "Identifier") key = prop.key.name;
    else if (!prop.computed && prop.key.type === "StringLiteral") key = prop.key.value;
    if (!key || !STYLE_KEYS.has(key)) continue;
    entries.set(key, prop.value.type === "StringLiteral" ? prop.value.value : (sourceSlice(source, prop.value) ?? "?"));
  }
  return entries;
}
```

**Port plan (SPEC R5 / OUT-03 inline-style):**

1. **REMOVE the `STYLE_KEYS` allowlist filter.** SPEC R5 says "object expressions
   on the `style` JSX attribute are captured as a flat record of literal
   key/value pairs; computed/spread values preserved as raw source slices." No
   key filter — every literal key/value pair is captured.
2. Output shape: `Record<string, string | { raw: string }>` (per SPEC R8).
   Literal values → `string`; computed/expression values → `{ raw: sourceSlice }`.
3. Replace `prop.key.type === "Identifier"` with `t.isIdentifier(prop.key)` etc.
4. Handle JSXSpreadAttribute → preserve as a synthetic `{ raw }` entry under
   key `"...rest"` or push to `ctx.warnings` (planner's choice).

---

### `src/core/extractors/css-module.ts` (NEW — no prototype analog)

**Closest analog:** prototype `collectImports` (lines 187-205) — only the
import-detection side; the `MemberExpression` `styles.foo` walker is new.

**Port plan:**

1. First pass: scan `ImportDeclaration` for `from "./X.module.css"` (or
   `*.module.scss`); record the local binding name (e.g., `styles`).
2. Second pass (during JSX walking, attached to `className=` attributes):
   detect `MemberExpression { object: Identifier(<binding>), property: Identifier(<key>) }`.
3. Emit `{ kind: "css-module", binding, key, source: "./X.module.css", file, line }`.
4. **No CSS file parsing** — SPEC R5 explicitly defers to v2.
5. Output shape per SPEC R8: `{ binding: string; key: string; source: string }[]`.

---

### `src/core/extractors/styled.ts` (NEW — no prototype analog)

**Analog:** none. RESEARCH.md "Pattern 9 — styled-components extractor"
lines 717-746 is the worked-out reference.

**Port plan from RESEARCH.md:**

```typescript
function extractStyledTemplate(node: t.TaggedTemplateExpression, source: string): StyledTemplate | null {
  const tag = node.tag;
  let tagName: string | null = null;

  if (t.isMemberExpression(tag) && t.isIdentifier(tag.object) && tag.object.name === "styled" && t.isIdentifier(tag.property)) {
    tagName = tag.property.name;          // styled.div  → "div"
  } else if (t.isCallExpression(tag) && t.isIdentifier(tag.callee) && tag.callee.name === "styled") {
    const arg = tag.arguments[0];
    if (t.isIdentifier(arg)) tagName = arg.name;   // styled(Button) → "Button"
    else tagName = "(expr)";
  } else {
    return null;
  }

  // Build body with {?} per D-10:
  const quasis = node.quasi.quasis;
  const exprs = node.quasi.expressions;
  let body = "";
  for (let i = 0; i < quasis.length; i++) {
    body += quasis[i].value.cooked ?? quasis[i].value.raw;
    if (i < exprs.length) body += "{?}";
  }
  return { tag: tagName, body };
}
```

**Detection traversal pattern** — mirror prototype's `collectImports`
visitor shape but visit `TaggedTemplateExpression`. No import-source verification
in v1 (D-10 — identifier-based detection only).

---

### `src/core/render-flow/index.ts` + `conditionals.ts` + `lists.ts` + `component-detect.ts`

**Analog:** prototype `extractRenderFlow` (lines 350-356), `findJsxInExpression`
(lines 228-262), `findReturnJsxInStatement` (lines 264-289),
`buildRenderFlowFromStatements/Statement` (lines 308-348).

**Prototype excerpt — `findJsxInExpression` (lines 228-262, port the shape):**

```typescript
function findJsxInExpression(node: any): any | null {
  const current = unwrapExpression(node);
  if (!current) return null;
  if (current.type === "JSXElement" || current.type === "JSXFragment") return current;
  if (current.type === "CallExpression") {
    for (const arg of current.arguments ?? []) {
      const found = findJsxInExpression(arg);
      if (found) return found;
    }
    return findJsxInExpression(current.callee);
  }
  if (["ConditionalExpression", "LogicalExpression", "BinaryExpression"].includes(current.type)) {
    return findJsxInExpression(current.left) ?? findJsxInExpression(current.right) ??
           findJsxInExpression(current.consequent) ?? findJsxInExpression(current.alternate);
  }
  // ... ArrowFunctionExpression, ArrayExpression, ObjectExpression branches
}
```

**Prototype excerpt — `buildRenderFlowFromStatement` (lines 317-348, branch emit):**

```typescript
if (statement.type === "IfStatement") {
  const thenFlow = buildRenderFlowFromStatement(statement.consequent, source, fallbackFlow) ?? fallbackFlow;
  const elseFlow = statement.alternate ? (buildRenderFlowFromStatement(statement.alternate, source, fallbackFlow) ?? fallbackFlow) : fallbackFlow;
  if (!thenFlow && !elseFlow) return fallbackFlow;
  return { kind: "branch", condition: statement.test, thenFlow, elseFlow };
}
```

**Port plan (D-05 — 7-kind RenderNode + OUT-04 5 conditional forms + .map):**

1. **Don't return raw AST nodes** — emit typed `RenderNode` per D-05. Every
   emit attaches `file: forward-slash absolute path` + `line: node.loc?.start.line`.
2. **`condition` field becomes a string** (raw source slice, per D-05) — the
   prototype keeps the AST node and stringifies on render. Move stringification
   into the walker.
3. **Add `||` / `??` / `!` forms** the prototype lacks. Use RESEARCH.md "Pattern 7 —
   Conditional render AST shapes" lines 661-672 as the truth table:
   - `LogicalExpression { operator: "||" }` → `branch { thenBranch: walk(left), elseBranch: walk(right) }`
   - `LogicalExpression { operator: "??" }` → same shape; condition string includes "??".
   - `UnaryExpression { operator: "!" }` wrapping the test → preserve negation
     in `condition` string.
4. **`.map(...)` recognition** — the prototype falls into generic `CallExpression`
   recursion (lines 749-755). New: detect `CallExpression { callee:
   MemberExpression { property: Identifier("map") }, arguments: [ArrowFunction|FunctionExpression] }`,
   emit `kind: "list"` with `iterableSource = sourceSlice(callee.object)`,
   `item = walk(arrowBody)`. Truncation cap on `iterableSource` per Claude's
   Discretion (CONTEXT.md).
5. **Component detection (`component-detect.ts`)** — port prototype's
   `unwrapComponentFunction` (lines 358-371) + `resolveWrapperTarget` (lines
   373-385) + `analyzeFile` traverse block (lines 419-437) + ADD
   `ClassDeclaration` visitor (RESEARCH.md Pattern 6 lines 627-653) — the
   prototype lacks class component support entirely.
6. **Replace all `node.type === "X"` with `t.isX(node)`** — every branch.
   This is the most mechanical part of the port.
7. **Fragment** — match BOTH `t.isJSXFragment(node)` AND `t.isJSXElement(node)
   && tagName === "Fragment"` (PITFALL 8 / RESEARCH.md lines 887-895).
   Aliased Fragment is a v1 gap.
8. **Spread** — `JSXSpreadChild` and `JSXSpreadAttribute` → `kind: "spread"`
   with `expression = sourceSlice(...)`.
9. **Source slicing** — port prototype's `sourceSlice` helper (lines 159-162):
   ```typescript
   function sourceSlice(source: string, node: any) {
     if (!node || typeof node.start !== "number" || typeof node.end !== "number") return null;
     return source.slice(node.start, node.end).replace(/\s+/g, " ").trim();
   }
   ```
   Keep as-is, place in `src/core/render-flow/source-slice.ts` or inline; the
   `\s+` collapse is correct for `condition` strings.

---

### `biome.json` (modify — verify D-11 layer 1)

**Analog:** existing `noRestrictedImports` block (`biome.json:29-49`).

**Existing block (already in place — verified):**

```json
{
  "includes": ["src/ir/**", "src/renderers/**", "src/core/**"],
  "linter": {
    "rules": {
      "style": {
        "noRestrictedImports": {
          "level": "error",
          "options": {
            "patterns": [
              {
                "group": ["**/adapters", "**/adapters/**", "**/mcp", "**/mcp/**"],
                "message": "ARCH-01: ir/ renderers/ core/ must not import adapters/ or mcp/"
              }
            ]
          }
        }
      }
    }
  }
}
```

**Port plan:** Phase 3 may need NO modification — the rule already covers
`src/core/**` blocking `**/adapters/**`. The planner should:

1. Verify the rule lints clean before Phase 3 work (regression check).
2. Confirm no scope tweak is needed (e.g., that the new
   `src/core/parser/`, `src/core/resolver/`, etc. files inherit the rule
   automatically — they should, since `src/core/**` is the include glob).

---

## Shared Patterns

These cross-cutting patterns apply to multiple new files.

### Forward-slash path discipline (Phase 1 D-07)

**Source:** `src/core/paths.ts:15-17`

```typescript
export function toForwardSlash(p: string): string {
  return p.split(path.sep).join("/").replaceAll("\\", "/");
}
```

**Apply to:** every file under `src/core/parser/`, `src/core/resolver/`,
`src/core/extractors/`, `src/core/render-flow/`, and `src/adapters/next/`.

**Rule:** ANY absolute path emitted into `ResolveResult.absolutePath`,
`RenderNode.file`, `ComponentDefinition.file`, `ParseContext.astCache` keys,
`ParseContext.resolverCache` keys, or `ctx.warnings` strings MUST first pass
through `toForwardSlash()`. Uses `node:path` operations (`path.join`,
`path.dirname`, `path.resolve`) all return OS-native; wrap each result.

---

### Babel traverse — ALWAYS via shim (Phase 1 D-20, CLAUDE.md)

**Source:** `src/core/babel-shim.ts:11-13`

```typescript
import traverseImport from "@babel/traverse";
export const traverse = (traverseImport as any).default ?? traverseImport;
```

**Apply to:** every file that walks the AST — `parser/`, `resolver/barrel.ts`,
`extractors/**`, `render-flow/**`, `adapters/next/NextJsAdapter.ts`.

**Correct usage:**

```typescript
import { traverse } from "../babel-shim.js";   // depth-aware path varies
import * as t from "@babel/types";

traverse(ast, {
  JSXElement(path) { /* ... */ },
});
```

**Forbidden** (catches at lint via D-11 rule + integration test in Wave 0):

```typescript
import traverse from "@babel/traverse";   // CJS/ESM interop hazard
```

---

### `@babel/types` type guards over string compare (CLAUDE.md)

**Source:** N/A in current repo (Phase 1 + 2 don't traverse much). Pattern from
`@babel/types` docs.

**Apply to:** every AST predicate. Replace prototype's `node.type === "X"` with
`t.isX(node)` everywhere.

```typescript
// PROTOTYPE (forbidden in Phase 3):
if (current.type === "JSXElement" || current.type === "JSXFragment") return current;

// PHASE 3 PORT:
if (t.isJSXElement(current) || t.isJSXFragment(current)) return current;
```

Type guards narrow the TS type, eliminating `any` casts that the prototype
relied on (`nodePath: any`, `current: any`).

---

### ESM imports with `.js` extension (Phase 1 conventions)

**Source:** every existing file in `src/`, e.g. `src/core/resolve-root.ts:1-2`:

```typescript
import path from "node:path";
import { toForwardSlash } from "./paths.js";
```

**Apply to:** every new file. Module system is ESM (`"type": "module"`); TS
`moduleResolution: "bundler"` requires `.js` on relative imports (compiled to
the same path). Type-only imports use `import type`.

---

### JSDoc decision-ID rationale (Phase 1 + 2 convention)

**Source:** `src/ir/schema.ts:1-11`, `src/core/babel-shim.ts:1-10`,
`src/core/paths.ts:3-14`, `src/mcp/log.ts:1-8`.

**Pattern:** every non-trivial export has a JSDoc block referencing the
governing decision (`D-01`, `D-05`, `R8`, `PARSE-02`, `OUT-04`, etc.) so
future readers can trace WHY without re-reading CONTEXT/SPEC.

**Example** (`src/core/paths.ts:3-14`):

```typescript
/**
 * Normalize a path to use forward slashes only.
 *
 * D-07 (forward-slash mandate): all paths in IR output must use `/` regardless of OS.
 *
 * We do two passes:
 *   1. `split(path.sep).join("/")` — handles the OS-native separator (backslashes on Windows).
 *   2. `.replaceAll("\\", "/")` — handles literal backslashes ...
 */
export function toForwardSlash(p: string): string { /* ... */ }
```

**Apply to:** `RenderNode` type alias (cite D-04, D-05), `ParseContext`
(cite D-01, D-02, D-03), `ResolveResult` (cite D-12, D-13), `PARSER_PLUGINS`
(cite PARSE-01), `LAYOUT_PREFIXES` (cite D-08), `ClassToken` (cite D-09),
`StyledTemplate` (cite D-10).

---

### Pure functions + `ctx` parameter (D-01)

**Source:** new pattern for Phase 3 — no class instances at parser level.

**Apply to:** every export under `src/core/parser/`, `src/core/resolver/`,
`src/core/extractors/`, `src/core/render-flow/`. First arg is always
`ctx: ParseContext`. State (caches, warnings, tsconfig) lives on `ctx`.

```typescript
export function parseFile(ctx: ParseContext, absPath: string): ParseResult { /* ... */ }
export function resolveModule(ctx: ParseContext, fromFile: string, specifier: string, importedName: string): ResolveResult { /* ... */ }
export function walkRenderFlow(ctx: ParseContext, fnNode: t.Node, source: string): RenderNode { /* ... */ }
```

`NextJsAdapter.extractComponents()` builds a fresh `ParseContext` per call and
threads it through — the entry point lives in
`src/adapters/next/NextJsAdapter.ts`.

---

### Discriminated-union return types (D-12)

**Source:** existing pattern in `src/ir/schema.ts` (TreeNode), `src/mcp/errors.ts`
(ToolResponse). Phase 3 extends it to `ResolveResult`, `ParseResult`, `RenderNode`.

**Pattern:** never throw across module boundaries; return a `{ ok: true, ... }`
or `{ ok: false, kind: "...", ...details }` union. Caller pattern-matches.

```typescript
type ResolveResult =
  | { ok: true; kind: "local"; absolutePath: string }
  | { ok: true; kind: "external"; packageName: string }
  | { ok: false; kind: "cycle"; chain: string[] }
  | { ok: false; kind: "not-found"; specifier: string; tried: string[] }
  | { ok: false; kind: "ambiguous"; specifier: string; candidates: string[] };
```

**Mirror precedent** — `src/mcp/errors.ts:9-19` for the discipline of returning
structured data instead of throwing.

---

### Stdio safety — never `console.log` (Phase 2 D-08)

**Source:** `src/mcp/log.ts:14-22` (stderr-only logger).

```typescript
function emit(level: Level, msg: string, meta?: Record<string, unknown>): void {
  const entry = JSON.stringify({ ...(meta ?? {}), level, msg, ts: new Date().toISOString() });
  process.stderr.write(`${entry}\n`);
}
```

**Apply to:** every new file. The prototype calls `console.error(...)` directly
(e.g., line 394, 922). In Phase 3:

- Diagnostic / debug noise → `log.warn(...)` / `log.debug(...)` from
  `src/mcp/log.ts` — but NOTE: `core/` cannot import from `mcp/` (D-11 rule
  blocks this). So `core/` modules MUST push to `ctx.warnings` ONLY.
- Only `src/adapters/next/NextJsAdapter.ts` may bridge to MCP-side logging
  (it's an island peer of `core/`, not constrained by the same rule).

**Rule:** no `console.log` / `console.error` anywhere under `src/core/` or
`src/adapters/`. Use `ctx.warnings.push(...)` (in-band) or `log.*` (out-of-band
diagnostics, only from `src/mcp/`).

---

## No Analog Found

These files have no close match in the repo. Planner should derive from
RESEARCH.md patterns + CONTEXT.md decisions.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/core/extractors/styled.ts` | extractor | transform | Prototype has no styled-components support; logic is greenfield (RESEARCH.md Pattern 9 is the reference) |
| `test/architecture/island.test.ts` | test (architecture) | scan | No prior architecture test exists in repo. ~30-line glob+regex per D-11 layer 2 |
| `test/adapters/types.test.ts` | test (structural) | assertion | No prior structural type-test exists |
| `test/adapters/FrameworkAdapter.test.ts` | test (interface) | assertion | No prior interface-shape test |
| `test/fixtures/parser/**` (entire tree) | fixture data | static | No fixtures exist in repo yet; D-14 + D-15 are the layout reference |

For these, the planner should:

1. Read RESEARCH.md "Pattern 9" (styled), "Validation Architecture / Wave 0
   Gaps" (test files), CONTEXT.md D-14 + D-15 (fixture layout).
2. Apply the cross-cutting Shared Patterns above (forward-slash, ESM `.js`,
   JSDoc decision IDs).
3. Use vitest's `toMatchFileSnapshot` (per CONTEXT.md D-14) for render-flow
   snapshots — co-locate `__snapshots__/` next to the test file.

---

## Metadata

**Analog search scope:**

- `generate-component-hierarchy.ts` (root, prototype — primary reference, full read)
- `src/**` (Phase 1 + Phase 2 files — convention reference: `core/`, `ir/`, `mcp/`)
- `biome.json` (verify D-11 layer 1 already in place)

**Files scanned:** 21 source files in `src/`, 1 prototype, 1 config.

**Pattern extraction date:** 2026-04-29

**Confidence:** HIGH — the prototype is canonical and most logic ports
mechanically; Phase 1+2 conventions are concrete and consistent.

**Next step:** `/gsd-plan-phase 03` — produce per-wave PLAN.md files referencing
this file's "Pattern Assignments" sections by file path.
