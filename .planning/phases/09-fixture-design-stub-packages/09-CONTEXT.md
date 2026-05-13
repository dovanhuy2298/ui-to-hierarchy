# Phase 9: Fixture Design & Stub Packages - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Create two Expo Router fixture projects under `test/fixtures/` — `expo-basic` and `expo-tabs-and-dynamic` — each with stub `node_modules/` (react-native + expo-router), a tsconfig with `@/` alias, and platform-suffix file pairs. A dedicated smoke test confirms the resolver classifies both packages as `kind: "external"`. No production source changes.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**7 requirements are locked.** See `09-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `09-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- Two fixture directory trees under `test/fixtures/` with exact file shapes listed in Requirements 1–2
- Local `node_modules/` stubs (react-native, expo-router) inside each fixture — `package.json` + minimal `index.d.ts` only
- `tsconfig.json` with `@/` path alias per fixture
- Platform-suffix file pairs (`Button.ios.tsx`, `Button.android.tsx`) in both fixtures
- One dedicated smoke test file verifying `kind: "external"` classification

**Out of scope (from SPEC.md):**
- Any FrameworkAdapter, ExpoRouterAdapter, or Expo-specific parsing logic (Phases 10–12)
- `selectAdapter` or adapter detection logic (Phase 11)
- Style extraction logic (Phase 13)
- Platform-suffix resolver fallback logic (Phase 14)
- Integration test suite (Phase 15)
- Any changes to `src/` production code

</spec_lock>

<decisions>
## Implementation Decisions

### Smoke Test Location
- **D-01:** Place smoke test at `test/core/resolver/expo-stubs.test.ts` — matches existing resolver test pattern (`barrel.test.ts`, `relative.test.ts`, `tsconfig-paths.test.ts` all live in `test/core/resolver/`). The SPEC's "or equivalent path" clause applies here.

### NativeWind className Type Handling
- **D-02:** Extend the `react-native` stub's `index.d.ts` to add `className?: string` to all components that have a `style` prop (View, Text, ScrollView, TouchableOpacity, Pressable, etc.). Use a shared `interface StyleProps { className?: string; style?: any }` pattern so every primitive picks it up. No separate `nativewind` stub needed. No `@ts-expect-error` comments.

### tsconfig Base Settings
- **D-03:** Minimal tsconfig — only `baseUrl: "."` and `paths: { "@/*": ["app/*"] }`. No jsx/module/strict additions. Matches existing fixture pattern (e.g., `test/fixtures/parser/resolver/shadcn-barrel/tsconfig.json`). Both fixtures use `./app/*` as the alias target (no `src/` subdir).

### Fixture File JSX Content
- **D-04:** Minimal content — just enough imports + 1 return statement per file. Sufficient to exercise the import APIs (Slot, Tabs, StyleSheet.create, className prop, style array) without adding noise. Focus is on TypeScript validity and import coverage, not realistic screen content.

### Claude's Discretion
- Exact stub `package.json` fields (version string, main entry) — use standard minimal form: `{ "name": "...", "version": "0.0.0", "main": "index.js" }`
- Which specific file in `expo-tabs-and-dynamic` carries NativeWind `className` usage and which carries style array syntax — planner decides based on natural fit
- Component names inside fixture files — keep them simple (e.g., `HomeScreen`, `TabsLayout`)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Spec
- `.planning/phases/09-fixture-design-stub-packages/09-SPEC.md` — Locked requirements, boundaries, acceptance criteria (15 checkboxes). MUST read before planning.

### Existing Resolver Code
- `src/core/resolver/node-modules.ts` — `packageNameFromSpecifier` and `detectNodeModules` — the two functions the smoke test will exercise. Read to understand what makes a bare specifier classify as `kind: "external"`.
- `src/core/resolver/index.ts` — `resolveModule()` entry point — smoke test calls this directly.

### Existing Fixture Patterns
- `test/fixtures/next-app-router/` — existing Next.js fixture structure (no `node_modules/` stubs, minimal files)
- `test/fixtures/parser/resolver/shadcn-barrel/tsconfig.json` — minimal tsconfig pattern to replicate

### Existing Resolver Test Patterns
- `test/core/resolver/barrel.test.ts` — canonical example of how resolver tests are structured (direct `resolveModule()` call, `ctxFor()` helper)
- `test/core/resolver/tsconfig-paths.test.ts` — shows how tsconfig alias resolution is tested against fixture files

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ctxFor(rootRel)` helper pattern from `test/core/resolver/barrel.test.ts` — builds a `ParseContext` from a relative root path; smoke test should use same pattern
- `resolveModule(ctx, fromFile, specifier, importedName)` — smoke test calls this directly with a bare specifier like `"react-native"` to assert `kind: "external"`

### Established Patterns
- Fixture tsconfigs are minimal — only the fields the resolver needs (baseUrl + paths)
- Resolver tests use `path.resolve(rootRel)` for fixture paths, keeping tests portable
- No `node_modules/` stubs exist in current Next.js fixtures — Expo fixtures are the first to need them
- All resolver unit tests invoke `resolveModule()` directly, never spawn the binary

### Integration Points
- `detectNodeModules(absPath)` gets invoked when a file path contains `/node_modules/` — the stubs ensure this code path can be tested
- `packageNameFromSpecifier("react-native")` already returns `"react-native"` without any stub; stubs are needed for TypeScript validity inside fixture files, not for resolver behavior

</code_context>

<specifics>
## Specific Ideas

- NativeWind className approach: shared `StyleProps` interface in stub `index.d.ts` covering all style-capable primitives — not per-component duplication
- tsconfig alias: `@/*` → `app/*` (not `src/*`) since fixtures have no `src/` dir

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 09-fixture-design-stub-packages*
*Context gathered: 2026-05-13*
