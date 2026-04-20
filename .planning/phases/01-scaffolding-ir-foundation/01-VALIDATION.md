---
phase: 1
slug: scaffolding-ir-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.3.x |
| **Config file** | vitest.config.ts (Wave 0 installs) |
| **Quick run command** | `pnpm vitest run --reporter=dot` |
| **Full suite command** | `pnpm vitest run && pnpm build && node -e "require('fs').accessSync('dist/cli.js', 1)"` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --reporter=dot`
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

To be filled by planner. Every plan's tasks must map to one of SC-1..SC-5 here.

| Task ID | Plan | Wave | Requirement | SC | Test Type | Automated Command | Status |
|---------|------|------|-------------|----|-----------|-------------------|--------|
| TBD     | TBD  | TBD  | OUT-01/ARCH-03 | SC-1..5 | unit/build | TBD | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `package.json` — type: module, bin, engines.node >=20, scripts (build/test)
- [ ] `tsconfig.json` — module: ESNext, moduleResolution: bundler, strict
- [ ] `vitest.config.ts` — default config sufficient
- [ ] `tsup.config.ts` — ESM target node20, shebang via banner.js, define toolVersion
- [ ] Install runtime deps: zod@^4.1, @babel/traverse@^7.29
- [ ] Install dev deps: typescript@^5.20, tsup@^8.5, vitest@^4.3, tsx@^4.21, @types/node

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None expected | — | All SC-1..SC-5 can be asserted with vitest or a tiny shell check | — |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
