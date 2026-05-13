---
phase: 09-fixture-design-stub-packages
reviewed: 2026-05-13T00:00:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - test/core/resolver/expo-stubs.test.ts
  - test/fixtures/expo-basic/app/_layout.tsx
  - test/fixtures/expo-basic/app/components/Button.android.tsx
  - test/fixtures/expo-basic/app/components/Button.ios.tsx
  - test/fixtures/expo-basic/app/components/HomeScreen.tsx
  - test/fixtures/expo-basic/app/index.tsx
  - test/fixtures/expo-basic/node_modules/expo-router/index.d.ts
  - test/fixtures/expo-basic/node_modules/expo-router/package.json
  - test/fixtures/expo-basic/node_modules/react-native/index.d.ts
  - test/fixtures/expo-basic/node_modules/react-native/package.json
  - test/fixtures/expo-basic/tsconfig.json
  - test/fixtures/expo-tabs-and-dynamic/app/(tabs)/[id].tsx
  - test/fixtures/expo-tabs-and-dynamic/app/(tabs)/_layout.tsx
  - test/fixtures/expo-tabs-and-dynamic/app/(tabs)/index.tsx
  - test/fixtures/expo-tabs-and-dynamic/app/+not-found.tsx
  - test/fixtures/expo-tabs-and-dynamic/app/_layout.tsx
  - test/fixtures/expo-tabs-and-dynamic/app/components/Button.android.tsx
  - test/fixtures/expo-tabs-and-dynamic/app/components/Button.ios.tsx
  - test/fixtures/expo-tabs-and-dynamic/node_modules/expo-router/index.d.ts
  - test/fixtures/expo-tabs-and-dynamic/node_modules/expo-router/package.json
  - test/fixtures/expo-tabs-and-dynamic/node_modules/react-native/index.d.ts
  - test/fixtures/expo-tabs-and-dynamic/node_modules/react-native/package.json
  - test/fixtures/expo-tabs-and-dynamic/tsconfig.json
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 09: Code Review Report

**Reviewed:** 2026-05-13T00:00:00Z
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Reviewed test fixtures (two Expo fixture trees: `expo-basic` and `expo-tabs-and-dynamic`) and the vitest smoke test `expo-stubs.test.ts`. The fixtures are intentionally minimal stubs — that context was noted and weight is not given to missing feature richness. However, several correctness defects exist that will cause the tests to silently not exercise the intended code paths or produce false-positive passes.

The two most critical issues are: (1) the stub `package.json` files point `"main"` at `"index.js"` but the actual files on disk are `index.d.ts` — the resolver's `probeFile` will never find them, so the "external" classification is exercised via the bare-specifier shortcut in `packageNameFromSpecifier` rather than the node_modules boundary detector (`detectNodeModules`). This means `INTEG-02` tests pass for the wrong reason and do not validate the file-system probe path. (2) The test helper `ctxFor` uses a relative path string passed to `path.resolve`, which is resolved against the Node.js `process.cwd()` at runtime. If the test runner sets cwd to a directory other than the repo root (e.g. vitest's default when run from a subdirectory), every `path.resolve("test/fixtures/...")` produces a wrong absolute path and all four tests will silently return `not-found` while `r.ok` will be `false` — causing the `expect(r.ok).toBe(true)` assertions to fail rather than testing the right behavior. The test has no assertion guard for the `ok: false` case before entering the inner block, which can mask subtler resolution failures.

---

## Critical Issues

### CR-01: Stub `package.json` `"main"` points to non-existent `index.js`; `detectNodeModules` path is never exercised

**File:** `test/fixtures/expo-basic/node_modules/expo-router/package.json:1`
**Also:** `test/fixtures/expo-basic/node_modules/react-native/package.json:1`
**Also:** `test/fixtures/expo-tabs-and-dynamic/node_modules/expo-router/package.json:1`
**Also:** `test/fixtures/expo-tabs-and-dynamic/node_modules/react-native/package.json:1`

**Issue:** Every stub `package.json` declares `"main": "index.js"`. No `index.js` file exists in any of the four stub packages — only `index.d.ts`. When the resolver's `resolveSpecifierToFile` reaches step 3 (bare specifier), it calls `packageNameFromSpecifier` and returns `external` immediately, without ever attempting to probe `node_modules/<pkg>/index.js`. The `detectNodeModules` code path (which validates the file-system boundary by checking for the `/node_modules/` segment in a resolved path) is therefore never reached by these tests. The tests pass, but they pass because of the early-return bare-specifier short-circuit, not because the node_modules boundary detection works. If `packageNameFromSpecifier` had a bug for these package names, the tests would still pass by accident.

The intent of `INTEG-02` ("expo stub external classification") is to validate that both classification paths work. For full coverage the stubs need a real resolvable entry point so `probeFile` can find it and route through `detectNodeModules`.

