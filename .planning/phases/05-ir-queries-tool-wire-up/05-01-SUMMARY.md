---
phase: 05-ir-queries-tool-wire-up
plan: 01
subsystem: testing
tags: [nextjs, app-router, fixtures, tsx, babel, vitest]

# Dependency graph
requires:
  - phase: 04-next-js-app-router-adapter
    provides: NextJsAdapter that consumes these fixtures via test/fixtures/phase-05/
provides:
  - test/fixtures/phase-05/kitchen-sink/ — 15-file Next.js App Router fixture covering R1-R7 acceptance
  - test/fixtures/phase-05/micro/parse-error/ — syntax-broken fixture for R8 kind:error IR node
  - test/fixtures/phase-05/micro/mutation-test/ — stable fixture for R5 ARCH-02 per-call cache test
affects:
  - 05-02 (Analyzer unit tests consume kitchen-sink and micro-fixtures)
  - 05-03 (MCP integration tests use these fixtures)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "kitchen-sink fixture pattern: single stable Next.js project covering all R1-R7 acceptance examples in one tree"
    - "micro-fixture pattern: isolated per-corner-case projects so kitchen-sink snapshot stays stable"

key-files:
  created:
    - test/fixtures/phase-05/kitchen-sink/tsconfig.json
    - test/fixtures/phase-05/kitchen-sink/next.config.js
    - test/fixtures/phase-05/kitchen-sink/app/layout.tsx
    - test/fixtures/phase-05/kitchen-sink/app/(group)/layout.tsx
    - test/fixtures/phase-05/kitchen-sink/app/(group)/dashboard/layout.tsx
    - test/fixtures/phase-05/kitchen-sink/app/(group)/dashboard/page.tsx
    - test/fixtures/phase-05/kitchen-sink/app/(group)/dashboard/settings/page.tsx
    - test/fixtures/phase-05/kitchen-sink/app/(group)/profile/page.tsx
    - test/fixtures/phase-05/kitchen-sink/app/@modal/login/page.tsx
    - test/fixtures/phase-05/kitchen-sink/app/feed/page.tsx
    - test/fixtures/phase-05/kitchen-sink/app/components/Card.tsx
    - test/fixtures/phase-05/kitchen-sink/app/components/Sidebar.tsx
    - test/fixtures/phase-05/kitchen-sink/app/components/Header.tsx
    - test/fixtures/phase-05/kitchen-sink/app/components/SubmitButton.tsx
    - test/fixtures/phase-05/kitchen-sink/app/components/StyledThing.tsx
    - test/fixtures/phase-05/micro/parse-error/tsconfig.json
    - test/fixtures/phase-05/micro/parse-error/app/layout.tsx
    - test/fixtures/phase-05/micro/parse-error/app/page.tsx
    - test/fixtures/phase-05/micro/mutation-test/tsconfig.json
    - test/fixtures/phase-05/micro/mutation-test/app/layout.tsx
    - test/fixtures/phase-05/micro/mutation-test/app/page.tsx
  modified: []

key-decisions:
  - "Worktree path: all files written to /e/ui-to-hierarch/.claude/worktrees/agent-ad3537a239201f8eb/ — initial writes to main repo were corrected"
  - "parse-error fixture uses unterminated JSX tag that triggers Babel catch path even with errorRecovery:true (JSX+TS combination)"
  - "SubmitButton uses named export default; StyledThing uses named export default — both match standard Next.js component conventions"
  - "dashboard/layout.tsx renders <Sidebar /> as standalone (no children) to test independent layout component usage"

patterns-established:
  - "D-16 kitchen-sink pattern: one stable fixture tree covering broadest acceptance surface, micro-fixtures for per-corner-case isolation"
  - "D-17 real on-disk .tsx files: fixture files are static, readable, reproducible — no programmatic generation"
  - "D-18 verbatim fixture names: acceptance examples map mechanically to filenames (grep-able verification)"

requirements-completed: [TOOL-01, TOOL-02, TOOL-03, TOOL-04, ARCH-02, R1, R2, R3, R4, R5, R7, R8]

# Metrics
duration: 4min
completed: 2026-04-29
---

# Phase 5 Plan 01: Fixture Project Tree Summary

