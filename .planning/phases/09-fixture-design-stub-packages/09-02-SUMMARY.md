---
phase: 09-fixture-design-stub-packages
plan: "02"
subsystem: test-fixtures
tags: [fixtures, expo, react-native, expo-router, nativewind, test-infrastructure]

dependency_graph:
  requires: []
  provides:
    - test/fixtures/expo-tabs-and-dynamic (complex Expo Router fixture tree)
  affects:
    - Phase 12 (Expo parsing support)
    - Phase 13 (NativeWind / style array detection)
    - Phase 14 (platform-suffix file handling)
    - 09-03 (smoke test uses this fixture)

tech_stack:
  added: []
  patterns:
    - Expo Router tab group layout with Tabs.Screen sub-components
    - NativeWind className prop on RN primitive (Text)
    - Style array syntax style={[a, b, cond && c]} in single fixture file
    - Platform-suffix filename pair (Button.ios.tsx / Button.android.tsx)
    - Local stub node_modules tracked in git (gitignore exception pattern)

key_files:
  created:
    - test/fixtures/expo-tabs-and-dynamic/tsconfig.json
    - test/fixtures/expo-tabs-and-dynamic/node_modules/react-native/package.json
    - test/fixtures/expo-tabs-and-dynamic/node_modules/react-native/index.d.ts
    - test/fixtures/expo-tabs-and-dynamic/node_modules/expo-router/package.json
    - test/fixtures/expo-tabs-and-dynamic/node_modules/expo-router/index.d.ts
    - test/fixtures/expo-tabs-and-dynamic/app/_layout.tsx
    - test/fixtures/expo-tabs-and-dynamic/app/+not-found.tsx
    - test/fixtures/expo-tabs-and-dynamic/app/(tabs)/_layout.tsx
    - test/fixtures/expo-tabs-and-dynamic/app/(tabs)/index.tsx
    - test/fixtures/expo-tabs-and-dynamic/app/(tabs)/[id].tsx
    - test/fixtures/expo-tabs-and-dynamic/app/components/Button.ios.tsx
    - test/fixtures/expo-tabs-and-dynamic/app/components/Button.android.tsx
  modified:
    - .gitignore (added !test/fixtures/**/node_modules/ exception)

decisions:
  - Concentrated NativeWind className AND style-array syntax in a single file (tabs/index.tsx) per planner discretion
  - Used interface TabsComponent extends pattern for expo-router stub (avoids declare namespace circular ref)
  - Added .gitignore negation rule for fixture stub node_modules (required for git tracking)

metrics:
  duration: "~5 minutes"
  completed: "2026-05-13"
  tasks_completed: 2
  files_created: 13
---

# Phase 09 Plan 02: expo-tabs-and-dynamic Fixture Summary

**One-liner:** Complex Expo Router fixture with tab groups, dynamic segment, +not-found, NativeWind className, and style-array syntax across 12 files + .gitignore fix.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Stub node_modules + tsconfig | 9cc5e06 | tsconfig.json, react-native/*, expo-router/*, .gitignore |
| 2 | App fixture files | 93483ac | 7 .tsx files across app/ tree |

## What Was Built

The `test/fixtures/expo-tabs-and-dynamic/` tree is a complex Expo Router fixture that exercises all routing and styling patterns v1.2 phases 12-14 will need:

- **Tab group routing:** `app/(tabs)/_layout.tsx` uses `<Tabs>` with two `<Tabs.Screen>` children (index + [id])
- **Dynamic segment:** `app/(tabs)/[id].tsx` — square-bracket filename carries the segment syntax
- **Expo special file:** `app/+not-found.tsx` — plus-prefix special file convention
- **NativeWind className:** `app/(tabs)/index.tsx` — `<Text className="text-lg font-bold">` on RN primitive
- **Style array syntax:** `app/(tabs)/index.tsx` — `style={[styles.card, active && styles.bold]}`
- **StyleSheet.create:** `app/(tabs)/index.tsx` — `const styles = StyleSheet.create({...})`
- **Platform-suffix pair:** `app/components/Button.ios.tsx` + `Button.android.tsx`
- **Stub packages:** byte-identical to expo-basic (react-native + expo-router) with minimal export surface

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added .gitignore exception for fixture stub node_modules**
- **Found during:** Task 1 (git add)
- **Issue:** `.gitignore` had global `node_modules/` rule which prevented staging the stub packages inside `test/fixtures/`. Without this exception, the stubs cannot be committed and the fixture tree is incomplete.
- **Fix:** Added `!test/fixtures/**/node_modules/` negation rule to `.gitignore`
- **Files modified:** `.gitignore`
- **Commit:** 9cc5e06 (included in Task 1 commit)

## Verification Results

- All 5 stub/config files verified via `node -e` access check: PASS
- All acceptance criteria for stub files (tsconfig paths, package.json fields, d.ts exports, no forbidden patterns): PASS
- All 7 app fixture files verified via the plan's automated verify script: PASS
- All acceptance criteria for fixture files (imports, exports, Tabs.Screen names, className, style=[...], no forbidden patterns): PASS
- `vitest run`: 356 tests PASS, 0 FAIL — no regressions

## Self-Check: PASSED

Files exist:
- test/fixtures/expo-tabs-and-dynamic/tsconfig.json: FOUND
- test/fixtures/expo-tabs-and-dynamic/node_modules/react-native/index.d.ts: FOUND
- test/fixtures/expo-tabs-and-dynamic/node_modules/expo-router/index.d.ts: FOUND
- test/fixtures/expo-tabs-and-dynamic/app/_layout.tsx: FOUND
- test/fixtures/expo-tabs-and-dynamic/app/(tabs)/_layout.tsx: FOUND
- test/fixtures/expo-tabs-and-dynamic/app/(tabs)/index.tsx: FOUND
- test/fixtures/expo-tabs-and-dynamic/app/(tabs)/[id].tsx: FOUND
- test/fixtures/expo-tabs-and-dynamic/app/+not-found.tsx: FOUND
- test/fixtures/expo-tabs-and-dynamic/app/components/Button.ios.tsx: FOUND
- test/fixtures/expo-tabs-and-dynamic/app/components/Button.android.tsx: FOUND

Commits verified: 9cc5e06, 93483ac — both in git log.
