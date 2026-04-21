---
phase: 02-mcp-transport-shell
plan: "01"
subsystem: testing
tags: [mcp, vitest, biome, typescript, inspector]

requires: []
provides:
  - "src/global.d.ts with declare const __TOOL_VERSION__: string"
  - "test/mcp/server.test.ts — Tier 1 it.todo stubs covering MCP-01/02/03"
  - "test/mcp/smoke.spawn.test.ts — Tier 2 it.todo stubs covering MCP-01/04"
  - "package.json test:smoke script and @modelcontextprotocol/inspector devDep"
  - "biome.json noConsole:error override for src/mcp/** and src/cli.ts"
affects:
  - "02-02"
  - "02-03"
  - "02-04"
  - "02-05"

tech-stack:
  added:
    - "@modelcontextprotocol/inspector ^0.21.2"
  patterns:
    - "biome.json overrides array for per-directory lint rules"
    - "it.todo stubs as Wave 0 test placeholders for Wave 1 fill-in"

key-files:
  created:
    - src/global.d.ts
    - test/mcp/server.test.ts
    - test/mcp/smoke.spawn.test.ts
  modified:
    - package.json
    - biome.json
    - src/cli.ts

key-decisions:
  - "Use process.stderr.write instead of console.error in cli.ts placeholder to comply with noConsole:error rule"
  - "Append second overrides entry to biome.json to preserve existing noRestrictedImports entry unchanged"
  - "Place @modelcontextprotocol/inspector in devDependencies only (not shipped in prod bundle)"

patterns-established:
  - "noConsole enforcement: all console.* in src/mcp/** and src/cli.ts caught at lint time"
  - "Stub-first test files: it.todo entries created in Wave 0, filled in by Wave 1 plans"

requirements-completed:
  - MCP-01
  - MCP-04

duration: 15min
completed: 2026-04-21
---

# Phase 02 Plan 01: Wave 0 Scaffolding Summary

**TypeScript __TOOL_VERSION__ declaration, biome noConsole enforcement for src/mcp/**, and 21 it.todo test stubs across Tier 1 (InMemoryTransport) and Tier 2 (stdio spawn) suites**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-21T17:00:00Z
- **Completed:** 2026-04-21T17:04:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Created `src/global.d.ts` so TypeScript recognizes `__TOOL_VERSION__` injected by tsup `define`
- Added `@modelcontextprotocol/inspector ^0.21.2` devDep and `test:smoke` script to package.json
- Appended second biome.json override enforcing `noConsole: error` on `src/mcp/**` and `src/cli.ts`
- Created `test/mcp/server.test.ts` with 16 `it.todo` stubs (MCP-01, MCP-02, MCP-03 scenarios)
- Created `test/mcp/smoke.spawn.test.ts` with 5 `it.todo` stubs (MCP-01, MCP-04 scenarios)

## Task Commits

1. **Task 1: global.d.ts + inspector devDep** — `5ca0326` (feat)
2. **Task 2: test:smoke script + biome override + cli.ts fix** — `73065b3` (feat)
3. **Task 3: test stub files** — `9aba5e5` (test)

## Files Created/Modified

- `src/global.d.ts` — Declares `__TOOL_VERSION__: string` for tsup build-time injection
- `test/mcp/server.test.ts` — Tier 1 it.todo stubs for tool registration, schemas, not-implemented responses
- `test/mcp/smoke.spawn.test.ts` — Tier 2 it.todo stubs for spawned binary verification
- `package.json` — Added inspector devDep and test:smoke script
- `biome.json` — Appended noConsole override for src/mcp/** and src/cli.ts
- `src/cli.ts` — Replaced console.error with process.stderr.write (noConsole compliance)

## Decisions Made

- **process.stderr.write over console.error in cli.ts:** The noConsole:error rule was applied immediately on the placeholder. Using `process.stderr.write` is the correct low-level alternative that avoids the linting constraint while preserving the stub behavior.
- **Append-only biome.json edit:** The existing `noRestrictedImports` override for `src/ir/**` was preserved unchanged; only a second entry was appended.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed cli.ts console.error violating newly-added noConsole override**
- **Found during:** Task 2 (biome.json noConsole override)
- **Issue:** `src/cli.ts` contained `console.error(...)` which the new noConsole:error rule immediately flagged, causing `pnpm lint` to exit 1
- **Fix:** Replaced `console.error("mcp server not implemented yet")` with `process.stderr.write("mcp server not implemented yet\n")`
- **Files modified:** `src/cli.ts`
- **Verification:** `pnpm lint` exits 0 after fix
- **Committed in:** `73065b3` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in pre-existing placeholder code)
**Impact on plan:** Fix was necessary for lint to pass. No scope creep — single-line change in placeholder file.

## Issues Encountered

None beyond the noConsole lint failure above, which was resolved inline.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All Wave 0 scaffolding complete; Wave 1 plans (02-02 through 02-04) can now fill in test stubs
- `pnpm typecheck` exits 0 — __TOOL_VERSION__ is declared
- `pnpm lint` exits 0 — biome noConsole enforcement active
- `pnpm test` exits 0 — 21 todo stubs skipped cleanly (6 test files, 34 passing tests)
- `@modelcontextprotocol/inspector` available for interactive MCP debugging via Wave 1 plans

## Self-Check: PASSED

- FOUND: src/global.d.ts
- FOUND: test/mcp/server.test.ts
- FOUND: test/mcp/smoke.spawn.test.ts
- FOUND: commit 5ca0326 (Task 1)
- FOUND: commit 73065b3 (Task 2)
- FOUND: commit 9aba5e5 (Task 3)
- grep: declare const __TOOL_VERSION__ — matches
- grep: test:smoke — matches
- grep: noConsole — matches
- grep: modelcontextprotocol/inspector — matches

---
*Phase: 02-mcp-transport-shell*
*Completed: 2026-04-21*
