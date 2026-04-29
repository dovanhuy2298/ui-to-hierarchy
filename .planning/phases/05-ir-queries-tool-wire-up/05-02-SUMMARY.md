---
phase: 05-ir-queries-tool-wire-up
plan: 02
subsystem: core
tags: [analyzer, ir-build, slot-substitution, levenshtein, babel, style-sidecar, tdd]

requires:
  - phase: 04-next-js-app-router-adapter
    provides: NextJsAdapter with 5 methods, ComponentDefinition 12-field shape, RouteMatch, runtime detection
  - phase: 03-parser-core-ast-resolution-extractors
    provides: ParseContext, parseFile, walkRenderFlow, RenderNode 7-kind union
  - phase: 01-scaffolding-ir-foundation
    provides: TreeNode 9-kind schema, Envelope 6-field schema, renderers

provides:
  - "Analyzer class at src/core/Analyzer.ts — per-call orchestrator for IR queries"
  - "buildFragmentRoot helper for synthetic fragment envelopes"
  - "getFullHierarchy: route → layout-chain + page tree via slot substitution"
  - "focusOn: union IR scan by component name with scope up/full/down"
  - "findByText: case-insensitive text scan with Levenshtein fuzzy fallback"
  - "findByStyle: className token + style key scan with style sidecar"
  - "src/core/index.ts re-exporting Analyzer and buildFragmentRoot"
  - "Phase-05 kitchen-sink fixture (16 files) covering R1–R7 acceptance criteria"
  - "Phase-05 micro fixtures: parse-error and mutation-test"

affects:
  - "05-03-PLAN (tests for Analyzer)"
  - "05-04-PLAN (MCP tool handlers — consume Analyzer)"
  - "05-05-PLAN (integration tests)"

tech-stack:
  added: []
  patterns:
    - "Per-call Analyzer instance with per-call ParseContext (ARCH-02 pattern)"
    - "RenderNode → TreeNode translation via switch on kind discriminant"
    - "Children-slot injection: AST traversal to recover {children} lost by walker null output"
    - "Inside-out slot substitution: layouts.reverse() → replaceSlot chain"
    - "Style sidecar Map<file:line:tag> keyed by composite identity"
    - "Route derivation from entry file paths (route groups transparent, parallel routes excluded)"
    - "Ancestor chain building for focusOn scope:up/full"

key-files:
  created:
    - src/core/Analyzer.ts
    - src/core/index.ts
    - test/core/analyzer.test.ts
    - test/fixtures/phase-05/kitchen-sink/app/layout.tsx
    - test/fixtures/phase-05/kitchen-sink/app/(group)/layout.tsx
    - test/fixtures/phase-05/kitchen-sink/app/(group)/dashboard/layout.tsx
    - test/fixtures/phase-05/kitchen-sink/app/(group)/dashboard/settings/page.tsx
    - test/fixtures/phase-05/kitchen-sink/app/(group)/dashboard/page.tsx
    - test/fixtures/phase-05/kitchen-sink/app/@modal/login/page.tsx
    - test/fixtures/phase-05/kitchen-sink/app/@modal/page.tsx
    - test/fixtures/phase-05/kitchen-sink/app/login/page.tsx
    - test/fixtures/phase-05/kitchen-sink/app/profile/page.tsx
    - test/fixtures/phase-05/kitchen-sink/app/style-test/page.tsx
    - test/fixtures/phase-05/kitchen-sink/app/server-test/ClientComp.tsx
    - test/fixtures/phase-05/micro/parse-error/app/page.tsx
    - test/fixtures/phase-05/micro/mutation-test/app/page.tsx
  modified: []

key-decisions:
  - "Children-slot injection via AST traversal: the render-flow walker drops {children} Identifier nodes (returns null). Fixed by post-processing the cached AST with @babel/traverse to find JSXExpressionContainer→Identifier('children') positions and injecting kind:'slot' nodes."
  - "Parallel route slot fixtures use /login route (where @modal/login/page.tsx matches the same URL segments) rather than /dashboard."
  - "slot kind in schema has no children field — parallel route content attached as [slot_marker, slotTree] siblings in parent component's children array."
  - "injectChildrenSlots uses sl >= tree.line (not >) to handle same-line {children} patterns."
  - "RouteMatch.entries is a flat string[] — page files identified by filename regex, layout files by layout.tsx pattern."

patterns-established:
  - "Analyzer pattern: per-call constructor creates fresh ParseContext; all state is instance fields; adapter called via interface only (island rule)."
  - "Children slot recovery: after extractComponents(), check astCache for the file's AST, traverse for JSXExpressionContainer→Identifier('children'), inject kind:'slot' nodes into translated TreeNode."
  - "buildFragmentRoot(matches): synthetic kind:'fragment', file:'<synthetic>', line:0 for all multi-match envelopes."

requirements-completed: [TOOL-01, TOOL-02, TOOL-03, TOOL-04, ARCH-02, R1, R2, R3, R4, R5, R6, R7, R8]

duration: 14min
completed: 2026-04-29
---

# Phase 05 Plan 02: Analyzer Class Summary

**Single-file Analyzer orchestrator (~897 LOC) implementing ComponentDefinition+RouteMatch→TreeNode translation with inside-out slot substitution, 4 IR query methods, hand-rolled Levenshtein, and per-element style sidecar — all without static fields or module-scope cache (ARCH-02 clean)**

## Performance

- **Duration:** 14 min
- **Started:** 2026-04-29T10:13:52Z
- **Completed:** 2026-04-29T10:28:30Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 18

## Accomplishments

