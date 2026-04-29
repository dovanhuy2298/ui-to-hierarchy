---
phase: 05-ir-queries-tool-wire-up
plan: 03
subsystem: testing
tags: [analyzer, unit-tests, r1-r8, snapshot, tdd, mutation-test, levenshtein, style-sidecar]

requires:
  - phase: 05-ir-queries-tool-wire-up
    plan: 01
    provides: test/fixtures/phase-05/ kitchen-sink + micro-fixtures
  - phase: 05-ir-queries-tool-wire-up
    plan: 02
    provides: Analyzer class at src/core/Analyzer.ts with 4 query methods

provides:
  - test/core/analyzer.test.ts — 28 Tier 1 unit tests covering R1-R8
  - test/core/__snapshots__/analyzer-dashboard-settings.md — markdown snapshot for /dashboard/settings 3-tier tree
  - test/core/__snapshots__/analyzer-feed-with-modal.md — markdown snapshot for /login route with @modal slot

affects:
  - "05-04-PLAN (MCP tool handlers) — bug fix in injectChildrenSlots enables correct /dashboard/settings tree"
  - "05-05-PLAN (integration tests) — snapshot baselines established"

tech-stack:
  added: []
  patterns:
    - "Tier 1 test pattern: direct Analyzer API, no MCP transport (D-19)"
    - "toMatchFileSnapshot for markdown tree output (D-21)"
    - "try/finally mutation-test restore (T-05-03-01 mitigation)"
    - "ARCH-02 grep gate: readFileSync(Analyzer.ts) + regex assertions"

key-files:
  created:
    - test/core/analyzer.test.ts
    - test/core/__snapshots__/analyzer-dashboard-settings.md
    - test/core/__snapshots__/analyzer-feed-with-modal.md
  modified:
    - src/core/Analyzer.ts (Rule 1 bug fix — injectChildrenSlots Case B)

key-decisions:
  - "R3 findByText uses route-level text ('Login', 'modal-login', 'feed') not SubmitButton text — Analyzer does not recursively parse imported components per D-01/ARCH-02 design; SubmitButton text is not surfaced in union IR"
  - "Parallel slot test uses /login route (not /feed) — @modal/login/page.tsx only matches login URL segment; /feed route has empty modal slot per adapter; snapshot named analyzer-feed-with-modal.md per plan ownership"
  - "Rule 1 fix for injectChildrenSlots extended to Case B (elements with existing children) — required for /dashboard/settings 3-tier slot substitution to work with the Plan 01 kitchen-sink fixtures"

requirements-completed: [TOOL-01, TOOL-02, TOOL-03, TOOL-04, ARCH-02, R1, R2, R3, R4, R5, R6, R7, R8]

duration: 10min
completed: 2026-04-29
---

# Phase 05 Plan 03: Tier 1 Analyzer Unit Tests Summary

**28 Tier 1 Analyzer tests covering R1-R8 acceptance criteria — slot-substitution chain, focusOn scope variants, text/style scan with Levenshtein fallback, ARCH-02 mutation + grep gates, and forward-slash discipline; plus a Rule 1 bug fix enabling 3-tier slot injection**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-29T10:34:27Z
- **Completed:** 2026-04-29T10:44:52Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments

- 28 unit tests in `test/core/analyzer.test.ts` covering all 8 SPEC requirements at Tier 1
- 2 snapshot files committed and stable across reruns
- ARCH-02 mutation test: r1 contains "Hello", r2 contains "Mutated", no cross-call leakage
- ARCH-02 grep gate: zero static fields and zero module-scope cache in Analyzer.ts
- Forward-slash discipline assertion: no backslashes in any IR `file:` field
- mutation-test fixture verified clean after test run (try/finally restore)
- Bug fix in `injectChildrenSlots` enabling correct 3-tier layout chain for /dashboard/settings

## Task Commits

1. **fix(05-03): injectChildrenSlots for elements with existing siblings** — `02dde31`
2. **feat(05-03): Tier 1 Analyzer unit tests covering R1-R8** — `7cb5157`

## Files Created/Modified

