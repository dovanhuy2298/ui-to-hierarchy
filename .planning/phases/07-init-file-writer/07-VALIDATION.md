---
phase: 7
slug: init-file-writer
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-11
audited: 2026-05-11
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
| **Estimated runtime** | ~1 second (init suite); ~2 seconds (full) |

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
| 02-T1   | 02   | 1    | INIT-04, INIT-06 | T-07-05 (markers) | block scan + replace + append | unit | `npx vitest run test/init/markers.test.ts` | ✅ | ✅ green |
| 02-T2   | 02   | 1    | INIT-07, INIT-09 | T-07-05/08 | fingerprint LF-normalized + EOL/BOM round-trip | unit | `npx vitest run test/init/fingerprint.test.ts test/init/eol.test.ts` | ✅ | ✅ green |
| 03-T1   | 03   | 1    | INIT-03 | — | argv parse + target enum | unit | `npx vitest run test/init/argv.test.ts test/init/targets.test.ts` | ✅ | ✅ green |
| 03-T2   | 03   | 1    | INIT-08 | T-07-18 | atomic write + EXDEV fallback | unit | `npx vitest run test/init/writer.test.ts` | ✅ | ✅ green |
| 03-T3   | 03   | 1    | INIT-12 | — | guide template renders 4 sections + cwd | unit | `npx vitest run test/init/template.test.ts` | ✅ | ✅ green |
| 04-T1   | 04   | 2    | INIT-13 (structural) | T-07-17 | runInit composes leaves; stdin/readline/isTTY grep clean | static | `npx tsc --noEmit` + grep gate | ✅ | ✅ green |
| 04-T2   | 04   | 2    | INIT-01, INIT-04, INIT-05, INIT-07, INIT-09, INIT-10, INIT-11, INIT-14 | T-07-15/17/19 | end-to-end idempotency + hand-edit guard + frontmatter preservation | integration | `npx vitest run test/init/integration.test.ts` | ✅ | ✅ green |
| 05-T*   | 05   | 3    | INIT-02 | — | cli dispatch fork; existing smoke test stays green | smoke | `npx vitest run test/mcp/smoke.spawn.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All Wave 0 test files were created during Wave 1/2 execution and verified green on 2026-05-11.

- [x] `test/init/markers.test.ts` — covers INIT-04 (idempotency primitives) and INIT-06 (append after blank line)
- [x] `test/init/fingerprint.test.ts` — covers INIT-07 (SHA-256 + LF normalization)
- [x] `test/init/eol.test.ts` — covers INIT-09 (EOL/BOM detect + apply round-trip)
- [x] `test/init/argv.test.ts` — covers INIT-03 (parseArgs + target enum validation)
- [x] `test/init/targets.test.ts` — companion coverage for INIT-03 target enum
- [x] `test/init/writer.test.ts` — covers INIT-08 (atomic write + EXDEV fallback + tmp cleanup)
- [x] `test/init/template.test.ts` — covers INIT-12 (renderGuide: 4 sections + cwd substitution)
- [x] `test/init/integration.test.ts` — covers INIT-01, INIT-04, INIT-05, INIT-07, INIT-09, INIT-10, INIT-11, INIT-13, INIT-14
- [x] `vitest.config.ts` — `define` block extended with `__INIT_MARKER_VERSION__`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real `npx ui-hierarchy-mcp --init` in a real project root injects the guide block | INIT-01 (end-to-end smoke) | Verifies published-package shebang + npm bin wiring against a real Node CLI launch | After `npm pack`, install tarball in scratch project, run `npx ui-hierarchy-mcp --init`, verify `CLAUDE.md` updated and `npx ui-hierarchy-mcp` (no flag) still starts stdio server |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ✅ approved 2026-05-11

---

## Validation Audit 2026-05-11

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Verified `npx vitest run test/init` → 8 files, 84 tests passed.
Verified `npx vitest run test/mcp/smoke.spawn.test.ts` → 1 file, 5 tests passed.
All Per-Task Map entries have existing automated commands and run green. No auditor agent spawn required.
