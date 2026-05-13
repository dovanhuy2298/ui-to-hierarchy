---
phase: 9
slug: fixture-design-stub-packages
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-13
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.3.6 |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `vitest run test/core/resolver/expo-stubs.test.ts` |
| **Full suite command** | `vitest run` |
| **Estimated runtime** | ~5 seconds (quick) / ~15 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `vitest run test/core/resolver/expo-stubs.test.ts`
- **After every plan wave:** Run `vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green (≥356 tests)
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | INTEG-01 | — | N/A | smoke | `node -e "require('fs').accessSync('test/fixtures/expo-basic/app/_layout.tsx')"` | ❌ W0 | ⬜ pending |
| 09-01-02 | 01 | 1 | INTEG-01 | — | N/A | smoke | `node -e "require('fs').accessSync('test/fixtures/expo-basic/app/components/Button.ios.tsx')"` | ❌ W0 | ⬜ pending |
| 09-02-01 | 02 | 1 | INTEG-01 | — | N/A | smoke | `node -e "require('fs').accessSync('test/fixtures/expo-tabs-and-dynamic/app/(tabs)/_layout.tsx')"` | ❌ W0 | ⬜ pending |
| 09-02-02 | 02 | 1 | INTEG-01 | — | N/A | smoke | `node -e "require('fs').accessSync('test/fixtures/expo-tabs-and-dynamic/app/components/Button.ios.tsx')"` | ❌ W0 | ⬜ pending |
| 09-03-01 | 03 | 2 | INTEG-02 | — | N/A | unit | `npx vitest run test/core/resolver/expo-stubs.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/core/resolver/expo-stubs.test.ts` — smoke test covering INTEG-02 (resolver external classification) and file existence assertions for INTEG-01
- [ ] `test/fixtures/expo-basic/` — entire fixture tree (INTEG-01): `app/_layout.tsx`, `app/index.tsx`, `app/components/HomeScreen.tsx`, `app/components/Button.ios.tsx`, `app/components/Button.android.tsx`, `tsconfig.json`, `node_modules/react-native/`, `node_modules/expo-router/`
- [ ] `test/fixtures/expo-tabs-and-dynamic/` — entire fixture tree (INTEG-01): `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/[id].tsx`, `app/+not-found.tsx`, `app/components/Button.ios.tsx`, `app/components/Button.android.tsx`, `tsconfig.json`, `node_modules/react-native/`, `node_modules/expo-router/`

*All phase deliverables are Wave 0 — no existing infrastructure covers Expo fixtures.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TypeScript type-checks fixture files without errors | INTEG-01 | `tsc` not in vitest pipeline | Run `tsc --noEmit --project test/fixtures/expo-basic/tsconfig.json` and `tsc --noEmit --project test/fixtures/expo-tabs-and-dynamic/tsconfig.json` — both must exit 0 |
| Analyzer does not throw on either fixture | SPEC constraint | Binary spawn excluded from smoke test | Run `node dist/cli.js --root test/fixtures/expo-basic` — must not throw uncaught exception |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
