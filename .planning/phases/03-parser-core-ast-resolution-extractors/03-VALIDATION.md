---
phase: 3
slug: parser-core-ast-resolution-extractors
status: draft
nyquist_compliant: true
wave_0_complete: true
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

> Test paths match the files actually created by Plans 02–06. Each PLAN.md task's `<acceptance_criteria>` references one of the test files below. Wave 0 scaffolding is folded into each plan's first task per the execution model — no separate Wave 0 plan exists.

| Requirement | Test File(s) | Test Type | Automated Command |
|-------------|--------------|-----------|-------------------|
| PARSE-01 | `test/core/parser/parseFile.test.ts` | unit | `npx vitest run test/core/parser/parseFile.test.ts` |
| PARSE-02 | `test/core/resolver/barrel.test.ts` | unit | `npx vitest run test/core/resolver/barrel.test.ts` |
| PARSE-03 | `test/core/resolver/tsconfig-paths.test.ts`, `test/core/resolver/relative.test.ts` | unit | `npx vitest run test/core/resolver/tsconfig-paths.test.ts test/core/resolver/relative.test.ts` |
| PARSE-04 | `test/core/render-flow/component-detect.test.ts` | unit | `npx vitest run test/core/render-flow/component-detect.test.ts` |
| OUT-02 | `test/core/extractors/tailwind-classes.test.ts`, `test/core/extractors/inline-style.test.ts`, `test/core/extractors/css-module.test.ts`, `test/core/extractors/styled.test.ts` | unit | `npx vitest run test/core/extractors/` |
| OUT-03 | `test/core/render-flow/conditionals.test.ts`, `test/core/render-flow/lists.test.ts` | unit | `npx vitest run test/core/render-flow/conditionals.test.ts test/core/render-flow/lists.test.ts` |
| OUT-04 | `test/core/render-flow/walkRenderFlow.test.ts` | unit | `npx vitest run test/core/render-flow/walkRenderFlow.test.ts` |
| ARCH-01 | `test/architecture/island.test.ts` | architecture | `npx vitest run test/architecture/island.test.ts` |

*Status legend: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky — populated during execution.*

---

## Wave 0 Requirements

Wave 0 scaffolding is folded into each plan's first task (per the GSD execution model adopted in Phase 3); no separate Wave 0 plan exists. Each plan creates its own test file alongside the implementation in the same task. The complete inventory of test files created during Phase 3:

- `test/architecture/island.test.ts` — Plan 01 (ARCH-01: no `core/` or `ir/` import from `adapters/`, static + dynamic)
- `test/adapters/types.test.ts` — Plan 01 (ComponentDefinition structural fields)
- `test/adapters/FrameworkAdapter.test.ts` — Plan 01 (exactly 5 method names)
- `test/adapters/next/NextJsAdapter.test.ts` — Plan 06 (HOC, class, stubs, end-to-end)
- `test/core/parser/parseFile.test.ts` — Plan 02 (PARSE-01: errorRecovery, sibling validity)
- `test/core/resolver/relative.test.ts` — Plan 03 (D-13 probe order)
- `test/core/resolver/barrel.test.ts` — Plan 03 (PARSE-02: shadcn fixture, cycle guard)
- `test/core/resolver/tsconfig-paths.test.ts` — Plan 03 (PARSE-03: `@/*`, multi-target, `extends` chain, forward-slash)
- `test/core/render-flow/component-detect.test.ts` — Plan 05 (PARSE-04: HOC + class component detection)
- `test/core/render-flow/walkRenderFlow.test.ts` — Plan 05 (OUT-04: 5 conditional forms + .map snapshot)
- `test/core/render-flow/conditionals.test.ts` — Plan 05 (OUT-03 conditionals primitive)
- `test/core/render-flow/lists.test.ts` — Plan 05 (OUT-03 lists primitive)
- `test/core/extractors/tailwind-classes.test.ts` — Plan 04 (OUT-02 part A: layout-only Tailwind, `fullClasses: true`)
- `test/core/extractors/inline-style.test.ts` — Plan 04 (OUT-02 part B: inline `style={{...}}`)
- `test/core/extractors/css-module.test.ts` — Plan 04 (OUT-02 part C: CSS Modules import + member access)
- `test/core/extractors/styled.test.ts` — Plan 04 (OUT-02 part D: styled-components tagged templates with `{?}` placeholder)
- `test/fixtures/parser/` — full fixture tree per D-14 + D-15 (parse-errors, hoc, classes, render-flow, extractors, resolver mini-projects)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Snapshot review of markdown tree shape on real shadcn fixture | OUT-02, OUT-03 | First-time tree-output review needs human eyes; subsequent diffs are automated via `toMatchFileSnapshot` | Run `npx vitest run test/integration/shadcn-fixture.test.ts -u` and visually inspect the produced snapshot before committing |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING test file references (folded into plan task 1)
- [x] No watch-mode flags (`--watch` forbidden in CI commands)
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter (per-task entries match plan-created paths)

**Approval:** ready
