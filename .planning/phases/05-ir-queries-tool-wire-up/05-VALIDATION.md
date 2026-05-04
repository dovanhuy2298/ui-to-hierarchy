---
phase: 05
slug: ir-queries-tool-wire-up
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-04
---

# Phase 05 — Validation Strategy

> Reconstructed retroactively from completed phase artifacts (State B). All 18 SPEC acceptance criteria map to existing automated tests; no gaps found.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.3.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run test/core/analyzer.test.ts test/mcp/tools` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds (236 tests, 34 files) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run test/core/analyzer.test.ts test/mcp/tools`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds (full suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | R1, R2, R3, R4, R5, R7, R8 | T-05-01-02 | Synthetic JSX fixtures only; no PII | fixtures (presence + content asserts) | `node -e "..."` (inline in plan) | ✅ | ✅ green |
| 05-01-02 | 01 | 1 | R5, R8 | T-05-01-01, T-05-01-03 | Mutation fixture restored via try/finally | fixtures (presence + content asserts) | `node -e "..."` (inline in plan) | ✅ | ✅ green |
| 05-02-01 | 02 | 1 | TOOL-01..04, ARCH-02, R1–R8 | T-05-02-01..06 | No cross-call cache; no-throw on user data; forward-slash discipline; pure parser only | unit (compile + grep gates) | `npx tsc --noEmit && npx vitest run test/architecture/island.test.ts` | ✅ | ✅ green |
| 05-03-01 | 03 | 2 | TOOL-01..04, ARCH-02, R1–R8 | T-05-02-01, T-05-02-06 | Mutation test proves no stale AST; no-backslash assertion | unit (vitest) | `npx vitest run test/core/analyzer.test.ts` | ✅ | ✅ green |
| 05-04-01 | 04 | 2 | TOOL-01..04, R1, R2, R3, R4, R6, R7, R8 | T-05-02-02 | withErrorBoundary preserved; user-data → envelope, never throw | integration (envelope shape) | `npx vitest run test/mcp/tools` | ✅ | ✅ green |
| 05-05-01 | 05 | 3 | TOOL-01..04, ARCH-02, R1–R8 | T-05-02-02 | EnvelopeSchema.parse on every response; isError falsy on user-data errors | integration (InMemoryTransport) | `npx vitest run test/mcp/tools` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### SPEC Acceptance → Test Mapping (18 checks)

| # | Acceptance Criterion | Test File:Line |
|---|----------------------|----------------|
| 1 | get_full_hierarchy /dashboard/settings — 3-tier slot substitution | [analyzer.test.ts:108](test/core/analyzer.test.ts#L108), [get-full-hierarchy.test.ts:32](test/mcp/tools/get-full-hierarchy.test.ts#L32), [get-full-hierarchy.test.ts:66](test/mcp/tools/get-full-hierarchy.test.ts#L66) |
| 2 | format='json' round-trips through EnvelopeSchema.parse | [analyzer.test.ts:147](test/core/analyzer.test.ts#L147), [get-full-hierarchy.test.ts:47](test/mcp/tools/get-full-hierarchy.test.ts#L47) |
| 3 | /feed (or /login) → kind:'slot', name:'modal' parallel slot | [analyzer.test.ts:155](test/core/analyzer.test.ts#L155), [get-full-hierarchy.test.ts:83](test/mcp/tools/get-full-hierarchy.test.ts#L83) |
| 4 | focus_on Card scope:'full' returns 2 subtrees with true file:line | [analyzer.test.ts:185](test/core/analyzer.test.ts#L185), [focus-on.test.ts:31](test/mcp/tools/focus-on.test.ts#L31) |
| 5 | scope:'up' / scope:'down' invariants | [analyzer.test.ts:207](test/core/analyzer.test.ts#L207), [analyzer.test.ts:224](test/core/analyzer.test.ts#L224), [focus-on.test.ts:46](test/mcp/tools/focus-on.test.ts#L46), [focus-on.test.ts:61](test/mcp/tools/focus-on.test.ts#L61) |
| 6 | find_by_text case-insensitive substring | [analyzer.test.ts:267](test/core/analyzer.test.ts#L267), [find-by-text.test.ts:30](test/mcp/tools/find-by-text.test.ts#L30) |
| 7 | Levenshtein 'did you mean' fallback (≤2 dist, top-5) | [analyzer.test.ts:303](test/core/analyzer.test.ts#L303), [find-by-text.test.ts:59](test/mcp/tools/find-by-text.test.ts#L59) |
| 8 | find_by_style className token equality, not substring | [analyzer.test.ts:334](test/core/analyzer.test.ts#L334), [analyzer.test.ts:351](test/core/analyzer.test.ts#L351), [find-by-style.test.ts:31](test/mcp/tools/find-by-style.test.ts#L31), [find-by-style.test.ts:64](test/mcp/tools/find-by-style.test.ts#L64) |
| 9 | style key 'marginTop' matches; value 'red' does not; data-* not scanned | [analyzer.test.ts:368](test/core/analyzer.test.ts#L368), [find-by-style.test.ts:80](test/mcp/tools/find-by-style.test.ts#L80), [find-by-style.test.ts:94](test/mcp/tools/find-by-style.test.ts#L94), [find-by-style.test.ts:108](test/mcp/tools/find-by-style.test.ts#L108) |
| 10 | Dedup node with both className='flex' and style={{flex:1}} | [analyzer.test.ts:388](test/core/analyzer.test.ts#L388) |
| 11 | Mutation between calls — no cross-call AST cache (ARCH-02) | [analyzer.test.ts:561](test/core/analyzer.test.ts#L561) |
| 12 | Static-analysis grep: zero static fields, zero module-scope cache | [analyzer.test.ts:584](test/core/analyzer.test.ts#L584), [find-by-style.test.ts:152](test/mcp/tools/find-by-style.test.ts#L152) |
| 13 | /does-not-exist → empty fragment + 'route not matched' warning | [analyzer.test.ts:520](test/core/analyzer.test.ts#L520), [get-full-hierarchy.test.ts:116](test/mcp/tools/get-full-hierarchy.test.ts#L116) |
| 14 | Syntax-error fixture → kind:'error' node, call still succeeds | [analyzer.test.ts:536](test/core/analyzer.test.ts#L536), [get-full-hierarchy.test.ts:132](test/mcp/tools/get-full-hierarchy.test.ts#L132) |
| 15 | 'use client' → layoutHint:'client'; server has none | [analyzer.test.ts:460](test/core/analyzer.test.ts#L460), [analyzer.test.ts:476](test/core/analyzer.test.ts#L476), [analyzer.test.ts:491](test/core/analyzer.test.ts#L491), [get-full-hierarchy.test.ts:98](test/mcp/tools/get-full-hierarchy.test.ts#L98) |
| 16 | All 4 tool envelopes pass EnvelopeSchema.parse | [analyzer.test.ts:434](test/core/analyzer.test.ts#L434), [analyzer.test.ts:440](test/core/analyzer.test.ts#L440), [get-full-hierarchy.test.ts:47](test/mcp/tools/get-full-hierarchy.test.ts#L47) |
| 17 | All Phase 1–4 tests still pass | full suite (`npx vitest run`) — 236/236 green |
| 18 | Adapter island test passes (core does not import adapters/next) | [test/architecture/island.test.ts](test/architecture/island.test.ts), reasserted by [find-by-style.test.ts:158](test/mcp/tools/find-by-style.test.ts#L158) |

### Forward-Slash Discipline (D-07)

- [analyzer.test.ts:598](test/core/analyzer.test.ts#L598) — asserts no backslashes in any IR `file:` field across the kitchen-sink fixture.

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* Vitest, fixture tree, and Phase 1–4 helpers (`InMemoryTransport`, `createServer`, `EnvelopeSchema`) were already in place; Plan 01 added the kitchen-sink and micro fixtures, Plan 03 / Plan 05 wrote the test files.

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify (inline node script for fixture plans, vitest for code plans)
- [x] Sampling continuity: every plan ends in a green vitest invocation; no 3-task gap
- [x] Wave 0 covers all MISSING references (none — existing infra suffices)
- [x] No watch-mode flags (`vitest run`, not `vitest`)
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-04
