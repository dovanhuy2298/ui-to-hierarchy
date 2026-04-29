# Phase 3: Parser Core (AST + Resolution + Extractors) — Research

**Researched:** 2026-04-29
**Domain:** Babel AST parsing + TypeScript module resolution + JSX render-flow extraction
**Confidence:** HIGH (stack locked in CLAUDE.md, prototype is canonical reference, PITFALLS pre-flagged)

## Summary

Phase 3 ports the prototype `generate-component-hierarchy.ts` (Bun + ad-hoc layout)
into the locked `core/` + `adapters/` island layout from Phase 1, with proper
TypeScript types, the 5-method `FrameworkAdapter` seam, full barrel chase via
`get-tsconfig`, and four style extractors. The CONTEXT.md decisions (D-01 through
D-15) lock most of the HOW; this research document expands each area with verified
source/version references, concrete API shapes from `get-tsconfig` /
`@babel/parser` / `@babel/traverse`, AST-shape patterns for the 5 conditional
forms + 5 HOC patterns + 4 extractors, and a Validation Architecture mapping the 8
phase requirements to vitest commands.

**Primary recommendation:** Treat the prototype as a working reference for AST
shape recognition (its `findJsxInExpression`, `unwrapComponentFunction`,
`resolveAliasImport`, `collectClassTokensFromExpression`, `summarizeStyleExpression`
each map 1:1 to a Phase 3 module), but rewrite — never wrap — using
`@babel/types` type guards (`t.isJSXElement(node)` over `node.type === "JSXElement"`)
and the locked 7-kind `RenderNode` shape. Resolution moves from `--alias key=value`
to `createPathsMatcher` from `get-tsconfig`, which directly returns the candidate
file paths to probe. The remaining work is mechanical porting + new HOC unwrap +
class component visitor + styled-components extractor, none of which the prototype
covers.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01 — D-15)

**D-01 — Pure functions + `ParseContext`:**
All four core modules (`parser/`, `resolver/`, `extractors/`, `render-flow/`) export
pure functions. State lives on a single `ParseContext` object passed as the first
argument. `ParseContext` shape:
```ts
interface ParseContext {
  resolvedRoot: string;              // forward-slash absolute root from resolveRoot()
  tsconfig: TsconfigResult | null;   // get-tsconfig result, parsed once per call
  astCache: Map<string, ParseResult>;       // key = absolute path
  resolverCache: Map<string, ResolveResult>; // key = `${fromFile}::${specifier}::${importedName}`
  warnings: string[];                // populated by extractors/resolver, surfaces in envelope
}
```
No class instances at the parser level. `NextJsAdapter.extractComponents()` builds
a fresh `ParseContext` per call.

**D-02 — Per-call AST cache, key = absolute path:**
`astCache: Map<string, ParseResult>` scoped to one `ParseContext` (one tool call).
Cache value: `{ kind: "ok", ast } | { kind: "error", message, line }` so re-entries
to the same file (barrel chase) don't re-parse and don't re-throw.

**D-03 — Per-call resolver cache:**
Keyed by tuple `(fromFile, specifier, importedName)`.

**D-04 — Parser-level `RenderNode` is separate from IR `TreeNode`:**
Defined in `src/adapters/types.ts`. Phase 5 owns the `adapter → IR` mapping.

**D-05 — `RenderNode` has 7 kinds, AST-shaped:**
```ts
type RenderNode =
  | { kind: "jsx"; tag: string; isComponent: boolean; resolvedFrom?: string;
      attributes: JsxAttribute[]; children: RenderNode[]; file: string; line: number }
  | { kind: "branch"; condition: string;
      thenBranch: RenderNode | null; elseBranch: RenderNode | null;
      file: string; line: number }
  | { kind: "list"; item: RenderNode; iterableSource: string; file: string; line: number }
  | { kind: "text"; value: string; file: string; line: number }
  | { kind: "fragment"; children: RenderNode[]; file: string; line: number }
  | { kind: "spread"; expression: string; file: string; line: number }
  | { kind: "error"; message: string; file: string; line: number };
```

**D-06 — `PropSignature` minimal:**
`{ name: string; typeSlice: string; optional: boolean }`. No `defaultValue`, no
`restElement` flag.

**D-07 — Destructure prop extraction:**
`function Card({ a, b: alias, ...rest }: Props)` → names `a`, `alias`, `rest`;
`typeSlice` for every prop = raw source of `Props`. Pure positional `props: Props`
records single synthetic prop.

**D-08 — Tailwind layout-only filter = hardcoded prefix list + variant strip regex:**
Module `src/core/extractors/tailwind/layout-prefixes.ts` exports prefix list (flex,
grid, gap, m, p, w, h, min/max-w/h, top/right/bottom/left/inset, place-, justify-,
items-, self-, content-, basis-, grow, shrink, order, col-, row-, space-, divide-,
absolute, relative, fixed, sticky, static, hidden, block, inline, inline-block,
inline-flex, inline-grid, overflow-, z-, size-) + variant strip regex
`^(?:\[[^\]]+\]|[a-zA-Z0-9_-]+):` repeated.

**D-09 — `cn`/`clsx`/`cva`/`twMerge` argument resolution:**
`ClassToken` is `{ kind: "literal"; value; file; line } | { kind: "raw"; source; file; line }`.
String-literal args (incl. interpolation-free template quasis) → `literal`. Object
keys with truthy literal values → `literal`. Everything else → single `raw` source slice.

**D-10 — styled-components `{?}` placeholder rule:**
Template literal `styled.tag` / `styled(Component)` → `{ tag, body }`. `body` =
template raw text with every `${...}` replaced by `{?}`. No theme resolution.
Identifier-based detection (`styled` callee) — no import-source verification in v1.

**D-11 — Two-layer island enforcement:**
1. Biome `noRestrictedImports` (already present in `biome.json` — verified) scoped
   to `src/core/**`, `src/ir/**`, `src/renderers/**`, blocking `**/adapters` and
   `**/adapters/**`.
2. vitest test `test/architecture/island.test.ts` reads every `.ts` under island
   roots, asserts no static or dynamic import resolves into `adapters/`.

**D-12 — `resolveModule` returns discriminated union, never throws:**
```ts
type ResolveResult =
  | { ok: true; kind: "local"; absolutePath: string }
  | { ok: true; kind: "external"; packageName: string }
  | { ok: false; kind: "cycle"; chain: string[] }
  | { ok: false; kind: "not-found"; specifier: string; tried: string[] }
  | { ok: false; kind: "ambiguous"; specifier: string; candidates: string[] };
```

**D-13 — tsconfig multi-target = first-existing-file wins:**
Iterate `paths` array in order. For each: probe exact path, then `.ts`, `.tsx`,
`.js`, `.jsx`, `/index.ts`, `/index.tsx`, `/index.js`, `/index.jsx`. First hit wins.
Zero matches → `not-found`. `ambiguous` reserved for future use.

**D-14 — Per-feature fixture folders + one kitchen-sink:**
```
test/fixtures/parser/
  parse-errors/        hoc/                classes/
  render-flow/         extractors/         resolver/
```

**D-15 — Resolver fixtures = real mini-projects on disk:**
Each has its own `tsconfig.json` and `src/` tree. `get-tsconfig` reads real files;
no mocking.

### Claude's Discretion

- Exact internal file split inside each module (extractors/ — one file per signal or sub-folders).
- Adding to layout-prefix list during implementation (one-line rationale comment).
- HOC pattern matching: single exported constant or per-pattern matcher functions.
- `JsxAttribute` shape inside `RenderNode.jsx` (locked during D-04 materialization).
- `iterableSource` (D-05) format: raw source slice of `.map(...)` receiver. Truncation cap up to planner.
- Whether barrel chase emits `warnings.push(...)` when stopping at `node_modules`.
- vitest snapshot file paths and naming (`__snapshots__/` co-located is fine).
- Per-prop notes on destructure aliasing (D-07) — internal field name and shape up to planner.

### Deferred Ideas (OUT OF SCOPE)

