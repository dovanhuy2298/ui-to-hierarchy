---
phase: 03-parser-core-ast-resolution-extractors
plan: 06
subsystem: parser-core
tags: [nextjs, framework-adapter, ast, babel, mcp, integration]

# Dependency graph
requires:
  - phase: 03-parser-core-ast-resolution-extractors
    provides: |
      Plan 01 (FrameworkAdapter interface, ParseContext, ComponentDefinition R8 shape, RenderNode union, ResolveResult union, island invariant);
      Plan 02 (parseFile primitive with per-call AST cache);
      Plan 03 (resolveModule with tsconfig + relative + node_modules + barrel chase);
      Plan 04 (Tailwind/inline-style/CSS-Modules/styled-components extractors);
      Plan 05 (walkRenderFlow + discoverComponents with HOC unwrap)
provides:
  - NextJsAdapter — the only FrameworkAdapter implementation v1 ships
  - ARCH-01 (FrameworkAdapter contract) closes; 2/5 methods implemented
  - PARSE-04 (component discovery + HOC) wired through to ComponentDefinition.wrappers
  - OUT-02/03/04 (style fields + render flow) populated end-to-end via extractComponents
  - Kitchen-sink E2E test proving all four extractors + render flow + HOC + class extraction work together
affects:
  - phase 04 (Phase 4 NextJsAdapter completion — fills detect, discoverEntries, mapRouteToEntry)
  - phase 05 (Phase 5 Analyzer — calls extractComponents and translates ComponentDefinition[] → IR)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-rolled JSXElement harvester (walkAst): direct recursive traversal over enumerable child fields, avoiding @babel/traverse's File/Program-root requirement when walking arbitrary subtrees"
    - "D-12 boundary: extractComponents NEVER throws — every parse failure becomes a synthetic ComponentDefinition with renderFlow.kind === 'error', preserving file:line"
    - "Forward-slash discipline at the boundary: toForwardSlash applied once per entry file, threaded into every ComponentDefinition.file and RenderNode.file via the walker"
    - "Stub methods raise the exact string 'not implemented in Phase 3' (SPEC R7) — Phase 4 will swap them for real implementations without changing the call sites"

key-files:
  created:
    - "src/adapters/next/NextJsAdapter.ts — Phase 3 deliverable, the only FrameworkAdapter implementation"
    - "test/adapters/next/NextJsAdapter.test.ts — basic contract suite (5-method shape, stub messages, HOC, parse-error tolerance)"
    - "test/adapters/next/NextJsAdapter.kitchen-sink.test.ts — end-to-end SPEC R5 acceptance"
  modified: []

key-decisions:
  - "Hand-rolled walkAst over @babel/traverse for JSX harvesting inside arbitrary subtrees: avoids fragile synthetic-Program wrapping and keeps per-component scope cheap"
  - "Inline 'not implemented in Phase 3' string literals (rather than a single shared constant) — meets SPEC R7 verbatim, makes grep-based acceptance trivial, removes one indirection a Phase-4 author has to chase"
  - "Class components yield empty props[] in v1 — class TS-generic prop signature extraction is deferred to v2 (R8 leaves the shape stable; only the population strategy changes)"
  - "Default-value object-pattern fields (`{ a = 1 }`) are recorded with optional: true — the JS surface treats a default as a missing-allowed prop, matching how downstream agents reason about call sites"

patterns-established:
  - "FrameworkAdapter implementations live under src/adapters/<framework>/ and are the ONLY runtime importers from src/core/. Reverse direction (core/ → adapters/) is blocked by both Biome noRestrictedImports and test/architecture/island.test.ts"
  - "extractComponents is the single composition point for the 5 core primitives; future framework adapters (React Native, Vue, Svelte) follow the same shape: parseFile + discoverComponents + walkRenderFlow + collectStyleSignals + assemble ComponentDefinition[]"
  - "Per-call ParseContext is the only shared state; astCache and resolverCache live for one extractComponents() call, then are discarded (ARCH-02 — no cross-call cache in v1)"

requirements-completed: [PARSE-04, OUT-02, OUT-03, OUT-04, ARCH-01]

# Metrics
duration: ~12min
completed: 2026-04-29
---

# Phase 03 Plan 06: NextJsAdapter Integration Summary

**NextJsAdapter wires parseFile + resolveModule + walkRenderFlow + discoverComponents + collectStyleSignals into the only `FrameworkAdapter` implementation v1 ships — closing ARCH-01 with 2/5 methods real, 3/5 stubbed for Phase 4.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-29T12:48:00Z
- **Completed:** 2026-04-29T12:56:00Z
- **Tasks:** 3
- **Files created:** 3

## Accomplishments

- `NextJsAdapter.extractComponents` produces a fully-populated `ComponentDefinition[]` (R8 11 fields) for every component in every entry file, composing all five core primitives.
- `NextJsAdapter.resolveModule` delegates to the core resolver, exposing the four-tier resolution chain (tsconfig paths → relative → node_modules → barrel chase) through the FrameworkAdapter boundary.
- Stub methods (`detect`, `discoverEntries`, `mapRouteToEntry`) raise the exact `Error("not implemented in Phase 3")` per SPEC R7 — call-site contract for Phase 4.
- Kitchen-sink end-to-end test proves all four style extractors + render flow + `fullClasses` toggle work together on a single fixture (SPEC R5 acceptance mechanically verified).
- D-12 honored: `extractComponents` never throws — parse failures become synthetic components with `renderFlow.kind === "error"`, preserving file:line.
- Forward-slash discipline preserved end-to-end: every `ComponentDefinition.file` and `RenderNode.file` value contains no backslashes regardless of OS.
- 18 Phase 3 test files / 58 tests green; architecture island test still passes.

