---
phase: 05-ir-queries-tool-wire-up
plan: 04
subsystem: mcp-tools
tags: [mcp, tool-handlers, analyzer, wire-up, envelope, renderer]

requires:
  - phase: 05-ir-queries-tool-wire-up
    plan: 02
    provides: Analyzer class with 4 query methods, buildFragmentRoot

provides:
  - "get-full-hierarchy handler: resolveRoot → Analyzer.getFullHierarchy → buildEnvelope → renderMarkdown/renderJson"
  - "focus-on handler: resolveRoot → Analyzer.focusOn → buildEnvelope → renderMarkdown"
  - "find-by-text handler: resolveRoot → Analyzer.findByText → buildEnvelope → renderMarkdown"
  - "find-by-style handler: resolveRoot → Analyzer.findByStyle → buildEnvelope → renderMarkdown"

affects:
  - "05-05-PLAN (MCP integration tests — all 4 handlers now callable)"

tech-stack:
  added: []
  patterns:
    - "Thin handler pattern: resolveRoot → new Analyzer → query → buildEnvelope + warnings splice → render by format"
    - "NextJsAdapter used as value (const FrameworkAdapter export, not class instantiation)"
    - "withErrorBoundary shell preserved verbatim from Phase 2 stubs"
    - "R8 no-throw discipline: user-data errors returned as data shape, never promoted to MCP errors"

key-files:
  created: []
  modified:
    - src/mcp/tools/get-full-hierarchy.ts
    - src/mcp/tools/focus-on.ts
    - src/mcp/tools/find-by-text.ts
    - src/mcp/tools/find-by-style.ts

key-decisions:
  - "NextJsAdapter is a const value export (object literal), not a class — used as adapter: NextJsAdapter directly (no new)"
  - "focus-on, find-by-text, find-by-style schemas have no format field — all default to renderMarkdown (Phase 2 schema lock)"
  - "get-full-hierarchy has format field — branches json vs markdown (existing Phase 2 schema)"
  - "warnings spliced via spread: { ...buildEnvelope(tree, opts), warnings } — preserves all envelope fields while replacing empty warnings array"

metrics:
  duration: 3min
  completed: 2026-04-29T10:36:02Z
  tasks: 1
  files_modified: 4
---

# Phase 05 Plan 04: MCP Tool Handler Wire-up Summary

**Replaced notImplemented() stubs in all 4 MCP tool handlers with Analyzer-backed bodies — each handler is ~35 LOC of thin plumbing: resolveRoot → new Analyzer → query → buildEnvelope + warnings → render by format**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-29T10:33:00Z
- **Completed:** 2026-04-29T10:36:02Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments

- Wired all 4 MCP tool handlers to the Plan 02 Analyzer class
- Preserved Phase 2 zod input schemas byte-unchanged (schema lock)
- Preserved `withErrorBoundary` shell in all 4 handlers
- No `isError: true` hardcoded in any handler body (R8 no-throw discipline)
- 188/188 tests pass (no regressions)
- tsc --noEmit clean (only pre-existing parse-error fixture TS1003 in test fixture — intentional malformed file)

## Task Commits

1. **feat(05-04): wire 4 MCP tool handlers to Analyzer** — `b0df7e0`

## Files Modified

- `src/mcp/tools/get-full-hierarchy.ts` — replaced notImplemented with Analyzer.getFullHierarchy; branches on format param
- `src/mcp/tools/focus-on.ts` — replaced notImplemented with Analyzer.focusOn; markdown only (no format in schema)
- `src/mcp/tools/find-by-text.ts` — replaced notImplemented with Analyzer.findByText; markdown only
- `src/mcp/tools/find-by-style.ts` — replaced notImplemented with Analyzer.findByStyle; markdown only

## Decisions Made

1. **NextJsAdapter value export** — `src/adapters/next/NextJsAdapter.ts` exports `NextJsAdapter` as a `const FrameworkAdapter` object literal, not a class. Used as `adapter: NextJsAdapter` directly (no `new`).

2. **Warnings splice pattern** — `{ ...buildEnvelope(tree, { resolvedRootOverride: root }), warnings }` spreads the base envelope then overwrites the empty `warnings: []` with the Analyzer-returned warnings array. Preserves all 6 envelope fields.

3. **Schema lock confirmed** — Only `get-full-hierarchy` has a `format` field. The other 3 tools (`focus-on`, `find-by-text`, `find-by-style`) have no `format` in their Phase 2 schemas — all default to `renderMarkdown`.

## Deviations from Plan

None — plan executed exactly as written. NextJsAdapter export shape verification was called out in the plan as required; confirmed as value export and used correctly.

## Known Stubs

None. All 4 handlers are fully wired to real Analyzer calls.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundaries introduced. The 4 threat entries in the plan's STRIDE register (T-05-04-01 through T-05-04-04) are all mitigated or accepted by existing mechanisms (withErrorBoundary, resolveRoot, R8 no-throw acceptance criteria). No new surface introduced.

## Self-Check: PASSED

- src/mcp/tools/get-full-hierarchy.ts: FOUND (contains new Analyzer, NextJsAdapter, buildEnvelope, renderMarkdown, renderJson)
- src/mcp/tools/focus-on.ts: FOUND (contains new Analyzer, NextJsAdapter, buildEnvelope, renderMarkdown)
- src/mcp/tools/find-by-text.ts: FOUND (contains new Analyzer, NextJsAdapter, buildEnvelope, renderMarkdown)
- src/mcp/tools/find-by-style.ts: FOUND (contains new Analyzer, NextJsAdapter, buildEnvelope, renderMarkdown)
- Commit b0df7e0: FOUND
- notImplemented grep: 0 matches in all 4 files
- isError: true grep: 0 matches in all 4 files
- 188/188 tests pass

---
*Phase: 05-ir-queries-tool-wire-up*
*Completed: 2026-04-29*
