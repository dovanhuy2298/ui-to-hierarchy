---
phase: "10-interface-widening-analyzer-de-next-ification"
plan: "02"
subsystem: core
tags: [refactor, adapter-delegation, framework-agnostic, de-nextification]
dependency_graph:
  requires: [10-01]
  provides: [framework-agnostic-Analyzer, NextJsAdapter-8-methods-green]
  affects: [src/core/Analyzer.ts, src/adapters/next/NextJsAdapter.ts]
tech_stack:
  added: []
  patterns: [adapter-delegation, island-rule, this-context-capture-before-traverse]
key_files:
  created: []
  modified:
    - src/core/Analyzer.ts
    - src/adapters/next/NextJsAdapter.ts
decisions:
  - collectChildrenSlotLines moved from module-scope to private class method; adapter captured before traverse visitor to avoid this-context loss in non-arrow callbacks (Pitfall 3)
  - buildUnionIR delegates entirely to adapter.enumerateRoutes replacing two-call discoverEntries+deriveRoutesFromEntries pattern
  - Island rule enforced — zero new value-level imports from src/adapters/ added to Analyzer.ts
metrics:
  duration: "~15 minutes"
  completed: "2026-05-13T05:00:00Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 10 Plan 02: De-Next-ify Analyzer.ts + NextJsAdapter GREEN Summary

**One-liner:** Removed 5 module-scope Next.js-specific functions from Analyzer.ts and replaced all callsites with adapter delegation (classifyEntry, enumerateRoutes, slotMarker), making the core framework-agnostic; implemented all 3 new NextJsAdapter methods to bring suite GREEN at 371 tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement classifyEntry, enumerateRoutes, slotMarker in NextJsAdapter | b63686a | src/adapters/next/NextJsAdapter.ts |
| 2 | De-Next-ify Analyzer.ts — remove 5 module-scope functions, delegate to adapter | 7ffe44e | src/core/Analyzer.ts |

## What Was Built

### Task 1: NextJsAdapter — 3 New Methods (GREEN)

`src/adapters/next/NextJsAdapter.ts` extended with:

- **`classifyEntry(absPath)`** — classifies entry files in order: page → layout → special → other. Critical check order (layout before special) prevents Pitfall 1 (layout.tsx being misclassified as "special").
- **`enumerateRoutes(absRoot)`** — calls `discoverNextEntries` then derives unique sorted route strings, inlining the logic from the former `deriveRoutesFromEntries`. Preserves `Array.from(routes).sort()` for deterministic ordering (Pitfall 4).
- **`slotMarker(name, _importSource)`** — returns `name === "children"`. importSource unused for Next.js (D-05).

Verification: `vitest run test/adapters/NextJsAdapter.test.ts` — all 11 tests PASS (GREEN).

### Task 2: Analyzer.ts De-Next-ification (6 Migrations)

All 6 migrations applied to `src/core/Analyzer.ts`:

| Migration | Change |
|-----------|--------|
| M1 | Deleted `collectChildrenSlotLines` module-scope function; added as private class method with `const adapter = this.adapter` capture before traverse |
| M2 | Updated callsite: `collectChildrenSlotLines(ast)` → `this.collectChildrenSlotLines(ast)` |
| M3 | Deleted `isPageFile`, `isSpecialFile`, `isLayoutFile` module-scope functions |
| M4 | Updated `buildRouteTree`: `isPageFile(entries[i]!)` → `this.adapter.classifyEntry(entries[i]!) === "page"`, `isLayoutFile(e)` → `this.adapter.classifyEntry(e) === "layout"` |
| M5 | Updated `buildUnionIR`: replaced `discoverEntries` + `deriveRoutesFromEntries` two-call pattern with single `await this.adapter.enumerateRoutes(this.root)` call; warning string updated to `"enumerateRoutes error"` |
| M6 | Deleted `deriveRoutesFromEntries` module-scope function |

**Island rule:** Zero new value-level imports from `src/adapters/` added to Analyzer.ts — all delegation via pre-existing `this.adapter` field.

## Verification Results

1. `grep -E "isPageFile|isLayoutFile|isSpecialFile|deriveRoutesFromEntries" src/core/Analyzer.ts` — 0 matches
2. `grep "discoverEntries error" src/core/Analyzer.ts` — 0 matches
3. `grep "enumerateRoutes error" src/core/Analyzer.ts` — 1 match
4. `grep "adapter.classifyEntry" src/core/Analyzer.ts` — 2 matches (buildRouteTree)
5. `grep "adapter.enumerateRoutes" src/core/Analyzer.ts` — 1 match (buildUnionIR)
6. `grep "adapter.slotMarker" src/core/Analyzer.ts` — 1 match (collectChildrenSlotLines private method)
7. `grep "attachParallelSlot" src/core/Analyzer.ts` — 2 matches (function NOT moved to adapter, per SPEC req 8)
8. `npx tsc --noEmit` — 0 errors in project source (1 error in test/fixtures/phase-05/micro/parse-error/app/page.tsx — intentional parse-error fixture, pre-existing)
9. `npx vitest run` — 371 tests passed, 0 failures, 46 test files

## Deviations from Plan

None — plan executed exactly as written. Migrations 1 and 2 were already partially applied in the Analyzer.ts uncommitted state when this continuation agent started; all 6 migrations verified complete.

## Known Stubs

None — all adapter delegation is fully wired. No placeholder data flows to UI rendering.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The migration is a pure internal refactor — same logic, same I/O, different call dispatch. T-10-02 (island rule) verified: no new value-level imports from src/adapters/ in Analyzer.ts.

## Self-Check: PASSED

- `src/core/Analyzer.ts` — exists; contains `adapter.classifyEntry`, `adapter.enumerateRoutes`, `adapter.slotMarker`, `collectChildrenSlotLines` as private method; zero leaked functions
- `src/adapters/next/NextJsAdapter.ts` — exists; contains all 8 FrameworkAdapter methods
- Commit b63686a — exists (Task 1)
- Commit 7ffe44e — exists (Task 2)
- vitest suite: 371 passed, 0 failed
