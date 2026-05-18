---
phase: 11-adapter-detection-selection-tool-routing
fixed_at: 2026-05-18T00:00:00Z
review_path: .planning/phases/11-adapter-detection-selection-tool-routing/11-REVIEW.md
iteration: 1
findings_in_scope: 12
fixed: 12
skipped: 0
status: all_fixed
---

# Phase 11: Code Review Fix Report

**Fixed at:** 2026-05-18T00:00:00Z
**Source review:** `.planning/phases/11-adapter-detection-selection-tool-routing/11-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 12
- Fixed: 12
- Skipped: 0

## Fixed Issues

### CR-01: Global `_frameworkOverride` singleton — eliminated

**Files modified:** `src/adapters/select.ts`, `src/cli.ts`, `src/mcp/server.ts`, `src/mcp/tools/get-full-hierarchy.ts`, `src/mcp/tools/focus-on.ts`, `src/mcp/tools/find-by-text.ts`, `src/mcp/tools/find-by-style.ts`, `src/mcp/tools/index.ts`, `test/adapters/select.test.ts`
**Commit:** a26ce9a
**Applied fix:** Removed `_frameworkOverride` module-level variable and `setFrameworkOverride` export from `select.ts`. Added `makeHandler(frameworkOverride?: string)` factory to each tool module. Updated `ToolModule` interface in `index.ts` to require `makeHandler`. Updated `createServer(frameworkOverride?)` and `startServer(frameworkOverride?)` in `server.ts` to thread the override into each tool's handler via closure. Updated `cli.ts` to import `VALID_FRAMEWORKS` (satisfying WR-02 simultaneously) and pass `frameworkVal` directly to `startServer()`. Removed `beforeEach(() => setFrameworkOverride(undefined as any))` from `select.test.ts` — no longer needed since there is no global state.

### CR-02: `Promise.allSettled` instead of `Promise.all` in `selectAdapter`

**Files modified:** `src/adapters/select.ts`
**Commit:** a26ce9a
**Applied fix:** Replaced `Promise.all` with `Promise.allSettled`. Rejected settlements degrade to `{ detected: false, signals: [] }` so a single probe error no longer propagates as an unhandled rejection across the entire `selectAdapter` call.

### CR-03: Path-traversal guard on `projectRoot`

**Files modified:** `src/core/resolve-root.ts`
**Commit:** a26ce9a
**Applied fix:** Added two guards after `path.resolve`: (1) reject if `path.dirname(resolved) === resolved` (filesystem root); (2) reject if resolved path equals or starts with `~/.ssh`. Both throw descriptive errors rather than proceeding with probe operations on sensitive paths.

### CR-04: Stale tool description in `get-full-hierarchy.ts`

**Files modified:** `src/mcp/tools/get-full-hierarchy.ts`
**Commit:** a26ce9a
**Applied fix:** Updated `description` from "Next.js App Router" to "file-based router project (Next.js App Router or Expo Router)". Updated `route` parameter description to note Expo Router compatibility. Also extracted `ROUTE_REGEX` as a named constant to support the IN-03 `.refine()` addition cleanly.

### WR-01: `setFrameworkOverride` type signature

**Files modified:** (resolved via CR-01)
**Commit:** a26ce9a
**Applied fix:** Resolved by CR-01 — `setFrameworkOverride` was removed entirely. No type unsafety remains.

### WR-02: Export `VALID_FRAMEWORKS` from `select.ts`, import in `cli.ts`

**Files modified:** `src/adapters/select.ts`, `src/cli.ts`
**Commit:** a26ce9a
**Applied fix:** Added `export const VALID_FRAMEWORKS = ["nextjs", "expo-router"] as const` and `export type FrameworkName = typeof VALID_FRAMEWORKS[number]` to `select.ts`. Updated `cli.ts` to import `VALID_FRAMEWORKS` from `../adapters/select.js` and removed the inline hardcoded array. The error message now uses `VALID_FRAMEWORKS.join(", ")` so it auto-updates when new frameworks are added.

### WR-03: `detectExpoRouter` `.js` and `.jsx` layout variants

**Files modified:** `src/adapters/expo/detect.ts`
**Commit:** a26ce9a
**Applied fix:** Extended `layoutCandidates` array to include `app/_layout.jsx`, `app/_layout.js`, `src/app/_layout.jsx`, and `src/app/_layout.js` in addition to the existing `.tsx` variants.

### WR-04: Align `detect()` with `detectNextJs()` in `next/detect.ts`

**Files modified:** `src/adapters/next/detect.ts`, `test/adapters/next/detect.test.ts`
**Commit:** a26ce9a
**Applied fix:** Replaced `detect(absRoot)` body with a one-line delegation: `const { detected } = await detectNextJs(absRoot); return detected;`. Updated the test assertion for the `next-detect-pages-only` fixture from `false` to `true` — the fixture has both signals (package.json#next + next.config.js) so it is correctly detected by the new two-signal logic; the previous `false` result was the divergent behavior being fixed.
**Note:** This is a behavioral change — requires human verification that callers relying on the old `detect()` behavior (requiring `app/` directory) are not negatively affected in production.

### WR-05 + IN-02: Fix `framework-flag.test.ts` assertions and hardcoded path

**Files modified:** `test/cli/framework-flag.test.ts`
**Commit:** a26ce9a
**Applied fix:** Replaced `path.resolve("e:/ui-to-hierarch")` with `path.resolve(import.meta.dirname, "../..")` (2 levels up from `test/cli/` reaches the project root). Added `expect(result.status).toBeOneOf([null, 0])` assertion to the valid-framework test so a startup crash causes a proper failure rather than a vacuous stderr check.

### IN-01: TODO comment on `ExpoRouterAdapter.detect()`

**Files modified:** `src/adapters/expo/ExpoRouterAdapter.ts`
**Commit:** a26ce9a
**Applied fix:** Replaced the one-line JSDoc with an expanded comment explaining: (1) real detection lives in `detect.ts`; (2) Wave 2 TODO; (3) explicit warning not to call this method for post-selection verification.

### IN-03: `.refine()` on route field in `get-full-hierarchy.ts`

**Files modified:** `src/mcp/tools/get-full-hierarchy.ts`
**Commit:** a26ce9a
**Applied fix:** Extracted the route regex as `ROUTE_REGEX` constant. Added `.refine(v => v === "/" || !v.endsWith("/"), { message: "Route must not have a trailing slash (except root /)" })` after `.regex(ROUTE_REGEX)` to make the trailing-slash constraint explicit and independent of regex structure.

---

## Test Results

All 389 tests pass after fixes (367 passing, 22 skipped — same distribution as before).

---

_Fixed: 2026-05-18T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
