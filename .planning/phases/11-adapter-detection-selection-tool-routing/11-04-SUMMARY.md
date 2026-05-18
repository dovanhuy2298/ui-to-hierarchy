---
plan: 11-04
phase: 11-adapter-detection-selection-tool-routing
status: complete
wave: 2
completed: 2026-05-18T03:05:00Z
---

# Plan 11-04 Summary — selectAdapter + --framework CLI flag

## One-liner
selectAdapter with parallel Promise.all probes, setFrameworkOverride singleton, and --framework allowlist validation wired into cli.ts.

## What was built
- src/adapters/select.ts: selectAdapter orchestrates detectNextJs + detectExpoRouter in parallel via Promise.all (ADAPT-03); returns conflict ToolResponse when both detected; zero-match ToolResponse when neither detected; setFrameworkOverride module-level singleton for CLI override
- src/init/argv.ts: framework field added to INIT_OPTION_SCHEMA so parseArgs accepts --framework without strict-mode rejection
- src/cli.ts: --framework validated against ["nextjs", "expo-router"] allowlist in else branch before startServer(); invalid value writes [framework] error to stderr and exits code 1 (D-04); setFrameworkOverride called when valid
- test/cli/framework-flag.test.ts: ADAPT-05 CLI integration tests (spawn node subprocess) — invalid value exits 1, valid value does not emit [framework] error

## Files changed
- src/adapters/select.ts (created)
- src/init/argv.ts (modified — framework field added to INIT_OPTION_SCHEMA)
- src/cli.ts (modified — import setFrameworkOverride, framework validation, HELP_TEXT updated)
- test/cli/framework-flag.test.ts (created)
- test/adapters/select.test.ts (modified — bug fix: toBeInstanceOf(NextJsAdapter) → toBe(NextJsAdapter) since NextJsAdapter is an object literal, not a class)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed toBeInstanceOf → toBe for object literal NextJsAdapter**
- **Found during:** Task 1 — running select tests
- **Issue:** The RED test stubs used `expect(result).toBeInstanceOf(NextJsAdapter)` but `NextJsAdapter` is a plain object literal (not a class/constructor), so `instanceof` would throw `TypeError: Right-hand side of 'instanceof' is not callable`
- **Fix:** Changed 3 assertions from `toBeInstanceOf(NextJsAdapter)` to `toBe(NextJsAdapter)` (strict reference equality). `ExpoRouterAdapter` is a class, so those 3 `toBeInstanceOf(ExpoRouterAdapter)` assertions remain unchanged.
- **Files modified:** test/adapters/select.test.ts
- **Commit:** d80fd2c

## Verification results
- test/adapters/select.test.ts: all 8 cases GREEN
- test/cli/framework-flag.test.ts: both CLI tests GREEN
- Full test suite: 389 passing, 0 failing (pre-existing integration test failure on stale dist resolved by rebuild)
- TypeScript check: only pre-existing error in test fixture (test/fixtures/phase-05/micro/parse-error/app/page.tsx — intentional malformed fixture)

## State for Wave 3
Tool handlers (Plan 05) can now replace hardcoded NextJsAdapter imports with selectAdapter calls. selectAdapter is available at src/adapters/select.ts with the full public API: selectAdapter(projectRoot, override?) and setFrameworkOverride(v).

## Self-Check: PASSED
- src/adapters/select.ts: FOUND
- test/cli/framework-flag.test.ts: FOUND
- Commit d80fd2c: FOUND
- 389 tests passing
