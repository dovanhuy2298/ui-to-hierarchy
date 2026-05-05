---
phase: 06-hardening-fixture-gates
plan: 02
subsystem: testing
tags: [fixtures, next-app-router, route-groups, parallel-slots, dynamic-segments, private-folders]

requires:
  - phase: 04-app-router-adapter
    provides: App Router routing semantics (groups, slots, dynamic segments, private folders) implemented in adapter
  - phase: 05-ir-queries-tools
    provides: Fixture conventions established by phase-05/kitchen-sink (analog for shape porting)
provides:
  - Hand-crafted nested-routes fixture exercising route group + private folder + parallel slots + dynamic [id] + loading/error/not-found siblings
  - SPEC R2 acceptance target (routing semantics)
  - SPEC R7 cold-spawn perf target (120 spawns)
  - SPEC R6 manual UAT target (Claude Code + MCP Inspector)
  - Unique find_by_text markers wired per-page so invariants can pinpoint a route
affects: [06-04 integration suite, 06-05 perf script, 06-07 manual UAT]

tech-stack:
  added: []
  patterns:
    - "Hand-authored fixtures only (no node_modules, no package.json, no Next.js scaffold)"
    - "One default-export-only component per page/layout file (PITFALLS §3.3)"
    - "Unique visible text markers per page to anchor find_by_text invariants"

key-files:
  created:
    - test/fixtures/phase-06/nested-routes/tsconfig.json
    - test/fixtures/phase-06/nested-routes/next.config.js
    - test/fixtures/phase-06/nested-routes/app/layout.tsx
    - test/fixtures/phase-06/nested-routes/app/(group)/layout.tsx
    - test/fixtures/phase-06/nested-routes/app/(group)/_internal/page.tsx
    - test/fixtures/phase-06/nested-routes/app/(group)/dashboard/layout.tsx
    - test/fixtures/phase-06/nested-routes/app/(group)/dashboard/loading.tsx
    - test/fixtures/phase-06/nested-routes/app/(group)/dashboard/error.tsx
    - test/fixtures/phase-06/nested-routes/app/(group)/dashboard/not-found.tsx
    - test/fixtures/phase-06/nested-routes/app/(group)/dashboard/[id]/page.tsx
    - test/fixtures/phase-06/nested-routes/app/(group)/dashboard/[id]/@sidebar/page.tsx
    - test/fixtures/phase-06/nested-routes/app/(group)/dashboard/[id]/@main/page.tsx
  modified: []

key-decisions:
  - "Single fixture stresses all four App Router routing edges (groups, slots, dynamic, private) per SPEC R2"
  - "error.tsx is the only file with 'use client' (Next.js convention requirement)"
  - "No path aliases — fixture is self-contained (alias coverage lives in shadcn-barrels and pnpm-monorepo fixtures)"
  - "Unique text markers per page: 'private-internal-marker', 'Sidebar slot', 'Dashboard {id}' — pin find_by_text invariants to specific routes"

patterns-established:
  - "Phase-06 fixtures live under test/fixtures/phase-06/<name>/ with bundler-resolution tsconfig and a next.config.js detection marker"
  - "App Router fixture pages each have exactly one default export, return one JSX element, and use realistic Tailwind layout tokens (flex, grid, flex-col, grid-cols-3)"

requirements-completed: [ARCH-04]

duration: ~5min
completed: 2026-05-05
---

# Phase 06 Plan 02: nested-routes Fixture Summary

**Hand-crafted 12-file Next.js App Router fixture exercising route groups, parallel slots, dynamic [id], private folders, and loading/error/not-found siblings — single most-exercised fixture for SPEC R2 / R6 / R7.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-05
- **Completed:** 2026-05-05
- **Tasks:** 1
- **Files modified:** 12 (all created)

## Accomplishments
- Authored full nested-routes fixture tree covering all four App Router routing edges in a single project (groups, parallel slots, dynamic, private)
- Wired unique find_by_text markers per leaf page so downstream integration invariants can negative-assert private-folder exclusion and positive-assert per-route content
- Established tsconfig (bundler resolution) + next.config.js detection markers consistent with phase-05/kitchen-sink analog
- Met all forbidden-artifact constraints: no node_modules, no package.json, no route.ts

## Task Commits

