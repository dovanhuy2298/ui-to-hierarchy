---
phase: 12
plan: "01"
subsystem: core-utility-extraction
tags:
  - import-bindings
  - test-stubs
  - refactor
  - tdd-red
dependency_graph:
  requires: []
  provides:
    - src/core/import-bindings.ts
    - test/adapters/expo/*.test.ts (5 RED stubs)
  affects:
    - src/core/Analyzer.ts
tech_stack:
  added: []
  patterns:
    - core utility extraction (private → exported module)
    - RED test stub scaffolding (it.todo pattern)
key_files:
  created:
    - src/core/import-bindings.ts
    - test/adapters/expo/segments.test.ts
    - test/adapters/expo/discover.test.ts
    - test/adapters/expo/route-map.test.ts
    - test/adapters/expo/rn-primitives.test.ts
    - test/adapters/expo/ExpoRouterAdapter.test.ts
  modified:
    - src/core/Analyzer.ts
decisions:
  - "collectImportBindings extracted verbatim; both interface and function become top-level exports"
  - "Analyzer.ts imports from ./import-bindings.js; all call sites (collectChildrenSlotLines, buildTreeForEntry) left untouched"
  - "RED stubs use it.todo() pattern exclusively — no real imports from not-yet-existing source files"
metrics:
  duration: "~8 minutes"
  completed: "2026-05-19"
  tasks: 2
  files: 7
---

# Phase 12 Plan 01: Foundation Wave — import-bindings Extraction + RED Stubs Summary

**One-liner:** Extracted `collectImportBindings` + `ImportBinding` from `Analyzer.ts` to new shared core utility `src/core/import-bindings.ts`, and scaffolded five RED test stub files for Wave 1/2 implementation targets.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extract collectImportBindings to src/core/import-bindings.ts | 1c4cfaa | src/core/import-bindings.ts, src/core/Analyzer.ts |
| 2 | Scaffold five RED test stubs under test/adapters/expo/ | 665f85e | 5 new test files |

## What Was Built

### Task 1: Core Utility Extraction

Created `src/core/import-bindings.ts` containing:
- `export interface ImportBinding { source: string; importedName: string; }`
- `export function collectImportBindings(ast: t.File): Map<string, ImportBinding>`

The function was moved verbatim from `src/core/Analyzer.ts` lines 135–160. Both symbols are now top-level exports.

`src/core/Analyzer.ts` changes:
- Added `import { collectImportBindings } from "./import-bindings.js"` and `import type { ImportBinding } from "./import-bindings.js"`
- Removed the private `interface ImportBinding` declaration
- Removed the private `function collectImportBindings` block
- **Left untouched:** two call sites — `collectChildrenSlotLines` (line ~1159) and `buildTreeForEntry` (line ~819) — same identifiers, same signatures, net-zero behavior

### Task 2: RED Test Stubs

Five RED stub files created under `test/adapters/expo/`:

| File | Describe Blocks | it.todo Count | Covers |
|------|----------------|---------------|--------|
| segments.test.ts | parseSegment | 8 | ROUTE-03 |
| discover.test.ts | resolveExpoRoot, discoverEntries | 9 | ROUTE-01 |
| route-map.test.ts | enumerateRoutes, mapRouteToEntry | 7 | ROUTE-04, ROUTE-05 |
| rn-primitives.test.ts | isRNPrimitive, RN_PRIMITIVES allowlist | 16 | SPEC-09/10/11 |
| ExpoRouterAdapter.test.ts | classifyEntry, Slot injection, Tabs/Stack walker, namespace warning, Text extraction, snapshots | 17 | D-01/D-02/D-03 |

**Total:** 57 `it.todo` items, 0 failures, 0 imports from not-yet-existing modules.

## Test Counts Before/After

| State | Passing | Todos | Failures |
|-------|---------|-------|----------|
| Before (baseline) | 389 | 0 | 0 |
| After Task 1 | 389 | 0 | 0 |
| After Task 2 | 389 | 56 | 0 |

Regression invariant maintained: net-zero behavior change. Architecture island test (`test/architecture/island.test.ts`) passes — `src/core/import-bindings.ts` contains zero `src/adapters/` imports.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Flags

None — this plan performs refactoring and test scaffolding only. No new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

- `src/core/import-bindings.ts` exists: YES
- `export function collectImportBindings` at line 24: YES  
- `export interface ImportBinding` at line 19: YES
- No `../adapters` imports in import-bindings.ts: CONFIRMED
- No `@babel/traverse` direct imports: CONFIRMED
- Analyzer.ts imports from `./import-bindings.js`: CONFIRMED (lines 26-27)
- Analyzer.ts has no local declarations of collectImportBindings or ImportBinding: CONFIRMED (grep returns 0)
- All 5 test stub files exist: CONFIRMED
- `npx vitest run` exits 0 with 389 tests passing: CONFIRMED
- `npx vitest run test/architecture/island.test.ts` exits 0: CONFIRMED
- `npx vitest run test/adapters/expo/` exits 0 (todos pending, not failing): CONFIRMED
- Commits 1c4cfaa and 665f85e exist in git log: CONFIRMED
