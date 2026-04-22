---
phase: 02-mcp-transport-shell
fixed_at: 2026-04-22T00:00:00Z
review_path: .planning/phases/02-mcp-transport-shell/02-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-04-22T00:00:00Z
**Source review:** `.planning/phases/02-mcp-transport-shell/02-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (WR-01, WR-02, WR-03 — fix_scope: critical_warning)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: `__TOOL_VERSION__` runtime fallback

**Files modified:** `src/mcp/server.ts`
**Commit:** 2cdffb7
**Applied fix:** Added a `TOOL_VERSION` constant after imports that reads `__TOOL_VERSION__` defensively via `typeof` check, falling back to `"0.0.0-unknown"` when the tsup `define` substitution has not been applied (e.g., under `tsx` or a test runner without the define shim). Replaced all three raw `__TOOL_VERSION__` usages in `createServer()` and `startServer()` with the new `TOOL_VERSION` constant.

### WR-02: `afterAll` transport not closed in smoke test

**Files modified:** `test/mcp/smoke.spawn.test.ts`
**Commit:** 1c9a37e
**Applied fix:** Added `await transport.close()` after `await client.close()` in the `afterAll` callback. This ensures the spawned `node dist/cli.js` child process is terminated cleanly, preventing orphan processes and open-handle warnings in CI.

### WR-03: Missing `.min(1)` on tool input schema fields

**Files modified:** `src/mcp/tools/find-by-text.ts`, `src/mcp/tools/find-by-style.ts`
**Commit:** 1ace2b8
**Applied fix:** Added `.min(1)` to the `query` field in `find-by-text.ts` and to the `class_or_prop` field in `find-by-style.ts`. Empty-string calls now fail at schema validation with a clear MCP error before reaching the handler.

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-04-22T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
