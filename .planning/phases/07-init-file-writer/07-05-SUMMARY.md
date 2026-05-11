---
phase: 07-init-file-writer
plan: 05
subsystem: cli
tags: [cli, parseArgs, dispatch, mcp, stdio]

requires:
  - phase: 07-init-file-writer
    provides: parseInitArgs (Plan 01), runInit orchestrator (Plan 04)
provides:
  - --init/--target/--dry-run/--force/--help/--version dispatch fork in src/cli.ts
  - byte-for-byte preservation of v1.0 no-args startServer() path
  - INIT-01 (single-binary subcommand), INIT-02 (no regression), INIT-11 (stdout invariant)
affects: [phase-08-polish, release-v1.1]

tech-stack:
  added: []
  patterns:
    - "cli.ts dispatch fork — parse argv, branch on flag presence, both arms exit explicitly via process.exit"
    - "stderr-only output from --init path (INIT-11) — no console.* or process.stdout.write in cli.ts"

key-files:
  created: []
  modified:
    - src/cli.ts
    - src/init/argv.ts

key-decisions:
  - "Help/version short-circuits live in cli.ts (not argv.ts) so --init is not required to trigger them"
  - "runInit().then(process.exit).catch(...) pattern with explicit [init] error stderr line for unhandled rejection (T-07-25)"

patterns-established:
  - "Both branches of the cli.ts dispatch fork must terminate explicitly — fall-through is never desired"

requirements-completed: [INIT-01, INIT-02, INIT-03, INIT-11]

duration: ~4min
completed: 2026-05-11
---

# Phase 7 Plan 05: cli.ts Dispatch Fork Summary

**`--init` subcommand routed in src/cli.ts with byte-preserved v1.0 startServer fallback and stderr-only output**

## Performance

- **Duration:** ~4 min (executor) + smoke-test verification
- **Tasks:** 2 (Task 1 implementation, Task 2 human-verify checkpoint — passed)
- **Files modified:** 2 (src/cli.ts, additive src/init/argv.ts)

## Accomplishments

- `--init` dispatches to `runInit` and exits via `process.exit(code)`; otherwise falls through to v1.0 `startServer()` byte-for-byte
- `--help`/`--version` short-circuits emit to stderr and exit 0 before either branch
- All 8 manual smoke steps from Task 2 `<how-to-verify>` pass on freshly built `dist/cli.js`
- INIT-02 regression gate intact: `test/mcp/smoke.spawn.test.ts` (5/5) still passes

## Task Commits

1. **Task 1: cli.ts dispatch fork** — `9699055` (feat)
2. **Task 2: human-verify smoke** — orchestrator-verified (no commit; verification only)

**Merge commit:** `6d45689` (orchestrator-applied worktree merge)

## Smoke Verification Results

| Step | Command | Expected | Result |
|------|---------|----------|--------|
| 3 | `node dist/cli.js --init` (empty dir) | create CLAUDE.md, stderr `[init] create CLAUDE.md`, stdout empty, exit 0 | ✓ |
| 4 | repeat step 3 | no-op (sha unchanged), stderr `[init] noop CLAUDE.md`, exit 0 | ✓ |
| 5 | `--init --target claude,codex,cursor,copilot` | 4 files at correct paths, cursor file has YAML frontmatter, 4 stderr lines | ✓ |
| 6 | `--init --target foo` | exit 1, stderr mentions `foo`, no files touched | ✓ |
| 7 | `--init --dry-run --target claude,codex` (empty dir) | 2 stderr `would create` lines, directory empty, exit 0 | ✓ |
| 8 | `node dist/cli.js` (no args) MCP stdio | v1.0 handshake works | ✓ (smoke.spawn.test.ts 5/5) |

## Decisions Made

- None beyond plan — followed PLAN.md exactly.

## Deviations from Plan

None — plan executed exactly as written. One operational incident (worktree cwd-drift during initial Edit) was recovered in-flight by the executor with no leakage into shared artifacts; final commits landed correctly in the worktree branch.

## Issues Encountered

None.

## Next Phase Readiness

- Phase 7 `--init` feature complete: foundation (01) + utilities (02) + template/writer (03) + runInit orchestrator (04) + cli dispatch (05) all landed and tested.
- 340/340 unit + integration tests pass; 8/8 manual smoke steps pass on built artifact.
- Ready for phase verification, then Phase 8 (v1.0 polish — markdown warnings, integration tests, true line numbers).

---
*Phase: 07-init-file-writer*
*Completed: 2026-05-11*