**Fix:** Add an `index.js` file (even a one-liner) alongside `index.d.ts` in each stub package so that `probeFile` finds the entry point and the resolver exercises `detectNodeModules`:

```
// test/fixtures/expo-basic/node_modules/react-native/index.js
// stub — intentionally empty; allows probeFile to resolve this package entry
```

Then add a second assertion in each test that verifies `r.kind === "external"` was reached via the resolved file path (or add a dedicated test that imports from a relative path that resolves into node_modules to prove `detectNodeModules` fires).

---

### CR-02: `ctxFor` uses a CWD-relative path — tests silently produce wrong results if `process.cwd()` is not the repo root

**File:** `test/core/resolver/expo-stubs.test.ts:8`

**Issue:** `ctxFor` calls `path.resolve(rootRel)` where `rootRel` is `"test/fixtures/expo-basic"` or `"test/fixtures/expo-tabs-and-dynamic"`. `path.resolve` with a relative path resolves against `process.cwd()` at runtime. If vitest is invoked from any directory other than the project root — or if the vitest config sets `root` to a different directory — the resolved path is wrong. The `fromFile` on lines 19, 44–47, 60–62 uses the same `path.resolve("test/fixtures/...")` pattern with the same fragility.

When the path is wrong, `resolveModule` returns `{ ok: false, kind: "not-found" }`. The test structure is:

```ts
expect(r.ok).toBe(true);      // fails here — stops vitest with an assertion error
if (r.ok) {
  expect(r.kind).toBe("external");  // never reached
}
```

This means a cwd mismatch produces a test failure rather than a wrong-path false positive, which is marginally better — but it also means that on a CI runner whose cwd differs from the repo root, the suite will fail with a confusing "expected false to be true" message rather than a path-resolution diagnosis.

**Fix:** Use `import.meta.url` (ESM) or `__dirname` (CJS) plus a computed path from the test file location to guarantee a correct absolute path regardless of cwd:

```ts
import { fileURLToPath } from "node:url";
const FIXTURES = fileURLToPath(new URL("../../fixtures", import.meta.url));

function ctxFor(fixtureName: string): ParseContext {
  return {
    resolvedRoot: path.join(FIXTURES, fixtureName),
    // ...
  };
}
```

---

## Warnings

### WR-01: `expo-router/index.d.ts` stub is a `.d.ts` declaration file — the resolver's `probeFile` may not recognise it as a valid module entry

**File:** `test/fixtures/expo-basic/node_modules/expo-router/index.d.ts:1`
**Also:** `test/fixtures/expo-tabs-and-dynamic/node_modules/expo-router/index.d.ts:1`

**Issue:** The `package.json` declares `"main": "index.js"`. There is no `index.js`. The only file present is `index.d.ts`. The resolver's `probeFile` (in `src/core/resolver/relative.ts`) probes for extensions like `.ts`, `.tsx`, `.js`, `.jsx`, and index variants. Whether it probes `.d.ts` files is not clear from the visible code — but even if it does, a `.d.ts` file is a declaration-only artifact, not a real module entry. If the resolver's probe list includes `.d.ts`, it would resolve `expo-router` as a local file rather than external, which is the opposite of the intended behaviour. If it does not include `.d.ts`, the probe fails and the bare-specifier path fires (CR-01 above).

**Fix:** Provide a real `index.js` stub alongside `index.d.ts` so the intended resolution path is unambiguous.

---

### WR-02: `(tabs)/index.tsx` uses `className` prop on a react-native `Text` component — invalid in React Native; misleads the parser

**File:** `test/fixtures/expo-tabs-and-dynamic/app/(tabs)/index.tsx:6`

**Issue:** Line 6 renders `<Text className="text-lg font-bold">Home</Text>`. React Native's `Text` component does not accept a `className` prop — that is a web/Tailwind pattern. The stub `react-native/index.d.ts` does include `className?: string` in `StyleProps`, so TypeScript will not flag this. However, the fixture is intended to represent a valid Expo React Native component. Using `className` on RN primitives makes the fixture inaccurate as a representation of real-world RN code and may produce misleading `classNames` parser output (the parser captures `className` attributes into `ComponentDefinition.classNames`). If downstream tests rely on this fixture to assert that RN components do not emit web-style `classNames`, the fixture is wrong.

Additionally, the `active && styles.bold` expression in the `style` prop (`style={[styles.card, active && styles.bold]}`) is a common pattern but `active && styles.bold` evaluates to `false | { fontWeight: "bold" }`. React Native accepts this (ignores falsy entries in a style array), but the parser may emit this as a `raw` expression token rather than a resolved literal, which is worth being explicit about in test expectations.

**Fix:** Remove `className` from the `Text` element if the fixture is meant to model pure RN code:

```tsx
<Text style={{ fontWeight: "bold" }}>Home</Text>
```

