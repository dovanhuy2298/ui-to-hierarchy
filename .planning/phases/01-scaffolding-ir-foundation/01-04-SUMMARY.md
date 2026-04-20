---
phase: 01-scaffolding-ir-foundation
plan: 04
subsystem: core/paths
tags: [core, paths, resolve-root, arch-03]
requirements: [ARCH-03]
provides:
  - toForwardSlash(p): string
  - relFromRoot(absFile, absRoot): string
  - resolveRoot(explicit?): string
requires: []
affects:
  - Plan 01-05 envelope builder (consumes resolveRoot)
  - Phase 3 parser (consumes relFromRoot for every file:line)
key-files:
  created:
    - src/core/paths.ts
    - src/core/resolve-root.ts
    - test/core/paths.test.ts
    - test/core/resolve-root.test.ts
  modified: []
decisions:
  - Double-normalization (path.sep split+join AND replaceAll("\\\\", "/")) makes toForwardSlash OS-portable — POSIX test runners can still validate backslash handling.
  - resolveRoot keeps dependency-light surface: only node:path + ./paths.js, no IR/renderer imports.
metrics:
  tasks_completed: 2
  files_created: 4
  duration: ~3min
  completed: 2026-04-20
---

# Phase 01 Plan 04: Path Utilities & Root Resolver Summary

**One-liner:** Forward-slash path normalization (`toForwardSlash`, `relFromRoot`) and project-root resolver (`resolveRoot` with arg > UI_TO_HIERARCH_ROOT env > cwd precedence), both OS-portable via double-normalization.

## What Was Built

- **`src/core/paths.ts`** — `toForwardSlash` uses `path.sep` split/join AND a literal-backslash `replaceAll`, guaranteeing that inputs containing `\\` normalize correctly on POSIX runners where `path.sep === "/"`. `relFromRoot` wraps `path.relative` + `toForwardSlash`.
- **`src/core/resolve-root.ts`** — single pure function; precedence chain via `?? ` operator; `path.resolve` + `toForwardSlash` yields absolute forward-slash path on any OS.
- **`test/core/paths.test.ts`** — 4 cases: `\\`→`/`, idempotent `/`, empty string, POSIX-shape `relFromRoot`.
- **`test/core/resolve-root.test.ts`** — 4 cases: arg precedence, env precedence, cwd fallback (via `delete process.env.UI_TO_HIERARCH_ROOT`), Windows-shape normalization invariant (no backslashes in output).

## Deviations from Plan

None — plan executed as written. One small refinement: in the cwd-fallback test, `vi.stubEnv("", "")` keeps the var as an empty string (truthy-enough that `??` does not fall through since `??` only catches `undefined`/`null`), so the test explicitly `delete`s the env var after unstubbing. This matches the plan's intent.

## Verification Status

**Plan-specified validation commands (`pnpm vitest run ...`, `pnpm typecheck`, `pnpm lint`) could not be executed from this plan** — Plan 01-01 (package.json + pnpm install + vitest config) is running concurrently in the same wave and dependencies are not yet on disk. This is expected for wave 1 parallelism.

Tests are structured to run successfully once 01-01 completes. Post-wave the orchestrator (or Plan 05) will run the full suite.

Static invariants verifiable now (without running):
- `src/core/paths.ts` exports both `toForwardSlash` and `relFromRoot` as named exports. Contains `path.sep`. No adapter/mcp imports.
- `src/core/resolve-root.ts` contains `UI_TO_HIERARCH_ROOT`, `process.cwd()`, two `?? ` fallbacks, `path.resolve(`, and `toForwardSlash(`. Only imports `node:path` and `./paths.js`.

## Parallel-Safety

Touched only files listed in `files_modified`. Did not modify package.json, tsconfig, vitest.config, or src/core/babel-shim.ts (other plans' territory).

## Self-Check: PASSED

All four target files exist on disk:
- `E:/ui-to-hierarch/src/core/paths.ts` — FOUND
- `E:/ui-to-hierarch/src/core/resolve-root.ts` — FOUND
- `E:/ui-to-hierarch/test/core/paths.test.ts` — FOUND
- `E:/ui-to-hierarch/test/core/resolve-root.test.ts` — FOUND

Not a git repo — commit verification skipped per task instruction.
