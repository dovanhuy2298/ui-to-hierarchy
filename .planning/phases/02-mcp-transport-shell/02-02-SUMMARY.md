---
phase: "02-mcp-transport-shell"
plan: "02"
subsystem: "mcp"
tags: ["errors", "logging", "stderr", "utilities"]
dependency_graph:
  requires: ["02-01"]
  provides: ["src/mcp/errors.ts", "src/mcp/log.ts"]
  affects: ["src/mcp/tools/*.ts", "src/mcp/server.ts"]
tech_stack:
  added: []
  patterns:
    - "isError: true response shape (D-05)"
    - "JSON-line stderr logger with MCP_DEBUG guard (D-08)"
    - "TDD RED/GREEN per task"
key_files:
  created:
    - src/mcp/errors.ts
    - src/mcp/log.ts
    - test/mcp/errors.test.ts
    - test/mcp/log.test.ts
  modified: []
decisions:
  - "Biome useTemplate lint info fixed by using template literal in process.stderr.write"
  - "Test helper `firstText()` added to avoid TS2532 on union content array access"
metrics:
  duration: "~3 minutes"
  completed: "2026-04-21T10:09:05Z"
  tasks_completed: 2
  files_created: 4
  files_modified: 0
---

# Phase 02 Plan 02: MCP Utility Modules (errors.ts + log.ts) Summary

**One-liner:** Shared error-response helpers (notImplemented/internalError/invalidInput) and a stderr-only JSON-line logger guarded by MCP_DEBUG, satisfying D-05 through D-09.

## What Was Built

### src/mcp/errors.ts

Exports three error-shaping functions and a `ToolResponse` type alias:

- `ToolResponse` — type alias for `CallToolResult` from the MCP SDK
- `notImplemented(toolName)` — D-05 stub response; text includes tool name, "Phase 5 (IR Queries & Tool Wire-up)", and "See .planning/ROADMAP.md"
- `internalError(toolName, err)` — wraps `err.message` only; never exposes `err.stack` (T-02-03 threat mitigation)
- `invalidInput(toolName, zodError)` — structured validation-failure response

All three return `{ content: [{ type: 'text', text: '...' }], isError: true }`.

### src/mcp/log.ts

Exports `log` object with four methods:

- `log.info(msg, meta?)` — writes JSON line to `process.stderr`
- `log.warn(msg, meta?)` — writes JSON line to `process.stderr`
- `log.error(msg, meta?)` — writes JSON line to `process.stderr`
- `log.debug(msg, meta?)` — no-op unless `process.env.MCP_DEBUG === '1'`

JSON line shape: `{ level, msg, ...meta, ts: new Date().toISOString() }` followed by `\n`. No `console.*` calls — satisfies Biome `noConsole: "error"` override for `src/mcp/**`.

## Verification Results

```
pnpm lint      — exit 0 (19 files checked, no errors)
pnpm typecheck — exit 0 (compilation completed)
pnpm test      — exit 0 (8 test files passed, 57 tests passed, 21 todo)
```

Grep checks all passed:
- `export function notImplemented` — found in errors.ts
- `export function internalError` — found in errors.ts
- `export function invalidInput` — found in errors.ts
- `export const log` — found in log.ts
- `process.stderr` — found in log.ts
- `console.` — NOT found in log.ts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TS2532 on content[0] array access in test file**
- **Found during:** Task 1 typecheck
- **Issue:** `result.content[0]` typed as `T | undefined` in the SDK union; direct property access failed strict TS
- **Fix:** Extracted `firstText()` helper that guards the access with a type narrowing check
- **Files modified:** test/mcp/errors.test.ts
- **Commit:** ee63b2e

**2. [Rule 1 - Style] Biome useTemplate lint info on log.ts**
- **Found during:** Task 2 lint
- **Issue:** `entry + "\n"` flagged by `lint/style/useTemplate`
- **Fix:** Changed to template literal `` `${entry}\n` ``
- **Files modified:** src/mcp/log.ts
- **Commit:** e533d99

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED (errors.ts) | 086223e | PASSED — import failed as expected |
| GREEN (errors.ts) | ee63b2e | PASSED — all 12 tests pass |
| RED (log.ts) | fa3b056 | PASSED — import failed as expected |
| GREEN (log.ts) | e533d99 | PASSED — all 11 tests pass |

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundary changes introduced. Both modules are internal utilities with no external surface. T-02-03 (stack trace leakage) explicitly mitigated in `internalError()` — only `err.message` is returned.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/mcp/errors.ts | FOUND |
| src/mcp/log.ts | FOUND |
| test/mcp/errors.test.ts | FOUND |
| test/mcp/log.test.ts | FOUND |
| commit ee63b2e (errors.ts feat) | FOUND |
| commit e533d99 (log.ts feat) | FOUND |
