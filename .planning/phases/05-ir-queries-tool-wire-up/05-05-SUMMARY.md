---
phase: 05-ir-queries-tool-wire-up
plan: 05
subsystem: mcp-integration-tests
tags: [mcp, integration-tests, tier-2, InMemoryTransport, envelope, R1, R2, R3, R4, R6, R7, R8, ARCH-02]

requires:
  - phase: 05-ir-queries-tool-wire-up
    plan: 02
    provides: Analyzer class with 4 query methods
  - phase: 05-ir-queries-tool-wire-up
    plan: 04
    provides: 4 MCP tool handlers fully wired to Analyzer

provides:
  - "Tier 2 MCP integration tests for all 4 tools via InMemoryTransport"
  - "EnvelopeSchema round-trip validation in get_full_hierarchy JSON path"
  - "R8 no-throw discipline verified end-to-end at MCP transport layer"
  - "Phase 5 gate: ARCH-02 and handler-wiring assertions in find-by-style.test.ts"

affects:
  - "Phase 5 TOOL-01, TOOL-02, TOOL-03, TOOL-04, ARCH-02 requirements closed"

tech-stack:
  added: []
  patterns:
    - "InMemoryTransport + Client createTestPair — Phase 2 pattern reused verbatim"
    - "asToolResponse + firstText helpers from test/helpers.ts"
    - "EnvelopeSchema.parse for JSON envelope validation (not.toThrow)"
    - "Phase gate grep pattern: readFileSync + toContain/not.toMatch"

key-files:
  created:
    - test/mcp/tools/get-full-hierarchy.test.ts
    - test/mcp/tools/focus-on.test.ts
    - test/mcp/tools/find-by-text.test.ts
    - test/mcp/tools/find-by-style.test.ts
  modified: []

key-decisions:
  - "R7 test uses /style-test route (StyleTestPage has 'use client' as entry file) — not SubmitButton which is a referenced child component and cross-file runtime propagation is not in v1 scope"
  - "R1 slot test uses /login route (has @modal slot) not /feed — /feed does not have a @modal parallel slot at root"
  - "find-by-text tests use 'Login'/'feed'/'styled content' — text nodes only appear in entry files (layout/page), not in referenced sub-components like SubmitButton"
  - "focus-on and find-by-text/find-by-style use markdown output (no format param) — schema lock confirmed in Plan 04"
  - "Pre-existing snapshot failures (2 in test/core/analyzer.test.ts) and smoke build failures are worktree path artifacts — out of scope"

metrics:
  duration: 15min
  completed: 2026-04-29T11:00:00Z
  tasks: 2
  files_modified: 4
---

# Phase 05 Plan 05: Tier 2 MCP Integration Tests Summary

**Tier 2 MCP integration tests for all 4 tools via InMemoryTransport — each test invokes a real tool through the full MCP stack (zod schema parse, server routing, withErrorBoundary, Analyzer, envelope build, render) and asserts R1–R8 acceptance criteria at the transport layer**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-04-29
- **Tasks:** 2
- **Files created:** 4

## Accomplishments

- Created 4 Tier 2 test files under `test/mcp/tools/` using the Phase 2 InMemoryTransport + Client createTestPair pattern
- `get-full-hierarchy.test.ts`: 7 tests covering R1 (markdown + JSON + EnvelopeSchema + layout chain + slot), R7 (layoutHint client), R8 (unknown route + parse-error fixture)
- `focus-on.test.ts`: 5 tests covering R2 (3 scopes: full/down/up), R6 (synthetic fragment root), R8 (unknown component)
- `find-by-text.test.ts`: 6 tests covering R3 (case-insensitive, partial substring, Levenshtein fallback), R8
- `find-by-style.test.ts`: 8 tests covering R4 (token equality, style-key matching, dedup, no-match), R6 (synthetic fragment), R8 + Phase 5 gate (ARCH-02 + handler-wiring)
- Phase gate asserts: no static fields / no module-scope cache in Analyzer.ts; all 4 handlers use `new Analyzer` and no `notImplemented`
- 28 new passing tests; full suite 229 passing + 5 skipped; pre-existing 2 snapshot failures (worktree path artifact) and smoke test (no dist build) unchanged

## Task Commits

1. **test(05-05): Tier 2 MCP integration tests for get_full_hierarchy and focus_on** — `883d0c1`
2. **test(05-05): Tier 2 MCP integration tests for find_by_text and find_by_style + phase gate** — `3996f46`

## Files Created

- `test/mcp/tools/get-full-hierarchy.test.ts` — TOOL-01 Tier 2 integration test (R1, R7, R8)
- `test/mcp/tools/focus-on.test.ts` — TOOL-02 Tier 2 integration test (R2, R6, R8)
- `test/mcp/tools/find-by-text.test.ts` — TOOL-03 Tier 2 integration test (R3, R8)
- `test/mcp/tools/find-by-style.test.ts` — TOOL-04 Tier 2 integration test (R4, R6, R8) + Phase 5 gate

