# Phase 3: Parser Core (AST + Resolution + Extractors) — Specification

**Created:** 2026-04-29
**Ambiguity score:** 0.15 (gate: ≤ 0.20)
**Requirements:** 8 locked

## Goal

Given any TSX/JSX/TS/JS file in a Next.js project, produce a framework-agnostic `ComponentDefinition[]` (with render flow, style signals, conditional branches, HOC wrappers, and resolved import paths) and expose it behind the 5-method `FrameworkAdapter` contract — Phase 3 implements the interface plus `resolveModule` and `extractComponents` of `NextJsAdapter`; routing methods are deferred to Phase 4.

## Background

Today the parser does not exist in `src/`. `src/core/` only ships `babel-shim.ts`, `paths.ts`, and `resolve-root.ts` (Phase 1 scaffolding). `src/adapters/` is empty. `src/ir/schema.ts` defines a 9-kind `TreeNode` discriminated union but has no field for `runtime`, `wrappers`, `className`, or inline style — those richer fields will live on a parser-level `ComponentDefinition` struct that Phase 5 builds into `TreeNode`.

The prototype `generate-component-hierarchy.ts` already encodes ~60% of this logic (Babel + traverse + alias resolution + render-flow walking) and is the canonical reference to port from. Three pitfalls are pre-flagged in `.planning/research/PITFALLS.md`: Babel ESM interop (`traverse.default` shim), HOC unwrap correctness, and barrel re-export cycle handling.

## Requirements

1. **Babel parse with error recovery (PARSE-01)**: Every supported source file is parsed by `@babel/parser` with the full plugin set and `errorRecovery: true`.
   - Current: No parser. `src/core/babel-shim.ts` exists but only normalizes the ESM/CJS interop for `@babel/traverse`.
   - Target: A `parseFile(absolutePath)` primitive returns a Babel `File` AST, using plugins `["jsx", "typescript", "decorators-legacy", "classProperties", "classPrivateProperties", "classPrivateMethods", "dynamicImport", "topLevelAwait", "importAssertions", "explicitResourceManagement"]` plus `errorRecovery: true`. Files that fail to parse surface as a `TreeNode { kind: "error", message, file, line }` — never silently dropped.
   - Acceptance: A vitest fixture file containing intentional syntax errors yields a `kind: "error"` node with the parser's diagnostic message, and a sibling valid file in the same call still produces correct output.

2. **Barrel re-export resolution with cycle guard (PARSE-02)**: Named imports landing in barrel files are followed to their true source.
   - Current: No resolver. Imports are not chased.
   - Target: A `resolveModule(fromFile, importSpecifier, importedName)` returns the absolute file path that owns the local declaration of `importedName`, by recursing through `ExportNamedDeclaration` and `ExportAllDeclaration`. Cache per `(file, exportedName)` pair. Resolution stops at: (a) a local declaration, (b) a re-export pointing into `node_modules` — emitted as an external library node carrying the package name, (c) a detected cycle — emitted as `kind: "error"` with message containing `"cycle"`.
   - Acceptance: A shadcn-style fixture (`@/components/ui/index.ts` re-exports `Button` from `./button`) resolves `import { Button } from "@/components/ui"` to the absolute path of `button.tsx`. A fixture with a deliberate `a.ts → b.ts → a.ts` re-export cycle produces an error node, not a stack overflow.

3. **tsconfig path resolution via `get-tsconfig` (PARSE-03)**: Project alias imports resolve correctly.
   - Current: No tsconfig reader. `src/core/paths.ts` has helper utilities but no alias logic.
   - Target: `resolveModule` uses `get-tsconfig` to read the project's `tsconfig.json` (including the `extends` chain), honoring `baseUrl` and `paths`. Aliases of the forms `@/*`, `~/*`, `#*`, and multi-target arrays are all resolved correctly. Resolved paths are absolute and use forward slashes on Windows.
   - Acceptance: A fixture with `tsconfig.json` defining `paths: { "@/*": ["src/*"], "#config/*": ["src/config/*"] }` resolves `import x from "@/components/Foo"` and `import y from "#config/env"` to the correct absolute paths under both POSIX and Windows separators.

