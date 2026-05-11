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
| 02-T1   | 02   | 1    | INIT-04, INIT-06 | T-07-05 (markers) | block scan + replace + append | unit | `npx vitest run test/init/markers.test.ts` | ❌ W0 | ⬜ pending |
| 02-T2   | 02   | 1    | INIT-07, INIT-09 | T-07-05/08 | fingerprint LF-normalized + EOL/BOM round-trip | unit | `npx vitest run test/init/fingerprint.test.ts test/init/eol.test.ts` | ❌ W0 | ⬜ pending |
| 03-T1   | 03   | 1    | INIT-03 | — | argv parse + target enum | unit | `npx vitest run test/init/argv.test.ts` | ❌ W0 | ⬜ pending |
| 03-T2   | 03   | 1    | INIT-08 | T-07-18 | atomic write + EXDEV fallback | unit | `npx vitest run test/init/writer.test.ts` | ❌ W0 | ⬜ pending |
| 03-T3   | 03   | 1    | INIT-12 | — | guide template renders 4 sections + cwd | unit | `npx vitest run test/init/template.test.ts` | ❌ W0 | ⬜ pending |
| 04-T1   | 04   | 2    | INIT-13 (structural) | T-07-17 | runInit composes leaves; stdin/readline/isTTY grep clean | static | `npx tsc --noEmit` + grep gate | ❌ W0 | ⬜ pending |
| 04-T2   | 04   | 2    | INIT-01, INIT-04, INIT-05, INIT-07, INIT-09, INIT-10, INIT-11, INIT-14 | T-07-15/17/19 | end-to-end idempotency + hand-edit guard + frontmatter preservation | integration | `npx vitest run test/init/integration.test.ts` | ❌ W0 | ⬜ pending |
| 05-T*   | 05   | 3    | INIT-02 | — | cli dispatch fork; existing smoke test stays green | smoke | `npx vitest run test/mcp/smoke.spawn.test.ts` | ✅ existing | ⬜ pending |

*Populated by planner — see PLAN.md task list. Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

These test files must exist before their corresponding tasks can be verified. The plans create them as part of Wave 1 (Plans 02 and 03) and Wave 2 (Plan 04). The executor flips `wave_0_complete: true` and `nyquist_compliant: true` once every entry below has been created and the Wave 1 test files turn green.

- [ ] `test/init/markers.test.ts` — covers INIT-04 (idempotency primitives) and INIT-06 (append after blank line) (created by Plan 02 Task 1)
- [ ] `test/init/fingerprint.test.ts` — covers INIT-07 (SHA-256 + LF normalization) (created by Plan 02 Task 2)
- [ ] `test/init/eol.test.ts` — covers INIT-09 (EOL/BOM detect + apply round-trip) (created by Plan 02 Task 2)
- [ ] `test/init/argv.test.ts` — covers INIT-03 (parseArgs + target enum validation) (created by Plan 03 Task 1)
- [ ] `test/init/writer.test.ts` — covers INIT-08 (atomic write + EXDEV fallback + tmp cleanup) (created by Plan 03 Task 2)
- [ ] `test/init/template.test.ts` — covers INIT-12 (renderGuide: 4 sections + cwd substitution) (created by Plan 03 Task 3)
- [ ] `test/init/integration.test.ts` — covers INIT-01, INIT-04 (idempotency end-to-end + fingerprint-preimage regression), INIT-05, INIT-07, INIT-09, INIT-10, INIT-11, INIT-13 (stdin listener invariant), INIT-14 (created by Plan 04 Task 2)
- [ ] `vitest.config.ts` — extend `define` block with `__INIT_MARKER_VERSION__: JSON.stringify('0.0-test')` (Plan 01 prerequisite for all test files to compile)

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
