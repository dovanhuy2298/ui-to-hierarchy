---
plan: 11-03
phase: 11-adapter-detection-selection-tool-routing
status: complete
wave: 1
completed: 2026-05-18T02:59:00Z
---

# Plan 11-03 Summary — detectNextJs export

## What was built
- Added detectNextJs(absRoot) export to src/adapters/next/detect.ts
- Symmetric { detected: boolean; signals: string[] } return shape
- Two signals: "package.json#next" (dep in package.json) + any next.config.* file presence
- detect() function unchanged — zero backward-compat impact
- 4 new test cases in test/adapters/next/detect.test.ts, all GREEN

## Files changed
- src/adapters/next/detect.ts (modified — readFile added to imports, detectNextJs function added after detect())
- test/adapters/next/detect.test.ts (modified — detectNextJs import added, describe block with 4 tests appended)

## Verification results
- All existing detect() tests (6): GREEN
- New detectNextJs tests (4): GREEN
- Full unit test suite: 10 passing, no regressions
- TypeScript check: only pre-existing parse-error fixture error (TS1003, intentional fixture)
- Integration test failures: pre-existing (dist/cli.js older than src — requires pnpm build, unrelated to this plan)

## Deviations from Plan
None — plan executed exactly as written.

## State for Wave 2
selectAdapter (Plan 04) can now import { detectNextJs } from src/adapters/next/detect.ts and run it in parallel with detectExpoRouter.
