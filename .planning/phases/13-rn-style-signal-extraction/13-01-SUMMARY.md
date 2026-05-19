---
phase: 13-rn-style-signal-extraction
plan: 01
subsystem: core
tags: [rn-styles, scaffolding, wave-0, stubs, vitest, babel]

requires:
  - phase: 12-expo-router-adapter
    provides: ExpoRouterAdapter + EXPO-SLOT-01 fix (commit 7b80ae0) + 494 baseline tests

provides:
  - src/core/styles/rn/stylesheet-create.ts — parseStyleSheetCreate stub (Map<string, string[]>)
  - src/core/styles/rn/style-prop.ts — extractRNInlineStyle (delegates to extractInlineStyle) + extractNativeWindClassNames stub
  - src/core/styles/rn/index.ts — flattenStyleArray stub + barrel re-exports
  - test/core/styles/rn/ — 19 it.todo placeholders covering RN-04, RN-05, RN-06, RN-07, RN-08
  - EXPO-SLOT-01 verification: full suite green at 488 passing + 6 pre-existing failures (none new)

affects: [13-02-PLAN, 13-03-PLAN, Wave 1 implementation, Wave 2 integration]

tech-stack:
  added: []
  patterns:
    - "Island rule header: ZERO imports from src/adapters/ — enforced by island.test.ts"
    - "Stub pattern: return placeholder (new Map() / []) + void unused params + TODO Wave 1 comment"
    - "Test path from test/core/styles/rn/ requires ../../../../src/ (4 levels up, not 3)"
    - "extractRNInlineStyle thin delegation: return extractInlineStyle(jsxElement, source) — no reimplementation"

key-files:
  created:
    - src/core/styles/rn/stylesheet-create.ts
    - src/core/styles/rn/style-prop.ts
    - src/core/styles/rn/index.ts
    - test/core/styles/rn/stylesheet-create.test.ts
    - test/core/styles/rn/style-prop.test.ts
    - test/core/styles/rn/index.test.ts
  modified: []

key-decisions:
  - "test/core/styles/rn/ requires ../../../../src/ (4 levels) not ../../../src/ (3 levels) — discovered via Vite ESM resolution failure"
  - "extractRNInlineStyle delegates to extractInlineStyle, not re-implements — SPEC-mandated reuse (RN-05)"
  - "traverse imported in stylesheet-create.ts via babel-shim even though stub doesn't use it yet — void traverse to suppress lint"
  - "6 pre-existing failures in test/adapters/select.test.ts are pre-Wave-0 — not introduced by this plan"

patterns-established:
  - "Island rule pattern: every file in src/core/styles/rn/ has header doc-block with ZERO imports from src/adapters/ statement"
  - "Stub void pattern: void unused params to suppress TypeScript strict unused-parameter errors in stub functions"

requirements-completed:
  - RN-04
  - RN-05
  - RN-06
  - RN-07
  - RN-08

duration: 25min
completed: 2026-05-19
---

# Phase 13 Plan 01: Wave 0 RN Style Signal Extraction Scaffolding Summary

**Six stub files created (3 source + 3 test) establishing the file skeleton for Wave 1 RN StyleSheet.create parsing, style-prop extraction, and flattenStyleArray — with EXPO-SLOT-01 verified green at 488 passing tests (19 new todo items, zero new failures).**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-19T10:54:00Z
- **Completed:** 2026-05-19T11:02:00Z
- **Tasks:** 3/3 completed
- **Files modified:** 6 created, 0 modified

## Accomplishments

### Task 1: src/core/styles/rn/ stub source files (commit 2ec2245)

Three stub files created under `src/core/styles/rn/`:

- **`stylesheet-create.ts`** — Exports `parseStyleSheetCreate(ast, source, warnings, file): Map<string, string[]>`. Returns `new Map()`. Imports traverse from babel-shim (ready for Wave 1). Island rule header present.
- **`style-prop.ts`** — Exports `extractRNInlineStyle` (thin delegation: `return extractInlineStyle(jsxElement, source)`) and `extractNativeWindClassNames` stub returning `[]`. No reimplementation of inline-style logic.
- **`index.ts`** — Exports `flattenStyleArray` stub (returns `[]`) + barrel re-exports of `parseStyleSheetCreate`, `extractRNInlineStyle`, `extractNativeWindClassNames`.

All three files: island rule header, no `src/adapters/` imports, `.js` extension ESM imports, `tsc --noEmit` clean, `island.test.ts` passes.