- Symbolic `cn(variants[state])` resolution
- `PropSignature.defaultValue` and `restElement` flag
- Tailwind config reading
- `React.createElement` / `_jsx` / `_jsxs` support — v1 documented gap
- Cross-call AST cache (ARCH-02 forbids in v1)
- Performance benchmarks (Phase 6, ARCH-04)
- Namespaced JSX (`<Dialog.Content>`) full member-expression resolution
- Aliased Fragment normalization
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PARSE-01 | Babel parse with full plugin set + `errorRecovery: true`; parse errors become `TreeNode { kind: "error" }`, never silent | "Standard Stack" — Babel parser API (Source: babeljs.io/docs/babel-parser); "Code Examples" — `parseFile()` reference impl. Plugin list locked in SPEC; PITFALLS §2.1 |
| PARSE-02 | Barrel re-export resolution recursing through `ExportNamedDeclaration` / `ExportAllDeclaration`, cycle-guarded | "Architecture Patterns" — barrel chase pseudo-code, Set-based cycle detection. Prototype lacks barrel chase entirely; new code |
| PARSE-03 | tsconfig `paths` + `baseUrl` + `extends` chain resolution via `get-tsconfig` | Verified `createPathsMatcher` API via Context7: returns `(specifier) => string[]` candidate paths; `getTsconfig()` walks `extends` chain transparently |
| PARSE-04 | HOC unwrapping (memo, forwardRef, observer, with*, *HOC) + class component (`extends Component`/`PureComponent`) extraction | "Code Examples" — HOC matcher table, `ClassDeclaration` visitor with `render()` method root. Prototype has shallow unwrap (`unwrapComponentFunction`); needs HOC name table + class visitor |
| OUT-02 | Layout-only Tailwind filter by default; `fullClasses: true` reveals all | D-08 prefix list + variant strip regex `^(?:\[[^\]]+\]|[a-zA-Z0-9_-]+):` repeated. PITFALLS §5.4 verifies Tailwind v4 arbitrary variant case |
| OUT-03 | Four style extractors: Tailwind (incl. cn/clsx/cva/twMerge), inline `style`, CSS Modules ref, styled-components | D-09 ClassToken discriminated union; D-10 `{?}` placeholder rule. Prototype covers Tailwind + inline; CSS Modules ref + styled new |
| OUT-04 | Conditional render preserved: ternary, `&&`, `||`, `??`, `!`/`!!`, `.map` as list | "Code Examples" — AST-shape matrix per form. Prototype has working ternary + `&&` + `.map`; needs `||`, `??`, `!` extension |
| ARCH-01 | `FrameworkAdapter` interface with exactly 5 methods; nothing in `core/`/`ir/`/`renderers/` imports `adapters/` | D-11 two-layer enforcement. Biome rule already present (verified `biome.json`); add vitest architecture test |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Babel AST parsing (`parseFile`) | `src/core/parser/` | — | Framework-agnostic primitive; only depends on `@babel/parser` + `babel-shim` |
| Module resolution / barrel chase / tsconfig paths | `src/core/resolver/` | — | Reads `get-tsconfig`; produces `ResolveResult` independent of any framework convention |
| Style signal extraction (Tailwind / inline / CSS Modules / styled) | `src/core/extractors/` | — | Pure AST visitors; no Next.js semantics |
| Render-flow walking (JSX → RenderNode) | `src/core/render-flow/` | — | Pure JSX walker; uses `babel-shim` traverse |
| `FrameworkAdapter` interface (5 methods) | `src/adapters/FrameworkAdapter.ts` | — | Locked surface; framework-neutral |
| `NextJsAdapter` orchestration (`resolveModule` + `extractComponents`) | `src/adapters/next/NextJsAdapter.ts` | `src/core/*` | Composes core primitives; routing methods stubbed |
| `ComponentDefinition` / `RenderNode` types | `src/adapters/types.ts` | — | Parser-level types; NOT in `src/ir/` (D-04) |
| IR `TreeNode` build (`adapter → IR` translator) | — (Phase 5) | — | Out of scope; Phase 5 owns bridge so `core/` and `adapters/` stay decoupled |
| Forward-slash path normalization | `src/core/paths.ts` (existing) | — | Phase 1 deliverable; reused |
| `@babel/traverse` ESM/CJS interop | `src/core/babel-shim.ts` (existing) | — | Phase 1 deliverable; the ONLY allowed traverse import path |

## Standard Stack

### Core (locked in CLAUDE.md and verified against npm registry on 2026-04-29)

| Library | Version | Purpose | Verified |
|---------|---------|---------|----------|
| `@babel/parser` | `^7.29.2` | Parse TS/TSX/JSX → AST (Babel `File`) | npm registry: 7.29.2 latest |
| `@babel/traverse` | `^7.29.0` | Visitor-pattern AST walker (must go via `babel-shim`) | npm registry: 7.29.0 latest |
| `@babel/types` | `^7.29.0` | Type guards (`t.isJSXElement`, `t.isCallExpression`, etc.) | npm registry: 7.29.0 latest |
| `get-tsconfig` | `^4.14.0` | Read tsconfig + `extends` chain + `createPathsMatcher` | npm registry: 4.14.0 latest; Context7 confirms `createPathsMatcher(tsconfig) → (specifier) => string[]` |
| `tinyglobby` | `^0.2.16` | File globbing (will be needed by adapter `discoverEntries` in Phase 4 — not Phase 3) | npm registry: 0.2.16 latest |
| `zod` | `^4.1.4` | Already used by IR / MCP layers; Phase 3 types are TS-only (no zod schemas) | already in package.json |

### Supporting (already shipped from Phase 1 / Phase 2)

| Module | Purpose | Why Reuse |
|--------|---------|-----------|
| `src/core/babel-shim.ts` | `traverse.default ?? traverse` interop shim | The ONLY allowed entry point for `@babel/traverse` (CLAUDE.md forbids direct import) |
| `src/core/paths.ts` | `toForwardSlash`, `relFromRoot` | Every emitted file path MUST go through `toForwardSlash` (Phase 1 D-07) |
| `src/core/resolve-root.ts` | Forward-slash absolute root resolution | `ParseContext.resolvedRoot` set from this helper at the call site |

### Alternatives Considered (resolved by CLAUDE.md "What NOT to Use")

| Instead of | Could Use | Why we picked the standard |
|------------|-----------|----------------------------|
| `@babel/parser` | `@swc/core` | 3-5x faster but smaller API surface, less forgiving of partial code, less mature traversal API. Parse speed is not the bottleneck in v1 (parse-on-demand, no cache) |
| `@babel/parser` | `oxc-parser` | Fastest, but AST deviates from ESTree; brittle for v1 |
| `@babel/parser` | `ts-morph` / TS Compiler API | ~60MB cold start; we don't need type-aware analysis, only syntactic JSX walking |
| `get-tsconfig` | `tsconfig-paths` | Designed for runtime `require` hooks, not static analysis; ESM compatibility issues. `get-tsconfig` is by `privatenumber` (tsx author), zero deps beyond `resolve-pkg-maps` |
| `get-tsconfig` | `enhanced-resolve` | Webpack's resolver — overkill for project-internal file resolution |

### Forbidden (per CLAUDE.md "What NOT to Use")

- `@babel/core` (heavy — pulls full transform pipeline)
- `@swc/core`, `oxc-parser`, `ts-morph`, TS Compiler API
- `tsconfig-paths` (legacy, ESM pain)
- Naive `import traverse from "@babel/traverse"` — must go through `babel-shim.ts`

## Architecture Patterns

### System Architecture Diagram

```
NextJsAdapter.extractComponents(opts) — Phase 3 entry point
     │
     │ build fresh ParseContext { resolvedRoot, tsconfig, astCache, resolverCache, warnings }
     ▼
┌────────────────────────────────────────────────────────────────┐
│ For each input file (entry list comes from caller in Phase 3,  │
│  from discoverEntries in Phase 4):                              │
│                                                                 │
│   parseFile(ctx, absPath) ────────► ParseResult                 │
│       │                                                         │
│       └─ ctx.astCache.get/set(absPath)                          │
│       └─ on parse error: ParseResult { kind: "error", ... }     │
│                                                                 │
│   collectImports(ast)  ─────────────► Map<localName, Import>    │
│   collectBindings(ast) ─────────────► Map<name, initExpr>       │
│                                                                 │
│   visit each component declaration (FunctionDeclaration,        │
│     VariableDeclarator with arrow/fn, ClassDeclaration extends  │
│     Component/PureComponent, ExportDefaultDeclaration):         │
│                                                                 │
│       ┌─ HOC unwrap chain ──► wrappers: string[]                │
│       │   match callee.name in {memo, forwardRef, observer,     │
│       │     /^with[A-Z]/, /HOC$/}                               │
│       │   recurse into first non-trivial CallExpression arg     │
│       │                                                         │
│       ├─ Render-flow walker ──► RenderNode tree                 │
│       │   • walkRenderFlow(ctx, fnNode, source) recursively     │
│       │     descends function/class body and JSX children       │
│       │   • preserves: ConditionalExpression, LogicalExpression │
│       │     (&&, ||, ??), UnaryExpression (!, !!),              │
│       │     CallExpression .map(fn) → list                       │
│       │   • each JSXElement → JsxAttribute[] + recursive children│
│       │                                                         │
│       │   For each JSXElement tag:                              │
│       │      tag is component (CapitalCase or namespace)?       │
│       │         └─► resolveModule(ctx, fromFile, importSource,  │
│       │              importedName)                              │
│       │              │                                          │
│       │              ├─ tsconfig path match (createPathsMatcher)│
│       │              │   ↓ try each candidate × extension order │
│       │              ├─ relative resolution (./foo, ../bar)     │
│       │              ├─ barrel chase (named import lands in     │
│       │              │   index.ts without local decl):          │
│       │              │     scan ExportNamedDeclaration +        │
│       │              │     ExportAllDeclaration, recurse with   │
│       │              │     visited Set<absPath>                 │
│       │              ├─ node_modules boundary →                 │
│       │              │   { ok:true, kind:"external", packageName│
│       │              ├─ cycle detected →                        │
│       │              │   { ok:false, kind:"cycle", chain }      │
│       │              └─ not found →                             │
│       │                  { ok:false, kind:"not-found", tried }  │
│       │                                                         │
│       └─ Style extractors (per JSXElement attribute):           │
│           tailwind/  : className="…", cn(), clsx(), cva(),      │
│                         twMerge()  → ClassToken[]                │
│                         (filtered by layout-prefix unless        │
│                          fullClasses:true)                       │
│           inline-style: style={{ k:v, …rest }}                  │
│                          → Record<string, string|{raw}>          │
│           css-module : `import s from "./X.module.css"` +       │
│                          `s.foo` member access                  │
│                          → { binding, key, source }             │
│           styled     : `styled.div` `…${expr}…` template        │
│                          → { tag, body with {?} placeholders }  │
│                                                                 │
│   Assemble ComponentDefinition with all 11 fields per SPEC R8   │
└────────────────────────────────────────────────────────────────┘
     │
     ▼
ComponentDefinition[]  — returned to caller
                        (Phase 5's toIR() will translate to TreeNode)
```

