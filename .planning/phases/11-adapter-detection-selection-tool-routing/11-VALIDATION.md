---
phase: 11
slug: adapter-detection-selection-tool-routing
status: planning-complete
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-18
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
| fixture-package-json | 01 | 0 | INTEG-04 | integration | `npx vitest run test/adapters/select.test.ts` | ⬜ pending |
| ExpoRouterAdapter stub | 01 | 1 | ADAPT-03 | unit | `npx vitest run test/adapters/ExpoRouterAdapter.test.ts` | ⬜ pending |
| detectExpoRouter | 01 | 1 | ADAPT-03 | unit | `npx vitest run test/adapters/expo/detect.test.ts` | ⬜ pending |
| detectNextJs export | 01 | 1 | ADAPT-03 | unit | `npx vitest run test/adapters/next/detect.test.ts` | ⬜ pending |
| selectAdapter | 02 | 2 | ADAPT-03, ADAPT-04 | unit | `npx vitest run test/adapters/select.test.ts` | ⬜ pending |
| CLI --framework flag | 02 | 2 | ADAPT-05 | unit | `npx vitest run test/cli` | ⬜ pending |
| tool handler refactor | 03 | 3 | ADAPT-06 | integration | `npx vitest run` | ⬜ pending |
| monorepo fixture + test | 03 | 3 | INTEG-04 | integration | `npx vitest run test/adapters/select.test.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/fixtures/expo-basic/package.json` — add `expo-router` in dependencies (required for two-signal detection)
- [ ] `test/fixtures/next-app-router/package.json` — confirm `next` in dependencies (required for detectNextJs probe)
- [ ] `test/adapters/expo/detect.test.ts` — stubs for ADAPT-03 detection tests
- [ ] `test/adapters/select.test.ts` — stubs for ADAPT-03/04 selectAdapter tests
- [ ] `test/fixtures/monorepo-mixed/` — minimal fixture structure for INTEG-04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `--help` shows `--framework` flag | ADAPT-05 | CLI output inspection | Run `node dist/cli.js --help`, verify `--framework` line appears |
| `--framework invalid` exits code 1 | ADAPT-05 | Process exit code check | Run `node dist/cli.js --framework invalid`, check `$?` = 1 |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