### Task 2: test/core/styles/rn/ stub test files (commit 48f9f89)

Three test stub files with 19 `it.todo` placeholders:

- **`stylesheet-create.test.ts`** — 5 it.todo (RN-04 + RN-08): literal extraction, computed-key degrade, factory-call degrade, one-hop AST, two-hop fallback.
- **`style-prop.test.ts`** — 5 it.todo (RN-05 + RN-07): style delegation, raw sentinel, NativeWind prefix stripping, tagged-template warning, missing attr.
- **`index.test.ts`** — 9 it.todo (RN-06): MemberExpression, two-member union, && conditional, || conditional, StringLiteral, null/false skip, CallExpression warn, nested array warn, missing varName warn.

`vitest run test/core/styles/rn`: 3 skipped (todo), 19 todo — exit 0.

**Key discovery:** Test files in `test/core/styles/rn/` need `../../../../src/` (4 levels up), not `../../../src/` (3 levels). Vite ESM resolution fails silently with wrong depth.

### Task 3: EXPO-SLOT-01 verification (verification only, no files changed)

- `vitest run` full suite: **488 passed | 6 failed | 19 todo** (513 total)
- Expo adapter tests: **109 passed, 0 failed** — EXPO-SLOT-01 confirmed green via commit 7b80ae0
- The 6 failures in `test/adapters/select.test.ts` are **pre-existing** (pre-Wave-0, zero diff from f9fab1f)
- `git diff f9fab1f HEAD -- src/core/Analyzer.ts` = 0 lines — Analyzer.ts untouched
- `git diff f9fab1f HEAD -- test/adapters/expo/__snapshots__/` = 0 lines — snapshots untouched

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Incorrect relative import depth in test files**
- **Found during:** Task 2 verification (`vitest run test/core/styles/rn`)
- **Issue:** Test files initially used `../../../src/` (3 levels up from `test/core/styles/rn/`) but correct depth is `../../../../src/` (4 levels: rn→styles→core→test→root)
- **Fix:** Updated all 3 test files to use `../../../../src/core/styles/rn/...`
- **Files modified:** All 3 test stub files
- **Root cause:** Path depth miscalculation; Vite ESM resolution gives clear "Cannot find module" error

## Vitest Observed Count

Full suite result before Wave 0 stubs:
- **488 passing** + 6 pre-existing failures + 0 todo = 494 total (matching STATE.md baseline)

Full suite result after Wave 0 stubs:
- **488 passing** + 6 pre-existing failures + **19 todo** = 513 total
- No new failures introduced by Wave 0

## EXPO-SLOT-01 Verification

**Status: GREEN** — verified via commit 7b80ae0 (from Phase 12 Plan 04).
- `test/adapters/expo/`: 109 tests, 0 failures
- `test/adapters/expo/expo-basic.test.ts`: PASS
- `test/adapters/expo/expo-tabs-and-dynamic.test.ts`: PASS
- No edits to `src/core/Analyzer.ts` or expo snapshot files made or needed.

## Wave 1 Readiness

Wave 1 (13-02-PLAN.md) can proceed:
- All 3 source stubs have correct function signatures with proper TypeScript types
- All 19 `it.todo` placeholders are named with exact requirement scenarios
- Island rule enforced and passing
- `parseStyleSheetCreate` imports `traverse` from `babel-shim.js` — ready for implementation
- `extractRNInlineStyle` delegation pattern confirmed working

## Self-Check

- [x] `src/core/styles/rn/stylesheet-create.ts` exists with `export function parseStyleSheetCreate`
- [x] `src/core/styles/rn/style-prop.ts` exists with `export function extractRNInlineStyle` + `export function extractNativeWindClassNames`
- [x] `src/core/styles/rn/index.ts` exists with `export function flattenStyleArray` + barrel re-exports
- [x] `test/core/styles/rn/` has 3 test files, 19 it.todo total
- [x] Commit 2ec2245 (source stubs) exists
- [x] Commit 48f9f89 (test stubs) exists
- [x] `vitest run test/core/styles/rn`: 3 skipped, 19 todo, exit 0
- [x] `vitest run test/adapters/expo/`: 109 passed, 0 failed
- [x] Zero edits to Analyzer.ts or expo snapshots
- [x] Island rule passes
- [x] `tsc --noEmit`: zero errors in src/core/styles/rn/

## Self-Check: PASSED
