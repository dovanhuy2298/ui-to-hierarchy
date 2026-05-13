---
phase: 09-fixture-design-stub-packages
plan: "01"
subsystem: testing
tags: [fixtures, expo, react-native, expo-router, test-infrastructure, stub-packages]

requires: []
provides:
  - "test/fixtures/expo-basic/ — self-contained Expo Router fixture tree with stub node_modules"
  - "Stub react-native package (View/Text/ScrollView/TouchableOpacity/Pressable/StyleSheet/StyleProp/ViewStyle/TextStyle)"
  - "Stub expo-router package (Slot/Link/Tabs/Stack via interface extends pattern)"
  - "Platform-suffix pair Button.ios.tsx + Button.android.tsx as Phase 14 probe target"
affects:
  - 09-02-fixture-tabs-dynamic
  - 09-03-stub-resolver-smoke-test
  - 10-expo-router-adapter
  - 14-platform-suffix-resolver

tech-stack:
  added: []
  patterns:
    - "Fixture stub node_modules: minimal package.json + index.d.ts, force-added via .gitignore negation"
    - "Stub index.d.ts uses interface extends React.ComponentType pattern (not declare namespace) for composite types"
    - "Fixture .gitignore with !node_modules/** negation to allow stub packages in versioned test fixtures"

key-files:
  created:
    - test/fixtures/expo-basic/.gitignore
    - test/fixtures/expo-basic/tsconfig.json
    - test/fixtures/expo-basic/node_modules/react-native/package.json
    - test/fixtures/expo-basic/node_modules/react-native/index.d.ts
    - test/fixtures/expo-basic/node_modules/expo-router/package.json
    - test/fixtures/expo-basic/node_modules/expo-router/index.d.ts
    - test/fixtures/expo-basic/app/_layout.tsx
    - test/fixtures/expo-basic/app/index.tsx
    - test/fixtures/expo-basic/app/components/HomeScreen.tsx
    - test/fixtures/expo-basic/app/components/Button.ios.tsx
    - test/fixtures/expo-basic/app/components/Button.android.tsx
  modified: []

key-decisions:
  - "Added fixture-level .gitignore with !node_modules/** to allow stub packages despite root gitignore — stub node_modules must be committed for fixture to be self-contained"

patterns-established:
  - "Fixture stub node_modules pattern: package.json (name/version/main) + index.d.ts (declare const/type only, minimal exports)"
  - "Interface extends ComponentType pattern for sub-component types (Tabs.Screen, Stack.Screen) avoids declare namespace circular ref pitfall"

requirements-completed: [INTEG-01, INTEG-02]

duration: 2min
completed: 2026-05-13
---

# Phase 09 Plan 01: expo-basic Fixture — Stub node_modules + App Files Summary

**Minimal Expo Router fixture tree with self-contained react-native + expo-router stub packages, tsconfig alias, and platform-suffix Button pair ready for Phase 10+ adapter and resolver tests**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-13T03:21:07Z
- **Completed:** 2026-05-13T03:23:43Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Created complete `test/fixtures/expo-basic/` tree: 5 config/stub files + 5 app source files
- Stub `react-native` and `expo-router` packages committed under fixture `node_modules/` via `.gitignore` negation pattern (first stub node_modules in the project)
- Platform-suffix pair `Button.ios.tsx` + `Button.android.tsx` in place as Phase 14 probe targets; all fixture files are inert from the analyzer's perspective

## Task Commits

1. **Task 1: Create expo-basic stub node_modules + tsconfig** - `2c1bbe2` (chore)
2. **Task 2: Author expo-basic app/ fixture files** - `b553f3d` (feat)

## Files Created/Modified

- `test/fixtures/expo-basic/.gitignore` - Negates root node_modules ignore to allow stub packages
- `test/fixtures/expo-basic/tsconfig.json` - baseUrl=. + @/* -> app/* alias
- `test/fixtures/expo-basic/node_modules/react-native/package.json` - Stub manifest (v0.0.0)
- `test/fixtures/expo-basic/node_modules/react-native/index.d.ts` - Type stubs: View/Text/ScrollView/TouchableOpacity/Pressable/StyleSheet/StyleProp/ViewStyle/TextStyle with shared StyleProps interface
- `test/fixtures/expo-basic/node_modules/expo-router/package.json` - Stub manifest (v0.0.0)
- `test/fixtures/expo-basic/node_modules/expo-router/index.d.ts` - Type stubs: Slot/Link/Tabs/Stack via interface extends React.ComponentType pattern
- `test/fixtures/expo-basic/app/_layout.tsx` - Root layout importing Slot from expo-router
- `test/fixtures/expo-basic/app/index.tsx` - Home screen using View/Text from react-native
- `test/fixtures/expo-basic/app/components/HomeScreen.tsx` - Component using StyleSheet.create
- `test/fixtures/expo-basic/app/components/Button.ios.tsx` - iOS platform-suffix probe target
- `test/fixtures/expo-basic/app/components/Button.android.tsx` - Android platform-suffix probe target

## Decisions Made

- Added `test/fixtures/expo-basic/.gitignore` with `!node_modules/` and `!node_modules/**` negation rules to allow stub packages to be committed — root `.gitignore` blocks `node_modules/` globally, but fixture stubs must be versioned for the fixture to be self-contained and usable without `npm install`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added fixture-level .gitignore to allow stub node_modules**
- **Found during:** Task 1 (Create expo-basic stub node_modules + tsconfig)
- **Issue:** Root `.gitignore` blocks all `node_modules/` directories. Running `git add` on `test/fixtures/expo-basic/node_modules/` failed with "ignored by .gitignore" error.
- **Fix:** Created `test/fixtures/expo-basic/.gitignore` with `!node_modules/` + `!node_modules/**` negation, then used `git add -f` to force-stage the stub files.
- **Files modified:** `test/fixtures/expo-basic/.gitignore` (new)
- **Verification:** `git add -f` succeeded; all 4 stub files staged and committed as `2c1bbe2`.
- **Committed in:** `2c1bbe2` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (blocking)
**Impact on plan:** Required for correctness — stub node_modules must be versioned for fixture self-containment. No scope creep.

## Issues Encountered

- Root `.gitignore` blocking stub node_modules — resolved via fixture-level `.gitignore` negation (documented as deviation above).

## Known Stubs

None — fixture files are intentionally minimal but complete. All imports resolve to the stub packages created in the same plan.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Next Phase Readiness

- `test/fixtures/expo-basic/` is complete and self-contained
- Plan 02 can create `test/fixtures/expo-tabs-and-dynamic/` using the same stub pattern (same node_modules shape, same .gitignore approach)
- Plan 03 smoke test can `path.resolve("test/fixtures/expo-basic")` and `path.resolve("test/fixtures/expo-basic/app/_layout.tsx")` against real committed files
- Pre-existing test suite: 329 tests pass, 27 skipped (356 total) — no regressions introduced

---
*Phase: 09-fixture-design-stub-packages*
*Completed: 2026-05-13*