Or, if the intent is to test NativeWind/Tailwind-for-RN (which does use `className`), add a comment making this explicit.

---

### WR-03: Test assertions do not guard the `ok: false` path — failing resolution produces misleading error messages

**File:** `test/core/resolver/expo-stubs.test.ts:21-27`

**Issue:** The test pattern is:

```ts
expect(r.ok).toBe(true);
if (r.ok) {
  expect(r.kind).toBe("external");
  if (r.kind === "external") {
    expect(r.packageName).toBe("react-native");
  }
}
```

When `r.ok` is `false`, vitest stops at the first `expect` with `"expected false to be true"`, providing no information about why resolution failed (which specifier, which root, which paths were tried). There is no assertion that produces the `r.tried` paths on failure.

**Fix:** Use `assert` or a custom failure message to surface the resolution context:

```ts
expect(r.ok, `resolveModule failed: ${JSON.stringify(r)}`).toBe(true);
```

---

### WR-04: Both fixture `tsconfig.json` files declare identical `paths` alias `@/*` → `app/*` — the `expo-tabs-and-dynamic` fixture has no test that exercises this alias

**File:** `test/fixtures/expo-tabs-and-dynamic/tsconfig.json:1`

**Issue:** The `tsconfig.json` in `expo-tabs-and-dynamic` declares `"paths": { "@/*": ["app/*"] }`, mirroring `expo-basic`. None of the fixture source files in `expo-tabs-and-dynamic` actually import anything using the `@/` alias — all imports use bare package names (`"react-native"`, `"expo-router"`). The alias configuration is therefore dead weight in the fixture, and no test in `expo-stubs.test.ts` exercises tsconfig path alias resolution against either fixture. If the purpose of including `paths` is to exercise alias resolution, a corresponding test and fixture import are missing.

**Fix:** Either add an alias-using import to the fixture (e.g. `import { Button } from "@/components/Button"` in one of the app files) and a corresponding test case, or remove `paths` from both tsconfigs until an alias test is planned.

---

## Info

### IN-01: `Button.android.tsx` and `Button.ios.tsx` are identical in both fixture trees — platform split is not exercised

**File:** `test/fixtures/expo-basic/app/components/Button.android.tsx:1`
**Also:** `test/fixtures/expo-basic/app/components/Button.ios.tsx:1`
**Also:** `test/fixtures/expo-tabs-and-dynamic/app/components/Button.android.tsx:1`
**Also:** `test/fixtures/expo-tabs-and-dynamic/app/components/Button.ios.tsx:1`

**Issue:** All four platform-variant files are byte-for-byte identical (`View` import, `Button` component returning `<View />`). If the parser is expected to handle platform-specific file resolution (`.android.tsx` vs `.ios.tsx` vs `.tsx` disambiguation), having identical content means any test relying on distinguishing which variant was resolved cannot detect a wrong-file selection bug. The `.android` and `.ios` variants are only useful as fixtures if they differ from each other and from the base file in some observable way.

**Fix:** Give each platform variant a distinct, observable difference — different component name, different rendered output, or at minimum a different text child — so a test can assert that the correct variant was resolved:

```tsx
// Button.android.tsx
export default function ButtonAndroid() { return <View><Text>Android</Text></View>; }

// Button.ios.tsx
export default function ButtonIOS() { return <View><Text>iOS</Text></View>; }
```

---

### IN-02: `expo-router/index.d.ts` stubs declare `TabsComponent` and `StackComponent` interfaces using `Record<string, any>` for `options` — overly permissive typing offers no signal to the parser

**File:** `test/fixtures/expo-basic/node_modules/expo-router/index.d.ts:7`

**Issue:** `options?: Record<string, any>` is typed as fully open. For a test fixture this is acceptable for brevity, but the `Stack` component is declared in the stub but never imported in any fixture file. If future tests intend to exercise `Stack`-based navigation, the fixture is ready; but currently the `Stack` export is unused dead code in the stub. This is a minor clarity issue.

**Fix:** No action required for correctness. If `Stack` remains unused after the full fixture suite is built out, remove it from the stub to keep the surface minimal and reduce confusion.

---

### IN-03: `react-native/index.d.ts` declares `StyleProp`, `ViewStyle`, `TextStyle` — none are imported or used in any fixture component

**File:** `test/fixtures/expo-basic/node_modules/react-native/index.d.ts:22-24`

**Issue:** The three type aliases (`StyleProp<T>`, `ViewStyle`, `TextStyle`) are exported but not used anywhere in either fixture tree. Since these are `.d.ts` declaration files the unused exports have no runtime cost, but they add surface area to the stub that is not covered by any test assertion. If the parser encounters these type names in a fixture, it would need to handle them — currently it never does.

**Fix:** Remove unused type exports from the stub to keep it minimal, or add fixture components that use typed style props to justify their presence.

---

_Reviewed: 2026-05-13T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