4. **HOC unwrapping and class component support (PARSE-04)**: Components wrapped in known HOCs are detected and annotated; class components are extracted.
   - Current: No component extraction logic.
   - Target: `extractComponents` unwraps the following HOC patterns and records them on `ComponentDefinition.wrappers`: `memo`, `forwardRef`, `observer`, any identifier matching `/^with[A-Z]/`, any identifier matching `/HOC$/`. The inner component (after unwrap) is the one whose render flow is walked. `ClassDeclaration` nodes whose superclass is `Component` or `PureComponent` (qualified or unqualified, e.g. `React.Component`) are extracted via a `ClassDeclaration` visitor with `render()` as the render-flow root.
   - Acceptance: Fixtures `memo(Foo)`, `forwardRef(Foo)`, `withRouter(Foo)`, `observer(Foo)`, and `class Foo extends React.Component` each yield exactly one `ComponentDefinition` with the expected `wrappers[]` (or empty for the class case) and the expected render flow.

5. **Style extractors — full surface (OUT-02, OUT-03)**: Every `ComponentDefinition` carries the four configured style signals.
   - Current: No extractors.
   - Target:
     - **Tailwind classNames** (MUST): Collected from `className="..."` literals AND from calls to `cn(...)`, `clsx(...)`, `cva(...)`, `twMerge(...)` (resolving string-literal arguments and known token-style spreads; non-resolvable arguments preserved as raw source slices).
     - **Inline `style` prop** (MUST): Object expressions on the `style` JSX attribute are captured as a flat record of literal key/value pairs; computed/spread values preserved as raw source slices.
     - **CSS Modules reference** (MUST): `styles.foo` accesses are emitted as `{ kind: "css-module", binding: "styles", key: "foo", source: "./X.module.css" }` — no CSS file parsing in v1.
     - **styled-components template literal** (best-effort): Template literal calls of `styled.tag` / `styled(Component)` are captured with the template body as a raw string; interpolations replaced by the placeholder `{?}`.
     - **Layout-only filter (OUT-02)**: `extractComponents(opts)` accepts `{ fullClasses?: boolean }`. When `fullClasses` is false (default), Tailwind output is filtered to layout-relevant tokens only (flex / grid / spacing / sizing / positioning families). When `fullClasses: true`, all tokens are returned unfiltered.
   - Acceptance: A fixture covering all four extractor inputs in one component yields a `ComponentDefinition` whose `classNames`, `inlineStyles`, `cssModuleRefs`, and `styledTemplates` arrays each contain the expected entries. Toggling `fullClasses` flips Tailwind output between layout-only and full sets, verified by snapshot.

6. **Conditional render branches preserved (OUT-04)**: The render flow walker preserves control-flow shape.
   - Current: No render-flow walker.
   - Target: When walking a component's JSX render tree, the following are preserved as branch / list nodes (not flattened):
     - Ternary `cond ? a : b` → branch with `then = a`, `else = b`.
     - Logical `cond && a` → branch with `then = a`, `else = null`.
     - Logical `a || b` and `a ?? b` → branch with `then = a`, `else = b`.
     - Negation `!cond && a` / `!!cond && a` → branch where `condition` records the negation.
     - `.map(...)` calls returning JSX → `kind: "list"` with the body as `item`.
   - Acceptance: A fixture component containing each of the five forms above produces a render flow whose serialized shape matches a vitest file snapshot, with `condition` strings reflecting source text.

7. **`FrameworkAdapter` contract + island boundary (ARCH-01)**: The adapter abstraction is locked and enforced.
   - Current: No `FrameworkAdapter` interface; `src/adapters/` is empty.
   - Target:
     - `src/adapters/FrameworkAdapter.ts` exports a TypeScript interface with exactly five methods: `detect`, `discoverEntries`, `resolveModule`, `extractComponents`, `mapRouteToEntry`. Method signatures are stable and documented.
     - `src/adapters/next/NextJsAdapter.ts` implements **only** `resolveModule` and `extractComponents` in Phase 3. The other three methods are present as typed stubs that throw `Error("not implemented in Phase 3")` and will be filled in by Phase 4.
     - The boundary is enforced: nothing under `src/core/`, `src/ir/`, or `src/renderers/` imports from `src/adapters/` (verified by a Biome `noRestrictedImports` rule or an integration test scanning the import graph).
   - Acceptance: A unit test verifies the interface has exactly five methods. A fixture import-graph scan fails the build if any file under `core/`, `ir/`, or `renderers/` references `adapters/`. `NextJsAdapter.detect()` throws "not implemented in Phase 3"; `NextJsAdapter.extractComponents()` returns a real result on a sample fixture.

