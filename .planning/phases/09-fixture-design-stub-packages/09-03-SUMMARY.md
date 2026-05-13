---
phase: 09-fixture-design-stub-packages
plan: "03"
subsystem: testing
tags: [vitest, resolver, expo, react-native, expo-router, smoke-test, external-classification]

requires:
  - phase: 09-01
    provides: expo-basic fixture with react-native + expo-router stub node_modules
  - phase: 09-02
    provides: expo-tabs-and-dynamic fixture with tabs layout, dynamic route, stub node_modules

provides:
  - INTEG-02 smoke test locking resolver external classification for both Expo fixtures
  - test/core/resolver/expo-stubs.test.ts (4 it() blocks: 2 packages x 2 fixtures)

affects: [phase-10, phase-11, phase-12, phase-13, phase-14, phase-15]

tech-stack:
  added: []
  patterns:
    - "Smoke test shape mirrors barrel.test.ts: same ctxFor() helper, same import structure"
    - "External result assertions: ok === true, kind === 'external', packageName — no absolutePath assertion"

key-files:
  created:
    - test/core/resolver/expo-stubs.test.ts
  modified: []

key-decisions:
  - "Test invokes resolveModule() directly — no binary spawn, no adapter imports (resolver-only isolation per SPEC)"
  - "fromFile uses real fixture paths (committed files) per RESEARCH Pitfall 2, even though bare-specifier classification is filesystem-agnostic"
  - "No absolutePath assertion on external results (field does not exist on external ResolveResult variant)"

patterns-established:
  - "INTEG-02 pattern: bare specifier smoke tests are resolver-only (no adapter/analyzer imports)"

requirements-completed: [INTEG-02]

duration: 5min
completed: 2026-05-13
---

# Phase 9 Plan 03: Expo Stub External Classification Smoke Test Summary

**Smoke test locking INTEG-02: resolveModule classifies react-native and expo-router as kind: "external" from both expo-basic and expo-tabs-and-dynamic fixtures**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-13T03:26:00Z
- **Completed:** 2026-05-13T03:28:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Authored `test/core/resolver/expo-stubs.test.ts` with 4 `it()` blocks covering INTEG-02 contract
- Verified all 4 assertions pass: react-native + expo-router as `kind: "external"` from both fixtures
- Full suite: 360 tests passing (baseline 356 + 4 new), zero regressions
- Phase 9 deliverables complete: INTEG-01 (fixtures) from Plans 01+02, INTEG-02 (smoke test) from this plan

## Task Commits

1. **Task 1: Author smoke test for resolver external classification across both Expo fixtures** - `918c96a` (test)

## Files Created/Modified

- `test/core/resolver/expo-stubs.test.ts` - INTEG-02 smoke test: 4 it() blocks verifying bare specifier external classification from both Expo fixtures

## Decisions Made

- Invoked `resolveModule()` directly (no binary spawn) per SPEC constraint for resolver-only isolation
- Followed `barrel.test.ts` shape verbatim for imports and `ctxFor()` helper
- Used real fixture file paths (files committed in Plans 01/02) per RESEARCH Pitfall 2 guidance
- Did not assert `r.absolutePath` on external results (field absent on `kind: "external"` variant per RESEARCH Pitfall 5)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 9 complete: all deliverables landed (INTEG-01 + INTEG-02)
- Phase 10+ can rely on both Expo fixtures and INTEG-02 resolver contract without re-verification
- Downstream phases: expo-basic and expo-tabs-and-dynamic fixtures are inert-but-resolver-friendly stubs

## Self-Check

- [x] `test/core/resolver/expo-stubs.test.ts` exists
- [x] Commit `918c96a` exists
- [x] 4/4 tests pass (`npx vitest run test/core/resolver/expo-stubs.test.ts`)
- [x] Full suite 360/360 green, zero regressions

---
*Phase: 09-fixture-design-stub-packages*
*Completed: 2026-05-13*
