# Phase 3: Parser Core (AST + Resolution + Extractors) - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the parser core that, given any TSX/JSX/TS/JS file in a Next.js project, produces a framework-agnostic `ComponentDefinition[]` and exposes it behind the 5-method `FrameworkAdapter` contract. Phase 3 ships the interface plus `resolveModule` + `extractComponents` of `NextJsAdapter`; the other three adapter methods are typed stubs that throw `Error("not implemented in Phase 3")` and are filled in by Phase 4.

In scope (HOW): module layout for parser/resolver/extractors/render-flow, parse context and cache lifecycle, parser-level RenderNode shape, Tailwind layout-only filter source, island enforcement mechanism, fixture organization, `ComponentDefinition.props` shape, resolver error discipline.

Out of scope: routing semantics (`detect`, `discoverEntries`, `mapRouteToEntry`), `"use client"` runtime detection (NEXT-04), full Next.js fixture trees, IR `TreeNode` build, query tools, performance SLA — all per SPEC.md "Out of scope".

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**8 requirements are locked.** See `03-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `03-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- `src/adapters/FrameworkAdapter.ts` — the 5-method interface
- `src/adapters/next/NextJsAdapter.ts` — only `resolveModule` + `extractComponents` implemented; other 3 methods stubbed
- `src/adapters/types.ts` — `ComponentDefinition` and supporting types
- `src/core/parser/` — Babel parse primitive with error recovery + `TreeNode kind: "error"` mapping
- `src/core/resolver/` — barrel re-export chase, tsconfig path resolution, `get-tsconfig` integration, cycle guard, per-file cache
- `src/core/extractors/` — Tailwind / inline style / CSS Modules ref / styled-components extractors + layout-only filter
- `src/core/render-flow/` — JSX walker that preserves ternary / `&&` / `||` / `??` / `!` / `.map` shape
- `test/fixtures/parser/` — unit-level fixtures (single TSX files) covering: error recovery, barrel chase, shadcn-style barrel, alias resolution (POSIX + Windows shape), HOC unwrap (5 patterns), class component, style extractors (all 4 inputs), `fullClasses` toggle, conditional render (5 forms), barrel cycle
- vitest unit tests + file snapshots for render-flow output

**Out of scope (from SPEC.md):**
- `NextJsAdapter.detect`, `.discoverEntries`, `.mapRouteToEntry` — Phase 4
- `"use client"` / `"use server"` runtime detection (NEXT-04) — Phase 4
- Full Next.js fixture projects (multi-file `app/` trees) — Phase 4 / Phase 6
- IR `TreeNode` build / token-budget queries — Phase 5
- Parsing files inside `node_modules`
- `React.createElement` / `cloneElement` support — documented v1 gap
- CSS Modules content parsing (PostCSS) — v2 deferred
- Cross-call AST cache, watch mode, persistent state — v2
- Performance SLA / p95 measurement — Phase 6
- HTTP/SSE transport, Pages Router, additional framework adapters — v2

</spec_lock>

<decisions>
## Implementation Decisions

### Parser Internal Architecture (D-01 — D-03)

- **D-01 — Pure functions + `ParseContext`:** All four core modules (`parser/`, `resolver/`, `extractors/`, `render-flow/`) export pure functions. State lives on a single `ParseContext` object passed as the first argument. `ParseContext` shape:
  ```ts
  interface ParseContext {
    resolvedRoot: string;              // forward-slash absolute root from resolveRoot()
    tsconfig: TsconfigResult | null;   // get-tsconfig result, parsed once per call
    astCache: Map<string, ParseResult>;       // key = absolute path
    resolverCache: Map<string, ResolveResult>; // key = `${fromFile}::${specifier}::${importedName}`
    warnings: string[];                // populated by extractors/resolver, surfaces in envelope
  }
  ```
  No class instances at the parser level. `NextJsAdapter.extractComponents()` builds a fresh `ParseContext` per call and threads it through. Easy to test individual functions; no hidden lifecycle.
