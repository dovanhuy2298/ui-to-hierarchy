---
phase: 08-v1-0-polish
plan: 03
subsystem: core/resolver + core/analyzer
tags: [polish-03, resolver, analyzer, line-accuracy]
requires:
  - 08-02-PLAN (ParseResult.declLines populated by parseFile)
provides:
  - ResolveResult.local now carries `line: number` (true declaration line)
  - Resolved local-kind component TreeNodes report the actual declaration line
affects:
  - src/adapters/types.ts (ResolveResult.local widened)
  - src/core/resolver/index.ts (line populated via parseFile + declLines.get)
  - src/core/resolver/barrel.ts (line populated; SpecifierResolver signature gains importedName)
  - src/core/Analyzer.ts (resolveComponentCallsites writes result.line)
tech_stack_added: []
tech_stack_patterns:
  - "Caller-passes-importedName resolver pattern: SpecifierResolver now takes importedName so each emission can populate the true line without a second parse pass."
key_files_created:
  - test/fixtures/phase-05/micro/line-test/app/layout.tsx
  - test/fixtures/phase-05/micro/line-test/app/page.tsx
  - test/fixtures/phase-05/micro/line-test/components/Foo.tsx
  - test/fixtures/phase-05/micro/line-test/tsconfig.json
key_files_modified:
  - src/adapters/types.ts
  - src/core/resolver/index.ts
  - src/core/resolver/barrel.ts
  - src/core/Analyzer.ts
  - test/core/analyzer.test.ts
decisions:
  - "Threaded `importedName` through `resolveSpecifierToFile` and `SpecifierResolver` rather than re-parsing in the Analyzer. Keeps the single-parse contract (parseFile is ctx-cached) and emits the correct line at the point of resolution."
  - "Barrel chase reads `declLines.get(importedName)` from the already-parsed AST it traversed for binding discovery — zero extra parse passes."
  - "D-04 honored byte-for-byte: external/cycle/not-found/ambiguous variants are unchanged. The Analyzer's external/unresolved branch at the original line 312 was not touched."
duration_seconds: 204
completed_at: 2026-05-12T02:45:17Z
---

# Phase 08 Plan 03: POLISH-03 part B — propagate declaration line through ResolveResult Summary

POLISH-03 part B replaces the legacy `line: 1` placeholder on resolved local-kind component TreeNodes with the true declaration line, by extending `ResolveResult.local` with a `line: number` field populated from `ParseResult.declLines` (added in plan 08-02) and threading it through `resolveSpecifierToFile`, `chaseBarrel`, and the Analyzer writer site.

## What changed

1. **`src/adapters/types.ts`** — `ResolveResult.local` is now `{ ok: true; kind: "local"; absolutePath: string; line: number }`. JSDoc extended with D-02/D-03 references. All other union variants byte-identical (D-04).
2. **`src/core/resolver/index.ts`** — `resolveSpecifierToFile` gains an `importedName` parameter. Both local-emission sites (tsconfig-paths branch and relative-path branch) now call `parseFile(ctx, fwd)` and look up `declLines.get(importedName)`, falling back to `1` per D-03. Callers updated: `doResolve` passes `importedName`, the bare-re-export recursion passes `re.importedFromSource`.
3. **`src/core/resolver/barrel.ts`** — `SpecifierResolver` type extended with `importedName`. The `foundLocal` emission reads `parsed.declLines.get(importedName) ?? 1` (free — same `parsed` already used for traversal). Recursive `resolveSpecifier(...)` calls pass the appropriate imported name (renamed export or the original).
4. **`src/core/Analyzer.ts`** — `resolveComponentCallsites` writes `line: result.line` instead of `line: 1` on the resolved-local branch. The unresolved/external branch is untouched (preserves D-12/D-13 call-site line behavior).
5. **Regression fixture** — `test/fixtures/phase-05/micro/line-test/` with `components/Foo.tsx` declaring `Foo` on line 3 (two leading comment lines), plus minimal `app/layout.tsx` and `app/page.tsx`.
6. **New analyzer test** — `Analyzer.getFullHierarchy({ route: "/" })` against the line-test fixture; asserts the resolved `Foo` TreeNode has `file` ending in `components/Foo.tsx`, `line === 3`, and `line !== 1`.

## Verification

- `pnpm tsc --noEmit` — clean (the pre-existing `test/fixtures/phase-05/micro/parse-error/app/page.tsx` TS1003 error is unrelated and existed before this plan).
- `pnpm vitest run test/core test/adapters` — 22 files, 155 tests passing.
- `pnpm vitest run` (full suite) — 43 files, 351 tests passing.
- Grep gates:
  - `grep -c "declLines.get" src/core/resolver/index.ts` → 2 ✓
  - `grep -c "declLines.get" src/core/resolver/barrel.ts` → 2 (1 code + 1 comment) ✓
  - `grep -c "line: result.line" src/core/Analyzer.ts` → 1 ✓
  - `sed -n '3p' test/fixtures/phase-05/micro/line-test/components/Foo.tsx` → `export function Foo() { return <div>foo</div>; }` ✓
- D-04 preservation: no edits to the external/cycle/not-found/ambiguous variants of `ResolveResult` or to the unresolved/external branch of `resolveComponentCallsites`.

## Deviations from Plan

**Commit granularity**: the plan structured tasks 1/2/3 as separate TDD-style commits, but `tdd_mode` is `false` in config and the type-widening forces resolver emission-site updates in the same change to keep tsc green. Folded Task 1 + Task 2 into one resolver-side commit (`d0a7aae`) and Task 3 into a consumer-side commit (`24c64f1`). Two semantically coherent commits instead of three half-broken ones. No behavioral deviation from the plan.

**`test/adapters/types.test.ts` update**: the plan suggested this file might need a `line: 1` addition if it constructed a `ResolveResult.local` literal. It does not — it only exercises `ComponentDefinition`. No edit needed; file left untouched.

Otherwise: plan executed exactly as written. No auto-fixes (Rules 1/2/3) triggered, no architectural changes, no auth gates.

## Commits

- `d0a7aae` — feat(08-03): plumb declaration line through ResolveResult.local
- `24c64f1` — feat(08-03): Analyzer writes true declaration line on resolved local components

## Self-Check: PASSED

- `test/fixtures/phase-05/micro/line-test/components/Foo.tsx` exists — FOUND
- `test/fixtures/phase-05/micro/line-test/app/page.tsx` exists — FOUND
- `test/fixtures/phase-05/micro/line-test/app/layout.tsx` exists — FOUND
- Commit `d0a7aae` in git log — FOUND
- Commit `24c64f1` in git log — FOUND
- `pnpm tsc --noEmit` exits cleanly (no new errors) — PASSED
- `pnpm vitest run` 351/351 — PASSED