### Recommended Project Structure

```
src/
├── adapters/
│   ├── FrameworkAdapter.ts     # Locked 5-method interface (ARCH-01)
│   ├── types.ts                # ComponentDefinition, RenderNode, JsxAttribute, ClassToken,
│   │                           #   PropSignature, ResolveResult, ParseContext, ParseResult
│   └── next/
│       └── NextJsAdapter.ts    # 2 methods implemented + 3 stubs
├── core/
│   ├── babel-shim.ts           # (existing) — only allowed traverse entry point
│   ├── paths.ts                # (existing) — toForwardSlash, relFromRoot
│   ├── resolve-root.ts         # (existing)
│   ├── parser/
│   │   ├── index.ts            # parseFile(ctx, absPath): ParseResult
│   │   └── plugins.ts          # exported plugin list constant
│   ├── resolver/
│   │   ├── index.ts            # resolveModule(ctx, fromFile, specifier, importedName)
│   │   ├── tsconfig.ts         # loadTsconfig + buildPathsMatcher wrappers
│   │   ├── relative.ts         # extension probe order from D-13
│   │   ├── barrel.ts           # chase ExportNamedDeclaration / ExportAllDeclaration
│   │   └── node-modules.ts     # detect /node_modules/ boundary, extract packageName
│   ├── extractors/
│   │   ├── index.ts            # collectStyleSignals(ctx, jsxElement, source, opts)
│   │   ├── tailwind/
│   │   │   ├── index.ts        # extractTailwind(...) → ClassToken[]
│   │   │   ├── resolve-args.ts # cn/clsx/cva/twMerge arg walker (per D-09)
│   │   │   └── layout-prefixes.ts # D-08 prefix list + variant strip regex
│   │   ├── inline-style.ts     # extractInlineStyle(...) → Record<string, string|{raw}>
│   │   ├── css-module.ts       # extractCssModuleRefs(...) → CssModuleRef[]
│   │   └── styled.ts           # extractStyledTemplates(...) → StyledTemplate[]
│   └── render-flow/
│       ├── index.ts            # walkRenderFlow(ctx, fnNode, source) → RenderNode
│       ├── conditionals.ts     # ConditionalExpression / LogicalExpression / UnaryExpression
│       ├── lists.ts            # CallExpression with .map callee
│       └── component-detect.ts # FunctionDeclaration / VariableDeclarator / ClassDeclaration / ExportDefault
└── ir/
    └── (untouched in Phase 3)

test/
├── architecture/
│   └── island.test.ts          # D-11 layer 2 — graph-walks all .ts under core/ir/renderers
├── fixtures/parser/
│   ├── parse-errors/           # syntax-error.tsx, partial.tsx
│   ├── hoc/                    # memo.tsx, forward-ref.tsx, observer.tsx, with-router.tsx, xyz-hoc.tsx
│   ├── classes/                # extends-react-component.tsx, extends-pure-component.tsx, qualified.tsx
│   ├── render-flow/            # ternary.tsx, logical-and.tsx, logical-or.tsx, nullish-coalesce.tsx, negation.tsx, map.tsx, nested.tsx
│   ├── extractors/
│   │   ├── kitchen-sink.tsx    # all 4 inputs in one component
│   │   ├── tailwind-only.tsx
│   │   ├── inline-style.tsx
│   │   ├── css-module.tsx
│   │   └── styled.tsx
│   └── resolver/               # mini-projects per D-15
│       ├── shadcn-barrel/
│       ├── barrel-cycle/
│       ├── multi-target/
│       ├── extends-chain/
│       └── windows-paths/
├── core/
│   ├── parser/                 # parseFile.test.ts
│   ├── resolver/               # resolveModule.test.ts (and one per fixture project)
│   ├── extractors/             # tailwind.test.ts, inline-style.test.ts, css-module.test.ts, styled.test.ts
│   └── render-flow/            # walkRenderFlow.test.ts
└── adapters/
    └── next/                   # NextJsAdapter.test.ts (extractComponents end-to-end on a single fixture)
```

### Pattern 1: Babel parse with errorRecovery (PARSE-01)

```ts
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

// src/core/parser/index.ts
import { parse, type ParseError } from "@babel/parser";
import type { File } from "@babel/types";
import { readFileSync } from "node:fs";
import { PARSER_PLUGINS } from "./plugins.js";
import { toForwardSlash } from "../paths.js";

export type ParseResult =
  | { kind: "ok"; ast: File; source: string }
  | { kind: "error"; message: string; line: number };

export function parseFile(ctx: ParseContext, absPath: string): ParseResult {
  const norm = toForwardSlash(absPath);
  const cached = ctx.astCache.get(norm);
  if (cached) return cached;

  let source: string;
  try {
    source = readFileSync(absPath, "utf8");
  } catch (err: any) {
    const result: ParseResult = { kind: "error", message: `read failed: ${err?.message ?? err}`, line: 0 };
    ctx.astCache.set(norm, result);
    return result;
  }

  // errorRecovery: true means parse() never throws on recoverable syntax errors;
  // it returns a partial AST and exposes errors on ast.errors[].
  // It WILL still throw on truly unrecoverable input (e.g., binary garbage).
  let ast: File;
  try {
    ast = parse(source, {
      sourceType: "module",
      sourceFilename: absPath,
      plugins: PARSER_PLUGINS as ParserPlugin[],
      errorRecovery: true,
      // ranges: false, tokens: false — we don't need them; keep AST small
    });
  } catch (err: any) {
    const line = (err as ParseError)?.loc?.line ?? 1;
    const result: ParseResult = { kind: "error", message: err?.message ?? String(err), line };
    ctx.astCache.set(norm, result);
    return result;
  }

  // Note: ast.errors[] may contain recoverable errors. Surfacing them as warnings
  //       is encouraged (D-01: ctx.warnings) but not required by SPEC R1.
  if (ast.errors.length > 0) {
    ctx.warnings.push(`parser recovered from ${ast.errors.length} error(s) in ${norm}`);
  }

  const result: ParseResult = { kind: "ok", ast, source };
  ctx.astCache.set(norm, result);
  return result;
}
```

**Key insight:** `errorRecovery: true` does NOT stop `parse()` from throwing on
unrecoverable input — the prototype's `try/catch` around `parseAst` is still
needed. What it DOES is collect recoverable parse errors onto `ast.errors[]` and
return a partial AST. Both paths (thrown + recovered) must produce a
`ParseResult { kind: "error" }` or surface a warning.

### Pattern 2: Babel traverse via shim (mandatory)

```ts
// CORRECT — every call site uses the shim:
import { traverse } from "../babel-shim.js";
import * as t from "@babel/types";

traverse(ast, {
  JSXElement(path) {
    if (t.isJSXIdentifier(path.node.openingElement.name)) {
      const tag = path.node.openingElement.name.name;
      // ...
    }
  },
});

// FORBIDDEN (per CLAUDE.md):
// import traverse from "@babel/traverse";  // ← breaks ESM/CJS interop intermittently
```

### Pattern 3: tsconfig path resolution via createPathsMatcher

Verified API from Context7 / get-tsconfig README:

```ts
import { getTsconfig, createPathsMatcher, type TsconfigResult } from "get-tsconfig";

// Step 1: load tsconfig (resolves extends chain transparently). Cache on ParseContext.
function loadTsconfigOnce(ctx: ParseContext): TsconfigResult | null {
  if (ctx.tsconfig !== undefined) return ctx.tsconfig;
  const tsconfig = getTsconfig(ctx.resolvedRoot); // searches upward for tsconfig.json
  ctx.tsconfig = tsconfig;
  return tsconfig;
}

// Step 2: build a matcher (call once per ParseContext)
const tsconfig = loadTsconfigOnce(ctx);
const pathsMatcher = tsconfig ? createPathsMatcher(tsconfig) : null;

// Step 3: resolve a specifier
if (pathsMatcher) {
  const candidates = pathsMatcher("@/components/Foo");
  // Returns string[] — absolute candidate base paths in priority order.
  // Example: ["E:/proj/src/components/Foo", "E:/proj/lib/components/Foo"]
  // For each candidate, probe extensions per D-13 order:
  //   exact, .ts, .tsx, .js, .jsx, /index.ts, /index.tsx, /index.js, /index.jsx
}
```

`createPathsMatcher` returns `null` if the tsconfig has no `paths` config. The
returned function returns `[]` if the specifier doesn't match any pattern. We
fall through to relative / node_modules in those cases.

### Pattern 4: Barrel chase with cycle guard (PARSE-02)

```ts
// src/core/resolver/barrel.ts (sketch)
import { traverse } from "../babel-shim.js";
import * as t from "@babel/types";
import { parseFile } from "../parser/index.js";

export function chaseBarrel(
  ctx: ParseContext,
  startFile: string,
  importedName: string,
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

  // Look for: (a) local declaration of importedName, (b) re-export
  let foundLocal = false;
  let reExportFrom: { source: string; renamed: string } | null = null;
  let starExports: string[] = [];

  traverse(parsed.ast, {
    // (a) local: function/var/class with that name
    FunctionDeclaration(p) {
      if (p.node.id?.name === importedName) foundLocal = true;
    },
    VariableDeclarator(p) {
      if (t.isIdentifier(p.node.id) && p.node.id.name === importedName) foundLocal = true;
    },
    ClassDeclaration(p) {
      if (p.node.id?.name === importedName) foundLocal = true;
    },
    // (b) `export { Foo } from "./bar"` or `export { Foo as Renamed } from "./bar"`
    ExportNamedDeclaration(p) {
      if (!p.node.source) return; // local re-export, not from another file
      for (const spec of p.node.specifiers) {
        if (t.isExportSpecifier(spec)) {
          const exportedName = t.isIdentifier(spec.exported) ? spec.exported.name : spec.exported.value;
          if (exportedName === importedName) {
            const renamed = t.isIdentifier(spec.local) ? spec.local.name : importedName;
            reExportFrom = { source: p.node.source.value, renamed };
          }
        }
      }
    },
    // (c) `export * from "./bar"` — must chase ALL such re-exports until one matches
    ExportAllDeclaration(p) {
      starExports.push(p.node.source.value);
    },
  });

  if (foundLocal) return { ok: true, kind: "local", absolutePath: startFile };
  if (reExportFrom) {
    const next = resolveSpecifier(ctx, startFile, reExportFrom.source);
    if (!next.ok) return next;
    if (next.kind === "external") return next; // landed in node_modules
    return chaseBarrel(ctx, next.absolutePath, reExportFrom.renamed, visited);
  }
  for (const starSource of starExports) {
    const next = resolveSpecifier(ctx, startFile, starSource);
    if (!next.ok) continue;
    if (next.kind === "external") continue; // skip — would parse node_modules
    const sub = chaseBarrel(ctx, next.absolutePath, importedName, new Set(visited));
    if (sub.ok || sub.kind === "cycle") return sub; // cycle propagates up
  }
  return { ok: false, kind: "not-found", specifier: importedName, tried: [startFile] };
}
```

**Cycle detection:** carry `visited: Set<string>` through recursion. Use a fresh
copy when forking on `ExportAllDeclaration` so siblings don't leak — but the
direct re-export path passes the same set so `a → b → a` is detected.

### Pattern 5: HOC unwrap matrix (PARSE-04)

| Pattern | AST shape | Match | Wrapper name |
|---------|-----------|-------|--------------|
| `memo(Foo)` | `CallExpression { callee: Identifier("memo"), arguments: [Identifier("Foo")] }` | callee identifier === "memo" | `"memo"` |
| `forwardRef((props, ref) => …)` | `CallExpression { callee: Identifier("forwardRef"), arguments: [ArrowFunctionExpression] }` | callee identifier === "forwardRef" | `"forwardRef"` |
| `observer(Foo)` | `CallExpression { callee: Identifier("observer") }` | callee identifier === "observer" | `"observer"` |
| `withRouter(Foo)` | `CallExpression { callee: Identifier("withRouter") }` | `/^with[A-Z]/.test(callee.name)` | callee.name |
| `xyzHOC(Foo)` | `CallExpression { callee: Identifier("xyzHOC") }` | `/HOC$/.test(callee.name)` | callee.name |
| `memo(forwardRef(observer(Foo)))` | nested CallExpressions | recurse outermost-to-innermost | `["memo","forwardRef","observer"]` |

```ts
const HOC_NAMES = new Set(["memo", "forwardRef", "observer"]);
const HOC_PATTERNS: RegExp[] = [/^with[A-Z]/, /HOC$/];

function isHocCallee(name: string): boolean {
  return HOC_NAMES.has(name) || HOC_PATTERNS.some((re) => re.test(name));
}

function unwrapHocChain(node: t.Node): { wrappers: string[]; inner: t.Node } {
  const wrappers: string[] = [];
  let current: t.Node = node;
  while (t.isCallExpression(current) && t.isIdentifier(current.callee) && isHocCallee(current.callee.name)) {
    wrappers.push(current.callee.name);
    // Find first non-trivial argument that could be the wrapped component:
    // Identifier (e.g. memo(Foo)) or function expression (forwardRef((p,r)=>…))
    const arg = current.arguments[0];
    if (!arg || (!t.isIdentifier(arg) && !t.isArrowFunctionExpression(arg) && !t.isFunctionExpression(arg) && !t.isCallExpression(arg))) break;
    current = arg as t.Node;
  }
  return { wrappers, inner: current };
}
```

### Pattern 6: Class component visitor (PARSE-04)

```ts
// extends Component, extends PureComponent, extends React.Component, extends React.PureComponent
function isReactComponentSuperclass(node: t.Node | null | undefined): boolean {
  if (!node) return false;
  if (t.isIdentifier(node)) return node.name === "Component" || node.name === "PureComponent";
  if (t.isMemberExpression(node)) {
    // React.Component
    return t.isIdentifier(node.object) && node.object.name === "React"
        && t.isIdentifier(node.property) && (node.property.name === "Component" || node.property.name === "PureComponent");
  }
  return false;
}

traverse(ast, {
  ClassDeclaration(path) {
    if (!isReactComponentSuperclass(path.node.superClass)) return;
    const name = path.node.id?.name;
    if (!name) return;
    // Find render() method as the render-flow root
    for (const member of path.node.body.body) {
      if (t.isClassMethod(member) && t.isIdentifier(member.key) && member.key.name === "render") {
        // walkRenderFlow(ctx, member, source) → renderFlow root
        // ...
      }
    }
  },
});
```

**Note (CONTEXT.md specific 2.3):** Don't try to verify the import resolves to
React. Too brittle for v1; false-negatives worse than false-positives.

### Pattern 7: Conditional render AST shapes (OUT-04)

| Form | AST node type | Properties used | RenderNode emitted |
|------|---------------|-----------------|--------------------|
| `cond ? a : b` | `ConditionalExpression` | `test`, `consequent`, `alternate` | `branch { condition: source(test), thenBranch: walk(consequent), elseBranch: walk(alternate) }` |
| `cond && a` | `LogicalExpression` `operator: "&&"` | `left`, `right` | `branch { condition: source(left), thenBranch: walk(right), elseBranch: null }` |
| `a \|\| b` | `LogicalExpression` `operator: "\|\|"` | `left`, `right` | `branch { condition: source(left) (truthy fallback), thenBranch: walk(left), elseBranch: walk(right) }` |
| `a ?? b` | `LogicalExpression` `operator: "??"` | `left`, `right` | `branch { condition: source(left) (null/undefined fallback), thenBranch: walk(left), elseBranch: walk(right) }` |
| `!cond && a` | `LogicalExpression { left: UnaryExpression { operator: "!", argument: cond } }` | unwrap `!`, record negation in condition source | `branch { condition: "!"+source(cond), thenBranch: walk(right), elseBranch: null }` |
| `!!cond && a` | `LogicalExpression { left: UnaryExpression { operator: "!", argument: UnaryExpression { operator:"!", ... }}}` | unwrap `!!`, condition is the inner | `branch { condition: "!!"+source(inner), thenBranch: walk(right), elseBranch: null }` |
| `items.map(item => <X />)` | `CallExpression { callee: MemberExpression { property: Identifier("map") }, arguments: [ArrowFn] }` | recurse callee.object for `iterableSource`; arrow body for `item` | `list { item: walk(arrowBody), iterableSource: source(callee.object) }` |
| `<>...</>` or `<Fragment>...</Fragment>` | `JSXFragment` or `JSXElement` with `<Fragment>` tag | children | `fragment { children: walkChildren(...) }` |
| `{...spread}` | `JSXSpreadChild` or `JSXSpreadAttribute` | `expression` | `spread { expression: source(expression) }` |
| Plain text | `JSXText` | `value` | `text { value: cleaned }` |