8. **`ComponentDefinition` shape locked**: The parser-level output type carries the fields downstream phases need.
   - Current: No `ComponentDefinition` type defined.
   - Target: `src/adapters/types.ts` (or `src/core/types.ts`) exports:
     ```ts
     interface ComponentDefinition {
       name: string;
       file: string;          // absolute, forward-slash
       line: number;
       kind: "function" | "class";
       wrappers: string[];    // HOC names, in outer-to-inner order
       props: PropSignature[];// names + raw type slices (no type-checker resolution)
       textContent: string[]; // string literals appearing in JSX text
       renderFlow: RenderNode;// recursive: jsx | branch | list | text | fragment | spread | error
       classNames: ClassToken[];
       inlineStyles: Record<string, string | { raw: string }>;
       cssModuleRefs: { binding: string; key: string; source: string }[];
       styledTemplates: { tag: string; body: string }[];
     }
     ```
     The `runtime` field (`"server" | "client"`) is deliberately NOT on `ComponentDefinition` in Phase 3 — Phase 4 (`NEXT-04`) layers it via `"use client"` directive detection.
   - Acceptance: All fields above are present and typed; vitest snapshot of a representative fixture covers every field.

## Boundaries

**In scope:**
- `src/adapters/FrameworkAdapter.ts` — the 5-method interface
- `src/adapters/next/NextJsAdapter.ts` — only `resolveModule` + `extractComponents` implemented; other 3 methods stubbed
- `src/adapters/types.ts` — `ComponentDefinition` and supporting types
- `src/core/parser/` — Babel parse primitive with error recovery + `TreeNode kind: "error"` mapping
- `src/core/resolver/` — barrel re-export chase, tsconfig path resolution, `get-tsconfig` integration, cycle guard, per-file cache
- `src/core/extractors/` — Tailwind / inline style / CSS Modules ref / styled-components extractors + layout-only filter
- `src/core/render-flow/` — JSX walker that preserves ternary / `&&` / `||` / `??` / `!` / `.map` shape
- `test/fixtures/parser/` — unit-level fixtures (single TSX files) covering: error recovery, barrel chase, shadcn-style barrel, alias resolution (POSIX + Windows shape), HOC unwrap (5 patterns), class component, style extractors (all 4 inputs), `fullClasses` toggle, conditional render (5 forms), barrel cycle
- vitest unit tests + file snapshots for render-flow output

**Out of scope:**
- `NextJsAdapter.detect`, `NextJsAdapter.discoverEntries`, `NextJsAdapter.mapRouteToEntry` — Phase 4 (routing semantics, layout chains, route groups, parallel/intercepting/dynamic routes)
- `"use client"` / `"use server"` runtime detection (NEXT-04) — Phase 4 layers this on top of Phase 3's `ComponentDefinition`
- Full Next.js fixture projects (multi-file `app/` trees) — Phase 4 / Phase 6 (`ARCH-04`)
- IR `TreeNode` build / token-budget queries — Phase 5
- Parsing files inside `node_modules` — out of scope per REQUIREMENTS.md (external imports become labeled framework nodes)
- `React.createElement` / `cloneElement` support — documented v1 gap (REQUIREMENTS.md "Out of scope")
- CSS Modules content parsing (PostCSS) — v2 deferred
- Cross-call AST cache, watch mode, persistent state — v2 (`ARCH-02`: parse-on-demand only)
- Performance SLA / p95 measurement — Phase 6 (`ARCH-04`)
- HTTP/SSE transport, Pages Router, additional framework adapters — v2

## Constraints

