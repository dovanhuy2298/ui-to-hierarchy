# Phase 9: Fixture Design & Stub Packages - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-13
**Phase:** 09-fixture-design-stub-packages
**Areas discussed:** Smoke test location, NativeWind className typing, tsconfig base settings, Fixture file JSX depth

---

## Smoke Test Location

| Option | Description | Selected |
|--------|-------------|----------|
| `test/core/resolver/expo-stubs.test.ts` | Matches existing resolver test pattern (barrel, relative, tsconfig-paths all in test/core/resolver/) | ✓ |
| `test/resolver/expo-stubs.test.ts` | New top-level subdir as SPEC literally suggests | |
| `test/fixtures-smoke/expo-stubs.test.ts` | Separate smoke-tests directory | |

**User's choice:** "Bạn kiểm tra cấu trúc thư mục test cũ và tự quyết định nhé" (deferred to Claude)
**Notes:** Claude inspected `find test -name "*.test.ts"` — all resolver tests are under `test/core/resolver/`. Chose `test/core/resolver/expo-stubs.test.ts` as consistent location. SPEC's "or equivalent path" clause covers this.

---

## NativeWind className Typing

| Option | Description | Selected |
|--------|-------------|----------|
| Extend react-native stub with `className?: string` on all style-capable components | Shared StyleProps interface, no extra packages | ✓ |
| Add separate `nativewind` stub package | Realistic but requires 2 stubs per fixture | |
| `@ts-expect-error` comments | Simple but "hacky", not realistic | |

**User's choice:** Extend stub react-native — thêm `className?: string` vào ViewProps
**Follow-up:** Confirmed all components with style prop get className (not just View) — use shared `StyleProps` interface.

---

## tsconfig Base Settings

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal: only `baseUrl` + `paths` | Matches shadcn-barrel fixture pattern | ✓ |
| Expo-realistic: add `jsx: "react-native"`, `esModuleInterop`, `strict` | More realistic but may conflict with vitest/babel setup | |

**User's choice:** Minimal — chỉ baseUrl + paths
**Notes:** Consistent with all existing test fixture tsconfigs in the project.

---

## Fixture File JSX Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal: just enough imports + 1 return statement | Focus on type validity and import coverage | ✓ |
| Realistic: props, nested components, conditional branches | More realistic but Phase 9 smoke test doesn't need it | |

**User's choice:** Minimal
**Notes:** Phase 9 is about resolver classification, not parsing JSX content. Minimal fixtures reduce maintenance burden for Phases 10–15.

---

## Claude's Discretion

- Smoke test location: `test/core/resolver/expo-stubs.test.ts` (deferred by user, decided by Claude after inspecting test directory)
- Exact stub `package.json` fields (version string, main entry)
- Which file in `expo-tabs-and-dynamic` carries NativeWind className usage vs style array syntax
- Component names inside fixture files

## Deferred Ideas

None — discussion stayed within phase scope.