The prototype's `findJsxInExpression` is a faithful starting point for the
recursion shape but must be refactored to emit `RenderNode`s instead of returning
the raw JSX node.

### Pattern 8: Tailwind variant-strip + layout filter (D-08, OUT-02)

```ts
// src/core/extractors/tailwind/layout-prefixes.ts
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

// Repeated variant prefix: arbitrary `[&>svg]:`, `dark:`, `md:hover:`, etc.
export const VARIANT_PREFIX_RE = /^(?:\[[^\]]+\]|[a-zA-Z0-9_-]+):/;

export function stripVariants(token: string): string {
  let t = token;
  while (VARIANT_PREFIX_RE.test(t)) t = t.replace(VARIANT_PREFIX_RE, "");
  return t;
}

export function isLayoutToken(token: string): boolean {
  const base = stripVariants(token);
  return LAYOUT_PREFIXES.some((p) =>
    p.endsWith("-") ? base.startsWith(p) : (base === p || base.startsWith(`${p}-`)),
  );
}
```

**Verified:** PITFALLS §5.4 confirms the variant-strip regex shape; tested
mentally against `md:flex` → `flex` ✓, `[&>svg]:size-6` → `size-6` ✓,
`dark:hover:flex` → `flex` ✓.

### Pattern 9: styled-components extractor (D-10)

```ts
// match: styled.div`...${expr}...`  or  styled(Component)`...`
function extractStyledTemplate(node: t.TaggedTemplateExpression, source: string): StyledTemplate | null {
  const tag = node.tag;
  let tagName: string | null = null;

  if (t.isMemberExpression(tag) && t.isIdentifier(tag.object) && tag.object.name === "styled" && t.isIdentifier(tag.property)) {
    // styled.div
    tagName = tag.property.name;
  } else if (t.isCallExpression(tag) && t.isIdentifier(tag.callee) && tag.callee.name === "styled") {
    // styled(Component)
    const arg = tag.arguments[0];
    if (t.isIdentifier(arg)) tagName = arg.name;
    else tagName = "(expr)";
  } else {
    return null;
  }

  // Build body with {?} placeholders for every interpolation:
  //   `padding: ${theme.gap}px; color: ${color};`
  // → `padding: {?}px; color: {?};`
  const quasis = node.quasi.quasis; // n quasis
  const exprs = node.quasi.expressions; // n-1 expressions
  let body = "";
  for (let i = 0; i < quasis.length; i++) {
    body += quasis[i].value.cooked ?? quasis[i].value.raw;
    if (i < exprs.length) body += "{?}";
  }
  return { tag: tagName, body };
}
```

### Anti-Patterns to Avoid

- **Re-deriving prototype patterns from scratch.** The prototype has working AST
  recognition for ternary / `&&` / `.map` / HOC unwrap (shallow) / class detection
  partially. Read `findJsxInExpression`, `findReturnJsxInStatement`,
  `unwrapComponentFunction`, `resolveAliasImport`, `collectClassTokensFromExpression`,
  `summarizeStyleExpression`. Port the recognition logic; rewrite the emit shape.

- **Stringly-typed AST checks.** The prototype uses
  `node.type === "JSXElement"` everywhere. Phase 3 uses `t.isJSXElement(node)`
  from `@babel/types` — this is non-negotiable per CLAUDE.md (replaces
  prototype's stringly-typed checks).

- **Direct `import traverse from "@babel/traverse"`.** Always use
  `import { traverse } from "../babel-shim.js"`. Phase 1 D-20 + CLAUDE.md.

- **Calling `resolveRoot()` inside `extractComponents`.** Phase 2 D-13 says it's
  called per-tool at the call site. `extractComponents` accepts `resolvedRoot`
  on the `ParseContext`.

- **Treating parse failure as exception.** PITFALLS §1.4: "Parse failure for
  user's file is expected data, not exception." Always emit `ParseResult { kind:"error" }`.

- **Building IR `TreeNode` directly from the parser.** D-04 says Phase 5 owns the
  bridge. Phase 3's output is `ComponentDefinition[]` with parser-shaped
  `RenderNode`. The two shapes differ: 7-kind `RenderNode` vs 9-kind `TreeNode`.

- **Mocking `get-tsconfig`.** D-15: resolver fixtures are real mini-projects on
  disk. Each has a real `tsconfig.json` and `src/` tree.

- **Parsing files inside `node_modules`.** PITFALLS §4.4 + REQUIREMENTS "Out of
  Scope". Detect `/node_modules/` in resolved path → emit
  `{ ok: true, kind: "external", packageName }` and STOP.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Read tsconfig.json with comments + `extends` chain | Custom JSON parser + extends recursion | `get-tsconfig`'s `getTsconfig()` | Handles JSONC, extends chain, project references; zero deps beyond `resolve-pkg-maps`; by `privatenumber` (tsx author) |
| Match specifier against `paths` patterns | Custom wildcard matcher | `createPathsMatcher(tsconfig)` | Returns `(specifier) => string[]` candidate paths in priority order |
| Walk Babel AST | Manual recursive traversal | `@babel/traverse` (via `babel-shim`) | Handles parent links, scope, replace/remove, sibling navigation |
| Type-check Babel nodes | `node.type === "JSXElement"` strings | `t.isJSXElement(node)` from `@babel/types` | Type-narrowing, safer refactors, catches typos at compile time |
| Variant strip regex (Tailwind) | One-shot match | Repeated `^(?:\[[^\]]+\]|[a-zA-Z0-9_-]+):` strip | Handles stacked variants `md:hover:dark:flex` |
| File globbing (Phase 4 prep) | `fs.readdir` recursion | `tinyglobby` | Drop-in fast-glob replacement, ~10x smaller install |

**Key insight:** `get-tsconfig` is the single highest-leverage external dep —
without it we'd hand-roll JSONC parsing, extends chain walking, paths matcher,
and case-sensitivity handling. The prototype's `--alias key=value` UX is strictly
worse than auto-reading the user's tsconfig.

## Common Pitfalls

### Pitfall 1: `errorRecovery: true` ≠ "never throws"

**What goes wrong:** Developers assume `errorRecovery` makes `parse()` total. It
doesn't — it tolerates *recoverable* syntax errors but still throws on truly
broken input (e.g., binary file fed to parser, or some malformed escapes).

**Why it happens:** Babel's docs phrase it as "tolerant", not "total".

**How to avoid:** Wrap `parse()` in try/catch even with `errorRecovery: true`,
emit `ParseResult { kind: "error" }` on either path. Also surface
`ast.errors[]` (recovered errors) to `ctx.warnings` — they often signal that
JSX in `.ts` (no plugin) is being silently lost.

**Warning signs:** A fixture's "valid except for one typo" file produces 0
errors and a real-looking AST → `ast.errors` is non-empty but ignored.

### Pitfall 2: Babel ESM/CJS interop on `@babel/traverse`

**What goes wrong:** `import traverse from "@babel/traverse"` gives you the module
namespace OR the default export depending on bundler/runtime interop mode. In
ESM Node `tsx`, it's the namespace (object); in tsup-bundled CJS, it's the
function. Calling it without the shim fails with "traverse is not a function".

**Why it happens:** `@babel/traverse` is CJS, exports an object with `default`,
and Node ESM unwraps inconsistently. Babel issues #13855, #15269.

**How to avoid:** Use the existing `src/core/babel-shim.ts`. The shim is
already covered by `test/core/babel-shim.test.ts` (Phase 1). Phase 3 must add
the CI guard from D-11 (no direct imports of `@babel/traverse` outside the shim).

### Pitfall 3: Barrel chase forgets the rename in `export { Foo as Bar }`

**What goes wrong:** A barrel does `export { internalFoo as Foo } from "./impl"`.
A naive chaser searching for "Foo" in `./impl` won't find it (the local name is
`internalFoo`). The chase must rename the search key when descending through a
re-export specifier.