- **D-02 — Per-call AST cache, key = absolute path:** `astCache` is a `Map<string, ParseResult>` scoped to a single `ParseContext` (one tool call). Garbage-collected when the context goes out of scope. Honors ARCH-02 ("no cross-call cache in v1"). Cache value: `{ kind: "ok", ast: BabelFile } | { kind: "error", message: string, line: number }` so re-entries to the same file (barrel chase) don't re-parse and don't re-throw.
- **D-03 — Per-call resolver cache:** `resolverCache` keyed by the tuple `(fromFile, specifier, importedName)`. Prevents redundant work when N components in one file all import from the same barrel. Same scope and lifecycle as `astCache`.

### RenderNode / ComponentDefinition Shape (D-04 — D-07)

- **D-04 — Parser-level `RenderNode` is separate from IR `TreeNode`:** Defined in `src/adapters/types.ts` (or a parser-internal types file), NOT imported from `src/ir/`. Phase 5 owns the `adapter → IR` mapping. Honors the island rule (`adapters/` cannot import from `ir/` either way — `ir/` is the consumer). Cost is one `toIR()` translator function in Phase 5; gain is keeping the parser output decoupled from the agent-facing IR shape.
- **D-05 — `RenderNode` has 7 kinds, reflecting AST reality, not IR shape:**
  ```ts
  type RenderNode =
    | { kind: "jsx"; tag: string; isComponent: boolean; resolvedFrom?: string;
        attributes: JsxAttribute[]; children: RenderNode[]; file: string; line: number }
    | { kind: "branch"; condition: string;  // raw source text of the condition expr
        thenBranch: RenderNode | null; elseBranch: RenderNode | null;
        file: string; line: number }
    | { kind: "list"; item: RenderNode; iterableSource: string; file: string; line: number }
    | { kind: "text"; value: string; file: string; line: number }
    | { kind: "fragment"; children: RenderNode[]; file: string; line: number }
    | { kind: "spread"; expression: string; file: string; line: number }
    | { kind: "error"; message: string; file: string; line: number };
  ```
  Component-vs-element distinction is a flag on the single `jsx` kind (Phase 5 splits into IR `component`/`element` based on capitalization + resolved binding). No `slot` kind here — slots are a Next.js routing concept (Phase 4).
- **D-06 — `ComponentDefinition.props` shape — minimal:** `PropSignature = { name: string; typeSlice: string; optional: boolean }`. `typeSlice` is the raw source text of the type annotation (no resolution, no normalization). `optional` derived from `name?: T` syntax. No `defaultValue`, no `restElement` flag in v1 — Phase 5 query tools have not requested them. Document this in the type's JSDoc so Phase 5 knows the boundary.
- **D-07 — Destructure prop extraction:** When a component declares `function Card({ a, b: alias, ...rest }: Props)`:
  - Names captured: `a`, `alias` (alias source recorded in notes as `b -> alias` for traceability), `rest`.
  - `typeSlice` for every prop = the raw source of `Props` (we do NOT resolve `Props` to a type and split per-field — static analysis stays syntactic).
  - Pure positional `function Card(props: Props)` records a single synthetic prop named `props` with `typeSlice = "Props"`. Phase 5 can decide to expand or hide.

### Tailwind / Style Extractors (D-08 — D-10)

