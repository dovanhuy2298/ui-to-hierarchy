---
phase: 1
slug: scaffolding-ir-foundation
status: filled
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-20
updated: 2026-04-20
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.3.x |
| **Config file** | vitest.config.ts (created by Plan 01 Task 2) |
| **Quick run command** | `pnpm vitest run --reporter=dot` |
| **Full suite command** | `pnpm vitest run && pnpm build && node -e "require('fs').accessSync('dist/cli.js', 1)" && pnpm lint && pnpm typecheck` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --reporter=dot`
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | SC | Test Type | Automated Command | Status |
|---------|------|------|-------------|----|-----------|-------------------|--------|
| 01-01-T1 | 01 | 1 | — (scaffold) | SC-1 | typecheck | `pnpm typecheck` | ⬜ pending |
| 01-01-T2 | 01 | 1 | — (scaffold) | SC-1 | build + shebang assert | `pnpm build && node -e "const l=require('node:fs').readFileSync('dist/cli.js','utf8').split('\n')[0]; if(l!=='#!/usr/bin/env node')process.exit(1)"` | ⬜ pending |
| 01-02-T1 | 02 | 1 | OUT-01 (foundation) | SC-2, SC-3 | unit (zod) | `pnpm vitest run test/ir/schema.test.ts --reporter=dot` | ⬜ pending |
| 01-03-T1 | 03 | 1 | — (interop) | SC-4 | unit | `pnpm vitest run test/core/babel-shim.test.ts --reporter=dot` | ⬜ pending |
| 01-04-T1 | 04 | 1 | ARCH-03 (paths) | SC-5 | unit | `pnpm vitest run test/core/paths.test.ts --reporter=dot` | ⬜ pending |
| 01-04-T2 | 04 | 1 | ARCH-03 | SC-5 | unit | `pnpm vitest run test/core/resolve-root.test.ts --reporter=dot` | ⬜ pending |
| 01-05-T1 | 05 | 2 | OUT-01 | SC-2, SC-3 | typecheck (fixtures) | `pnpm typecheck` | ⬜ pending |
| 01-05-T2 | 05 | 2 | OUT-01, ARCH-03 | SC-2, SC-3, SC-5 | snapshot + schema + build | `pnpm vitest run test/renderers --reporter=dot && pnpm build` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## SC → Task Coverage

| Success Criterion | Covered By |
|-------------------|------------|
| SC-1 (build + shebang) | 01-01-T2 |
| SC-2 (markdown round-trip + file:line forward-slash) | 01-02-T1 (schema gate) + 01-05-T2 (snapshot) |
| SC-3 (JSON round-trip + schema valid) | 01-02-T1 + 01-05-T2 |
| SC-4 (Babel interop shim) | 01-03-T1 |
| SC-5 (resolveRoot + envelope echo) | 01-04-T1 + 01-04-T2 + 01-05-T2 |

## Requirement → Plan Coverage

| Requirement | Plan(s) |
|-------------|---------|
| OUT-01 | 01-02 (schema foundation), 01-05 (renderers + fixtures) |
| ARCH-03 | 01-04 (resolveRoot), 01-05 (envelope-builder echoes resolvedRoot) |

---

## Wave 0 Requirements

- [ ] `package.json` — type: module, bin, engines.node >=20, scripts — Plan 01 Task 1
- [ ] `tsconfig.json` — module: ESNext, moduleResolution: bundler, strict — Plan 01 Task 1
- [ ] `vitest.config.ts` — default config — Plan 01 Task 2
- [ ] `tsup.config.ts` — ESM, node20, banner.js, define `__TOOL_VERSION__` — Plan 01 Task 2
- [ ] `biome.json` — noRestrictedImports rule scoped to ir/renderers/core — Plan 01 Task 2
- [ ] Install runtime deps: zod@^4.1, @babel/traverse@^7.29 — Plan 01 Task 1
- [ ] Install dev deps: typescript, tsup, vitest, tsx, @types/node, @types/babel__traverse, @biomejs/biome — Plan 01 Task 1
- [ ] `git init` if repo is not a git repo — Plan 01 Task 1 (opportunistic)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | — | All SC-1..SC-5 are asserted by automated commands above | — |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending execution
