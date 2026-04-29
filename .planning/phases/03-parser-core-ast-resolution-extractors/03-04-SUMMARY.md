---
phase: 03-parser-core-ast-resolution-extractors
plan: 04
subsystem: core/extractors
tags: [extractors, tailwind, inline-style, css-modules, styled-components, OUT-02, OUT-03]
requires:
  - 03-01 (ClassToken, CssModuleRef, StyledTemplate, ParseContext types)
  - 03-02 (parseFile primitive driving fixtures in tests)
provides:
  - "src/core/extractors/tailwind/{layout-prefixes,resolve-args,index}.ts"
  - "src/core/extractors/{inline-style,css-module,styled,index}.ts"
  - "collectStyleSignals orchestrator for NextJsAdapter (Plan 06)"
affects:
  - "Plan 06 (NextJsAdapter) consumes collectStyleSignals to populate ComponentDefinition style fields"
tech-stack:
  added: []
  patterns:
    - "Pure-function extractors driven by @babel/types guards + babel-shim traverse"
    - "Layout filter via prefix-list + repeat-strip variant regex (D-08)"
    - "Raw source slice fallback for non-resolvable expressions (D-09)"
    - "Identifier-based styled-components detection with {?} placeholder (D-10)"
key-files:
  created:
    - "src/core/extractors/tailwind/layout-prefixes.ts"
    - "src/core/extractors/tailwind/resolve-args.ts"
    - "src/core/extractors/tailwind/index.ts"
    - "src/core/extractors/inline-style.ts"
    - "src/core/extractors/css-module.ts"
    - "src/core/extractors/styled.ts"
    - "src/core/extractors/index.ts"
    - "test/core/extractors/tailwind.test.ts"
    - "test/core/extractors/inline-style.test.ts"
    - "test/core/extractors/css-module.test.ts"
    - "test/core/extractors/styled.test.ts"
    - "test/fixtures/parser/extractors/kitchen-sink.tsx"
    - "test/fixtures/parser/extractors/tailwind-only.tsx"
    - "test/fixtures/parser/extractors/inline-style.tsx"
    - "test/fixtures/parser/extractors/css-module.tsx"
    - "test/fixtures/parser/extractors/styled.tsx"
  modified:
    - "tsconfig.json (excluded extractor fixtures from typecheck)"
decisions:
  - "Excluded test/fixtures/parser/extractors/** from tsconfig; the .tsx files are intentionally invalid as standalone TS (no JSX flag, missing modules) — they are parsed by parseFile, not compiled."
metrics:
  duration: ~10m
  completed: 2026-04-29
requirements: [OUT-02, OUT-03]
---

# Phase 03 Plan 04: Style Extractors Summary

Implements OUT-02 (Tailwind layout-only filter) and OUT-03 (the four style extractors locked by SPEC R5: Tailwind / inline-style / CSS Modules / styled-components) plus the `collectStyleSignals` orchestrator consumed by NextJsAdapter (Plan 06).

## What Shipped

**Tailwind (`src/core/extractors/tailwind/`):**
- `layout-prefixes.ts` — D-08 LAYOUT_PREFIXES list, VARIANT_PREFIX_RE (`^(?:\[[^\]]+\]|[a-zA-Z0-9_-]+):`), `stripVariants`, `isLayoutClass`, `filterLayoutClasses`. Prefixes ending in `-` match by `startsWith`; bare prefixes match exact-or-`prefix-`-prefixed.
- `resolve-args.ts` — `collectClassTokens` walks the className expression: `StringLiteral`, interpolation-free `TemplateLiteral`, `cn`/`clsx`/`cva`/`twMerge` `CallExpression`, `ArrayExpression`, `ObjectExpression` (truthy-literal keys → literal tokens). Anything else collapses to `{ kind: "raw", source }` — the slice of the original source.
- `index.ts` — `extractTailwindClasses(jsxElement, source, file, { fullClasses })`. Default `fullClasses=false` filters to layout literals + all raw tokens; `fullClasses=true` returns everything.

**Inline style (`src/core/extractors/inline-style.ts`):**
- Captures `style={{...}}` literal pairs as a Record. `string`/`number`/`boolean`/`null` literals stringify; computed/member/call values become `{ raw }`. Spread elements are surfaced under synthetic `__spread_<offset>` keys.

