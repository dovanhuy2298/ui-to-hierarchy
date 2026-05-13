---
phase: "10-interface-widening-analyzer-de-next-ification"
plan: "01"
subsystem: adapters
tags: [interface, tdd, contract, framework-adapter]
dependency_graph:
  requires: []
  provides: [FrameworkAdapter-8-method-contract, NextJsAdapter-red-tests]
  affects: [src/adapters/next/NextJsAdapter.ts, src/core/Analyzer.ts]
tech_stack:
  added: []
  patterns: [Record-keyof-exhaustive-check, TDD-red-green]
key_files:
  created:
    - test/adapters/NextJsAdapter.test.ts
  modified:
    - src/adapters/FrameworkAdapter.ts
    - test/adapters/FrameworkAdapter.test.ts
decisions:
  - FrameworkAdapter widened from 5 to 8 methods; locking test updated atomically to prevent compile errors
  - NextJsAdapter tests written in RED state — classifyEntry, enumerateRoutes, slotMarker not yet implemented
metrics:
  duration: "~10 minutes"
  completed: "2026-05-13T04:43:11Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 10 Plan 01: FrameworkAdapter Interface Widening + RED Tests Summary

**One-liner:** Widened FrameworkAdapter interface from 5 to 8 methods (classifyEntry, enumerateRoutes, slotMarker) with updated structural locking test and RED-state unit tests for NextJsAdapter.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Widen FrameworkAdapter to 8 methods + update locking test | b8e6fe9 | src/adapters/FrameworkAdapter.ts, test/adapters/FrameworkAdapter.test.ts |
| 2 | Create NextJsAdapter unit tests for 3 new methods (RED) | 25592a5 | test/adapters/NextJsAdapter.test.ts |

## What Was Built

### Task 1: FrameworkAdapter Interface Widening

`src/adapters/FrameworkAdapter.ts` extended from 5 to 8 methods:

- `classifyEntry(absPath: string): "page" | "layout" | "special" | "other"` — classifies entry files by routing role
- `enumerateRoutes(absRoot: string): string[] | Promise<string[]>` — enumerates all route strings
- `slotMarker(name: string, importSource: string): boolean` — detects slot injection points (Next.js: `children`; Expo Router: `Slot` from `expo-router`)

Doc comment updated: replaced "Adding a 6th method requires a milestone amendment" with "8-method set locked by Phase 10 SPEC (10-SPEC.md)".

`test/adapters/FrameworkAdapter.test.ts` updated: Record stub expanded from 5 to 8 keys; `toHaveLength(5)` replaced with `toHaveLength(8)`; alphabetically sorted key list updated.

**Verification:** `vitest run test/adapters/FrameworkAdapter.test.ts` exits 0 (PASS).

### Task 2: NextJsAdapter RED Tests

`test/adapters/NextJsAdapter.test.ts` created with 11 test cases across 3 describe blocks:

- `NextJsAdapter.classifyEntry` (6 tests): page/layout/special/other classification + Pitfall 1 regression guard (`layout.tsx` must NOT return `"special"`)
- `NextJsAdapter.slotMarker` (4 tests): `children`→true regardless of importSource, `Slot/expo-router`→false, non-children names→false
- `NextJsAdapter.enumerateRoutes` (1 test): smoke test against expo-basic fixture — sorted array, no parallel-route (`@`) or private-folder (`_`) entries

**Verification:** `vitest run test/adapters/NextJsAdapter.test.ts` exits non-zero (RED — `classifyEntry is not a function`). Implementations land in Plan 02.

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

1. `vitest run test/adapters/FrameworkAdapter.test.ts` — EXIT 0 (locking test PASS)
2. `vitest run test/adapters/NextJsAdapter.test.ts` — EXIT non-zero (RED state, expected)
3. `grep "classifyEntry|enumerateRoutes|slotMarker" src/adapters/FrameworkAdapter.ts` — 3 lines
4. `grep "toHaveLength(8)" test/adapters/FrameworkAdapter.test.ts` — 1 line
5. `grep "toHaveLength(5)" test/adapters/FrameworkAdapter.test.ts` — 0 lines

## Known Stubs

None — this plan adds interface declarations and failing tests only. No runtime stubs created.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The FrameworkAdapter widening is a pure type-level change (TypeScript interface only); no runtime I/O added. Consistent with T-10-01 disposition "accept" in the plan's threat register.

## Self-Check: PASSED

- `src/adapters/FrameworkAdapter.ts` — exists and contains 8 methods
- `test/adapters/FrameworkAdapter.test.ts` — exists and contains `toHaveLength(8)`
- `test/adapters/NextJsAdapter.test.ts` — exists (created in Task 2)
- Commit b8e6fe9 — exists (Task 1)
- Commit 25592a5 — exists (Task 2)
