---
phase: 3
slug: parser-core-ast-resolution-extractors
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-29
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> See `03-RESEARCH.md` § Validation Architecture for full test-to-requirement mapping.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.3 (already configured Phase 1) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=dot` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10–20 seconds (parser tests are fast — no I/O beyond fixtures) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=dot` (scoped to touched files when feasible)
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Per-task entries are filled by `gsd-planner` from RESEARCH.md § "Test-to-Requirement Mapping (Wave 0 gap list)". Each PLAN.md task's `<acceptance_criteria>` must reference one of the test files below.

| Requirement | Test File | Test Type | Automated Command |
|-------------|-----------|-----------|-------------------|
| PARSE-01 | `test/core/parse.test.ts` | unit | `npx vitest run test/core/parse.test.ts` |
| PARSE-02 | `test/core/resolve-barrel.test.ts` | unit | `npx vitest run test/core/resolve-barrel.test.ts` |
| PARSE-03 | `test/core/resolve-paths.test.ts` | unit | `npx vitest run test/core/resolve-paths.test.ts` |
| PARSE-04 | `test/core/unwrap-hoc.test.ts`, `test/core/extract-class-component.test.ts` | unit | `npx vitest run test/core/unwrap-hoc.test.ts test/core/extract-class-component.test.ts` |
| OUT-02 | `test/extractors/extract-classes.test.ts`, `test/extractors/extract-style.test.ts`, `test/extractors/extract-css-modules.test.ts`, `test/extractors/extract-styled.test.ts` | unit | `npx vitest run test/extractors/` |
| OUT-03 | `test/core/render-flow.test.ts` | unit | `npx vitest run test/core/render-flow.test.ts` |
| OUT-04 | covered transitively (resolved import paths surface in barrel/paths tests above) | unit | (see PARSE-02 + PARSE-03) |
| ARCH-01 | `test/architecture/island.test.ts` | architecture | `npx vitest run test/architecture/island.test.ts` |

*Status legend: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky — populated during execution.*

---

## Wave 0 Requirements

All test files above are gaps (none exist yet). Wave 0 must include:

- [ ] `test/fixtures/` — minimal Next.js App Router shapes, barrel re-export shadcn-style fixture, HOC fixture, class-component fixture, styled-components fixture, conditional render fixture
- [ ] `test/core/parse.test.ts` — stubs for PARSE-01 (errorRecovery → `kind: "error"`)
- [ ] `test/core/resolve-barrel.test.ts` — stubs for PARSE-02 (recursive ExportNamed/ExportAll chase, cycle guard)
- [ ] `test/core/resolve-paths.test.ts` — stubs for PARSE-03 (`@/*`, `~/*`, `#*`, `extends` chain via `get-tsconfig`)
- [ ] `test/core/unwrap-hoc.test.ts` — stubs for PARSE-04 part A (memo, forwardRef, observer, with*, *HOC)
- [ ] `test/core/extract-class-component.test.ts` — stubs for PARSE-04 part B (ClassDeclaration → render())
- [ ] `test/extractors/extract-classes.test.ts` — stubs for OUT-02 part A (layout-only Tailwind by default, `fullClasses: true`)
- [ ] `test/extractors/extract-style.test.ts` — stubs for OUT-02 part B (inline `style={{...}}`)
- [ ] `test/extractors/extract-css-modules.test.ts` — stubs for OUT-02 part C (CSS Modules import + member access)
- [ ] `test/extractors/extract-styled.test.ts` — stubs for OUT-02 part D (styled-components tagged templates)
- [ ] `test/core/render-flow.test.ts` — stubs for OUT-03 (ternary, `&&`, `||`, `??`, `!`, `.map`)
- [ ] `test/architecture/island.test.ts` — stubs for ARCH-01 (no `core/` or `ir/` import from `adapters/`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Snapshot review of markdown tree shape on real shadcn fixture | OUT-02, OUT-03 | First-time tree-output review needs human eyes; subsequent diffs are automated via `toMatchFileSnapshot` | Run `npx vitest run test/integration/shadcn-fixture.test.ts -u` and visually inspect the produced snapshot before committing |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all 12 MISSING test file references
- [ ] No watch-mode flags (`--watch` forbidden in CI commands)
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter once gsd-planner attaches per-task entries

**Approval:** pending