**21 on-disk Next.js App Router fixture files for Phase 5 acceptance — kitchen-sink covering R1-R7 + two micro-fixtures for R8 parse-error and R5 ARCH-02 mutation test**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-29T10:12:46Z
- **Completed:** 2026-04-29T10:17:18Z
- **Tasks:** 2
- **Files modified:** 21

## Accomplishments

- Kitchen-sink fixture with 3-tier nested layouts, parallel @modal route, Card referenced from 2 routes, SubmitButton (use client + Submit/submit form text), and StyledThing (flex className tokens + marginTop/color style keys + dedup p element)
- parse-error micro-fixture with intentionally broken JSX that triggers Babel's catch path even under errorRecovery:true
- mutation-test micro-fixture with exactly one 'Hello' literal for ARCH-02 per-call cache verification

## Task Commits

Each task was committed atomically:

1. **Task 1: Create kitchen-sink fixture project** - `1786140` (feat)
2. **Task 2: Create parse-error and mutation-test micro-fixtures** - `b21e063` (feat)

**Plan metadata:** (docs commit pending)

## Files Created/Modified

- `test/fixtures/phase-05/kitchen-sink/app/components/SubmitButton.tsx` - "use client" + Submit/submit form text (R3/R7 acceptance)
- `test/fixtures/phase-05/kitchen-sink/app/components/StyledThing.tsx` - className="flex items-center", style={{ marginTop: 8, color: "red" }}, dedup `<p className="flex" style={{ flex: 1 }}>` (R4 acceptance)
- `test/fixtures/phase-05/kitchen-sink/app/(group)/dashboard/settings/page.tsx` - terminal page at 3-tier layout depth (R1 acceptance)
- `test/fixtures/phase-05/kitchen-sink/app/@modal/login/page.tsx` - parallel @modal route slot (R1 acceptance #3)
- `test/fixtures/phase-05/micro/parse-error/app/page.tsx` - unterminated JSX tag for R8 kind:error test
- `test/fixtures/phase-05/micro/mutation-test/app/page.tsx` - single Hello literal for R5 ARCH-02 test

## Decisions Made

- Worktree path correction: initial file writes landed in main repo (`E:\ui-to-hierarch\test\fixtures\phase-05`) and were copied + removed to the correct worktree path.
- parse-error fixture: the unterminated JSX `<div className="hello"` followed by `}` causes Babel to throw even under `errorRecovery: true` when using jsx+typescript plugins together. This is the expected behavior — `parseFile` catches the thrown error and returns `{ kind: "error" }`, satisfying R8.
- dashboard/layout.tsx renders `<Sidebar />` (no children) and the `{children}` slot separately — this matches real Next.js App Router usage where the layout file's own components are siblings to the children slot.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Initial file writes went to the main repo working directory (`E:\ui-to-hierarch\`) instead of the worktree (`E:\ui-to-hierarch\.claude\worktrees\agent-ad3537a239201f8eb\`). Corrected by copying to the worktree path and removing from the main repo (which had no git tracking at that path anyway).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 21 fixture files are committed and stable on the worktree branch
- Kitchen-sink fixture is the snapshot anchor for Plan 02 (Analyzer) and Plan 05 (MCP integration) tests
- parse-error micro-fixture exercises the `parseFile` catch path → `kind:"error"` result (R8)
- mutation-test micro-fixture has exactly 1 Hello literal — Plan 02 test can rewrite it and restore in `finally` (R5/ARCH-02)
- No blockers for Plan 02 proceeding immediately

---
*Phase: 05-ir-queries-tool-wire-up*
*Completed: 2026-04-29*

## Self-Check: PASSED

- FOUND: test/fixtures/phase-05/kitchen-sink/app/components/SubmitButton.tsx
- FOUND: test/fixtures/phase-05/kitchen-sink/app/components/StyledThing.tsx
- FOUND: test/fixtures/phase-05/kitchen-sink/app/(group)/dashboard/settings/page.tsx
- FOUND: test/fixtures/phase-05/kitchen-sink/app/@modal/login/page.tsx
- FOUND: test/fixtures/phase-05/micro/parse-error/app/page.tsx
- FOUND: test/fixtures/phase-05/micro/mutation-test/app/page.tsx
- FOUND: .planning/phases/05-ir-queries-tool-wire-up/05-01-SUMMARY.md
- FOUND commit: 1786140 (kitchen-sink fixture)
- FOUND commit: b21e063 (micro-fixtures)
