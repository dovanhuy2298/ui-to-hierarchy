---
phase: 08-v1-0-polish
plan: 02
subsystem: parser
tags: [babel, ast, parser, declLines, polish-03]

requires:
  - phase: 03-parser-pipeline
    provides: parseFile primitive and ParseContext.astCache (D-02 single-parse invariant)
provides:
  - ParseResult.ok carries declLines:Map<string, number> populated during parseFile
  - collectDeclLines flat-scan helper covering FunctionDeclaration / VariableDeclarator-arrow / ClassDeclaration / ExportSpecifier re-exports
  - decl-lines.tsx fixture (top-level component declarations with known line numbers)
affects: [08-03 resolveModule line propagation, downstream Analyzer.ts:304 placeholder removal]

tech-stack:
  added: []
  patterns:
    - "Single-pass declLines computation before astCache write — preserves D-02 identity invariant"
    - "Flat program.body scan over @babel/types node kinds (no @babel/traverse) for top-level binding map"

key-files:
  created:
    - test/fixtures/parser/parse-errors/decl-lines.tsx
  modified:
    - src/adapters/types.ts (ParseResult.ok variant + JSDoc D-01)
    - src/core/parser/index.ts (collectDeclLines helper + result wiring)
    - test/core/parser/parseFile.test.ts (POLISH-03 describe block — 7 new assertions)

key-decisions:
  - "Helper extraction: collectDeclLines lives in src/core/parser/index.ts (CONTEXT discretion — clearer than inline traversal, no new file)"
  - "Test file placement: extended existing test/core/parser/parseFile.test.ts (project convention) rather than new test/core/parser.test.ts (plan's working path)"
  - "ExportNamedDeclaration recursion also records inner FunctionDeclaration/ClassDeclaration/VariableDeclaration names (covers `export function Foo` shorthand)"

patterns-established:
  - "Declaration-line map: populate once during parseFile, store on ParseResult.ok, callers read via parseResult.declLines.get(name)"

requirements-completed: []  # POLISH-03 enables, but flips only when plan 08-03 wires the line through

duration: 12min
completed: 2026-05-12
---

# Phase 8 Plan 2: POLISH-03 Part A — declLines Population Summary

**Per-file declaration-line map populated during the single parseFile pass, exposed on ParseResult.ok so downstream resolveModule can replace the `line: 1` placeholder with the true component declaration line at zero extra parse cost.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-12T02:27:00Z
- **Completed:** 2026-05-12T02:39:40Z
- **Tasks:** 2 (1 type-extension + 1 TDD implementation)
- **Files modified:** 3 (+ 1 new fixture)

## Accomplishments

- `ParseResult.ok` extended with `declLines: Map<string, number>` (additive — error variant untouched)
- `parseFile` populates `declLines` in the existing single Babel parse pass — no second AST walk, no cache duplication
- Coverage: named `FunctionDeclaration`, `VariableDeclarator` with arrow/function init, `ClassDeclaration`, re-exported `ExportSpecifier` names, plus declarations wrapped in `ExportNamedDeclaration` / `ExportDefaultDeclaration`
- Anonymous default exports intentionally absent (D-03 fallback territory)
- D-02 cache identity preserved: `parseFile(ctx, p) === parseFile(ctx, p)` still holds

## Task Commits

1. **Task 1: Extend ParseResult.ok with declLines field** — `9664a47` (feat)
2. **Task 2 (RED): Failing parser tests + fixture** — `580f0fb` (test)
3. **Task 2 (GREEN): collectDeclLines helper + parseFile wiring** — `f8157a1` (feat)

_Note: Task 2 is TDD — RED then GREEN. No REFACTOR commit (helper landed clean)._

## Files Created/Modified

- `src/adapters/types.ts` — `ParseResult.ok` adds `declLines: Map<string, number>`; JSDoc cites D-01 and the four covered node kinds.
- `src/core/parser/index.ts` — new `collectDeclLines(body)` helper does a flat scan of `program.body`; result wired in before the existing `ctx.astCache.set(...)`.
- `test/core/parser/parseFile.test.ts` — new `POLISH-03 D-01 parseFile.declLines` describe block with 7 assertions (one per node kind, anonymous-default negative, baseline ok-variant presence, cache identity).
- `test/fixtures/parser/parse-errors/decl-lines.tsx` — new fixture; load-bearing line numbers (Foo@5, Bar@9, Baz@13, Outer@19, anonymous default@21).

