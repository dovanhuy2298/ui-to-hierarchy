---
phase: 03-parser-core-ast-resolution-extractors
plan: 01
subsystem: parser
tags: [adapter, types, framework-adapter, render-node, component-definition, arch-01, island, vitest]

# Dependency graph
requires:
  - phase: 01-scaffolding-ir-foundation
    provides: src/ir/schema.ts (TreeNode shape mirrored), src/core/paths.ts (toForwardSlash), biome.json (D-11 layer 1 noRestrictedImports already in place)
  - phase: 02-mcp-transport-shell
    provides: tools/index.ts surface-contract pattern for FrameworkAdapter shape
provides:
  - "src/adapters/types.ts — 10 parser-level type exports (RenderNode 7-kind union, ComponentDefinition 12-field shape, JsxAttribute, PropSignature, ClassToken, CssModuleRef, StyledTemplate, ResolveResult, ParseResult, ParseContext)"
  - "src/adapters/FrameworkAdapter.ts — locked 5-method interface (detect, discoverEntries, resolveModule, extractComponents, mapRouteToEntry)"
  - "test/architecture/island.test.ts — D-11 layer 2 enforcement (ARCH-01)"
  - "test/adapters/FrameworkAdapter.test.ts — 5-method structural assertion"
  - "test/adapters/types.test.ts — ComponentDefinition 12-field structural assertion"
  - "test/fixtures/parser/.gitkeep — fixtures root prepared for Wave 2 plans"
affects: [03-02-resolver, 03-03-parser-core, 03-04-extractors, 03-05-render-flow, 03-06-next-adapter, phase-04, phase-05]

# Tech tracking
tech-stack:
  added: []  # all dependencies (get-tsconfig, @babel/types, tinyglobby, vitest) already in package.json
  patterns:
    - "Pure TypeScript types only — no zod at parser boundary (D-04)"
    - "Discriminated unions with file:line on every variant (mirrors src/ir/schema.ts discipline)"
    - "JSDoc decision-ID rationale on every top-level type (D-04, D-05, D-06, D-09, D-10, D-12, D-13, R8)"
    - "Architecture test as fixture-free codebase scan (ARCH-01 layer 2)"

key-files:
  created:
    - src/adapters/types.ts
    - src/adapters/FrameworkAdapter.ts
    - test/architecture/island.test.ts
    - test/adapters/FrameworkAdapter.test.ts
    - test/adapters/types.test.ts
    - test/fixtures/parser/.gitkeep
  modified: []

key-decisions:
  - "ComponentDefinition is 12 fields, not 11 (plan said 11 but SPEC R8 + the plan's own field literal both enumerate 12). Test asserts toHaveLength(12)."
  - "TsConfigResult (capital C) is the actual export name from get-tsconfig — plan and CONTEXT.md used the lowercase TsconfigResult."

patterns-established:
  - "Adapter types live in src/adapters/types.ts, never in src/core/types.ts (keeps the island boundary clean)"
  - "FrameworkAdapter interface kept in its own file (src/adapters/FrameworkAdapter.ts) — single contract artifact for downstream agents to import"
  - "Architecture test pattern: tinyglobby walk + readFile + regex, single-shot violation collection so a single failure reports every offender"

requirements-completed: [ARCH-01]

# Metrics
duration: ~12min
completed: 2026-04-29
---

# Phase 3 Plan 1: Adapter Type Contracts + Island Boundary Summary

**Locked the parser-level type surface (10 exports) and FrameworkAdapter 5-method interface, with two-layer ARCH-01 enforcement (Biome lint + vitest island scan) so Wave 2/3 plans can build against stable contracts.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-29T05:22:30Z (worktree base reset)
- **Completed:** 2026-04-29T05:34:51Z
- **Tasks:** 3
- **Files created:** 6
- **Files modified:** 0

## Accomplishments

- Parser-level types lock — RenderNode 7-kind union (jsx, branch, list, text, fragment, spread, error), ComponentDefinition 12-field shape (R8), supporting types (JsxAttribute, PropSignature, ClassToken, CssModuleRef, StyledTemplate), discriminated ResolveResult union (D-12) and ParseResult / ParseContext envelope (D-01/D-02/D-03). 10 named exports total, all decision-ID-anchored in JSDoc.
- FrameworkAdapter 5-method contract locked in `src/adapters/FrameworkAdapter.ts` — Phase 3 implements 2/5 (resolveModule, extractComponents) in later plans; Phase 4 fills the routing trio.
- ARCH-01 layer-2 enforcement live: `test/architecture/island.test.ts` scans every TS file under `src/core`, `src/ir`, `src/renderers` and fails if any imports — static or dynamic — point into `src/adapters`.
- Two structural tests guard the locked surfaces: a `keyof FrameworkAdapter` exhaustive Record (5 keys) and a `Object.keys(ComponentDefinition literal)` length-12 check. Adding a 6th adapter method or a 13th component field fails the build.
- Fixtures root `test/fixtures/parser/.gitkeep` placed so Wave 2 plans can populate per-feature subfolders (D-14 / D-15) without touching the tree shape.

## Task Commits

1. **Task 1: src/adapters/types.ts — parser-level type contracts** — `ba1ee6a` (feat)
2. **Task 2: src/adapters/FrameworkAdapter.ts — locked 5-method interface** — `bb53e04` (feat)
3. **Task 3: architecture island test + structural tests + fixtures root** — `a3dd3c4` (test)

## Files Created/Modified

