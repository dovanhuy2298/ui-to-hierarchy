---
phase: 4
slug: next-js-app-router-adapter
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-29
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
| TBD | TBD | TBD | NEXT-01 | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | NEXT-02 | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | NEXT-03 | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | NEXT-04 | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Planner will populate concrete task IDs and file paths in PLAN.md frontmatter.*

---

## Wave 0 Requirements

- [ ] `test/fixtures/next-app-kitchen-sink/` — kitchen-sink fixture covering route groups, parallel slots, intercepting routes, dynamic segments
- [ ] `test/fixtures/next-app-detect-*/` — 4 minimal fixtures for detector positive/negative cases
- [ ] vitest already installed — no framework setup needed

---

## Manual-Only Verifications

*All phase behaviors have automated verification — Next.js App Router conventions are syntactic and fully testable via fixtures.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
