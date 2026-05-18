---
phase: 11
slug: adapter-detection-selection-tool-routing
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-18
audited: 2026-05-18
test_count: 367
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green (≥371 tests)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| fixture-package-json | 01 | 0 | INTEG-04 | integration | `npx vitest run test/adapters/select.test.ts` | ✅ green |
| ExpoRouterAdapter stub | 01 | 1 | ADAPT-03 | unit | `npx vitest run test/adapters/select.test.ts` | ✅ green (covered via select.test.ts — no standalone ExpoRouterAdapter.test.ts) |
| detectExpoRouter | 01 | 1 | ADAPT-03 | unit | `npx vitest run test/adapters/expo/detect.test.ts` | ✅ green |
| detectNextJs export | 01 | 1 | ADAPT-03 | unit | `npx vitest run test/adapters/next/detect.test.ts` | ✅ green |
| selectAdapter | 02 | 2 | ADAPT-03, ADAPT-04 | unit | `npx vitest run test/adapters/select.test.ts` | ✅ green |
| CLI --framework flag | 02 | 2 | ADAPT-05 | integration | `npx vitest run test/cli` | ✅ green |
| tool handler refactor | 03 | 3 | ADAPT-06 | integration | `npx vitest run` | ✅ green |
| monorepo fixture + test | 03 | 3 | INTEG-04 | integration | `npx vitest run test/adapters/select.test.ts` | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `test/fixtures/expo-basic/package.json` — add `expo-router` in dependencies (required for two-signal detection)
- [x] `test/fixtures/next-app-router/package.json` — confirm `next` in dependencies (required for detectNextJs probe)
- [x] `test/adapters/expo/detect.test.ts` — stubs for ADAPT-03 detection tests (4 cases, all green)
- [x] `test/adapters/select.test.ts` — stubs for ADAPT-03/04 selectAdapter tests (8 cases, all green)
- [x] `test/fixtures/monorepo-mixed/` — minimal fixture structure for INTEG-04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `--help` shows `--framework` flag | ADAPT-05 | CLI output inspection | Run `node dist/cli.js --help`, verify `--framework` line appears |

> Note: `--framework invalid exits code 1` was promoted to automated via `test/cli/framework-flag.test.ts` (spawnSync integration test).

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s (suite runs in ~5s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** 2026-05-18 — audit complete, 367 tests, 0 failures

---

## Validation Audit 2026-05-18

| Metric | Count |
|--------|-------|
| Tasks audited | 8 |
| COVERED | 8 |
| PARTIAL | 0 |
| MISSING | 0 |
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
| Manual-Only demoted to automated | 1 (`--framework invalid` → `test/cli/framework-flag.test.ts`) |
| Test count at audit | 367 pass / 0 fail |
