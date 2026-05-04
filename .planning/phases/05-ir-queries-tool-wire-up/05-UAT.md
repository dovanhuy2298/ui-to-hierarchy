---
status: complete
phase: 05-ir-queries-tool-wire-up
source:
  - .planning/phases/05-ir-queries-tool-wire-up/05-01-SUMMARY.md
  - .planning/phases/05-ir-queries-tool-wire-up/05-02-SUMMARY.md
  - .planning/phases/05-ir-queries-tool-wire-up/05-03-SUMMARY.md
  - .planning/phases/05-ir-queries-tool-wire-up/05-04-SUMMARY.md
  - .planning/phases/05-ir-queries-tool-wire-up/05-05-SUMMARY.md
started: 2026-05-04T04:31:32Z
updated: 2026-05-04T04:33:00Z
mode: automated
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: From a clean shell, `npm run build` then `node dist/cli.js`. Server boots over stdio without errors.
result: pass
evidence: |
  `npm run build` → tsup ESM build success in 35ms, dist/cli.js (78.88 KB) emitted.
  Shebang banner intact, target node20.

### 2. Full Test Suite Passes
expected: `npx vitest run` — full suite green, no Phase 5 regressions.
result: issue
reported: "vitest run reports 235 PASS / 1 FAIL — test/mcp/smoke.spawn.test.ts:99 expects all 4 tools to return isError:true (Phase 2 stub behavior). Phase 5 wired real Analyzer-backed handlers; the smoke test was not updated."
severity: major

### 3. get_full_hierarchy returns layout chain (R1)
expected: /dashboard/settings → 3-tier layout chain with {children} slots.
result: pass
evidence: |
  Covered by test/core/analyzer.test.ts (R1 describe block) and test/mcp/tools/get-full-hierarchy.test.ts.
  56/56 Phase-5 specific tests pass.

### 4. get_full_hierarchy renders @modal parallel slot (R1)
expected: /login route → kind:"slot", name:"modal" sibling node.
result: pass
evidence: Covered by test/mcp/tools/get-full-hierarchy.test.ts (slot test, /login route). 56/56 pass.

### 5. get_full_hierarchy JSON envelope round-trips (R1)
expected: format:"json" → EnvelopeSchema.parse() succeeds, all 6 fields present.
result: pass
evidence: Covered by test/mcp/tools/get-full-hierarchy.test.ts (EnvelopeSchema round-trip).

### 6. focus_on returns 3 scope variants (R2)
expected: full / down / up scopes return distinct subtrees.
result: pass
evidence: Covered by test/mcp/tools/focus-on.test.ts (5 tests, R2 + R6 + R8).

### 7. find_by_text matches with Levenshtein fallback (R3)
expected: "feedd" → fuzzy match "feed"; "login" → "Login"+"modal-login".
result: pass
evidence: Covered by test/core/analyzer.test.ts (R3) and test/mcp/tools/find-by-text.test.ts (6 tests).

### 8. find_by_style matches token + style key (R4)
expected: className token equality, style key wildcard, dedup, no-match returns empty matches.
result: pass
evidence: Covered by test/mcp/tools/find-by-style.test.ts (8 tests, R4 + R6 + R8 + Phase-5 gate).

### 9. R8 — unknown route returns clean error envelope (no throw)
expected: unknown route → kind:"error" envelope, no isError:true at MCP layer.
result: pass
evidence: Covered by test/mcp/tools/get-full-hierarchy.test.ts (R8 unknown route) and focus-on.test.ts (R8 unknown component).

### 10. R8 — parse-error fixture surfaces kind:error
expected: micro/parse-error fixture → kind:"error" tree node, server does not throw.
result: pass
evidence: Covered by test/mcp/tools/get-full-hierarchy.test.ts (R8 parse-error fixture).

### 11. ARCH-02 — per-call cache, no cross-call leakage
expected: Mutation test fixture: r1="Hello", r2="Mutated"; zero static fields, zero module-scope cache.
result: pass
evidence: |
  Mutation test in test/core/analyzer.test.ts passes (try/finally restore).
  Manual grep on src/core/Analyzer.ts: zero static fields, zero top-level Map/cache. Phase-5 gate in find-by-style.test.ts also asserts this.

## Summary

total: 11
passed: 10
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Full test suite is green after Phase 5 lands"
  status: failed
  reason: "test/mcp/smoke.spawn.test.ts:99 — `each tool call returns isError:true on stderr, not stdout` was written in Phase 2 to assert the notImplemented stub behavior. Phase 5 (plan 04) wired all 4 handlers to real Analyzer calls — they now return successful data envelopes, so `result.isError` is undefined. The Phase 2 smoke test must be updated to assert the post-Phase-5 contract: tool calls return successful results (no isError), stdout stays clean (only MCP frames), application logs still go to stderr only."
  severity: major
  test: 2
  artifacts:
    - test/mcp/smoke.spawn.test.ts:99-119
    - src/mcp/tools/get-full-hierarchy.ts (now Analyzer-backed, no notImplemented)
    - src/mcp/tools/focus-on.ts
    - src/mcp/tools/find-by-text.ts
    - src/mcp/tools/find-by-style.ts
  missing: []