- Implemented `Analyzer` class at `src/core/Analyzer.ts` (897 LOC) with all 4 query methods
- Fixed critical gap: `{children}` JSXExpression drops to null in render-flow walker — recovered via AST traversal and slot injection
- Built Phase-05 kitchen-sink fixture (16 files) covering all SPEC acceptance criteria R1–R7
- All 212 tests pass (183 pre-existing + 29 new); island architecture test passes; ARCH-02 grep gates pass

## Task Commits

1. **test(05-02): add failing Analyzer unit tests and phase-05 fixtures** — `233e78d`
2. **feat(05-02): implement Analyzer class — IR-build, slot-substitution, 4 query methods** — `39f42e5`

## Files Created/Modified

- `src/core/Analyzer.ts` — Analyzer class + helpers (IR-build, slot-substitution, Levenshtein, style sidecar, query methods)
- `src/core/index.ts` — re-exports Analyzer and buildFragmentRoot
- `test/core/analyzer.test.ts` — 29 unit tests covering all 8 SPEC requirements
- `test/fixtures/phase-05/kitchen-sink/` — 14 fixture files for R1–R7 acceptance
- `test/fixtures/phase-05/micro/parse-error/app/page.tsx` — syntax-error fixture for R8
- `test/fixtures/phase-05/micro/mutation-test/app/page.tsx` — mutation fixture for ARCH-02

## Decisions Made

1. **Children-slot injection via AST traversal** — The `walkRenderFlow` walker silently drops `{children}` JSXExpressionContainer nodes (Identifier returns null). Post-processing with `collectChildrenSlotLines(ast)` (using `@babel/traverse`) collects line numbers of `{children}` usages, then `injectChildrenSlots()` adds `kind:"slot", name:"children"` nodes into the translated TreeNode at those positions. Condition `sl >= tree.line` (not `>`) handles same-line patterns like `<body>{children}</body>`.

2. **Parallel route slot representation** — `TreeNode { kind:"slot" }` has no `children` field (D-10 schema lock). Parallel route content attached as `[slot_marker_node, slotTree]` siblings in the outermost component's children array. The slot marker node `{ kind:"slot", name:"modal" }` identifies the slot; the slotTree is its content sibling.

3. **Fixture parallel route test uses `/login` route** — The `@modal/login/page.tsx` slot populates only when URL segments match (`login` matches `login`). Changed test from `/dashboard` to `/login` route.

4. **Flat RouteMatch.entries** — `RouteMatch.entries` is a flat `string[]` (not split into layouts/page/specials). Page files identified via `isPageFile()` filename regex; layout files via `isLayoutFile()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Children slot injection — {children} disappears in render-flow walker**
- **Found during:** Task 1 (Analyzer implementation + test debugging)
- **Issue:** `walkRenderFlow` returns `null` for JSXExpressionContainer wrapping Identifier("children"). The walker's JSXExpressionContainer handler calls `walk(node.expression, ...)` and Identifier nodes fall through all patterns, returning null. This means `<body>{children}</body>` produces `body` with empty children — no slot anchor exists for substitution.
- **Fix:** Added `collectChildrenSlotLines(ast)` using babel traverse to find `{children}` positions, and `injectChildrenSlots(tree, slotLines, file)` to inject `kind:"slot", name:"children"` nodes after translation. Called in `buildTreeForEntry` after the AST is cached by `extractComponents`.
- **Files modified:** `src/core/Analyzer.ts`
- **Verification:** `SettingsPage` found 3 levels deep in `/dashboard/settings` hierarchy; 29/29 tests pass.
- **Committed in:** `39f42e5`

**2. [Rule 1 - Bug] Parallel slot fixture mismatch**
- **Found during:** Task 1 test debugging
- **Issue:** Test used `/dashboard` route for modal slot test, but `@modal/login/page.tsx` only matches `["login"]` URL segments, not `["dashboard"]`.
- **Fix:** Added `app/login/page.tsx` fixture and changed test to use `/login` route where modal slot entries are populated.
- **Files modified:** `test/core/analyzer.test.ts`, `test/fixtures/phase-05/kitchen-sink/app/login/page.tsx`
- **Verification:** Modal slot found in tree for `/login` route; 29/29 tests pass.
- **Committed in:** `233e78d` (fixture), test commit

---

**Total deviations:** 2 auto-fixed (Rule 1 bugs)
**Impact on plan:** Both fixes necessary for correct slot substitution. No scope creep — implementation follows plan intent exactly.

## Issues Encountered

None beyond the two Rule 1 bug fixes documented above.

## TDD Gate Compliance

- RED gate: `233e78d` — `test(05-02): add failing Analyzer unit tests and phase-05 fixtures` (13 of 29 tests failed)
- GREEN gate: `39f42e5` — `feat(05-02): implement Analyzer class` (all 29 tests pass)
- REFACTOR gate: N/A (no cleanup needed)

## Next Phase Readiness

- `Analyzer` class ready for Plan 03 (integration tests against kitchen-sink fixture)
- `Analyzer` class ready for Plan 04 (MCP tool handler wiring — replace `notImplemented`)
- Style sidecar populated during IR build — `findByStyle` works end-to-end
- All Phase 1–4 tests still pass (212/212)
- ARCH-02 grep gates verified clean

## Self-Check: PASSED

- src/core/Analyzer.ts: FOUND
- src/core/index.ts: FOUND
- test/core/analyzer.test.ts: FOUND
- 05-02-SUMMARY.md: FOUND
- Commit 233e78d (test RED): FOUND
- Commit 39f42e5 (feat GREEN): FOUND
- 212/212 tests pass
- ARCH-02 grep gates clean
- Island architecture test passes

---
*Phase: 05-ir-queries-tool-wire-up*
*Completed: 2026-04-29*
