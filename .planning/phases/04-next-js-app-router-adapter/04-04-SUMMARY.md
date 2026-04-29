---
phase: 04-next-js-app-router-adapter
plan: 04
subsystem: adapters/next
tags: [next, adapter, runtime, integration, phase-gate]
requires:
  - src/adapters/next/detect.ts (plan 02)
  - src/adapters/next/discover.ts (plan 02)
  - src/adapters/next/route-map.ts (plan 03)
  - src/adapters/types.ts (RouteMatch + runtime field, plan 01)
  - test/fixtures/next-app-router/* (D-16 fixture variants)
provides:
  - NextJsAdapter — first complete FrameworkAdapter implementation
  - All 5 adapter methods functional (no throwing stubs)
  - runtime: "server" | "client" populated on every ComponentDefinition
affects:
  - phase 5 (toIR consumes RouteMatch + runtime when building TreeNodes)
tech-stack:
  added: []
  patterns:
    - "Delegating shim (3 one-liners) over sibling modules — keeps adapter file thin"
    - "Babel directive prologue read: ast.program.directives[0]?.value.value (per-file scope)"
    - "Default-server runtime mapping: \"use client\" → client, anything else → server"
key-files:
  modified:
    - src/adapters/next/NextJsAdapter.ts
    - test/adapters/next/NextJsAdapter.test.ts
    - tsconfig.json
  created:
    - test/adapters/next/runtime.test.ts
decisions:
  - "Synthetic parse-error ComponentDefinition defaults to runtime: \"server\" — no directive available"
  - "tsconfig fixtures exclusion extended to next-app-router and next-detect-* (mirrors parser fixture pattern; pre-existing JSX/no-jsx-flag errors that pre-date this plan)"
  - "ROADMAP/REQUIREMENTS/STATE updates intentionally deferred — executor instructed not to modify them in worktree (orchestrator handles after merge)"
metrics:
  duration_minutes: ~8
  tasks_completed: 3
  files_changed: 4
  tests_added: 11
  completed_date: 2026-04-29
---

# Phase 04 Plan 04: NextJsAdapter Wiring + Runtime Plumbing Summary

NextJsAdapter is now a fully-functional FrameworkAdapter — three previously-throwing stubs (`detect`, `discoverEntries`, `mapRouteToEntry`) became one-line async shims over `detect.ts` / `discover.ts` / `route-map.ts`, and every `ComponentDefinition` carries a `runtime: "server" | "client"` field derived from `ast.program.directives[0]`.

## What Shipped

### `src/adapters/next/NextJsAdapter.ts`
- **3 stubs replaced** with delegating async shims:
  - `detect(absRoot)` → `detectNextProject(absRoot)`
  - `discoverEntries(absRoot)` → `discoverNextEntries(absRoot)`
  - `mapRouteToEntry(absRoot, route)` → `matchRoute(absRoot, route)`
- **`buildComponentDefinition` runtime plumbing** (NEXT-04 / D-10..D-12):
  - Reads `ast.program.directives[0]?.value.value`
  - `"use client"` → `runtime: "client"`; anything else → `runtime: "server"` (App Router default)
  - Babel's directive-prologue rule means leading comments do NOT block detection
- **Synthetic parse-error record** now includes `runtime: "server"` — the 13-field shape stays exhaustive
- **JSDoc** updated to reflect Phase 4 completion

### `test/adapters/next/NextJsAdapter.test.ts`
- Dropped the "throws not implemented in Phase 3" assertion
- Added 3 positive smoke tests against the real fixtures (`detect` → true on `next-detect-with-app`; `discoverEntries` returns string[] on `next-app-router`; `mapRouteToEntry` returns matched RouteMatch for `/dashboard/settings`)
- Updated sorted-keys array to expect the 13-field shape (`runtime` between `renderFlow` and `styledTemplates`)
- Added runtime-value membership assertion

### `test/adapters/next/runtime.test.ts` (new — 8 cases)
Covers all four D-16 fixture variants plus per-file scope and full-shape assertions:

| Fixture | Expected runtime |
| ------- | ---------------- |
| `app/(marketing)/about/page.tsx` (`"use client"` line 1) | `client` |
| `app/dashboard/page.tsx` (no directive) | `server` |
| `app/blog/[slug]/page.tsx` (`"use server"`) | `server` |
| `app/maybe/[[...opt]]/page.tsx` (comments before `"use client"`) | `client` |
| `app/layout.tsx` (root layout, no directive) | `server` |
| `app/page.tsx` (no directive) | `server` |

Per-file-scope test asserts every component returned for one file shares the same `runtime` value. Full-shape assertion confirms `Object.keys(comp).includes("runtime")` for every `ComponentDefinition` returned across all kitchen-sink leaves.

## Verification

- `npx vitest run` → **188 passed (29 files)**, 5 skipped, 0 failures.
- `npx tsc --noEmit` → exit 0 (transient 11→12 field error from plan 01 resolved by this plan).
- New tests added by this plan: **11** (3 positive smoke tests in `NextJsAdapter.test.ts` + 8 cases in `runtime.test.ts`). One existing case dropped (the throws assertion).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] tsconfig fixture exclusion**
- **Found during:** Task 1 verification (`npx tsc --noEmit`)
- **Issue:** `test/fixtures/next-app-router/**` and `test/fixtures/next-detect-*/**` were not excluded from tsconfig, producing 59 pre-existing TS17004 / TS7026 JSX-flag errors (these fixtures exist as plain `.tsx` source for the parser to read; they should never be type-checked by the project tsconfig).
- **Fix:** Extended `exclude` in `tsconfig.json` to add the five `next-*` fixture roots, mirroring the existing `test/fixtures/parser/**` exclusion pattern.
- **Files modified:** `tsconfig.json`
- **Commit:** `9f2f551`

**2. [Rule 3 — Blocking] dist/cli.js missing for smoke test**
- **Found during:** Task 4 full-suite verification
- **Issue:** `test/mcp/smoke.spawn.test.ts` requires a built `dist/cli.js` from `npm run build` to spawn. In a fresh worktree the file is absent, failing the whole-suite gate. Pre-existing (not introduced by plan 04-04).
- **Fix:** Ran `npx tsup` to produce `dist/cli.js` before re-running the suite. Output is gitignored; not committed.
- **No file changes committed.**

### Intentionally Skipped (Plan Task 4 partial)

The plan's Task 4 prescribed updates to `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, and `.planning/STATE.md`. Per the executor invocation directive ("Do NOT update STATE.md or ROADMAP.md") these were **deliberately skipped** so the orchestrator can perform them after merging the worktree. All other Task 4 verification steps were performed.

### Pre-existing Out-of-Scope Issues (Not Fixed)

- `npx biome check src test` exits non-zero (59 errors / 18 warnings) due to lint issues in files authored by plans 02 and 03 (`segments.ts`, `discover.ts`, `detect.ts`, etc.). These pre-date plan 04-04. Logged here but not fixed — out of scope per executor scope-boundary rule.

## Acceptance Criteria — All Met

- [x] `grep "not implemented in Phase 3" src/adapters/next/NextJsAdapter.ts` → 0 matches
- [x] `from "./detect.js"`, `from "./discover.js"`, `from "./route-map.js"` each appear once
- [x] `ast.program.directives[0]` appears once
- [x] `runtime: "server"` (synthetic record) and `runtime,` (built record) both present
- [x] All 3 shims declared `async`
- [x] `npx tsc --noEmit` exits 0
- [x] All architecture/island tests still green
- [x] All previously-passing tests still pass (no regressions)
- [x] All 8 NEXT-04 runtime-test cases pass
- [x] All 4 D-16 fixture variants tested independently
- [x] Per-file scope assertion passes
- [x] Full-shape assertion (`runtime` field on every record) passes

## Hand-off Notes for Phase 5

- `RouteMatch` consumer in Phase 5 is `toIR()` — it reads `entries`/`params`/`slots` to build the layout chain.
- `runtime` consumer in Phase 5 is the IR `TreeNode` translator — decides where the client/server boundary renders in the hierarchy output.
- All four NEXT-* requirements (NEXT-01 layout chain, NEXT-02 dynamic params, NEXT-03 parallel slots, NEXT-04 runtime field) are now closed at the adapter layer; Phase 5 wires them into the public MCP tools.

## TDD Gate Compliance

Plan type was `execute` (not `tdd`). The atomic commits split test/feat appropriately:
- `feat(04-04): wire NextJsAdapter shims and plumb runtime field` (commit 9f2f551)
- `test(04-04): assert 13-field shape and positive smoke tests for NextJsAdapter` (commit 0ecf86b)
- `test(04-04): cover NEXT-04 runtime boundary across D-16 fixture variants` (commit 668cc65)

## Self-Check: PASSED

- src/adapters/next/NextJsAdapter.ts — FOUND
- test/adapters/next/NextJsAdapter.test.ts — FOUND
- test/adapters/next/runtime.test.ts — FOUND
- tsconfig.json — FOUND (modified)
- Commit 9f2f551 — FOUND
- Commit 0ecf86b — FOUND
- Commit 668cc65 — FOUND