## Decisions Made

- **Helper vs inline:** Extracted to `collectDeclLines(body: Statement[])` — clearer than inlining ~50 lines in `parseFile`, no new file, no module boundary cost (kept local in `parser/index.ts`).
- **No @babel/traverse:** Flat scan over `ast.program.body` is sufficient because component declarations are top-level by convention. Avoiding traverse keeps the parser primitive light and dodges the well-known `traverse.default` ESM interop trap.
- **`ExportNamedDeclaration` recursion:** Also records inner `FunctionDeclaration`/`ClassDeclaration`/`VariableDeclaration` so `export function Foo() {}` records `Foo` regardless of whether it appears as a bare `FunctionDeclaration` or wrapped in `ExportNamedDeclaration`. (The fixture exercises this path — `Foo`/`Bar`/`Baz` are all `export`-wrapped.)
- **Test placement:** Used the existing `test/core/parser/parseFile.test.ts` instead of creating `test/core/parser.test.ts` as the plan's `<action>` block suggested. Project convention is `test/core/parser/parseFile.test.ts`; the plan's acceptance criteria say only "the new parser test passes", which this satisfies.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Convention alignment] Test placement followed existing project convention**
- **Found during:** Task 2 (RED phase)
- **Issue:** Plan suggested creating `test/core/parser.test.ts`; project already has `test/core/parser/parseFile.test.ts` as the established parser-test home.
- **Fix:** Extended the existing file with a new `POLISH-03 D-01 parseFile.declLines` describe block.
- **Files modified:** `test/core/parser/parseFile.test.ts` (instead of new file)
- **Verification:** `pnpm vitest run test/core/parser/parseFile.test.ts` → 13 passed (6 pre-existing + 7 new).
- **Committed in:** `580f0fb`

---

**Total deviations:** 1 auto-fixed (Rule 3 — alignment with existing convention)
**Impact on plan:** No scope creep. New tests live where future contributors expect them.

## Issues Encountered

- **Pre-existing tsc fixture error:** `test/fixtures/phase-05/micro/parse-error/app/page.tsx(3,1): error TS1003` shows up under `pnpm tsc --noEmit`. Verified pre-existing (present on HEAD~3 before this plan touched anything). Out of scope; logged for awareness only.
- **Integration tests require rebuild:** `test/integration/mcp-e2e.test.ts` guards on `dist/cli.js` mtime vs `src/cli.ts`. Ran `pnpm build` once after the parser change to refresh dist and re-ran integration suite — 20/20 passed. No regression from this plan.

## User Setup Required

None.

## Next Phase Readiness

- **Plan 08-03 unblocked:** `resolveModule` can now call `parseFile(ctx, absolutePath)` (free via D-02 cache) and read `parseResult.declLines.get(importedName)` to populate the `line` field on the resolved local-kind `ResolveResult`. Fallback to `line: 1` when `declLines.get(...)` returns `undefined` per D-03.
- **No envelope schema change** — schemaVersion: "1" remains frozen (POLISH-03 was scoped to be schema-stable from the start).
- **No new runtime dep** — uses `@babel/types` (already a transitive peer of `@babel/parser`).

---
*Phase: 08-v1-0-polish*
*Completed: 2026-05-12*

## Self-Check: PASSED

Verified post-write:
- `src/adapters/types.ts` exists and contains `declLines: Map<string, number>` (grep → 1 match)
- `src/core/parser/index.ts` exists and contains `declLines` twice (declaration + result wiring)
- `test/fixtures/parser/parse-errors/decl-lines.tsx` exists
- Commits `9664a47`, `580f0fb`, `f8157a1` present in `git log --oneline -5`
- 13/13 tests pass in `test/core/parser/parseFile.test.ts`
- Full suite: 330 passed / 20 skipped / 0 failed after `pnpm build`
- `pnpm tsc --noEmit`: only pre-existing fixture error (unrelated)