- **Stack lock (from CLAUDE.md):** `@babel/parser ^7.29.2`, `@babel/traverse ^7.29.0`, `@babel/types ^7.29.0`, `get-tsconfig ^4.14.0`. No `@babel/core`, no `@swc/core`, no `ts-morph`, no `tsconfig-paths`, no TypeScript compiler API.
- **Babel ESM interop:** All `@babel/traverse` imports must go through the existing `src/core/babel-shim.ts` (or equivalent `traverse.default ?? traverse` shim). Direct `import traverse from "@babel/traverse"` is forbidden (Babel issue #13855).
- **Static analysis only:** No execution of user code. No DOM. No transformation. Read-only AST traversal.
- **Forward-slash paths:** All emitted file paths use forward slashes regardless of host OS.
- **No cache across calls:** Per-call AST cache only; no persistence between tool calls (matches `ARCH-02`, deferred to v2).
- **Adapter island:** `core/`, `ir/`, `renderers/` MUST NOT import from `adapters/`. Enforced via lint rule or graph test.
- **Prototype as canonical reference:** Where the prototype `generate-component-hierarchy.ts` already solves a pitfall (Babel ESM interop, HOC unwrap, barrel chase), Phase 3 ports the logic — does not re-derive it.

## Acceptance Criteria

- [ ] `parseFile()` returns a Babel AST for valid input and a `TreeNode { kind: "error" }` for syntax-error input — verified by vitest fixture
- [ ] `NextJsAdapter.resolveModule()` resolves `@/*`, `~/*`, `#*` aliases via `get-tsconfig` on a fixture project — POSIX absolute path returned, forward slashes on Windows
- [ ] Shadcn-style barrel fixture (`@/components/ui` → `./button` → `Button`) resolves to the source file's absolute path
- [ ] Re-export cycle fixture produces a `kind: "error"` node containing `"cycle"` in the message — no stack overflow
- [ ] `NextJsAdapter.extractComponents()` returns one `ComponentDefinition` per component for fixtures covering: function component, class component (`extends React.Component`), `memo(Foo)`, `forwardRef(Foo)`, `observer(Foo)`, `withRouter(Foo)`, `xyzHOC(Foo)` — `wrappers[]` populated correctly
- [ ] All four style extractors populate their fields on a combined fixture: Tailwind (incl. `cn`/`clsx`/`cva`/`twMerge`), inline `style` prop literal pairs, CSS Modules `styles.foo` references, `styled.div`` ` ` ` template body with `{?}` placeholder for interpolations
- [ ] `extractComponents({ fullClasses: false })` returns layout-only Tailwind tokens; `{ fullClasses: true }` returns all — verified by file snapshot diff
- [ ] Render-flow fixture with ternary, `&&`, `||`, `??`, `!cond &&`, and `.map(...)` produces a render flow whose snapshot matches the locked shape, with `condition` strings reflecting source text
- [ ] `FrameworkAdapter` interface exports exactly five methods — verified by a static type test
- [ ] `NextJsAdapter.detect`, `.discoverEntries`, `.mapRouteToEntry` each throw `Error("not implemented in Phase 3")` — verified by vitest
- [ ] No file under `src/core/`, `src/ir/`, or `src/renderers/` imports from `src/adapters/` — verified by lint rule or import-graph test
- [ ] `ComponentDefinition` type exports all 11 fields specified in Requirement 8 — verified by a TypeScript structural test

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                     |
|--------------------|-------|------|--------|-----------------------------------------------------------|
| Goal Clarity       | 0.92  | 0.75 | ✓      | 8 falsifiable requirements, output shape locked           |
| Boundary Clarity   | 0.85  | 0.70 | ✓      | P3 vs P4 split locked at 2/5 NextJsAdapter methods        |
| Constraint Clarity | 0.78  | 0.65 | ✓      | Stack + Babel ESM interop + island rule explicit          |
| Acceptance Criteria| 0.78  | 0.70 | ✓      | 12 pass/fail checks, all anchored to fixture files        |
| **Ambiguity**      | 0.15  | ≤0.20| ✓      |                                                           |

Status: ✓ = met minimum, ⚠ = below minimum (planner treats as assumption)

## Interview Log

| Round | Perspective    | Question summary                                            | Decision locked                                                                                |
|-------|----------------|-------------------------------------------------------------|------------------------------------------------------------------------------------------------|
| 1     | Researcher     | Phase 3 / Phase 4 split for NextJsAdapter's 5 methods?      | Phase 3 ships interface + `resolveModule` + `extractComponents`. Other 3 stubbed for Phase 4.  |
| 1     | Researcher     | Run /gsd-research-phase first or lock with prototype + notes?| Lock with prototype + research notes; deeper research is a HOW concern for /gsd-plan-phase.    |
| 1     | Researcher     | Where do acceptance fixtures live?                          | `test/fixtures/parser/` in this repo — unit-level single-TSX fixtures. Full Next.js → P4/P6.   |
| 2     | Boundary Keeper| OUT-03 four extractors — all MUST or some defer?            | All 4 MUST-HAVE; styled-components is best-effort with `{?}` placeholder for interpolations.   |
| 2     | Boundary Keeper| `ComponentDefinition` shape — full / minimal / defer?       | Full shape locked: name/file/line/kind/wrappers/props/textContent/renderFlow + 4 style fields. |
| 2     | Boundary Keeper| Barrel chase boundary — when does resolution stop?          | Stop at: local decl / node_modules boundary (emit external library) / cycle (emit error node). |

---

*Phase: 03-parser-core-ast-resolution-extractors*
*Spec created: 2026-04-29*
*Next step: /gsd-discuss-phase 3 — implementation decisions (parser module layout, style-extractor internal APIs, render-flow tree representation, etc.)*