1. **Task 1: Author nested-routes fixture tree** — `9968269` (test)

## Files Created
- `test/fixtures/phase-06/nested-routes/tsconfig.json` — bundler tsconfig
- `test/fixtures/phase-06/nested-routes/next.config.js` — Next.js detection marker
- `test/fixtures/phase-06/nested-routes/app/layout.tsx` — root layout
- `test/fixtures/phase-06/nested-routes/app/(group)/layout.tsx` — route-group layout (no URL segment)
- `test/fixtures/phase-06/nested-routes/app/(group)/_internal/page.tsx` — private folder page (`private-internal-marker` text)
- `test/fixtures/phase-06/nested-routes/app/(group)/dashboard/layout.tsx` — dashboard layout
- `test/fixtures/phase-06/nested-routes/app/(group)/dashboard/loading.tsx` — loading sibling
- `test/fixtures/phase-06/nested-routes/app/(group)/dashboard/error.tsx` — error sibling (`"use client"` required)
- `test/fixtures/phase-06/nested-routes/app/(group)/dashboard/not-found.tsx` — not-found sibling
- `test/fixtures/phase-06/nested-routes/app/(group)/dashboard/[id]/page.tsx` — dynamic detail page
- `test/fixtures/phase-06/nested-routes/app/(group)/dashboard/[id]/@sidebar/page.tsx` — `@sidebar` parallel slot leaf (`Sidebar slot` text)
- `test/fixtures/phase-06/nested-routes/app/(group)/dashboard/[id]/@main/page.tsx` — `@main` parallel slot leaf

## Acceptance Verification
- All 12 files exist (node verifier script returned `ok`).
- `"use client"` count in `error.tsx`: 1.
- `private-internal-marker` hits in fixture: 1 (only in `_internal/page.tsx`).
- `Sidebar slot` hits in fixture: 1 (only in `@sidebar/page.tsx`).
- `export default function` count under `app/`: 10 (one per page/layout file).
- `node_modules/` absent, `package.json` absent, `route.ts` count: 0.

## Decisions Made
None beyond decisions already encoded in the plan — followed plan as specified.

## Deviations from Plan
None — plan executed exactly as written.

## Issues Encountered
- Initial Write attempts used the main-repo absolute path (`E:\ui-to-hierarch\…`) rather than the worktree absolute path (`E:\ui-to-hierarch\.claude\worktrees\agent-…\…`); the writes silently landed outside the worktree and produced empty directories from the prior `mkdir`. Resolved by re-issuing Writes with the full worktree-absolute path. Final fixture contents verified via `find` and the plan's node verifier.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Fixture is ready for consumption by Wave 1 integration suite (06-04), Wave 2 perf script (06-05), and manual UAT (06-07).
- Routing-semantics correctness will be exercised end-to-end by 06-04 — this plan only authors the on-disk shape.

## Self-Check: PASSED

Verified files exist:
- FOUND: test/fixtures/phase-06/nested-routes/tsconfig.json
- FOUND: test/fixtures/phase-06/nested-routes/next.config.js
- FOUND: test/fixtures/phase-06/nested-routes/app/layout.tsx
- FOUND: test/fixtures/phase-06/nested-routes/app/(group)/layout.tsx
- FOUND: test/fixtures/phase-06/nested-routes/app/(group)/_internal/page.tsx
- FOUND: test/fixtures/phase-06/nested-routes/app/(group)/dashboard/layout.tsx
- FOUND: test/fixtures/phase-06/nested-routes/app/(group)/dashboard/loading.tsx
- FOUND: test/fixtures/phase-06/nested-routes/app/(group)/dashboard/error.tsx
- FOUND: test/fixtures/phase-06/nested-routes/app/(group)/dashboard/not-found.tsx
- FOUND: test/fixtures/phase-06/nested-routes/app/(group)/dashboard/[id]/page.tsx
- FOUND: test/fixtures/phase-06/nested-routes/app/(group)/dashboard/[id]/@sidebar/page.tsx
- FOUND: test/fixtures/phase-06/nested-routes/app/(group)/dashboard/[id]/@main/page.tsx

Verified commit:
- FOUND: 9968269

---
*Phase: 06-hardening-fixture-gates*
*Plan: 02*
*Completed: 2026-05-05*