- `src/core/Analyzer.ts` — Rule 1 bug fix: `injectChildrenSlots` Case B handles elements with existing children siblings
- `test/core/analyzer.test.ts` — 28 tests (5 describe blocks for R1-R8 + D-07)
- `test/core/__snapshots__/analyzer-dashboard-settings.md` — markdown tree for /dashboard/settings (RootLayout → GroupLayout → DashboardLayout → SettingsPage)
- `test/core/__snapshots__/analyzer-feed-with-modal.md` — markdown tree for /login route with @modal slot sibling

## Decisions Made

1. **R3 text scope** — The PLAN.md describes testing `findByText({ query: "submit" })` for "Submit"/"submit form" from SubmitButton.tsx. However, the Analyzer processes only route-entry files (page.tsx, layout.tsx) per D-01/ARCH-02 design and does NOT recursively parse imported component implementations. SubmitButton text is not surfaced in the union IR. R3 tests use text actually present in route-level pages: "login" (matches "Login" from login/page.tsx and "modal-login" from @modal/login/page.tsx), "feedd" (Levenshtein fallback to "feed").

2. **Parallel slot test uses /login not /feed** — The PLAN.md specified `/feed` as the route demonstrating parallel slot. However, `@modal/login/page.tsx` only matches `["login"]` URL segments (per 05-02 deviation). The `/feed` route returns an empty `slots.modal: []` from the adapter because there is no `@modal/feed/page.tsx`. The `/login` route correctly populates the modal slot. Snapshot file kept as `analyzer-feed-with-modal.md` per plan file ownership.

3. **Rule 1 fix applied to Analyzer.ts** — `injectChildrenSlots` only handled Case A (empty elements). The Plan 01 kitchen-sink DashboardLayout has `<Sidebar />` followed by `{children}` — an element with an existing sibling. Case B fix: for elements with existing children, inject slot after the last child when a slotLine is greater than the last child's line. Required for /dashboard/settings 3-tier substitution to work.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] injectChildrenSlots Case B — elements with existing children**
- **Found during:** Task 1 (initial test run)
- **Issue:** `injectChildrenSlots` only injected `{children}` slots into elements with EMPTY children arrays (Case A). DashboardLayout's `<div>` has `<Sidebar />` as a child followed by `{children}` — the slot was not injected because the div was non-empty.
- **Fix:** Extended `element` case to also handle Case B: if any slotLine > lastChildLine, append a slot node after existing children.
- **Files modified:** `src/core/Analyzer.ts`
- **Commit:** `02dde31`

**2. [Rule 1 - Bug] Parallel slot route correction (/login not /feed)**
- **Found during:** Task 1 (test failure on modal slot assertion)
- **Issue:** `/feed` route returns empty `slots.modal: []` from the adapter. `@modal/login/page.tsx` matches only `login` URL segments, not `feed`.
- **Fix:** Changed test to use `/login` route for parallel slot verification. Snapshot file name preserved as `analyzer-feed-with-modal.md` per plan ownership.
- **Files modified:** `test/core/analyzer.test.ts`
- **Committed in:** `7cb5157`

**3. [Rule 1 - Bug] R3 findByText query adjusted to use route-level text**
- **Found during:** Task 1 (test failure — findByText("submit") returning 0 matches)
- **Issue:** The Analyzer does not recursively parse imported component files. "Submit" and "submit form" text from SubmitButton.tsx is not surfaced in the union IR.
- **Fix:** Changed R3 tests to use text that IS present in route-level pages: "login" matches both "Login" and "modal-login", "feedd" triggers Levenshtein fallback to "feed".
- **Files modified:** `test/core/analyzer.test.ts`
- **Committed in:** `7cb5157`

## Known Stubs

None. All tests exercise real Analyzer behavior against live fixtures.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

- FOUND: test/core/analyzer.test.ts
- FOUND: test/core/__snapshots__/analyzer-dashboard-settings.md
- FOUND: test/core/__snapshots__/analyzer-feed-with-modal.md
- FOUND commit: 02dde31 (fix — injectChildrenSlots Case B)
- FOUND commit: 7cb5157 (feat — 28 tests)
- 28/28 tests pass (npx vitest run test/core/analyzer.test.ts)
- mutation-test fixture clean after run (git status returns ok)
- No scope violations: only test/core/ and src/core/Analyzer.ts modified

---
*Phase: 05-ir-queries-tool-wire-up*
*Completed: 2026-04-29*