**CSS Modules (`src/core/extractors/css-module.ts`):**
- Two-pass file walk: first pass registers `import x from "./X.module.{css,scss,sass}"` (default + namespace) bindings; second pass emits one `CssModuleRef` per `binding.key` member access.

**styled-components (`src/core/extractors/styled.ts`):**
- D-10 identifier-based detection: `styled.<tag>` MemberExpression or `styled(<expr>)` CallExpression. `${...}` interpolations replaced with literal `{?}` in the captured body.

**Orchestrator (`src/core/extractors/index.ts`):**
- `collectStyleSignals(ast, jsxElements, source, file, opts)` returns `{ classNames, inlineStyles, cssModuleRefs, styledTemplates }`. Tailwind + inline are per-element; CSS Modules + styled-components are file-level. `fullClasses` flows only to Tailwind.

## Tests

7 tests across 4 files, all passing:
- `tailwind.test.ts` (4 tests) — variant strip, layout classification, fullClasses=false filter, fullClasses=true bypass.
- `inline-style.test.ts` — literal vs. raw values, spread surfaced as synthetic key.
- `css-module.test.ts` — default and namespace imports, three refs detected.
- `styled.test.ts` — `styled.div` and `styled(Box)` capture, `{?}` placeholder.

`kitchen-sink.tsx` fixture is in place for Plan 06's NextJsAdapter end-to-end test (no test in this plan).

## Decisions

- **tsconfig exclusion of extractor fixtures.** The `.tsx` fixtures intentionally reference modules that don't exist (`./cn`, `./Component.module.css`, `styled-components`) — they are inputs to `parseFile`, not compiled units. Added `test/fixtures/parser/extractors/**` to `tsconfig.exclude` (mirroring the existing `parse-errors/**` exclusion).
- **Adapter island invariant preserved.** All references to `ClassToken`, `CssModuleRef`, `StyledTemplate` from `src/core/extractors/` are `import type` only, with the same biome-ignore comment pattern Plan 02 established. No runtime edge from `src/core/` to `src/adapters/`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `noUncheckedIndexedAccess` strict-mode error in styled.ts**
- **Found during:** Task 2 typecheck.
- **Issue:** `quasi.quasis[i].value.cooked` triggered "Object is possibly undefined" because tsconfig has `noUncheckedIndexedAccess: true`.
- **Fix:** Bound `quasi.quasis[i]` to a local `q`, guarded with `if (q)` before access.
- **File:** `src/core/extractors/styled.ts`
- **Commit:** dd48f09

**2. [Rule 3 - Blocking] Fixtures broke project-wide typecheck**
- **Found during:** Task 3 typecheck.
- **Issue:** New `.tsx` fixtures lacked JSX support / referenced unresolvable modules; `tsc --noEmit` failed across the project.
- **Fix:** Added `test/fixtures/parser/extractors/**` to `tsconfig.exclude`, matching the existing `parse-errors/**` pattern.
- **File:** `tsconfig.json`
- **Commit:** 75e0dd3

## Out of Scope (Pre-existing)

- `test/mcp/smoke.spawn.test.ts` fails on Windows in this worktree (unrelated to extractors). Logged as out of scope per scope-boundary rule.

## Self-Check: PASSED

**Files exist:**
- src/core/extractors/tailwind/layout-prefixes.ts: FOUND
- src/core/extractors/tailwind/resolve-args.ts: FOUND
- src/core/extractors/tailwind/index.ts: FOUND
- src/core/extractors/inline-style.ts: FOUND
- src/core/extractors/css-module.ts: FOUND
- src/core/extractors/styled.ts: FOUND
- src/core/extractors/index.ts: FOUND
- test/core/extractors/{tailwind,inline-style,css-module,styled}.test.ts: FOUND
- test/fixtures/parser/extractors/{tailwind-only,inline-style,css-module,styled,kitchen-sink}.tsx: FOUND

**Commits exist:**
- acc5465 (Task 1 — Tailwind extractor): FOUND
- dd48f09 (Task 2 — three extractors + orchestrator): FOUND
- 75e0dd3 (Task 3 — fixtures + tests + tsconfig): FOUND

**Verification:**
- `npx tsc --noEmit` exits 0
- `npx biome check src/core/extractors/` exits 0
- `npx vitest run test/core/extractors/` — 7/7 pass