**How to avoid:** When matching an `ExportSpecifier`, recurse with
`spec.local.name`, not `spec.exported.name`. The Pattern 4 code handles this
via the `renamed` field.

### Pitfall 4: `export *` ambiguity — multiple barrels can export the same name

**What goes wrong:** `index.ts` does `export * from "./a"; export * from "./b"`
and BOTH `./a` and `./b` define `Foo`. TypeScript silently picks one (last one
wins under most settings, but not all). Our resolver should not silently pick
either — it should emit `ambiguous`.

**How to avoid:** Track all star-export branches; if two return `local`, emit
`{ ok: false, kind: "ambiguous", candidates: [path1, path2] }`. The
`ResolveResult` union (D-12) already reserves this kind.

**Caveat:** The CONTEXT.md specifics call this "currently unreachable" — but if
a fixture is added later for true ambiguity, the path is already in the type.

### Pitfall 5: `.map(...)` arrow returning JSX inside a fragment of expressions

**What goes wrong:** `items.map((it) => (<Card />))` — the body is a parenthesized
JSX. `items.map((it) => { return <Card />; })` — block body. `items.map((it) =>
cond ? <A /> : <B />)` — ternary inside arrow. The walker must descend into all
arrow body shapes.

**How to avoid:** Use the prototype's `extractReturnJsx` shape — it already
handles arrow expressions vs block bodies vs nested IIFEs. Port it.

### Pitfall 6: `cn(undefined, false, '')` produces empty `ClassToken[]` — fine

But `cn(condition && "active")` should NOT collapse the LogicalExpression — it
should record `"active"` as a literal AND record the whole conditional as a raw
token (per D-09 "everything else preserved as a single `raw` token"). Decide:
recurse into `LogicalExpression.right` for literal extraction, OR keep the
whole thing as raw, OR do both? **Both** — most signal for the agent.

### Pitfall 7: Forward-slash discipline

**What goes wrong:** Resolver returns Windows-style `E:\proj\src\Foo.tsx`. Phase
1 D-07 says forward-slash absolute paths everywhere. PITFALLS checklist item:
"All `fileRel` use forward slashes on Windows."

**How to avoid:** Resolver wraps every emitted path in `toForwardSlash()` from
`src/core/paths.ts` BEFORE returning. The `node_modules` boundary detection
must check `/node_modules/` (forward-slash) — only works if path is normalized
first. Same for `path.dirname`/`path.join` results within the resolver — node's
`path` returns OS-native separators.

### Pitfall 8: Fragment detection

**What goes wrong:** `<>...</>` is `JSXFragment`. `<Fragment>` is `JSXElement`
with `tag: "Fragment"` — easy to miss. Aliased `import { Fragment as F } from
"react"` and `<F>` cannot be detected without import-aware Fragment normalization
(deferred per CONTEXT.md "Deferred Ideas").

**How to avoid:** Match BOTH `JSXFragment` and `JSXElement` with
`tagName === "Fragment"` (literal). Document aliased Fragment as v1 gap; emit
as `kind: "jsx"` with `tag: "F"` until later phase adds normalization.

### Pitfall 9: Class component `render()` returning multiple JSX returns

**What goes wrong:** `render() { if (foo) return <A/>; return <B/>; }` — naive
walker takes only the first return statement. Must build a branch tree where
the if/else maps to `branch` nodes.

**How to avoid:** The prototype's `buildRenderFlowFromStatement` already does
exactly this for function components. Reuse the same statement-walker for
class `render()` method bodies.

## Runtime State Inventory

> Phase 3 is greenfield — no rename/refactor/migration. This section is omitted.

## Code Examples

### Reading tsconfig once per call

```ts
// src/core/resolver/tsconfig.ts
import { getTsconfig, createPathsMatcher } from "get-tsconfig";
import type { ParseContext } from "../../adapters/types.js";

export function getOrLoadTsconfig(ctx: ParseContext) {
  if (ctx.tsconfig === undefined) {
    ctx.tsconfig = getTsconfig(ctx.resolvedRoot);
  }
  return ctx.tsconfig; // null if no tsconfig found anywhere up the tree
}

export function getOrBuildPathsMatcher(ctx: ParseContext) {
  const tsconfig = getOrLoadTsconfig(ctx);
  // Cache the matcher on ctx via a private field; or recompute (cheap).
  return tsconfig ? createPathsMatcher(tsconfig) : null;
}
```

### Extension probe order (D-13)

```ts
// src/core/resolver/relative.ts
import { existsSync } from "node:fs";
import path from "node:path";
import { toForwardSlash } from "../paths.js";

const EXT_ORDER = [".ts", ".tsx", ".js", ".jsx"] as const;

export function probeFileCandidates(basePath: string): string | null {
  // 1. Exact path (someone wrote `import x from "@/foo.tsx"`)
  if (existsSync(basePath)) return toForwardSlash(basePath);
  // 2. Append each ext
  for (const ext of EXT_ORDER) {
    const candidate = `${basePath}${ext}`;
    if (existsSync(candidate)) return toForwardSlash(candidate);
  }
  // 3. /index.<ext>
  for (const ext of EXT_ORDER) {
    const candidate = path.join(basePath, `index${ext}`);
    if (existsSync(candidate)) return toForwardSlash(candidate);
  }
  return null;
}
```

### node_modules detection (PARSE-02)

```ts
function isExternalPath(absPath: string): boolean {
  return toForwardSlash(absPath).includes("/node_modules/");
}

function packageNameFromSpecifier(specifier: string): string {
  // Scoped: @org/pkg/sub → @org/pkg
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.slice(0, 2).join("/");
  }
  // Unscoped: pkg/sub → pkg
  return specifier.split("/")[0];
}
```

### `FrameworkAdapter` interface — locked surface (ARCH-01)