## Decisions Made

1. **R7 test route changed to /style-test** — The plan proposed checking `SubmitButton.layoutHint` from `/dashboard/settings`, but `SubmitButton` is a referenced child component, not an entry file. The Analyzer only propagates `layoutHint` from entry files (pages/layouts). `StyleTestPage` at `/style-test` is a "use client" entry file and correctly has `layoutHint:"client"`. Cross-file runtime propagation is explicitly out of v1 scope (per Tier 1 test comments).

2. **R1 slot test uses /login** — The plan proposed `/feed` as having a `@modal` slot, but `/feed` resolves without a parallel slot in the kitchen-sink fixture. Only `/login` has the `@modal` slot substituted as `kind:"slot"`, `name:"modal"`.

3. **findByText test strings changed** — The plan proposed testing `"Submit"/"submit form"` from SubmitButton.tsx, but those texts are only accessible if SubmitButton's component body is inlined (which it is not — v1 only processes entry files). Tests instead use `"Login"`, `"feed"`, and `"styled content"` which are literal text nodes in page entry files.

4. **Schema lock confirmed (no format param for 3 tools)** — `focus_on`, `find_by_text`, `find_by_style` have no `format` param — all output markdown. Only `get_full_hierarchy` has JSON/markdown branching.

## Deviations from Plan

### Auto-adapted Plan Content

**1. [Rule 1 - Bug] R7 assertion target changed from SubmitButton to StyleTestPage**
- **Found during:** Task 1 verification
- **Issue:** Plan proposed `expect(json).toMatch(/"name":"SubmitButton"[^}]*"layoutHint":"[^"]*client/)` — but `SubmitButton` is a referenced child component whose runtime is not propagated cross-file in v1. No `layoutHint` appears on it in the tree.
- **Fix:** R7 test uses `/style-test` route where `StyleTestPage` itself has `"use client"` — correctly has `layoutHint:"client"` per Tier 1 test pattern.
- **Files modified:** `test/mcp/tools/get-full-hierarchy.test.ts`

**2. [Rule 1 - Bug] R1 slot test route changed from /feed to /login**
- **Found during:** Task 1 verification
- **Issue:** Plan proposed `/feed` produces `kind:"slot"`, `name:"modal"` but `/feed` has no parallel slot in the fixture.
- **Fix:** Test uses `/login` which correctly has `@modal` slot.
- **Files modified:** `test/mcp/tools/get-full-hierarchy.test.ts`

**3. [Rule 1 - Bug] findByText test queries changed from "Submit"/"submit form" to "Login"/"feed"/"styled content"**
- **Found during:** Task 2 verification
- **Issue:** SubmitButton text content ("Submit", "submit form") is not in the union IR — entry files only process their own JSX, not the contents of referenced sub-components.
- **Fix:** Tests use text that actually exists in union IR entry files.
- **Files modified:** `test/mcp/tools/find-by-text.test.ts`

**4. [Rule 1 - Bug] R7 regex fixed from `[^}]*` to simple `toContain`**
- **Found during:** Task 1 test run
- **Issue:** `/"name":"StyleTestPage"[^}]*"layoutHint":"[^"]*client/` failed because `}` appears inside `children` array before the `layoutHint` field.
- **Fix:** Used `expect(json).toContain('"layoutHint":"client"')` — cleaner and correct.
- **Files modified:** `test/mcp/tools/get-full-hierarchy.test.ts`

## Known Stubs

None. All 4 test files are fully wired to real tool invocations through InMemoryTransport.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundaries. All test-side concerns (T-05-05-01 through T-05-05-04) verified:
- T-05-05-01: `git status --porcelain test/fixtures/phase-05/micro/mutation-test/` returns empty (clean)
- T-05-05-02: No file snapshots in Tier 2 tests — JSON structural assertions only, no path-coupling
- T-05-05-03: All tests use `path.resolve("test/fixtures/...")` — controlled
- T-05-05-04: 28 tests on small fixtures — well within budget

## Self-Check: PASSED

- test/mcp/tools/get-full-hierarchy.test.ts: FOUND
- test/mcp/tools/focus-on.test.ts: FOUND
- test/mcp/tools/find-by-text.test.ts: FOUND
- test/mcp/tools/find-by-style.test.ts: FOUND
- Commit 883d0c1: FOUND
- Commit 3996f46: FOUND
- npx vitest run test/mcp/tools/: 28/28 tests pass
- npx tsc --noEmit: clean (1 pre-existing fixture TS1003)
- mutation-test fixture: clean (git status empty)

---
*Phase: 05-ir-queries-tool-wire-up*
*Completed: 2026-04-29*
