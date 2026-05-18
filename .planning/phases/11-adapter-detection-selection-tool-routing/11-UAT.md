---
status: diagnosed
phase: 11-adapter-detection-selection-tool-routing
source: 11-01-SUMMARY.md, 11-02-SUMMARY.md, 11-03-SUMMARY.md, 11-04-SUMMARY.md, 11-05-SUMMARY.md
started: 2026-05-18T03:57:00Z
updated: 2026-05-18T03:58:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Full test suite passes (unit + integration)
expected: pnpm test runs 389 tests, 0 failures across all suites including integration tests with pnpm-monorepo and mutation-test fixtures
result: issue
reported: "11 integration tests fail after fresh build. pnpm-monorepo/apps/web, pnpm-monorepo/apps/admin, and phase-05/micro/mutation-test fixtures missing `next` dep or next.config.* — selectAdapter returns isError:true for them"
severity: major

### 2. No hardcoded NextJsAdapter in MCP tool handlers
expected: grep src/mcp/tools/ for NextJsAdapter returns 0 results — all 4 tools route via selectAdapter
result: pass

### 3. --framework flag: invalid value rejected
expected: node dist/cli.js --framework vue exits 1, writes "[framework] error: unknown value" to stderr
result: pass

### 4. --framework flag: valid value accepted
expected: node dist/cli.js --framework expo-router does NOT emit [framework] error to stderr
result: pass

### 5. detectExpoRouter two-signal probe
expected: expo-basic fixture (has expo-router dep + _layout.tsx) → detected:true; next-app-router → detected:false
result: pass
notes: verified via vitest suite (detect.test.ts, 4 cases all GREEN)

### 6. detectNextJs two-signal probe
expected: next-app-router fixture (has next dep + next.config.mjs) → detected:true; expo-basic → detected:false
result: pass
notes: verified via vitest suite (next/detect.test.ts, 4 cases all GREEN)

### 7. selectAdapter: conflict resolution
expected: monorepo-mixed fixture (has both expo-router dep and next dep + next.config.ts) → returns conflict ToolResponse (isError:true, conflict message)
result: pass
notes: verified via select.test.ts, 8 cases all GREEN

### 8. MCP tools route via selectAdapter for Next.js fixtures
expected: get-full-hierarchy, focus-on, find-by-text, find-by-style all return isError:false on nested-routes and shadcn-barrels fixtures
result: pass
notes: integration tests for nested-routes, shadcn-barrels, kitchen-sink all pass

## Summary

total: 8
passed: 7
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "pnpm test runs 389 tests, 0 failures — all integration tests pass including pnpm-monorepo and mutation-test fixtures"
  status: failed
  reason: "User reported: 11 integration tests fail after fresh build. pnpm-monorepo/apps/web, pnpm-monorepo/apps/admin missing 'next' in package.json deps; mutation-test missing package.json and next.config.* entirely. detectNextJs requires both signals (package.json#next AND next.config.*) so selectAdapter returns isError:true for these fixtures."
  severity: major
  test: 1
  root_cause: "Plan 11-05 added package.json with next dep to 7 fixtures but missed 3: phase-06/pnpm-monorepo/apps/web, phase-06/pnpm-monorepo/apps/admin (have next.config.js but package.json lacks 'next' dep), and phase-05/micro/mutation-test (has neither package.json nor next.config.*). Integration tests for these fixtures now fail with selectAdapter returning zero-match error."
  artifacts:
    - path: "test/fixtures/phase-06/pnpm-monorepo/apps/web/package.json"
      issue: "package.json has no 'next' dependency — only {\"name\":\"@acme/web\",\"private\":true}"
    - path: "test/fixtures/phase-06/pnpm-monorepo/apps/admin/package.json"
      issue: "package.json has no 'next' dependency — only {\"name\":\"@acme/admin\",\"private\":true}"
    - path: "test/fixtures/phase-05/micro/mutation-test/"
      issue: "Missing package.json and next.config.* — no detection signals for either framework"
  missing:
    - "Add {\"dependencies\":{\"next\":\"*\"}} to test/fixtures/phase-06/pnpm-monorepo/apps/web/package.json"
    - "Add {\"dependencies\":{\"next\":\"*\"}} to test/fixtures/phase-06/pnpm-monorepo/apps/admin/package.json"
    - "Add test/fixtures/phase-05/micro/mutation-test/package.json with next dep"
    - "Add test/fixtures/phase-05/micro/mutation-test/next.config.js"
  debug_session: "fixed inline — commit fix(fixtures): add next dep to 3 fixtures missed by plan 11-05"
