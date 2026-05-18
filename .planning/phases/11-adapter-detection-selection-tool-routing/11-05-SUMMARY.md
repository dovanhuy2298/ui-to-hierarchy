---
plan: 11-05
phase: 11-adapter-detection-selection-tool-routing
status: complete
wave: 3
completed: 2026-05-18T03:13:00Z
---

# Plan 11-05 Summary — Tool Handler Refactor (ADAPT-06)

## What was built

Refactored all 4 MCP tool handlers to route through `selectAdapter()` instead of importing
`NextJsAdapter` directly. The tool layer is now framework-agnostic: any future adapter
registered via `selectAdapter` is automatically routed without touching tool code.

Key changes per handler (get-full-hierarchy, focus-on, find-by-text, find-by-style):
- Replaced `import { NextJsAdapter }` with `import { selectAdapter }`
- Replaced `new Analyzer({ root, adapter: NextJsAdapter })` with:
  ```ts
  const adapter = await selectAdapter(root);
  if ("isError" in adapter) return adapter;
  const analyzer = new Analyzer({ root, adapter });
  ```
- D-09 cleanup: removed `base.warnings ?? []` fallback (always an array from buildEnvelope)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Config] Add package.json to Next.js test fixtures**
- **Found during:** Task verification — selectAdapter returning isError for all old fixtures
- **Issue:** `detectNextJs` requires two signals: `next` in `package.json` dependencies AND
  `next.config.*` file. Seven existing fixtures only had `next.config.*` but no `package.json`,
  causing `selectAdapter` to return zero-match error for all tool handler integration tests.
- **Fix:** Added minimal `package.json` with `{ "dependencies": { "next": "*" } }` to 7 fixtures.
  Also added `next.config.js` to `parse-error` fixture (had `app/` dir but no config file).
- **Files modified:**
  - `test/fixtures/next-detect-pages-only/package.json` (new)
  - `test/fixtures/next-detect-with-app/package.json` (new)
  - `test/fixtures/next-detect-with-src-app/package.json` (new)
  - `test/fixtures/phase-05/kitchen-sink/package.json` (new)
  - `test/fixtures/phase-05/micro/parse-error/package.json` (new)
  - `test/fixtures/phase-05/micro/parse-error/next.config.js` (new)
  - `test/fixtures/phase-06/nested-routes/package.json` (new)
  - `test/fixtures/phase-06/shadcn-barrels/package.json` (new)
- **Commit:** 1c9e15a (same commit as main task)

## Files changed

- `src/mcp/tools/get-full-hierarchy.ts` (modified)
- `src/mcp/tools/focus-on.ts` (modified)
- `src/mcp/tools/find-by-text.ts` (modified)
- `src/mcp/tools/find-by-style.ts` (modified)
- 8 test fixture files (new — see deviation above)

## Verification results

- `grep -r "NextJsAdapter" src/mcp/tools/`: ZERO results
- Full vitest suite: **389 tests passing, 0 failures, 0 regressions**
- TypeScript `tsc --noEmit`: 1 pre-existing error in intentional `parse-error` fixture (not introduced by this plan)

## Phase 11 complete

All 5 plans executed. Adapter detection, selection, and tool routing are wired end-to-end:
- Plan 11-01: ExpoRouterAdapter stub (8 methods)
- Plan 11-02: detectExpoRouter two-signal probe
- Plan 11-03: detectNextJs two-signal probe + monorepo-mixed fixture
- Plan 11-04: selectAdapter orchestrator + --framework CLI flag
- Plan 11-05: Tool handler refactor (this plan) — removes last hardcoded NextJsAdapter from MCP layer

## Self-Check: PASSED

- Commit 1c9e15a exists: verified
- All 4 tool handler files modified: verified
- Zero NextJsAdapter imports in src/mcp/tools/: verified
- 389 tests passing: verified
