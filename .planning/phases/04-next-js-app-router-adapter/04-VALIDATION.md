---
phase: 4
slug: next-js-app-router-adapter
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-29
approved: 2026-05-05
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=dot` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=dot`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01 | 04-01-PLAN | 1 | NEXT-04 (types contract: `runtime` field on ComponentDefinition + RouteMatch shape) | — | N/A | unit | `npx vitest run test/adapters/types.test.ts` | ✅ `test/adapters/types.test.ts` | ✅ green |
| 04-01 | 04-01-PLAN | 1 | Wave-0 fixtures (kitchen-sink + 4 R5 detect fixtures) | — | N/A | fixture | `ls test/fixtures/next-app-router test/fixtures/next-detect-*` | ✅ on disk | ✅ green |
| 04-02 | 04-02-PLAN | 2 | R5 (detect heuristic) | T-04-03 (no config-file import) | static existence-probe only — never `import()`s user config | unit | `npx vitest run test/adapters/next/detect.test.ts` | ✅ `test/adapters/next/detect.test.ts` | ✅ green |
| 04-02 | 04-02-PLAN | 2 | R6 (entry discovery: lex-sort, `_*` exclusion, group/slot inclusion) | — | N/A | unit | `npx vitest run test/adapters/next/discover.test.ts` | ✅ `test/adapters/next/discover.test.ts` | ✅ green |
| 04-03 | 04-03-PLAN | 3 | NEXT-01 (layout chain reconstruction with sibling specials) | — | N/A | unit | `npx vitest run test/adapters/next/route-map.test.ts` | ✅ `test/adapters/next/route-map.test.ts` | ✅ green |
| 04-03 | 04-03-PLAN | 3 | NEXT-02 (groups / parallel `@slot` / 4 intercepting variants / private `_*`) | — | N/A | unit | `npx vitest run test/adapters/next/route-map.test.ts` | ✅ `test/adapters/next/route-map.test.ts` | ✅ green |
| 04-03 | 04-03-PLAN | 3 | NEXT-03 (dynamic `[slug]` / catch-all `[...rest]` / optional-catch-all `[[...opt]]` param echo) | — | N/A | unit | `npx vitest run test/adapters/next/route-map.test.ts` | ✅ `test/adapters/next/route-map.test.ts` | ✅ green |
| 04-03 | 04-03-PLAN | 3 | D-12 (no-throw envelope on malformed input / missing `app/`) | — | empty `RouteMatch` instead of throw | unit | `npx vitest run test/adapters/next/route-map.test.ts` | ✅ `test/adapters/next/route-map.test.ts` | ✅ green |
| 04-04 | 04-04-PLAN | 4 | NEXT-04 (runtime directive: `"use client"` / `"use server"` / none / leading-comments) | — | N/A | unit | `npx vitest run test/adapters/next/runtime.test.ts` | ✅ `test/adapters/next/runtime.test.ts` | ✅ green |
| 04-04 | 04-04-PLAN | 4 | Adapter wiring (5 methods delegate to plan 02/03 modules; no throwing stubs) | — | N/A | integration | `npx vitest run test/adapters/next/NextJsAdapter.test.ts test/adapters/next/NextJsAdapter.kitchen-sink.test.ts` | ✅ `test/adapters/next/NextJsAdapter.test.ts`, `test/adapters/next/NextJsAdapter.kitchen-sink.test.ts` | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Sampling continuity:** No 3 consecutive task rows without an automated verify — every row has an `npx vitest run` command. Each wave (1→2→3→4) has at least one green automated verify before the next wave's tasks execute, satisfying the post-wave sampling rule.

**Phase 04 targeted suite (70 cases across 7 files):**
`npx vitest run test/adapters/next test/adapters/types.test.ts` → 70 passed, 0 failed (verified 2026-05-05).

---

## Wave 0 Requirements

- [x] `test/fixtures/next-app-router/` — kitchen-sink fixture covering route groups `(marketing)`, parallel slots `@modal`, intercepting routes `(.)photo`, dynamic `[slug]`, catch-all `[...rest]`, optional-catch-all `[[...opt]]`, private `_internal`, layout chain `app/dashboard/settings/{layout,page,loading}.tsx`
- [x] `test/fixtures/next-detect-with-app/`, `test/fixtures/next-detect-with-src-app/`, `test/fixtures/next-detect-pages-only/`, `test/fixtures/next-detect-no-config/` — 4 R5 truth-table fixtures
- [x] vitest already installed — no framework setup needed

---

## Manual-Only Verifications

*All phase behaviors have automated verification — Next.js App Router conventions are syntactic and fully testable via fixtures.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (kitchen-sink + 4 detect fixtures shipped under plan 04-01)
- [x] No watch-mode flags
- [x] Feedback latency < 15s (targeted suite ~1s; full suite ~10s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-05 — Phase 04 retroactive Nyquist gate close. 04-VERIFICATION.md status=passed (4/4 must-haves) backs the per-task map; 70 targeted tests green on 2026-05-05.
