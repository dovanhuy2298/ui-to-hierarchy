---
phase: 12
plan: "02"
subsystem: adapters/expo
tags: [expo-router, routing, rn-primitives, tdd, wave-1]
dependency_graph:
  requires: [12-01]
  provides: [segments, discover, route-map, rn-primitives]
  affects: [12-03-ExpoRouterAdapter]
tech_stack:
  added: []
  patterns:
    - ExpoSegment discriminated union (name field, not param — D-11)
    - resolveExpoRoot priority reversal (src/app before app/ — D-08)
    - Linear layout chain walk (simpler than Next.js tree)
    - isRNPrimitive dual-gate (allowlist + importSource === "react-native" — SPEC Req 10)
key_files:
  created:
    - src/adapters/expo/segments.ts
    - src/adapters/expo/discover.ts
    - src/adapters/expo/route-map.ts
    - src/adapters/expo/rn-primitives.ts
    - test/adapters/expo/segments.test.ts
    - test/adapters/expo/discover.test.ts
    - test/adapters/expo/route-map.test.ts
    - test/adapters/expo/rn-primitives.test.ts
  modified: []
decisions:
  - ExpoSegment uses `name` field everywhere (not `param`) — enforced by D-11, confirmed by regression test
  - resolveExpoRoot checks src/app first, then app/ — reversed from Next.js order per D-08
  - detectDualRoots is a standalone function returning booleans; warning emission delegated to Wave 2 adapter
  - mapRouteToEntry uses linear layout chain walk (not Next.js tree) — simpler, no parallel slots in v1
  - isRNPrimitive gates on both Set membership AND importSource === "react-native" — SPEC Req 10
  - cloneEmpty() no-throw contract applied at 7 call sites in route-map.ts
metrics:
  duration: "~30 minutes"
  completed: "2026-05-19T02:03:00Z"
  tasks_completed: 4
  files_created: 8
---

# Phase 12 Plan 02: Expo Utility Modules (segments, discover, route-map, rn-primitives) Summary

**One-liner:** Four pure utility modules implementing Expo Router segment classification, filesystem discovery with src/app priority, URL route enumeration, and RN primitive allowlist.

## Tasks Completed

| Task | Description | Commit | Tests |
|------|-------------|--------|-------|
| 1 | segments.ts — ExpoSegment + parseSegment | fb61d65 | 11 |
| 2 | discover.ts — resolveExpoRoot + detectDualRoots + discoverEntries | 28ddae1 | 18 |
| 3 | route-map.ts — enumerateRoutes + mapRouteToEntry | d725bf8 | 16 |
| 4 | rn-primitives.ts — RN_PRIMITIVES + isRNPrimitive | b349488 | 23 |

**Test delta:** 389 baseline → 450 passing (Wave 0 stubs converted to GREEN + new coverage)

## Exports Delivered

### `src/adapters/expo/segments.ts`
- `ExpoSegment` — discriminated union: static/dynamic/catch-all/optional-catch-all/group/index/special. Field is `name` everywhere (D-11).
- `parseSegment(dir)` — strips extension, classifies segment kind. optional-catch-all tested before catch-all (longest-first).

### `src/adapters/expo/discover.ts`
- `resolveExpoRoot(absRoot)` — checks src/app FIRST, then app/ (D-08 priority reversal vs Next.js). Returns null when neither exists.
- `detectDualRoots(absRoot)` — probes both roots independently, returns `{ hasSrcApp, hasApp }`. No console.* calls. Dual-root warning emission is delegated to Wave 2 (ExpoRouterAdapter).
- `discoverEntries(absRoot)` — globs `**/*.{tsx,jsx,ts,js}`, ignores components/hooks/utils/node_modules. Groups (tabs)/ NOT ignored. Returns lex-sorted forward-slash absolute paths.

### `src/adapters/expo/route-map.ts`
- `enumerateRoutes(absRoot)` — groups transparent in URL, index collapses, +special excluded. Returns lex-sorted route strings.
- `mapRouteToEntry(absRoot, route)` — linear layout chain walk in root→leaf→page order (D-09). cloneEmpty() no-throw contract for invalid/unmatched input.

### `src/adapters/expo/rn-primitives.ts`
- `RN_PRIMITIVES` — `Set<string>` with exactly 13 members (SPEC Req 9).
- `isRNPrimitive(tagName, importSource)` — gates on both allowlist membership AND `importSource === "react-native"` (SPEC Req 10 disambiguation).

## Dual-Root Warning Contract (for Wave 2)

The dual-root detection is intentionally split:
- `detectDualRoots()` in this plan returns booleans only — no warning emission.
- `ExpoRouterAdapter.discoverEntries()` (Wave 3, Plan 12-03) calls `detectDualRoots()`, pushes into `this.pendingWarnings[]`, then calls the standalone `discoverEntries()`.
- Warnings flushed into `ctx.warnings[]` at start of `extractComponents()`.

This contract is explicit and reserved for Wave 2.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all four source files are fully implemented with no placeholder/TODO values.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundary changes. All new files are pure utilities operating on local filesystem paths. Glob ignore list is a fixed constant (T-12-03 mitigated). Group folders intentionally traversed (T-12-04 accepted per SPEC).

## Pre-Existing Test Failures (Out of Scope)

Six tests in `test/adapters/select.test.ts` and one in `test/cli/framework-flag.test.ts` were already failing before Plan 12-02 execution (confirmed via git stash check). Root cause: `vi.mocked(...).mockImplementation` fails due to vi.mock hoisting issues with ES modules. These are pre-existing failures unrelated to Wave 1 utility modules. Logged to deferred-items for Wave 3 investigation.

## Self-Check: PASSED

- src/adapters/expo/segments.ts — FOUND
- src/adapters/expo/discover.ts — FOUND
- src/adapters/expo/route-map.ts — FOUND
- src/adapters/expo/rn-primitives.ts — FOUND
- test/adapters/expo/segments.test.ts — FOUND (11 passing)
- test/adapters/expo/discover.test.ts — FOUND (18 passing)
- test/adapters/expo/route-map.test.ts — FOUND (16 passing)
- test/adapters/expo/rn-primitives.test.ts — FOUND (23 passing)
- Commits fb61d65, 28ddae1, d725bf8, b349488 — VERIFIED in git log
- Island test passes — VERIFIED
- Full suite: 450 passing (> 389 baseline) — VERIFIED