## Task Commits

1. **Task 1: NextJsAdapter implementation** — `c72218a` (feat)
2. **Task 2: Basic NextJsAdapter contract test** — `92829b9` (test)
3. **Task 3: Kitchen-sink end-to-end test** — `43fc433` (test)

## Files Created/Modified

- `src/adapters/next/NextJsAdapter.ts` — FrameworkAdapter implementation: `resolveModule` delegate, `extractComponents` orchestration, three Phase-4 stubs, hand-rolled `walkAst` JSX harvester, D-06/D-07 destructure-aware prop extractor, render-tree text harvester.
- `test/adapters/next/NextJsAdapter.test.ts` — 5 tests: 5-method shape, stub messages, simple extraction with R8 12-key shape assertion + forward-slash check, HOC wrapper preservation (memo), D-12 not-throws on parse-error file.
- `test/adapters/next/NextJsAdapter.kitchen-sink.test.ts` — 2 tests: all-four-extractors + render flow on `kitchen-sink.tsx`, fullClasses toggle flips Tailwind output between layout-only and full set.

## Decisions Made

- **Hand-rolled `walkAst` over `@babel/traverse`** for collecting `JSXElement[]` from a component body. `@babel/traverse` requires a `File`/`Program` root, and wrapping arbitrary subtrees in a synthetic `Program` only works for `Expression` nodes (e.g. `ClassMethod` and `FunctionDeclaration` need a different shape). A direct recursive walker over enumerable child fields covers every AST shape uniformly with ~30 LOC.
- **Inline `"not implemented in Phase 3"` literals** in each stub instead of a single shared constant. The plan's acceptance grep counts the literal; inlining makes the SPEC R7 contract trivially auditable and removes one indirection that a Phase-4 author would otherwise have to chase before deleting.
- **Class components yield `props: []`** in v1 — class TS-generic prop signature extraction is deferred to v2. The R8 shape is stable; only the population strategy will change. Test asserts the 12-key Object.keys shape, so this choice cannot drift.
- **`{ a = 1 }: Props` records `optional: true`** for `a` — defaulted destructure fields are call-site-optional from the JS surface's perspective, matching how downstream MCP consumers reason about prop requirements.

## Deviations from Plan

None — plan executed exactly as written.

The plan's sample code included a `t.file(t.program([...]))` synthetic-File construction inside `collectJsxElements`; the plan also explicitly noted that this only works for Expression nodes and pointed to `walkAst` as the simpler alternative. The implementation uses `walkAst` only and drops the synthetic-File construction entirely (the plan's "Notes" section explicitly endorses this).

## Issues Encountered

- **Worktree base mismatch on startup:** The worktree was created from an older HEAD (`7afc495` — Phase 2 head) but the plan's expected base is `1e55abe` (Phase 3 Wave 2 merge). Resolved by `git reset --hard 1e55abe...` per the `<worktree_branch_check>` step. After reset, all Wave 1+2 source files (`src/adapters/types.ts`, `src/adapters/FrameworkAdapter.ts`, `src/core/parser/`, `src/core/resolver/`, `src/core/render-flow/`, `src/core/extractors/`) were present and the implementation proceeded normally.
- **Pre-existing CRLF lint warnings in Wave 1+2 files:** `npx biome check .` reports format errors on `src/adapters/types.ts`, `src/adapters/FrameworkAdapter.ts`, `src/cli.ts`, every Wave-1/2 `src/core/**/*.ts` file (line-ending CRLF vs LF). All of these existed BEFORE this plan's first commit (verified via `git log` on each file). Out-of-scope per the executor's scope-boundary rule; logged here for visibility. New file `src/adapters/next/NextJsAdapter.ts` is fully Biome-clean.
- **Pre-existing MCP smoke test failure:** `test/mcp/smoke.spawn.test.ts` (Phase 2 Plan 5) fails because it spawns `dist/cli.js` and that artifact is not built in the worktree. Pre-existing, unrelated to Phase 3. The 18 Phase 3 test files (58 tests) all pass.

## Threat Flags

None — no new security-relevant surface introduced. T-3-01 (DoS via uncaught error) is mitigated as planned: the basic suite asserts `extractComponents` does not throw on the syntax-error fixture. T-3-02 (path containment) is accepted per plan; Phase 6 hardening will add the guard.

## Next Phase Readiness

- **Phase 4 prereqs:** Phase 4 NextJsAdapter completion can swap each `throw new Error("not implemented in Phase 3")` for real implementations (`detect`, `discoverEntries`, `mapRouteToEntry`) — call sites already exist via the `FrameworkAdapter` interface.
- **Phase 5 prereqs:** Phase 5 Analyzer can `import { NextJsAdapter } from "./adapters/next/NextJsAdapter.js"` and call `extractComponents(ctx, entryFiles)` to obtain a `ComponentDefinition[]`; the IR translator (`toIR`) consumes this directly.
- **No blockers.** Phase 3 deliverable is complete; all 12 acceptance bullets in `03-SPEC.md` are now mechanically verifiable via vitest.

## Self-Check: PASSED

Verified files exist and commits exist:
- FOUND: src/adapters/next/NextJsAdapter.ts
- FOUND: test/adapters/next/NextJsAdapter.test.ts
- FOUND: test/adapters/next/NextJsAdapter.kitchen-sink.test.ts
- FOUND: c72218a (Task 1)
- FOUND: 92829b9 (Task 2)
- FOUND: 43fc433 (Task 3)

---
*Phase: 03-parser-core-ast-resolution-extractors*
*Plan: 06*
*Completed: 2026-04-29*