- `src/adapters/types.ts` — 10 parser-level type exports with decision-ID JSDoc; no imports from src/ir/, src/core/, or src/renderers/.
- `src/adapters/FrameworkAdapter.ts` — interface-only file with 5 method declarations and `import type { ... } from "./types.js"`.
- `test/architecture/island.test.ts` — tinyglobby + readFile scan of three island roots, single-shot violation collection, asserts `violations.length === 0` via `expect(violations).toEqual([])`.
- `test/adapters/FrameworkAdapter.test.ts` — `Record<keyof FrameworkAdapter, true>` exhaustive coverage stub + sorted-keys assertion.
- `test/adapters/types.test.ts` — minimal `ComponentDefinition` literal + sorted-keys assertion + length-12 check.
- `test/fixtures/parser/.gitkeep` — empty placeholder so Wave 2 plans can populate per-feature subfolders.

## Decisions Made

- **ComponentDefinition has 12 fields, not 11** — the plan's prose said 11 but its own field literal and SPEC R8's enumeration both list 12 (name, file, line, kind, wrappers, props, textContent, renderFlow, classNames, inlineStyles, cssModuleRefs, styledTemplates). Test asserts 12; types.ts JSDoc updated to match. Treated as a Rule 1 fix — the spec's actual surface, not the plan's miscount, is the load-bearing contract for Wave 2/3.
- **`TsConfigResult` is the correct import name from `get-tsconfig`** — the plan and CONTEXT.md used `TsconfigResult` (lowercase `c`); the package exports `TsConfigResult`. Fixed during Task 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Plan-data bug] ComponentDefinition field count corrected from 11 → 12**
- **Found during:** Task 3 (running `vitest` on the new structural test)
- **Issue:** Plan literal listed 12 fields and SPEC R8 enumerates 12, but the plan's prose, JSDoc cue, and the proposed `toHaveLength(11)` assertion all said 11. Test failed: `expected [Array(12)] to have a length of 11 but got 12`.
- **Fix:** Updated `test/adapters/types.test.ts` to assert length 12 with explanatory JSDoc. Updated `src/adapters/types.ts` JSDoc on `ComponentDefinition` from "Object.keys(...) === 11" → "=== 12 to catch accidental additions/removals".
- **Files modified:** test/adapters/types.test.ts, src/adapters/types.ts
- **Verification:** All 3 new vitest tests pass (`vitest run test/architecture/ test/adapters/`). `npx tsc --noEmit` exits 0.
- **Committed in:** a3dd3c4 (Task 3 commit, bundled with the type-test creation)

**2. [Rule 1 — Plan-data bug] `get-tsconfig` exports `TsConfigResult` (capital C), not `TsconfigResult`**
- **Found during:** Task 1 (typecheck after writing types.ts)
- **Issue:** Plan source code block imported `import type { TsconfigResult } from "get-tsconfig"`. tsc errored: `'"get-tsconfig"' has no exported member named 'TsconfigResult'. Did you mean 'TsConfigResult'?`
- **Fix:** Renamed the import and the field type to `TsConfigResult` (capital C) — the actual export name.
- **Files modified:** src/adapters/types.ts
- **Verification:** `npx tsc --noEmit` exits 0.
- **Committed in:** ba1ee6a (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — plan/spec bookkeeping bugs caught by typecheck/test). No architectural changes, no scope creep.
**Impact on plan:** Both fixes are mechanical corrections to the plan's data, not departures from intent. The locked surface still matches SPEC R8 (12 fields) and ARCH-01 (5 methods).

## Issues Encountered

- One pre-existing test failure outside this plan's scope: `test/mcp/smoke.spawn.test.ts` requires `dist/cli.js` (built via `npm run build`). Failure is a build-state artifact unrelated to anything Plan 03-01 touches — left untouched per the deferred-items / scope-boundary rule. The 3 new tests added by this plan all pass.
- Worktree branch was ahead of the expected base (`f687c4a`) by phase-02 commits; followed the worktree-branch-check protocol and `git reset --hard` to the expected base before starting Task 1.

## Next Phase Readiness

- Wave 2 plans (03-02 resolver, 03-03 parser core, 03-04 extractors, 03-05 render-flow) can now `import type { ComponentDefinition, RenderNode, ParseContext, ResolveResult, ParseResult } from "../../adapters/types.js"` without further additions.
- 03-06 NextJsAdapter has the locked 5-method shape to implement against and the layer-2 island test that will fail loudly if any non-adapter file accidentally reaches into `src/adapters/`.
- No blockers.

## Self-Check: PASSED

**Files exist (6/6):**
- src/adapters/types.ts: FOUND
- src/adapters/FrameworkAdapter.ts: FOUND
- test/architecture/island.test.ts: FOUND
- test/adapters/FrameworkAdapter.test.ts: FOUND
- test/adapters/types.test.ts: FOUND
- test/fixtures/parser/.gitkeep: FOUND

**Commits exist (3/3):**
- ba1ee6a: FOUND (feat — types.ts)
- bb53e04: FOUND (feat — FrameworkAdapter.ts)
- a3dd3c4: FOUND (test — 3 tests + fixtures placeholder + types.ts JSDoc fix)

**Verification commands re-run:**
- `npx tsc --noEmit` → exits 0
- `npx vitest run test/architecture/island.test.ts test/adapters/FrameworkAdapter.test.ts test/adapters/types.test.ts` → 3/3 pass
- `npx biome check src/adapters/` → 0 violations

---
*Phase: 03-parser-core-ast-resolution-extractors*
*Plan: 01*
*Completed: 2026-04-29*