```ts
// src/adapters/FrameworkAdapter.ts
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

A unit test asserts the interface has exactly five method names — done by
declaring a `keyof FrameworkAdapter` exhaustive switch or by counting
`Object.keys` of a stub implementation.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `--alias key=value` CLI flags (prototype) | Auto-read `tsconfig.json` via `get-tsconfig` | This phase | Removes user friction, supports `extends` chain, multi-target arrays, `~/*`, `#*` patterns |
| Stringly-typed AST checks (`node.type === "X"`) | `@babel/types` type guards (`t.isX(node)`) | Phase 3 (was tolerated in prototype) | Type-narrowing in TS strict mode; catches refactor errors at compile time |
| Imports `traverse` directly (prototype line 6 — `traverseModule` then `const traverse = traverseModule`) | `babel-shim.ts` enforces `traverse.default ?? traverse` | Phase 1 (already shipped) | Survives ESM/CJS interop variance across runtimes |
| Single `parseAst` plugin list `["jsx", "typescript", "classProperties", "decorators-legacy", "dynamicImport", "topLevelAwait"]` | Full SPEC plugin set adds `classPrivateProperties`, `classPrivateMethods`, `importAssertions`, `explicitResourceManagement` | This phase | Prevents silent parse failures on modern TSX (private class fields, `using`, import attributes) |
| No barrel chase (prototype falls back to "single component in target file" heuristic — line 681) | Recursive `ExportNamedDeclaration` + `ExportAllDeclaration` chase with cycle guard | This phase | Required for shadcn-style barrels; prototype heuristic happens to work on small fixtures only |
| Layout filter via prefix list only (prototype) | Prefix list + repeated variant-strip regex (D-08) | This phase | Handles `[&>svg]:size-6`, `md:hover:dark:flex`, Tailwind v4 arbitrary variants |

**Deprecated/outdated:**

- The prototype's `LAYOUT_CLASS_EXACT` set (`absolute`, `flex`, etc.) is partly
  redundant with the prefix list; CONTEXT.md's D-08 list is canonical.
- Prototype's class-component support: NONE. ClassDeclaration visitor is new in
  Phase 3.
- Prototype's HOC unwrap: shallow (only finds the inner function via
  `unwrapComponentFunction`); doesn't record wrapper names. Phase 3 records the
  whole `wrappers: string[]` chain.

## Assumptions Log

> All claims tagged `[ASSUMED]` here. Empty table = all claims verified or cited.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `parse()` with `errorRecovery:true` collects errors on `ast.errors[]` and continues, but still throws on truly malformed binary input | "Pattern 1 — Babel parse with errorRecovery" | Low — even if it never throws on text, the try/catch still works. We may simply never hit the catch path |
| A2 | `createPathsMatcher` returns `[]` (not `null`) when specifier doesn't match any pattern, vs. `null` when tsconfig has no `paths` config at all | "Pattern 3 — tsconfig path resolution" | Low — both states route to fallback (relative + node_modules); behavior is observationally equivalent. Verify on first integration test |
| A3 | `get-tsconfig` 4.14.0 reads `extends` chain transparently — the returned config object has `extends` already merged (no need for caller to walk the chain manually) | "Standard Stack" | Medium — if `extends` chain is NOT merged, paths matcher will miss inherited path mappings. Mitigated by D-15 fixture `extends-chain/` — will surface immediately if assumption is wrong |
| A4 | `t.isMemberExpression(callee)` patterns for HOCs (e.g., `React.memo(Foo)`) are rare enough in real codebases to defer; we only match unqualified Identifier callees | "Pattern 5 — HOC unwrap matrix" | Low — REQUIREMENTS.md only requires the listed names. Tests can add `React.memo` fixture if needed; matcher extension is one line |
| A5 | The prototype's heuristic of "if target file has exactly one component, treat it as the import target" is NOT needed once barrel chase is implemented | "Anti-Patterns" | Low — proper barrel chase + named-export resolution should always find the right binding. If not, tests will fail and we can fall back to the heuristic |

## Open Questions (RESOLVED)

1. **Should `ParseContext.warnings` be deduplicated?**
   - What we know: Multiple call sites push warnings; same message could repeat across many files (e.g., "skipping node_modules:react").
   - What's unclear: Whether agents prefer one-per-occurrence (signals frequency) or deduplicated (smaller envelope).
   - Recommendation: Dedupe via `Set<string>` on the way out of `extractComponents`; keep raw `warnings` internal. Decision belongs to planner.
   - **RESOLVED:** Adopt the recommendation — dedupe via `Set<string>` on the way out of `extractComponents`; raw `warnings` array stays internal. Wired in Plan 06 (extractComponents output).

2. **Where exactly does `ParseResult { kind: "error" }` translate to `RenderNode { kind: "error" }`?**
   - What we know: PARSE-01 says "syntax errors become `TreeNode { kind: "error" }`" — SPEC R1.
   - What's unclear: A whole-file parse error has no JSX context; the natural emit point is at `extractComponents` level (the file produces zero `ComponentDefinition`s but a synthetic error component, OR an error gets attached to the closest enclosing render flow).
   - Recommendation: Synthetic `ComponentDefinition { name: "<parseError>", kind: "function", renderFlow: { kind: "error", ... } }` per failed file. Phase 5's `toIR()` flattens to `TreeNode { kind: "error" }`. Planner picks shape; tests will lock it.
   - **RESOLVED:** Synthetic `ComponentDefinition` with `renderFlow.kind === "error"` per failed file (implemented in Plan 06). Phase 5 `toIR()` will flatten to `TreeNode { kind: "error" }`.

3. **Should `resolveModule` differentiate "external in node_modules with valid path" from "external bare specifier (couldn't even resolve)"?**
   - What we know: D-12 has `external` (success) and `not-found` (failure).
   - What's unclear: A bare specifier `"react"` with no node_modules nearby — the SPEC implies `external` because we mark all node_modules as external regardless. But if there's no actual file we can't extract `packageName` from a path; we use the original specifier.
   - Recommendation: Always derive `packageName` from the specifier (not from the resolved path). Resolution success means `paths` matched OR relative path resolved OR specifier looks like a bare/scoped package name. Planner can refine.
   - **RESOLVED:** Adopt the recommendation — `packageName` always derived from the specifier; do NOT differentiate "node_modules-with-path" from "bare-spec-not-found" in v1 (both surface as `external`). Wired in Plan 03 `packageNameFromSpecifier` + `detectNodeModules`.

4. **Does the architecture test (D-11 layer 2) need to handle `import("...")` dynamic imports or just static `import x from "..."`?**
   - What we know: D-11 says "dynamic imports and string-built paths".
   - What's unclear: Detecting dynamic `import()` requires AST parsing (or regex with false-positive risk). Worth the complexity?
   - Recommendation: Regex-based string scan is fine for v1 (`/from\s+["']([^"']+)["']/` + `/import\s*\(\s*["']([^"']+)["']\s*\)/`). False-positive rate near-zero for our own codebase. Planner picks scope.
   - **RESOLVED:** Regex-based static-only detection for v1 (handles both `import x from "..."` and `import("...")` strings); dynamic-import-with-template-literals deferred. Implemented in Plan 01 `test/architecture/island.test.ts`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | >=20 (engines.node) | — |
| `@babel/parser` | parseFile | ✓ | 7.29.2 in package.json | — |
| `@babel/traverse` | render-flow / extractors / resolver | ✓ | 7.29.0 in package.json | — |
| `@babel/types` | type guards | ✓ | 7.29.0 in package.json | — |
| `get-tsconfig` | tsconfig + paths | ✓ | 4.14.0 in package.json | — |
| `tinyglobby` | Phase 4 only (`discoverEntries`) | ✓ | 0.2.16 in package.json | — |
| `vitest` | tests | ✓ | 4.1.4 → 4.3.x available | — |
| `@biomejs/biome` | island enforcement | ✓ | 2.4.12 in devDeps | — |

**Missing dependencies:** None — every dep needed for Phase 3 is already in
`package.json` from earlier phases. No installation step required during this
phase's plans.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.x (already installed) |
| Config file | `vitest.config.ts` (existing) |
| Quick run command | `pnpm test -- test/core/parser/parseFile.test.ts` (single-test pattern) |
| Full suite command | `pnpm test` (runs all `test/**/*.test.ts`) |
| Architecture test command | `pnpm test -- test/architecture/island.test.ts` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PARSE-01 | Valid file → AST; syntax-error fixture → ParseResult{ kind:"error" } | unit | `pnpm test -- test/core/parser/parseFile.test.ts` | ❌ Wave 0 |
| PARSE-01 | Valid sibling alongside error file in same call still produces correct output | integration | `pnpm test -- test/core/parser/parseFile.test.ts -t "sibling"` | ❌ Wave 0 |
| PARSE-02 | Shadcn-style barrel resolves to source `button.tsx` | unit | `pnpm test -- test/core/resolver/barrel.test.ts -t "shadcn"` | ❌ Wave 0 |
| PARSE-02 | Re-export cycle `a→b→a` produces `{ ok:false, kind:"cycle" }` (no stack overflow) | unit | `pnpm test -- test/core/resolver/barrel.test.ts -t "cycle"` | ❌ Wave 0 |
| PARSE-03 | `@/*`, `~/*`, `#*` aliases resolve via createPathsMatcher | unit | `pnpm test -- test/core/resolver/tsconfig.test.ts` | ❌ Wave 0 |
| PARSE-03 | Multi-target `paths: { "@/*": ["src/*", "lib/*"] }` first-existing wins | unit | `pnpm test -- test/core/resolver/tsconfig.test.ts -t "multi-target"` | ❌ Wave 0 |
| PARSE-03 | `extends` chain inherits `paths` | unit | `pnpm test -- test/core/resolver/tsconfig.test.ts -t "extends"` | ❌ Wave 0 |
| PARSE-03 | Forward-slash absolute paths on Windows | unit | `pnpm test -- test/core/resolver/tsconfig.test.ts -t "forward-slash"` | ❌ Wave 0 |
| PARSE-04 | memo / forwardRef / observer / withRouter / xyzHOC each populate `wrappers[]` | unit | `pnpm test -- test/adapters/next/NextJsAdapter.test.ts -t "hoc"` | ❌ Wave 0 |
| PARSE-04 | `class Foo extends React.Component` extracted via ClassDeclaration visitor | unit | `pnpm test -- test/adapters/next/NextJsAdapter.test.ts -t "class"` | ❌ Wave 0 |
| OUT-02 | `fullClasses:false` filters Tailwind to layout-only; `fullClasses:true` returns all | snapshot | `pnpm test -- test/core/extractors/tailwind.test.ts` | ❌ Wave 0 |
| OUT-02 | Variant-strip handles `[&>svg]:size-6`, `md:flex`, `dark:hover:flex` | unit | `pnpm test -- test/core/extractors/tailwind.test.ts -t "variant"` | ❌ Wave 0 |
| OUT-03 | All four extractors populate fields on kitchen-sink fixture | snapshot | `pnpm test -- test/core/extractors/kitchen-sink.test.ts` | ❌ Wave 0 |
| OUT-03 | styled-components body has `{?}` for interpolations | unit | `pnpm test -- test/core/extractors/styled.test.ts` | ❌ Wave 0 |
| OUT-04 | ternary / && / \|\| / ?? / !cond&& / .map → snapshot of RenderNode shape | file snapshot | `pnpm test -- test/core/render-flow/walkRenderFlow.test.ts` | ❌ Wave 0 |
| ARCH-01 | `FrameworkAdapter` interface has exactly 5 method names | type test | `pnpm test -- test/adapters/FrameworkAdapter.test.ts` | ❌ Wave 0 |
| ARCH-01 | No file under `core/`, `ir/`, `renderers/` imports `adapters/` (static + dynamic) | architecture | `pnpm test -- test/architecture/island.test.ts` | ❌ Wave 0 |
| ARCH-01 | `NextJsAdapter.detect/discoverEntries/mapRouteToEntry` throw "not implemented in Phase 3" | unit | `pnpm test -- test/adapters/next/NextJsAdapter.test.ts -t "stub"` | ❌ Wave 0 |
| (R8) | `ComponentDefinition` exports all 11 fields | type structural | `pnpm test -- test/adapters/types.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** Run the touched test file's command (e.g.,
  `pnpm test -- test/core/parser/parseFile.test.ts`).
- **Per wave merge:** `pnpm test` (full suite) + `pnpm typecheck` + `pnpm lint`.
- **Phase gate:** Full suite green + `pnpm test -- test/architecture/island.test.ts`
  green + `pnpm lint` clean (no `noRestrictedImports` violations) before
  `/gsd-verify-work`.

### Wave 0 Gaps

All test files are new in Phase 3. Wave 0 should create:

- [ ] `test/architecture/island.test.ts` — D-11 layer 2; ~30 lines glob+regex
- [ ] `test/adapters/types.test.ts` — structural assertion that
      `ComponentDefinition` has all 11 fields
- [ ] `test/adapters/FrameworkAdapter.test.ts` — exactly 5 method names test
- [ ] `test/adapters/next/NextJsAdapter.test.ts` — main suite (HOC, class, stubs, end-to-end)
- [ ] `test/core/parser/parseFile.test.ts` — error recovery, sibling validity
- [ ] `test/core/resolver/barrel.test.ts` — shadcn, cycle
- [ ] `test/core/resolver/tsconfig.test.ts` — paths, extends, multi-target, fwd-slash
- [ ] `test/core/extractors/tailwind.test.ts` — layout-only, variants, cn/clsx/cva/twMerge
- [ ] `test/core/extractors/kitchen-sink.test.ts` — combined four-extractor snapshot
- [ ] `test/core/extractors/styled.test.ts` — `{?}` placeholder
- [ ] `test/core/render-flow/walkRenderFlow.test.ts` — file snapshot of 5 conditional forms + .map
- [ ] `test/fixtures/parser/` — full tree per D-14 + D-15 (parse-errors, hoc, classes,
      render-flow, extractors, resolver mini-projects)

No new framework install needed — vitest already configured.

## Security Domain

> Static analysis MCP — minimal attack surface (read-only, no network, no user code execution).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | MCP stdio runs locally; no auth boundary |
| V3 Session Management | no | Stateless per-tool-call |
| V4 Access Control | no | OS file permissions only |
| V5 Input Validation | yes | zod on tool inputs (Phase 2 already); `resolveModule` validates specifier shape |
| V6 Cryptography | no | No crypto operations |
| V12 Files & Resources | yes | Project root jail (resolveRoot guards); never parse paths outside root |

### Known Threat Patterns for static-analysis MCP

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal in resolved import paths (`../../../../../etc/passwd`) | Information disclosure | After resolution, assert resolved path starts with `ctx.resolvedRoot`; reject otherwise. Already partially covered by Phase 1's `resolveRoot` |
| Symlink escape (pnpm node_modules junction → outside root) | Information disclosure | Don't follow into `/node_modules/`; emit `external`. PITFALLS §4.3 |
| Parser DoS via deeply nested expressions | Availability | Babel parser is reasonably robust; rely on Node's default stack size + per-tool timeout (later phase concern) |
| Reading arbitrary files via tool input | Information disclosure | Tool inputs validated by zod (Phase 2); resolver only reads files reachable via static imports from entry |

**Note:** Phase 3 is read-only file system access. No new network surface, no
user code execution, no DOM. Threat surface is limited to "could a malicious
project root cause us to read files outside that root" — mitigated by
`/node_modules/` boundary and forward-slash root-prefix check.

## Project Constraints (from CLAUDE.md)

| Directive | Where It Applies | Enforcement |
|-----------|------------------|-------------|
| Use `@babel/parser` ^7.29.2, `@babel/traverse` ^7.29.0, `@babel/types` ^7.29.0 — pinned | All parser modules | package.json — already locked |
| Use `get-tsconfig` ^4.14.0 — no `tsconfig-paths`, no TS Compiler API | resolver/tsconfig.ts | package.json — already locked |
| Use `zod` ^4.1.4 — but Phase 3 types are TS-only (no schemas needed) | adapters/types.ts | Phase 3 doesn't add zod schemas |
| Forbidden: `@babel/core`, `@swc/core`, `ts-morph`, TS Compiler API | All parser modules | Code review + package.json drift check |
| Forbidden: `import traverse from "@babel/traverse"` (naive) | Everywhere | `babel-shim.ts` is single source; D-11 architecture test catches direct imports |
| Module system: ESM (`"type": "module"`) | All TS source | tsconfig + tsup config (Phase 1) |
| Runtime: Node >=20 | All code | engines.node enforced |
| Static analysis only — no execution of user code | extractors/, resolver/ | Code review; no `eval`, `require()` of user files, no spawn |
| Forward-slash paths everywhere | All path emit | `toForwardSlash` from paths.ts; D-07 |
| `core/`, `ir/`, `renderers/` MUST NOT import from `adapters/` | All island modules | Biome `noRestrictedImports` (already configured) + D-11 layer 2 architecture test |
| Use Biome (already chosen Phase 1) for lint+format | All TS source | `pnpm lint` runs in CI |
| GSD Workflow Enforcement | This phase work | All edits via `/gsd-execute-phase` |
| Always prefix shell commands with `rtk` (user's global rule) | Tooling commands in plan documentation | Document in plans; doesn't affect production code |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/03-parser-core-ast-resolution-extractors/03-CONTEXT.md` — D-01 through D-15 lock the HOW
- `.planning/phases/03-parser-core-ast-resolution-extractors/03-SPEC.md` — 8 falsifiable requirements with acceptance criteria
- `.planning/research/PITFALLS.md` §2.1, §2.4–§2.7, §4.1–§4.4, §5.1, §5.4 — pre-flagged HIGH-confidence pitfalls
- `generate-component-hierarchy.ts` (repo root) — canonical reference prototype; ground truth for AST recognition patterns
- `src/core/babel-shim.ts`, `src/core/paths.ts`, `src/ir/schema.ts`, `biome.json` — actual current state of repo
- `package.json` — verified all Phase 3 deps present at locked versions
- Context7 `/privatenumber/get-tsconfig` (fetched 2026-04-29) — verified `createPathsMatcher(tsconfig) → (specifier) => string[]` API
- npm registry queries (2026-04-29) — confirmed package versions: `@babel/parser` 7.29.2, `@babel/traverse` 7.29.0, `@babel/types` 7.29.0, `get-tsconfig` 4.14.0, `tinyglobby` 0.2.16, `vitest` 4.1.5

### Secondary (MEDIUM confidence)

- [Babel parser plugins documentation](https://babeljs.io/docs/babel-parser#plugins) — plugin name canonical source for SPEC PARSE-01 list
- [Babel issue #13855](https://github.com/babel/babel/issues/13855) — verified `traverse.default` interop bug documented in `babel-shim.ts`
- [Babel issue #15269](https://github.com/babel/babel/issues/15269) — same class of issue for `@babel/generator`
- [Vitest snapshot guide](https://vitest.dev/guide/snapshot) — `toMatchFileSnapshot`/`toMatchInlineSnapshot` for render-flow output testing
- [PROJECT.md PITFALLS sources cited inline] — Tailwind v4 variant docs, Next.js App Router docs

### Tertiary (LOW confidence — flagged in Assumptions Log)

- A1, A2, A3, A4, A5 above — minor API behavior assumptions that the first
  integration test will confirm or refute.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — every package version verified against npm registry on 2026-04-29; CLAUDE.md locks them.
- Architecture: HIGH — CONTEXT.md decisions (D-01 through D-15) are the architecture; this research expands their HOW.
- Pitfalls: HIGH — PITFALLS.md is project's load-bearing pitfall doc, already verified against Babel issue trackers and Next.js docs.
- AST patterns: HIGH — prototype is working code that already exercises ternary / `&&` / `.map` / HOC unwrap shallow / class detection partially.
- HOC + class extraction beyond prototype: MEDIUM — patterns are well-known but the specific union of regex `^with[A-Z]/` and `/HOC$/` is a project decision (CONTEXT.md), not an industry pattern.
- Validation Architecture: HIGH — vitest is already configured; commands are mechanical.

**Research date:** 2026-04-29
**Valid until:** 2026-05-29 (30 days; stack is stable; only `vitest` minor 4.1→4.3 within range)

---

*Phase: 03-parser-core-ast-resolution-extractors*
*Research completed: 2026-04-29*
*Next step: `/gsd-plan-phase 03` — produce per-wave PLAN.md files consuming this research*
