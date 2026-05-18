---
phase: 12
slug: 12-exporouteradapter-routing-rn-primitives
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-18
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest `^4.3.6` |
| **Config file** | `vitest.config.ts` (project root) |
| **Quick run command** | `npx vitest run test/adapters/expo/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds (quick), ~30 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run test/adapters/expo/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| segments | routing-infra | 1 | ROUTE-03 | — | N/A | unit | `npx vitest run test/adapters/expo/segments.test.ts` | ❌ Wave 0 | ⬜ pending |
| discover | routing-infra | 1 | ROUTE-01 | — | N/A | unit | `npx vitest run test/adapters/expo/discover.test.ts` | ❌ Wave 0 | ⬜ pending |
| route-map | routing-infra | 1 | ROUTE-04, ROUTE-05 | — | N/A | unit | `npx vitest run test/adapters/expo/route-map.test.ts` | ❌ Wave 0 | ⬜ pending |
| rn-primitives | rn-classification | 2 | SPEC-09, SPEC-10, SPEC-11 | — | N/A | unit | `npx vitest run test/adapters/expo/rn-primitives.test.ts` | ❌ Wave 0 | ⬜ pending |
| import-bindings | core-extraction | 0 | D-04, D-05 | — | N/A | regression | `npx vitest run` | ✅ existing | ⬜ pending |
| ExpoRouterAdapter (stubs→impl) | adapter-impl | 2 | ROUTE-01..05, RN-01..03, SPEC-09..11 | — | N/A | snapshot | `npx vitest run test/adapters/expo/ExpoRouterAdapter.test.ts` | ❌ Wave 0 | ⬜ pending |
| collectChildrenSlotLines | analyzer-ext | 2 | ROUTE-02 | — | N/A | snapshot+regression | `npx vitest run` | ✅ existing | ⬜ pending |
| snapshot-relock | snapshot | final | all | — | N/A | snapshot | `npx vitest run` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/adapters/expo/segments.test.ts` — unit tests for `parseSegment` covering ROUTE-03 (`[id]`, `[...rest]`, `[[...opt]]`, `(group)`, `index`, `+not-found`, static)
- [ ] `test/adapters/expo/discover.test.ts` — unit tests for `resolveExpoRoot` (src/app priority, dual-root warning, empty for non-Expo) covering ROUTE-01
- [ ] `test/adapters/expo/route-map.test.ts` — unit tests for `enumerateRoutes` (group transparency, index collapsing) covering ROUTE-04/ROUTE-05
- [ ] `test/adapters/expo/rn-primitives.test.ts` — unit tests for `isRNPrimitive` and text extraction covering SPEC-09/10/11
- [ ] `test/adapters/expo/ExpoRouterAdapter.test.ts` — snapshot tests for expo-basic and expo-tabs-and-dynamic fixtures covering ROUTE-02 layout chain

*All are new files; test framework is already installed.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