- **D-08 — Tailwind layout-only filter = hardcoded prefix list + variant strip regex:** Module `src/core/extractors/tailwind/layout-prefixes.ts` exports two artifacts:
  1. **Prefix list** (layout families):
     ```
     flex, grid, gap, m, p, w, h, min-w, min-h, max-w, max-h,
     top, right, bottom, left, inset,
     place-, justify-, items-, self-, content-,
     basis-, grow, shrink, order, col-, row-,
     space-, divide-,
     absolute, relative, fixed, sticky, static,
     hidden, block, inline, inline-block, inline-flex, inline-grid,
     overflow-, z-,
     size-          // Tailwind v4 unified width+height
     ```
     Curated, auditable, easy to extend.
  2. **Variant strip regex:** `^(?:\[[^\]]+\]|[a-zA-Z0-9_-]+):` repeated, matches PITFALLS 5.4 — handles `md:flex`, `[&>svg]:size-6`, `dark:hover:flex`. After stripping variants, classify by prefix list.

  `extractComponents({ fullClasses: false })` (default) filters tokens through this classifier. `fullClasses: true` returns everything. No Tailwind config reading (would require executing user's `tailwind.config.{js,ts}`, violating "no execution of user code").
- **D-09 — `cn`/`clsx`/`cva`/`twMerge` argument resolution:** `ClassToken` is a discriminated union:
  ```ts
  type ClassToken =
    | { kind: "literal"; value: string; file: string; line: number }
    | { kind: "raw"; source: string; file: string; line: number };  // raw source slice
  ```
  All string-literal arguments (including those nested inside template literal quasis with no interpolation) become `literal` tokens. Object-literal keys with truthy literal values (`{ "p-4": true }`) become `literal` tokens. Everything else (identifier, member expression, conditional expression, template with interpolation) is preserved as a single `raw` token containing the source slice. Matches PITFALLS 5.1 ("return both"). No symbolic execution / variant-table resolution in v1 — defer to v2 if Phase 6 testing shows it matters.
- **D-10 — styled-components `{?}` placeholder rule:** Template literal calls of `styled.tag` / `styled(Component)` produce `{ tag: string; body: string }`. `body` is the template's raw text with every `${...}` interpolation replaced by the literal string `{?}`. No resolution of theme functions. Detection is identifier-based (the tag callee is `styled`), no import-source verification in v1 — keeps the extractor a pure AST visitor.

### Adapter Island Enforcement (D-11)

- **D-11 — Two-layer enforcement:**
  1. **Biome `noRestrictedImports` rule** in `biome.json`, scoped to `src/core/**`, `src/ir/**`, `src/renderers/**`, blocking any specifier that resolves under `src/adapters/`. Loud-fails in IDE + CI lint.
  2. **vitest integration test** `test/architecture/island.test.ts` reads every `.ts` file under the three island roots and asserts no `from "..."` / `import("...")` resolves into `adapters/`. Catches dynamic imports and string-built paths that the lint rule would miss.

  Phase 1 already chose Biome (D-17), so layer 1 is a config addition with no new dependency. Layer 2 is ~30 lines of glob+regex.

### Resolver Error Discipline (D-12, D-13)

- **D-12 — `resolveModule` returns a discriminated union, never throws:**
  ```ts
  type ResolveResult =
    | { ok: true; kind: "local"; absolutePath: string }     // forward-slash absolute
    | { ok: true; kind: "external"; packageName: string }   // node_modules boundary
    | { ok: false; kind: "cycle"; chain: string[] }
    | { ok: false; kind: "not-found"; specifier: string; tried: string[] }
    | { ok: false; kind: "ambiguous"; specifier: string; candidates: string[] };
  ```
  Caller (`extractComponents`) decides whether to emit a `RenderNode { kind: "error" }` or to drop the import silently. Aligns with PITFALLS 1.4 ("parse failure for user's file is expected data, not exception").
- **D-13 — tsconfig multi-target = first-existing-file wins:** When `paths` maps a specifier to an array of targets (e.g. `"@/*": ["src/*", "lib/*"]`), iterate the array in order. For each target, probe extensions in this order: exact path, `.ts`, `.tsx`, `.js`, `.jsx`, `/index.ts`, `/index.tsx`, `/index.js`, `/index.jsx`. First hit wins. Matches TS compiler behavior. If zero targets resolve → `{ ok: false, kind: "not-found" }`. `ambiguous` is reserved for non-array conflicts (currently unreachable; kept in the union so future logic doesn't have to redesign the result type).

### Fixture Strategy (D-14, D-15)

- **D-14 — Per-feature fixture folders + one kitchen-sink:**
  ```
  test/fixtures/parser/
    parse-errors/        # syntax errors, partial files, unrecoverable cases
    hoc/                 # memo.tsx, forward-ref.tsx, observer.tsx, with-router.tsx, xyz-hoc.tsx
    classes/             # extends-react-component.tsx, extends-pure-component.tsx, qualified.tsx
    render-flow/         # ternary.tsx, logical-and.tsx, logical-or.tsx, nullish-coalesce.tsx, negation.tsx, map.tsx, nested.tsx
    extractors/
      kitchen-sink.tsx   # all 4 style inputs in one component (validates field interplay + fullClasses toggle)
      tailwind-only.tsx
      inline-style.tsx
      css-module.tsx
      styled.tsx
    resolver/            # mini-projects (see D-15)
  ```
  Each `.tsx` file is the smallest input that exercises one feature. Snapshot diffs stay localized. Kitchen-sink only exists where field interplay matters (style extractors).
- **D-15 — Resolver fixtures = real mini-projects on disk:**
  ```
  test/fixtures/parser/resolver/
    shadcn-barrel/
      tsconfig.json           # paths: { "@/*": ["src/*"] }
      src/
        components/ui/
          index.ts            # re-exports Button from "./button"
          button.tsx
        page.tsx              # imports { Button } from "@/components/ui"
    barrel-cycle/
      tsconfig.json
      src/{a.ts, b.ts, page.tsx}   # a re-exports from b, b from a
    multi-target/
      tsconfig.json           # paths: { "@/*": ["src/*", "lib/*"] }
      src/components/Foo.tsx
      page.tsx                # imports "@/components/Foo"
    extends-chain/
      tsconfig.base.json
      tsconfig.json           # extends: ./tsconfig.base.json
      src/...
    windows-paths/             # (mock layout — actual Windows behavior tested via path.sep mock or asserted by toForwardSlash)
  ```
  Tests pass each mini-project's directory as `resolvedRoot` and call `resolveModule` directly. `get-tsconfig` reads real files; no mocking. Honors the SPEC's "POSIX + Windows separator" acceptance via the existing `src/core/paths.ts#toForwardSlash` helper applied to every emitted path.

### Claude's Discretion

Downstream agents (researcher / planner / executor) may decide these without asking:
- Exact internal file split inside each module (e.g., whether `extractors/` has one file per signal or sub-folders).
- The exact list of layout-relevant Tailwind prefixes — D-08 list is the starting point; planner may add families during implementation if an obvious one is missing (e.g., `aspect-`, `place-self-`). Adding requires a one-line rationale comment.
- HOC pattern matching: SPEC locks the five names + two regexes. Whether they live as a single exported constant or per-pattern matcher functions is up to the planner.
- `JsxAttribute` shape inside `RenderNode.jsx` — at minimum `{ name, value }` where `value` discriminates literal vs expression vs spread. Concrete shape locked during D-04's `RenderNode` materialization.
- `iterableSource` (D-05) format: raw source slice of the receiver of `.map(...)` (e.g., `"items"`, `"posts.filter(p => p.active)"`). Truncation policy (long expressions) — planner picks reasonable cap.
- Whether barrel chase emits a `warnings.push(...)` when stopping at `node_modules` (PITFALLS 4.4) — encouraged but not mandated.
- `vitest` snapshot file paths and naming — `__snapshots__/` co-located with the test file is fine.
- Per-prop notes on destructure aliasing (D-07) — internal field name and shape up to planner.

### Folded Todos

None — no pending todos matched this phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked phase requirements
- `.planning/phases/03-parser-core-ast-resolution-extractors/03-SPEC.md` — **Locked requirements (8 items) — MUST read before planning.** Lists exact acceptance criteria, in/out of scope, constraints. CONTEXT.md is HOW; SPEC is WHAT.

### Project scope & v1 requirements
- `.planning/PROJECT.md` — vision, in/out of scope, key decisions table.
- `.planning/REQUIREMENTS.md` — specifically **PARSE-01, PARSE-02, PARSE-03, PARSE-04, OUT-02, OUT-03, OUT-04, ARCH-01** (this phase's requirements) and **ARCH-02** (parse-on-demand contract that constrains caching).
- `.planning/ROADMAP.md` §"Phase 3: Parser Core" — success criteria SC-1…SC-6.

### Tech stack & forbidden choices (locked in CLAUDE.md)
- `CLAUDE.md` §"Technology Stack" — `@babel/parser ^7.29.2`, `@babel/traverse ^7.29.0`, `@babel/types ^7.29.0`, `get-tsconfig ^4.14.0`, `zod ^4.1.4`. Pinned versions; do not bump in this phase.
- `CLAUDE.md` §"AST Parsing & Traversal" — plugin set, type-guard discipline (`t.isJSXElement(...)` over string compare).
- `CLAUDE.md` §"What NOT to Use" — NO `@babel/core`, NO `@swc/core`, NO `ts-morph`, NO `tsconfig-paths`, NO TypeScript compiler API, NO naive `import traverse from "@babel/traverse"`.

### Pitfalls research (HIGH confidence)
- `.planning/research/PITFALLS.md` §2.1 (parser plugins + errorRecovery), §2.4 (conditional render), §2.5 (`.map`), §2.6 (HOC unwrap + class components), §2.7 (Fragment), §4.1 (tsconfig paths), §4.2 (barrel chase), §4.4 (don't parse `node_modules`), §5.1 (dynamic className), §5.4 (Tailwind variant strip).
- `.planning/research/STACK.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/FEATURES.md` — supplementary background; PITFALLS is the load-bearing one for this phase.

### Prior phase context (carry-forward)
- `.planning/phases/01-scaffolding-ir-foundation/01-CONTEXT.md` §"Directory Layout" (D-16, D-17) — island rule (Biome enforced) + 5-island src/ layout.
- `.planning/phases/01-scaffolding-ir-foundation/01-CONTEXT.md` §"File:Line Attachment" (D-06, D-07) — flat `file: string` + `line: number` on every node, forward-slash relative paths. RenderNode here MUST follow the same convention so Phase 5's `toIR()` is mechanical.
- `.planning/phases/01-scaffolding-ir-foundation/01-CONTEXT.md` §"Babel Interop Shim" (D-20) — all `@babel/traverse` usage MUST go through `src/core/babel-shim.ts`. Direct imports are forbidden.
- `.planning/phases/02-mcp-transport-shell/02-CONTEXT.md` §"Server Wiring & Layout" (D-13) — `resolveRoot()` is called per-tool, not at server startup. Phase 3's `ParseContext` builder consumes that resolved root.

### Reference prototype (canonical for porting)
- `generate-component-hierarchy.ts` (repo root) — HIGH-relevance reference implementation. Specifically:
  - Parse plugin list & `errorRecovery` flag — PARSE-01.
  - `resolveAliasImport` + barrel chase logic — PARSE-02 / PARSE-03 (port and generalize via `get-tsconfig`).
  - HOC unwrap + class detection — PARSE-04.
  - Render-flow walker (ternary / `&&` / `.map`) — OUT-04 (port to 7-kind RenderNode shape per D-05).
  - Tailwind variant strip + class collection — OUT-02 / OUT-03 / D-08 / D-09.
  Do NOT import from the prototype (Bun script, lives outside `src/`). Port logic into pure functions per D-01.

### External docs (planner may fetch fresh)
- [`@babel/parser` plugin docs](https://babeljs.io/docs/babel-parser#plugins) — for verifying the plugin set in PARSE-01.
- [`get-tsconfig` README](https://github.com/privatenumber/get-tsconfig) — `paths` matcher API + `extends` chain handling.
- [Babel issues #13855, #15269](https://github.com/babel/babel/issues/13855) — justifies the existing `babel-shim.ts`.
- [Vitest snapshot guide](https://vitest.dev/guide/snapshot) — `toMatchFileSnapshot` for render-flow output (per D-14).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phases 1 + 2)
- **`src/core/babel-shim.ts`** — the ONLY allowed entry point for `@babel/traverse`. Phase 3 parser/extractors/render-flow walkers import `traverse` from here.
- **`src/core/paths.ts`** — `toForwardSlash(p)` and `relFromRoot(absFile, absRoot)`. Every emitted file path in `ComponentDefinition.file` and `RenderNode.file` MUST go through `toForwardSlash`. Resolver outputs MUST be forward-slash absolute paths.
- **`src/core/resolve-root.ts`** — already produces a forward-slash absolute root. `ParseContext.resolvedRoot` is set from this helper at the call site (`NextJsAdapter.extractComponents`).
- **`src/ir/schema.ts`** — IR `TreeNode` is a 9-kind discriminated union with flat `file`/`line` fields. Phase 3's `RenderNode` deliberately differs (7 kinds, parser-shaped) — Phase 5 owns the bridge.
- **`src/mcp/log.ts`** — tiny stderr logger from Phase 2. `ParseContext.warnings` is the in-band channel (returned in envelope); `log.warn(...)` is reserved for diagnostic noise (e.g., "skipping node_modules:react"). Don't write to stdout.
- **`biome.json`** — Phase 1 set up Biome; Phase 2 added a scoped `noConsole` override. Phase 3 adds the `noRestrictedImports` block per D-11.

### Established Patterns
- **Zod-first schemas, types via `z.infer`** (Phase 1 D-04). Phase 3's `ComponentDefinition` and `RenderNode` are pure TypeScript types — no zod schema needed because they aren't user-facing tool inputs. If Phase 5 wants runtime validation at the IR boundary, it adds the schema there.
- **Forward-slash paths everywhere** (Phase 1 D-07). Non-negotiable. Resolver and extractors call `toForwardSlash` on every absolute path before emit.
- **Island imports** (Phase 1 D-16/D-17, Phase 2 reaffirmed). `core/`, `ir/`, `renderers/` MUST NOT import from `adapters/`. Phase 3 adds the inverse: `adapters/` may import from `core/` (it's where the parser primitives live), but NOT from `ir/` or `renderers/` — the adapter produces parser-level types, not IR.
- **Per-tool `resolveRoot()` call** (Phase 2 D-13). Phase 3's `NextJsAdapter.extractComponents` receives the resolved root from the caller; never calls `resolveRoot` itself.

### Integration Points
- `src/adapters/FrameworkAdapter.ts` — new file. Exactly 5 methods. Locked surface; Phase 4 fills in the other three.
- `src/adapters/next/NextJsAdapter.ts` — new file. Implements `resolveModule` + `extractComponents`; stubs `detect`, `discoverEntries`, `mapRouteToEntry`.
- `src/adapters/types.ts` — new file. `ComponentDefinition`, `RenderNode`, `JsxAttribute`, `ClassToken`, `PropSignature`, `ResolveResult`, `ParseContext`. All TypeScript; no zod.
- `src/core/parser/` — new folder. `parseFile(ctx, absolutePath): ParseResult` is the primitive.
- `src/core/resolver/` — new folder. `resolveModule(ctx, fromFile, specifier, importedName): ResolveResult`. Uses `get-tsconfig` for path mapping; barrel chase + cycle guard internal.
- `src/core/extractors/` — new folder. Sub-modules per signal: `tailwind/`, `inline-style.ts`, `css-module.ts`, `styled.ts`. Each exports a pure function `(ctx, jsxElement, sourceText) => Signal[]`.
- `src/core/render-flow/` — new folder. `walkRenderFlow(ctx, fnNode, sourceText): RenderNode` recursively descends a function/class component body's JSX return.
- `biome.json` — add `noRestrictedImports` rule per D-11 layer 1.
- `test/fixtures/parser/` — new tree per D-14 / D-15.
- `test/architecture/island.test.ts` — new. D-11 layer 2.
- `package.json` — add runtime deps `get-tsconfig`, `@babel/traverse`, `@babel/types` (already in CLAUDE.md stack lock; not yet in package.json).

</code_context>

<specifics>
## Specific Ideas

- The prototype's `parseAst` plugin list lacks `classPrivateProperties`, `classPrivateMethods`, `importAssertions`, `explicitResourceManagement` — SPEC PARSE-01 adds them. Don't blindly copy the prototype's plugin array; use SPEC's full set.
- `resolveModule` distinguishes `"@/components"` (named import lands in barrel) from `"@/components/Button"` (direct file). Both go through `get-tsconfig`'s `paths` resolver first; only the barrel case triggers the export-chain chase.
- `cycle` detection chain (D-12) — accumulate visited files in a `Set<string>` carried through the resolver's recursion. The chain in the error result is the ordered visit list, useful for the agent's diagnostic.
- For `extractComponents({ fullClasses: false })` (the default): the filter applies ONLY to Tailwind tokens; inline style / CSS Modules / styled-components signals are ALWAYS fully captured regardless of the flag (per SPEC OUT-02, layout-only is a Tailwind concern).
- Class component visitor (PARSE-04): match the superclass against both qualified (`React.Component`, `React.PureComponent`) and unqualified (`Component`, `PureComponent`) forms via `t.isMemberExpression` / `t.isIdentifier`. Don't try to verify the import resolves to React — too brittle for v1, false-negatives worse than false-positives here.
- `node_modules` boundary detection (PARSE-02): when the resolver's chase lands on a path containing `/node_modules/` (after `toForwardSlash`), stop and emit `{ ok: true, kind: "external", packageName }`. Extract `packageName` from the original specifier (the part before the first `/` for unscoped, first two for scoped `@org/pkg`).
- The `iterableSource` field on `RenderNode { kind: "list" }` (D-05) lets agents see what's being iterated without resolving the binding (e.g., `posts`, `users.filter(u => u.active)`). Useful for `find_by_text` queries in Phase 5.

</specifics>

<deferred>
## Deferred Ideas

### From this discussion
- **Symbolic `cn(variants[state])` resolution** — D-09 captures dynamic args as raw source slices only. If Phase 6 real-client testing shows agents struggle with variant-table patterns, revisit with a v2 spec amendment.
- **`PropSignature.defaultValue` and `restElement` flag** — D-06 keeps PropSignature minimal. Add when Phase 5 query tools concretely need them.
- **Tailwind config reading** — D-08 rejects executing user's `tailwind.config.{js,ts}`. If a v2 phase wants accurate token sets, parse the config file's AST (still no execution) or accept a curated allowlist as input.
- **`React.createElement` / `_jsx` / `_jsxs` support** — PITFALLS 2.2, listed as v1 documented gap. Don't build it into Phase 3 even if the AST is right there.
- **Cross-call AST cache (persistent across tool calls)** — ARCH-02 forbids in v1. D-02's per-context cache is the design substrate; v2 just swaps the lifetime.
- **Performance benchmarks** — Phase 6 (`ARCH-04`). Phase 3 doesn't measure parse throughput; it just ships correctness.
- **Namespaced JSX (`<Dialog.Content>`) full resolution** — PITFALLS 2.3. Prototype has partial support. Phase 3 emits the `jsx` node with `tag = "Dialog.Content"` but does NOT resolve through the namespace import — Phase 4 or v2 owns full member-expression resolution if it's still needed after Phase 5 query tools land.
- **`React.Fragment` / aliased Fragment detection** — PITFALLS 2.7. Phase 3 detects `<>...</>` and `<Fragment>` (identifier match). Aliased forms (`import { Fragment as F }`) emit as `kind: "jsx"` with `tag: "F"` until a follow-up phase adds import-aware Fragment normalization.

### Reviewed Todos (not folded)
None — no todos matched.

</deferred>

---

*Phase: 03-parser-core-ast-resolution-extractors*
*Context gathered: 2026-04-29*
