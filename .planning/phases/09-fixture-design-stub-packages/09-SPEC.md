# Phase 9: Fixture Design & Stub Packages — Specification

**Created:** 2026-05-13
**Ambiguity score:** 0.12 (gate: ≤ 0.20)
**Requirements:** 7 locked

## Goal

Two Expo Router fixture projects exist under `test/fixtures/` — `expo-basic` and `expo-tabs-and-dynamic` — each with stubbed `react-native` and `expo-router` node_modules (package.json + minimal index.d.ts), a tsconfig with `@/` alias, and a platform-suffix file pair; a dedicated smoke test confirms the resolver classifies both packages as `kind: "external"`.

## Background

No Expo-related fixtures exist anywhere in `test/fixtures/`. Existing Next.js fixtures (`test/fixtures/next-app-router/`) follow the pattern: `app/` directory + one config file, no `node_modules/` stubs. The resolver's `packageNameFromSpecifier` already classifies bare specifiers (e.g., `react-native`, `expo-router`) as `kind: "external"` without stubs — the stubs are needed for TypeScript validity inside fixture files and to make the `detectNodeModules` code path testable. Phase 9 has no dependencies and is the foundation for all v1.2 adapter work (Phases 10–15 depend on these fixtures being present and inert).

## Requirements

1. **expo-basic fixture files**: `test/fixtures/expo-basic/` contains the full file set for a minimal Expo Router app.
   - Current: Directory does not exist
   - Target: Directory exists with `app/_layout.tsx` (containing `<Slot/>` imported from `expo-router`), `app/index.tsx` (a screen component), `app/components/HomeScreen.tsx` (a screen using `StyleSheet.create` from `react-native`), `app/components/Button.ios.tsx`, `app/components/Button.android.tsx`
   - Acceptance: All five files above exist at their stated paths and are valid TypeScript (no TS errors when type-checked against the fixture's own tsconfig and stubs)

2. **expo-tabs-and-dynamic fixture files**: `test/fixtures/expo-tabs-and-dynamic/` contains a more complex Expo Router app shape.
   - Current: Directory does not exist
   - Target: Directory exists with `app/_layout.tsx` (root layout), `app/(tabs)/_layout.tsx` (tab group using `<Tabs>` from `expo-router`), `app/(tabs)/index.tsx`, `app/(tabs)/[id].tsx` (dynamic segment), `app/+not-found.tsx` (special file), and at least one file using NativeWind `className` prop and one file with `style={[a, b, cond && c]}` array syntax; also includes `app/components/Button.ios.tsx` and `app/components/Button.android.tsx`
   - Acceptance: All files above exist; NativeWind `className` usage and style array usage are present in at least one fixture file each

3. **Stub react-native package**: Each fixture has a local `node_modules/react-native/` stub.
   - Current: No stubs exist in any fixture
   - Target: Both `test/fixtures/expo-basic/node_modules/react-native/` and `test/fixtures/expo-tabs-and-dynamic/node_modules/react-native/` contain a valid `package.json` (with `"name": "react-native"`, `"version"`, `"main"`) and an `index.d.ts` that exports only the types actually imported in that fixture's files (e.g., `View`, `Text`, `StyleSheet`, `TouchableOpacity`, `StyleProp`, `ViewStyle`, `TextStyle`)
   - Acceptance: TypeScript can resolve `import { View, Text, StyleSheet } from 'react-native'` within each fixture without errors

4. **Stub expo-router package**: Each fixture has a local `node_modules/expo-router/` stub.
   - Current: No stubs exist in any fixture
   - Target: Both stubs contain a valid `package.json` and an `index.d.ts` that exports only the types actually imported in fixture files (at minimum: `Slot`, `Tabs`, `Stack`, `Link`; each as a React component declaration)
   - Acceptance: TypeScript can resolve `import { Slot } from 'expo-router'` and `import { Tabs } from 'expo-router'` within each fixture without errors

5. **tsconfig.json with @/ alias**: Each fixture has its own tsconfig.json with `paths` mapping for `@/`.
   - Current: No tsconfig exists in either fixture directory
   - Target: Both `test/fixtures/expo-basic/tsconfig.json` and `test/fixtures/expo-tabs-and-dynamic/tsconfig.json` exist with `"compilerOptions": { "paths": { "@/*": ["./src/*"] } }` (or `["./app/*"]` — see Constraints) and appropriate base settings
   - Acceptance: The resolver, when given a file in the fixture that imports `@/components/Foo`, resolves the alias using the fixture's local tsconfig

6. **Platform-suffix file pairs**: Both fixtures contain a `Button.ios.tsx` / `Button.android.tsx` pair so Phase 14 has a real probe target.
   - Current: No platform-suffix files exist in fixtures
   - Target: Each fixture contains `app/components/Button.ios.tsx` and `app/components/Button.android.tsx` as minimal valid React Native components (JSX returning `<View>`)
   - Acceptance: Both files exist at the stated paths in both fixtures

7. **Smoke test for external classification**: A dedicated test file verifies resolver classifies `react-native` and `expo-router` imports as `kind: "external"`.
   - Current: No smoke test exists for Expo resolver behavior
   - Target: `test/resolver/expo-stubs.test.ts` (or equivalent path) invokes the resolver directly (no binary spawn) against files in both fixtures; asserts `result.kind === "external"` and `result.packageName === "react-native"` / `"expo-router"` for imports of those packages
   - Acceptance: `vitest run` executes the new test file and all assertions pass; the test is isolated (does not import adapter code)

## Boundaries

**In scope:**
- Two fixture directory trees under `test/fixtures/` with the exact file shapes listed in Requirements 1–2
- Local `node_modules/` stubs (react-native, expo-router) inside each fixture — `package.json` + minimal `index.d.ts` only
- `tsconfig.json` with `@/` path alias per fixture
- Platform-suffix file pairs (`Button.ios.tsx`, `Button.android.tsx`) in both fixtures
- One dedicated smoke test file verifying `kind: "external"` classification

**Out of scope:**
- Any `FrameworkAdapter`, `ExpoRouterAdapter`, or Expo-specific parsing logic — those land in Phases 10–12
- `selectAdapter` or adapter detection logic — Phase 11
- Style extraction logic (`StyleSheet.create` indexing, NativeWind parsing) — Phase 13
- Platform-suffix resolver fallback logic — Phase 14
- Integration test suite covering format: json/markdown output — Phase 15
- Monorepo fixture (`pnpm-monorepo` variant for Expo) — Phase 11
- Parsing `app.config.ts` / `tailwind.config.*` — explicitly excluded from v1.2 scope
- Any changes to `src/` production code — this phase is fixtures + test only

## Constraints

- Fixtures must be **inert** from the analyzer's perspective until Phase 12: running the current analyzer against either fixture must not crash (it may return empty or partial results), but must not throw an uncaught exception
- `@/` alias target in tsconfig: use `["./src/*"]` if the fixture has a `src/` subdirectory, otherwise `["./app/*"]` — keep consistent with the fixture's own directory layout
- stub `index.d.ts` exports must be **minimal** — only export types actually imported in that fixture's files; no broad stubs that would mask missing imports in future fixture additions
- Platform-suffix files (`Button.ios.tsx`, `Button.android.tsx`) must be valid TypeScript React Native components (importable without TS errors) but can be minimal: a single named export returning `<View />`
- The smoke test must invoke the resolver **directly** (no subprocess spawn) — same pattern as existing resolver unit tests in `test/`

## Acceptance Criteria

- [ ] `test/fixtures/expo-basic/app/_layout.tsx` exists and contains `<Slot/>` imported from `expo-router`
- [ ] `test/fixtures/expo-basic/app/index.tsx` exists as a valid screen component
- [ ] `test/fixtures/expo-basic/app/components/HomeScreen.tsx` uses `StyleSheet.create` from `react-native`
- [ ] `test/fixtures/expo-tabs-and-dynamic/app/(tabs)/_layout.tsx` uses `<Tabs>` from `expo-router`
- [ ] `test/fixtures/expo-tabs-and-dynamic/app/(tabs)/[id].tsx` exists as a dynamic segment screen
- [ ] `test/fixtures/expo-tabs-and-dynamic/app/+not-found.tsx` exists as a special file
- [ ] At least one file in `expo-tabs-and-dynamic` uses NativeWind `className` prop on an RN primitive
- [ ] At least one file in `expo-tabs-and-dynamic` uses `style={[a, b, cond && c]}` array syntax
- [ ] Both fixtures have `app/components/Button.ios.tsx` and `app/components/Button.android.tsx`
- [ ] Both fixtures have `node_modules/react-native/package.json` and `node_modules/react-native/index.d.ts`
- [ ] Both fixtures have `node_modules/expo-router/package.json` and `node_modules/expo-router/index.d.ts`
- [ ] Both fixtures have a `tsconfig.json` with `@/` path alias configured
- [ ] Smoke test file exists and passes: resolver returns `kind: "external"` for `react-native` and `expo-router` imports from both fixtures
- [ ] `vitest run` exits 0 with all existing tests still passing (≥353 tests green, no regressions)
- [ ] Running the current analyzer against either fixture does not throw an uncaught exception

## Ambiguity Report

| Dimension           | Score | Min  | Status | Notes                                            |
|---------------------|-------|------|--------|--------------------------------------------------|
| Goal Clarity        | 0.90  | 0.75 | ✓      | File shapes explicitly enumerated                |
| Boundary Clarity    | 0.90  | 0.70 | ✓      | Smoke test location locked; out-of-scope explicit |
| Constraint Clarity  | 0.85  | 0.65 | ✓      | tsconfig alias target + stub scope clarified     |
| Acceptance Criteria | 0.85  | 0.70 | ✓      | 15 pass/fail checkboxes                          |
| **Ambiguity**       | 0.12  | ≤0.20| ✓      |                                                  |

## Interview Log

| Round | Perspective | Question summary                          | Decision locked                                              |
|-------|-------------|------------------------------------------|--------------------------------------------------------------|
| 0     | Researcher  | Codebase scout: existing fixtures?        | No Expo fixtures; resolver already returns external for bare specifiers |
| 0     | Researcher  | How does resolver classify externals?     | `packageNameFromSpecifier` handles bare specifiers; stubs needed for TS validity |
| 1     | Researcher  | Where should smoke test live?             | New dedicated file `test/resolver/expo-stubs.test.ts`       |
| 1     | Researcher  | Does each fixture need tsconfig?          | Yes — `@/` alias to `./src/*` (or `./app/*` if no src/)     |
| 1     | Simplifier  | How broad should stub index.d.ts be?      | Minimal — only types actually imported in that fixture      |

---

*Phase: 09-fixture-design-stub-packages*
*Spec created: 2026-05-13*
*Next step: /gsd-discuss-phase 9 — implementation decisions (exact file content, test structure, etc.)*
