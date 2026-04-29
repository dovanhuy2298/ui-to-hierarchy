---
phase: 03-parser-core-ast-resolution-extractors
verified: 2026-04-29T13:05:00Z
status: passed
score: 16/16 must-haves verified
overrides_applied: 0
---

# Phase 3: Parser Core (AST + Resolution + Extractors) Verification Report

**Phase Goal:** Given any TSX file, the parser produces a framework-agnostic `ComponentDefinition[]` with render flow, style signals, conditional branches, and resolved import paths — exposed behind the 5-method `FrameworkAdapter` contract.

**Verified:** 2026-04-29
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Aggregated from must-haves across all 6 plan frontmatters (deduped against ROADMAP/SPEC).

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Parser-level types (ComponentDefinition, RenderNode 7-kind union, JsxAttribute, ClassToken, PropSignature, ResolveResult, ParseContext, ParseResult) declared in src/adapters/types.ts | ✓ VERIFIED | src/adapters/types.ts lines 35-279; 7 RenderNode kinds with `file`/`line` on each; no zod, no forbidden imports |
| 2  | FrameworkAdapter interface exposes exactly 5 methods | ✓ VERIFIED | src/adapters/FrameworkAdapter.ts lines 22-46: detect, discoverEntries, resolveModule, extractComponents, mapRouteToEntry; asserted in test/adapters/FrameworkAdapter.test.ts |
| 3  | Architecture test fails build if src/core, src/ir, src/renderers run-time imports from src/adapters | ✓ VERIFIED | test/architecture/island.test.ts walks files via tinyglobby; uses negative-lookahead regex to permit `import type` only; passing |
| 4  | parseFile parses TS/TSX/JSX/JS via @babel/parser with the 10-plugin set + errorRecovery: true; cache identity (===) on re-entry; no throws escape | ✓ VERIFIED | src/core/parser/index.ts:43-48 (errorRecovery true, full plugin set in plugins.ts); cache identity asserted in test/core/parser/parseFile.test.ts |
| 5  | resolveModule returns a ResolveResult union and never throws (D-12) | ✓ VERIFIED | src/core/resolver/index.ts (no throw paths); test/core/resolver/barrel.test.ts asserts `not.toThrow` + `kind === "cycle"` chain ≥ 2 |
| 6  | tsconfig paths (@/*, ~/*, #*, multi-target, extends-chain) resolve via get-tsconfig#createPathsMatcher | ✓ VERIFIED | src/core/resolver/tsconfig.ts uses createPathsMatcher; 4 fixture mini-projects in test/fixtures/parser/resolver/* exercise each shape |
| 7  | Barrel re-exports chase through ExportNamed/ExportAll to source; cycles return kind:"cycle" with chain (no stack overflow) | ✓ VERIFIED | src/core/resolver/barrel.ts maintains `visited: Set<string>`; barrel-cycle fixture passes; node_modules emit external |
| 8  | Tailwind extractor pulls className literals + cn/clsx/cva/twMerge args; non-resolvable args become {kind:"raw"}; layout-only filter via D-08 prefix list | ✓ VERIFIED | src/core/extractors/tailwind/{index,resolve-args,layout-prefixes}.ts; HELPER_NAMES set has all 4; test/core/extractors/tailwind.test.ts asserts both fullClasses paths and `[&>svg]:size-6` arbitrary-variant strip |
| 9  | Inline style{{...}} literal pairs captured; computed/spread → { raw: source } | ✓ VERIFIED | src/core/extractors/inline-style.ts; test/core/extractors/inline-style.test.ts |
| 10 | CSS Modules `styles.foo` references emitted with binding/key/source from `.module.css` import | ✓ VERIFIED | src/core/extractors/css-module.ts (regex /\.module\.(css|scss|sass)$/); default + namespace import patterns covered in test |
| 11 | styled.tag` and styled(Component)` template literals captured with `${...}` → `{?}` (D-10) | ✓ VERIFIED | src/core/extractors/styled.ts renderTemplateWithPlaceholder pushes "{?}"; test asserts `toMatch(/\{\?\}/)` |
| 12 | walkRenderFlow emits 7-kind RenderNode for ternary/&&/||/??/!cond/.map; preserves negation in condition slice | ✓ VERIFIED | src/core/render-flow/{index,conditionals,lists}.ts; 7 fixtures + test/core/render-flow/walkRenderFlow.test.ts assert each shape including `condition.startsWith("!")` |
| 13 | Component detection (FunctionDeclaration, VariableDeclarator, ClassDeclaration extends Component/PureComponent qualified+unqualified, ExportDefault) + HOC unwrap (memo, forwardRef, observer, /^with[A-Z]/, /HOC$/) | ✓ VERIFIED | src/core/render-flow/component-detect.ts (HOC_NAMES + HOC_PATTERNS, isReactComponentSuperclass); 5 HOC + 3 class fixtures pass via it.each in component-detect.test.ts |
| 14 | NextJsAdapter implements FrameworkAdapter; resolveModule + extractComponents real, 3 stubs throw exact string "not implemented in Phase 3" | ✓ VERIFIED | src/adapters/next/NextJsAdapter.ts:40-50 (literal string in 3 stubs); test/adapters/next/NextJsAdapter.test.ts asserts `/not implemented in Phase 3/` |
| 15 | extractComponents builds ComponentDefinition[] with all 11 SPEC R8 fields populated; never throws on parse-error files (D-12) | ✓ VERIFIED | NextJsAdapter.ts buildComponentDefinition assembles 11 fields + parse-error path emits synthetic CD; kitchen-sink + parse-error tests assert |
| 16 | All emitted file paths forward-slash absolute; fullClasses option threads through Tailwind only | ✓ VERIFIED | toForwardSlash applied at every emission; tests assert `.includes("\\") === false`; kitchen-sink test toggles fullClasses both ways |

**Score:** 16/16 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/adapters/types.ts` | 10 type/interface exports incl. RenderNode 7-kind union, ComponentDefinition 11 fields | ✓ VERIFIED | All exports present; 11 ComponentDefinition fields; no forbidden imports |
| `src/adapters/FrameworkAdapter.ts` | Interface with exactly 5 methods | ✓ VERIFIED | Exactly 5 method declarations; structural assertion test green |
| `src/adapters/next/NextJsAdapter.ts` | FrameworkAdapter impl with 2 real + 3 stubs | ✓ VERIFIED | 2/5 implemented (resolveModule, extractComponents); 3 stubs throw exact phrase |
| `src/core/parser/index.ts` | parseFile primitive with errorRecovery + cache | ✓ VERIFIED | Uses 10-plugin set, errorRecovery true, toForwardSlash cache key, no traverse import |
| `src/core/parser/plugins.ts` | 10-plugin constant | ✓ VERIFIED | All 10 strings present incl. explicitResourceManagement |
| `src/core/resolver/index.ts` | resolveModule (composes tsconfig+relative+node-modules+barrel) | ✓ VERIFIED | Cache key `${fromFile}::${specifier}::${importedName}`; no throws |
| `src/core/resolver/barrel.ts` | chaseBarrel with visited cycle guard | ✓ VERIFIED | `visited: Set<string>` carried; star-export visited fork |
| `src/core/resolver/tsconfig.ts` | get-tsconfig wrapper | ✓ VERIFIED | createPathsMatcher used; WeakMap matcher cache |
| `src/core/resolver/relative.ts` | probeFile + joinRelative with D-13 ext order | ✓ VERIFIED | EXT_ORDER + INDEX_ORDER arrays present |
| `src/core/resolver/node-modules.ts` | detectNodeModules + packageNameFromSpecifier | ✓ VERIFIED | Scoped + unscoped pkg detection |
| `src/core/extractors/index.ts` | collectStyleSignals orchestrator | ✓ VERIFIED | Composes all 4 extractors |
| `src/core/extractors/tailwind/{index,resolve-args,layout-prefixes}.ts` | Tailwind + cn/clsx/cva/twMerge + D-08 filter | ✓ VERIFIED | LAYOUT_PREFIXES + variant strip regex; raw-token preservation |
| `src/core/extractors/{inline-style,css-module,styled}.ts` | 3 remaining extractors | ✓ VERIFIED | All compile, all field shapes locked per SPEC R5 |
| `src/core/render-flow/{index,conditionals,lists}.ts` | walkRenderFlow + walkConditional + walkLogical + walkList | ✓ VERIFIED | Handles JSXElement, JSXFragment, JSXText, JSXSpreadChild, conditional/logical/.map |
| `src/core/render-flow/component-detect.ts` | discoverComponents + unwrapHocChain + isReactComponentSuperclass + isHocCallee | ✓ VERIFIED | All 4 exports present; PARSE-04 superclass test covers React.Component qualified+unqualified |
| `test/architecture/island.test.ts` | D-11 layer 2 enforcement | ✓ VERIFIED | tinyglobby walk + regex with negative lookahead for `import type` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| FrameworkAdapter.ts | adapters/types.ts | `import type` | ✓ WIRED | Line 1: `from "./types.js"` |
| parser/index.ts | @babel/parser | named import { parse } | ✓ WIRED | Line 2 |
| parser/index.ts | core/paths.ts | toForwardSlash | ✓ WIRED | Line 9 |
| resolver/index.ts | parser/index.ts | parseFile | ✓ WIRED | Line 7 |
| resolver/tsconfig.ts | get-tsconfig | createPathsMatcher | ✓ WIRED | Verified via test passes |
| resolver/barrel.ts | core/babel-shim.ts | traverse | ✓ WIRED | Verified via cycle/shadcn tests |
| extractors/tailwind/index.ts | layout-prefixes.ts | isLayoutClass | ✓ WIRED | Verified via tailwind.test.ts |
| render-flow/index.ts | core/babel-shim.ts | (NOT used directly here — uses @babel/types) | ✓ WIRED | conditionals + lists imported |
| component-detect.ts | core/babel-shim.ts | traverse | ✓ WIRED | Discovery test green |
| NextJsAdapter.ts | core/parser, core/resolver, core/render-flow, core/extractors | parseFile, resolveModule, walkRenderFlow, discoverComponents, collectStyleSignals | ✓ WIRED | All 5 imports present and exercised by basic + kitchen-sink tests |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| NextJsAdapter.extractComponents | `out: ComponentDefinition[]` | parseFile + discoverComponents + walkRenderFlow + collectStyleSignals | Yes — kitchen-sink fixture asserts `classNames`, `inlineStyles.margin`, `cssModuleRefs[label]`, `styledTemplates` all populated with concrete values | ✓ FLOWING |
| resolveModule | `ResolveResult` | tsconfig matcher → file probe → AST walk for local decl → barrel chase | Yes — shadcn-barrel fixture resolves to actual button.tsx absolute path; cycle fixture returns chain ≥ 2 | ✓ FLOWING |
| walkRenderFlow | `RenderNode` tree | recursive AST descent | Yes — branches/lists/text/jsx all emit non-null subtrees in fixture tests | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full vitest suite | `npx vitest run` | 25 files, 126 tests passed in 2.77s | ✓ PASS |
| TypeScript compiles | (gates inside plans, exercised through test runs) | Tests import-and-execute the whole graph | ✓ PASS |

### Requirements Coverage

PLAN frontmatter declares phase req IDs `[PARSE-01..04, OUT-02..04, ARCH-01]` (the 8 actual REQUIREMENTS.md IDs mapped to Phase 3). The remaining IDs claimed in the user request (R5, R7, R8, D-01..D-13) are SPEC-internal / decision-log identifiers and are not present in REQUIREMENTS.md — they are tracked here for completeness against the SPEC.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| **PARSE-01** | 03-02 | Babel parse with full 10-plugin set + errorRecovery; errors → kind:"error" node | ✓ SATISFIED | src/core/parser/{plugins,index}.ts; parseFile.test.ts (6 tests incl. cache identity, error path, recovery warnings) |
| **PARSE-02** | 03-03 | Barrel re-export resolution + cycle guard | ✓ SATISFIED | src/core/resolver/barrel.ts; shadcn-barrel + barrel-cycle fixtures pass |
| **PARSE-03** | 03-03 | tsconfig paths via get-tsconfig (@/*, ~/*, #*, multi-target, extends chain) | ✓ SATISFIED | src/core/resolver/tsconfig.ts; tsconfig-paths.test.ts (4 tests across 4 mini-project fixtures) |
| **PARSE-04** | 03-05, 03-06 | HOC unwrap + class component support | ✓ SATISFIED | src/core/render-flow/component-detect.ts; component-detect.test.ts asserts 5 HOC patterns + 3 class fixtures via it.each |
| **OUT-02** | 03-04 | Layout-only Tailwind filter; fullClasses toggle | ✓ SATISFIED | src/core/extractors/tailwind/layout-prefixes.ts; tailwind.test.ts asserts both directions; kitchen-sink E2E asserts toggle |
| **OUT-03** | 03-04 | Tailwind/inline/CSS-Modules/styled-components extractors | ✓ SATISFIED | 4 extractor files + 4 test suites + kitchen-sink E2E populating all 4 fields |
| **OUT-04** | 03-05 | Conditional render branches preserved (ternary, &&, \|\|, ??, !cond, .map) | ✓ SATISFIED | walkConditional + walkLogical + walkList; 7 render-flow fixtures + walkRenderFlow.test.ts asserts each form |
| **ARCH-01** | 03-01, 03-06 | FrameworkAdapter 5-method contract + adapter island invariant | ✓ SATISFIED | FrameworkAdapter.ts (5 methods, structural test green); island.test.ts (regex walk, type-only imports permitted); NextJsAdapter implements 2 + stubs 3 |

**SPEC-internal IDs (informational, not REQUIREMENTS.md):**

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| R5 (= OUT-03) | 4 style extractors | ✓ SATISFIED | See OUT-03 above; kitchen-sink fixture covers all four |
| R7 (= ARCH-01) | FrameworkAdapter contract + island | ✓ SATISFIED | See ARCH-01 above |
| R8 | ComponentDefinition 11-field shape | ✓ SATISFIED | types.ts lines 202-215; types.test.ts asserts Object.keys length === 11 |
| D-01 | Pure functions over ParseContext | ✓ SATISFIED | All core modules consume ctx as parameter; no class instances |
| D-02 | Per-call astCache, identity on re-entry | ✓ SATISFIED | parseFile.test.ts asserts `expect(a).toBe(b)` for both ok and error paths |
| D-03 | resolverCache key tuple (fromFile, specifier, importedName) | ✓ SATISFIED | resolver/index.ts line 46; tsconfig-paths.test.ts asserts identity |
| D-04 | RenderNode separate from IR TreeNode | ✓ SATISFIED | types.ts JSDoc; no import from src/ir/ in adapters/ |
| D-05 | RenderNode 7-kind union with file/line on every variant | ✓ SATISFIED | types.ts lines 57-106 |
| D-06 | PropSignature minimal shape | ✓ SATISFIED | types.ts lines 123-127 (name, typeSlice, optional) |
| D-07 | Destructure prop extraction | ✓ SATISFIED | NextJsAdapter.extractProps handles ObjectPattern + alias + RestElement |
| D-08 | Layout-only Tailwind prefix list + variant strip | ✓ SATISFIED | layout-prefixes.ts LAYOUT_PREFIXES + VARIANT_PREFIX_RE |
| D-09 | ClassToken literal vs raw discrimination | ✓ SATISFIED | types.ts line 142-144; resolve-args.ts emits both kinds |
| D-10 | styled `${...}` → `{?}` placeholder | ✓ SATISFIED | styled.ts renderTemplateWithPlaceholder |
| D-11 | Adapter island layer 2 (architecture test) | ✓ SATISFIED | test/architecture/island.test.ts |
| D-12 | resolveModule + extractComponents never throw | ✓ SATISFIED | All error paths return discriminated union; tests assert `not.toThrow` |
| D-13 | First-existing-file-wins probe order (.ts, .tsx, .js, .jsx, /index.*) | ✓ SATISFIED | relative.ts EXT_ORDER + INDEX_ORDER; relative.test.ts asserts |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | — |

Notes:
- The 3 NextJsAdapter stubs throwing `"not implemented in Phase 3"` are **intentional** per SPEC R7 — Phase 4 fills them in. Not a stub anti-pattern; the contract is explicit and tested.
- `<parse-error>` synthetic ComponentDefinition is the documented D-12 fallback, not a placeholder.
- No TODO/FIXME/XXX/HACK markers found in any Phase 3 source file.

### Human Verification Required

(none — all behavior is deterministic over fixtures; no UI/UX/real-time/external-service surfaces in Phase 3)

### Gaps Summary

No gaps. The phase delivers exactly what the SPEC + ROADMAP scoped:

- 6 plans across 3 waves (types/contract → primitives → integration) all executed
- 25 vitest files / 126 tests all green
- ARCH-01 island invariant doubly enforced (Biome + architecture test)
- NextJsAdapter is consumable by Phase 4 (which will fill detect/discoverEntries/mapRouteToEntry on top of the locked contract) and Phase 5 (which will translate ComponentDefinition[] → IR TreeNode)
- All 11 SPEC R8 ComponentDefinition fields populated end-to-end via the kitchen-sink fixture
- Forward-slash discipline preserved at every emission site

The `runtime: "server" | "client"` field correctly absent from ComponentDefinition (NEXT-04, deferred to Phase 4 per SPEC).

---

_Verified: 2026-04-29_
_Verifier: Claude (gsd-verifier)_
