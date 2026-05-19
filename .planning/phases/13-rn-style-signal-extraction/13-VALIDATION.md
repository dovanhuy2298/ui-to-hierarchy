---
phase: 13
slug: rn-style-signal-extraction
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-19
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest `^4.3.6` |
| **Config file** | `vitest.config.ts` (project root) |
| **Quick run command** | `vitest run test/core/styles/rn` |
| **Full suite command** | `vitest run` |
| **Estimated runtime** | ~10 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `vitest run test/core/styles/rn`
- **After every plan wave:** Run `vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green (≥ 494 + new tests)
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-SLOT-verify | 01 | 0 | EXPO-SLOT-01 | — | No throw on slot injection | smoke | `vitest run test/adapters/expo` | ✅ existing | ⬜ pending |
| 13-W0-stylesheet | 01 | 0 | RN-04, RN-08 | — | N/A | unit | `vitest run test/core/styles/rn/stylesheet-create.test.ts` | ❌ Wave 0 | ⬜ pending |
| 13-W0-styleprop | 01 | 0 | RN-05, RN-07 | — | N/A | unit | `vitest run test/core/styles/rn/style-prop.test.ts` | ❌ Wave 0 | ⬜ pending |
| 13-W0-flatten | 01 | 0 | RN-06 | — | N/A | unit | `vitest run test/core/styles/rn/index.test.ts` | ❌ Wave 0 | ⬜ pending |
| 13-stylesheet-impl | 02 | 1 | RN-04 | T-input-validation | `t.isObjectExpression` guard + `{ raw }` on malformed | unit | `vitest run test/core/styles/rn/stylesheet-create.test.ts` | ❌ Wave 0 | ⬜ pending |
| 13-styleprop-impl | 02 | 1 | RN-05, RN-07 | T-input-validation | No regex on tagged template | unit | `vitest run test/core/styles/rn/style-prop.test.ts` | ❌ Wave 0 | ⬜ pending |
| 13-flatten-impl | 02 | 1 | RN-06 | — | null-check before t.is* | unit | `vitest run test/core/styles/rn/index.test.ts` | ❌ Wave 0 | ⬜ pending |
| 13-adapter-wire | 03 | 2 | RN-04..08 | T-path-inject | `toForwardSlash` on all Map keys | integration | `vitest run test/adapters/expo` | ✅ existing | ⬜ pending |
| 13-fixture-edit | 03 | 2 | RN-07 | — | N/A | integration | `vitest run test/adapters/expo` | ✅ existing | ⬜ pending |
| 13-island-check | 03 | 2 | ARCH-01 | — | No adapter imports in core | static | `vitest run test/architecture/island.test.ts` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/core/styles/rn/stylesheet-create.test.ts` — stubs for RN-04, RN-08
- [ ] `test/core/styles/rn/style-prop.test.ts` — stubs for RN-05, RN-07
- [ ] `test/core/styles/rn/index.test.ts` — stubs for RN-06 (≥ 8 `flattenStyleArray` cases)
- [ ] `src/core/styles/rn/` directory (does not exist yet — Wave 0 creates stubs)

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
