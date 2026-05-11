---
phase: 7
slug: init-file-writer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-11
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run test/init` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run test/init`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | INIT-XX | — | — | unit/integration | `npx vitest run <file>` | ❌ W0 | ⬜ pending |

*Populated by planner — see PLAN.md task list. Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/init/markers.test.ts` — marker scan, fingerprint, hand-edit detection (INIT-09, INIT-10, INIT-12)
- [ ] `test/init/atomic-write.test.ts` — atomic rename, CRLF/BOM preservation (INIT-07, INIT-08)
- [ ] `test/init/targets.test.ts` — per-target path + frontmatter (INIT-03, INIT-04, INIT-05, INIT-14)
- [ ] `test/init/cli.test.ts` — argv parsing, --dry-run, --force, --target enum validation (INIT-01, INIT-02, INIT-06, INIT-11, INIT-13)
- [ ] `test/init/idempotent.test.ts` — re-run produces zero file changes (INIT-09)
- [ ] `test/fixtures/init/` — temp-dir helpers, sample CLAUDE.md / AGENTS.md / .cursor/rules / .github fixtures

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real `npx ui-hierarchy-mcp --init` in a real project root injects the guide block | INIT-01 (end-to-end smoke) | Verifies published-package shebang + npm bin wiring against a real Node CLI launch | After `npm pack`, install tarball in scratch project, run `npx ui-hierarchy-mcp --init`, verify `CLAUDE.md` updated and `npx ui-hierarchy-mcp` (no flag) still starts stdio server |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
