# Phase 10: Interface Widening & Analyzer De-Next-ification — Specification

**Created:** 2026-05-13
**Ambiguity score:** 0.15 (gate: ≤ 0.20)
**Requirements:** 8 locked

## Goal

An adapter author can implement a new framework without modifying `src/core/Analyzer.ts`, because the five Next.js-specific string literals and logic patterns in Analyzer.ts have been routed through three new `FrameworkAdapter` methods, and `NextJsAdapter` has been migrated to implement those methods while producing byte-identical output.

## Background

`src/core/Analyzer.ts` currently contains five module-scope functions that hard-code Next.js conventions:

1. `isPageFile(absPath)` — matches `page.(tsx|jsx|ts|js)` by filename
2. `isLayoutFile(absPath)` — matches `layout.(tsx|jsx|ts|js)` by filename
3. `isSpecialFile(absPath)` — matches `layout|template|loading|error|not-found|default` by filename
4. `deriveRoutesFromEntries(entries, absRoot)` — applies Next.js routing rules (app/, route groups `(...)`, parallel routes `@…`, private folders `_…`)
5. `collectChildrenSlotLines(ast)` — looks for JSX `{children}` identifier specifically (the Next.js slot pattern); called in `buildTreeForEntry` to inject `kind:"slot"` nodes

Additionally, `buildTreeForEntry` propagates `layoutHint: "client"` based on `def.runtime`, which is adapter-sourced already but the classification of what counts as "client" is still Next.js-centric.

The `attachParallelSlot` helper and `buildRouteTree` call-path are framework-agnostic in their tree-mutation logic; only which entries are slot-type is framework-specific. That entry-type detection is now delegated through `classifyEntry`.

`FrameworkAdapter.ts` currently has a locking test (`test/adapters/FrameworkAdapter.test.ts`) that asserts exactly 5 keys — it will need to be deliberately updated to assert the new method set.

Phase 9 (fixture design) is complete. Phase 11 (adapter detection and selection) depends on Phase 10 being complete.

## Requirements

1. **classifyEntry method added**: `FrameworkAdapter` exposes a new method `classifyEntry(absPath: string): "page" | "layout" | "special" | "other"`.
   - Current: `isPageFile`, `isLayoutFile`, `isSpecialFile` are standalone functions in `Analyzer.ts` with Next.js-hardcoded regex patterns
   - Target: These three functions are removed from `Analyzer.ts`; their logic moves into `NextJsAdapter.classifyEntry()`; `Analyzer.ts` calls `this.adapter.classifyEntry(absPath)` wherever it previously called the standalone functions
   - Acceptance: A grep for `isPageFile\|isLayoutFile\|isSpecialFile` inside `src/core/Analyzer.ts` returns zero matches; `classifyEntry` is declared on the `FrameworkAdapter` interface

2. **enumerateRoutes method added**: `FrameworkAdapter` exposes `enumerateRoutes(absRoot: string): string[] | Promise<string[]>`.
   - Current: `deriveRoutesFromEntries(entries, absRoot)` is a module-scope function in `Analyzer.ts` hard-coding Next.js app directory conventions, route groups, parallel routes, and private folder exclusions
   - Target: `deriveRoutesFromEntries` is removed from `Analyzer.ts`; `buildUnionIR()` calls `this.adapter.enumerateRoutes(this.root)` instead; `NextJsAdapter` encapsulates the full route-derivation logic (including calling `discoverEntries` internally or accepting them as input — design-phase decision)
   - Acceptance: A grep for `deriveRoutesFromEntries` inside `src/core/Analyzer.ts` returns zero matches; `enumerateRoutes` is declared on the `FrameworkAdapter` interface

3. **slotMarker method added**: `FrameworkAdapter` exposes `slotMarker(name: string, importSource: string): boolean`.
   - Current: `collectChildrenSlotLines(ast)` in `Analyzer.ts` hard-codes an AST walk looking specifically for `Identifier("children")` — the Next.js slot pattern
   - Target: The AST walk logic stays in `Analyzer.ts` as a private helper, but instead of hard-coding `expr.name === "children"`, it consults `this.adapter.slotMarker(name, importSource)` for each candidate identifier/JSX element; `NextJsAdapter.slotMarker` returns `true` when `name === "children"` (import source ignored for Next.js, since `{children}` is a React prop — not an imported component)
   - Acceptance: A grep for the literal string `"children"` used as a slot-detection condition inside `src/core/Analyzer.ts` returns zero matches; `slotMarker` is declared on the `FrameworkAdapter` interface; `NextJsAdapter.slotMarker("children", "react")` returns `true`, `NextJsAdapter.slotMarker("Slot", "expo-router")` returns `false`

4. **Locking test deliberately updated**: The `test/adapters/FrameworkAdapter.test.ts` method-count assertion is updated to reflect the new method set.
   - Current: Test asserts `Object.keys(adapter).length === 5` (or equivalent) — 5 methods: `detect`, `discoverEntries`, `resolveModule`, `extractComponents`, `mapRouteToEntry`
   - Target: Test asserts the new 8-method set: the original 5 plus `classifyEntry`, `enumerateRoutes`, `slotMarker`; the comment in the test explaining the locking rationale is updated to reference this SPEC
   - Acceptance: `vitest run test/adapters/FrameworkAdapter.test.ts` passes; the test fails when any of the 8 methods is removed from the interface (i.e., the assertion is specific, not `≥`)

5. **NextJsAdapter implements all 3 new methods**: `NextJsAdapter` is migrated to implement `classifyEntry`, `enumerateRoutes`, and `slotMarker`.
   - Current: `NextJsAdapter` implements 5 methods; Next.js routing logic lives partly in `Analyzer.ts`
   - Target: `NextJsAdapter` implements all 8 methods; the routing and file-classification logic that was in `Analyzer.ts` is moved into the adapter
   - Acceptance: `NextJsAdapter` has no TypeScript compile errors; all interface methods are implemented; no `// TODO` stubs remain

6. **Zero Next.js string literals remaining in Analyzer.ts**: A grep for Next.js-specific strings inside `src/core/Analyzer.ts` returns zero matches.
   - Current: `Analyzer.ts` contains `"page."`, `"layout."`, `"not-found"`, `"children"` (as slot identity), `"_layout"`, route-group regex, parallel-route prefix `@`, private-folder prefix `_`
   - Target: All Next.js-specific strings moved to `NextJsAdapter`; `Analyzer.ts` only contains framework-agnostic orchestration
   - Acceptance: Running `grep -E '_layout|page\.|not-found|"children"' src/core/Analyzer.ts` returns zero matches (the strings may still appear in comments / test files, but not as logic conditions)

7. **Snapshots re-locked, full suite stays green**: All existing vitest snapshot files are re-locked after the refactor; test count stays ≥ 353.
   - Current: Snapshots reflect Next.js output through the existing Analyzer+NextJsAdapter pipeline
   - Target: After migration, running `vitest run` produces identical snapshot content (byte-for-byte for JSON output; structurally equivalent for markdown — same tree glyphs, same file:line); if any snapshot diverges, it is deliberately re-locked (not silently accepted)
   - Acceptance: `vitest run` exits 0 with ≥ 353 passing tests; snapshot update mode (`vitest run --update-snapshots`) produces zero new diverging snapshots

8. **attachParallelSlot stays generic in Analyzer.ts**: The parallel-slot tree-mutation logic is confirmed as framework-agnostic and is not moved to the adapter.
   - Current: `attachParallelSlot(tree, slotName, slotTree, warnings)` in Analyzer.ts performs generic tree surgery (appending slot marker + fragment siblings)
   - Target: `attachParallelSlot` stays in Analyzer.ts unchanged; the framework-specific concern (which entries are parallel-slot entries) is handled by `classifyEntry` returning `"special"` or by adapter-internal logic in `enumerateRoutes`
   - Acceptance: `attachParallelSlot` is still defined in `src/core/Analyzer.ts` after the refactor; it has no framework-specific imports or string literals

## Boundaries

**In scope:**
- `src/adapters/FrameworkAdapter.ts` — add `classifyEntry`, `enumerateRoutes`, `slotMarker` to the interface
- `src/adapters/next/NextJsAdapter.ts` — implement the 3 new methods; move Next.js routing logic from Analyzer.ts into the adapter
- `src/core/Analyzer.ts` — remove 5 Next.js-specific functions; replace with adapter delegation calls
- `test/adapters/FrameworkAdapter.test.ts` — update method-count locking assertion from 5 to 8
- Snapshot re-lock (`vitest run --update-snapshots` if any diverge after delegation)
- Keeping all 353+ existing tests green

**Out of scope:**
- Any `ExpoRouterAdapter` implementation — Phase 12 only; no Expo adapter code lands here
- `slotMarker` for Expo Router (`<Slot/>` from `expo-router`) — the method exists on the interface but Expo's implementation is Phase 12's concern
- Adapter detection / `selectAdapter` — Phase 11
- Tool-handler refactor to use `selectAdapter` — Phase 11
- `enumerateRoutes` for Expo Router — Phase 12
- React Native primitive recognition — Phases 12–13
- Style extraction — Phases 12–13
- `--framework` CLI flag — Phase 11
- Integration tests for Expo fixtures — Phase 15

## Constraints

- The `FrameworkAdapter` interface currently has a comment warning that "Adding a 6th method requires a milestone amendment." That comment must be updated to reflect the new 8-method set and reference this phase.
- All existing v1.0/v1.1 Next.js markdown + JSON snapshots must remain valid after migration; if any diverge, re-lock them deliberately (do not blindly accept all diffs without reviewing)
- `attachParallelSlot` tree-mutation logic stays in `Analyzer.ts` — it must not be moved to the adapter
- `slotMarker` returns a plain `boolean` (not a slot-name string or richer type) — keeping it simple for Phase 10; richer return types can be revisited if Phase 12 needs them
- Island rule (D-11): `src/core/Analyzer.ts` may only import FrameworkAdapter as a `type`-only import (already enforced by Biome); the new delegation calls must not create value-level imports from `src/adapters/`

## Acceptance Criteria

- [ ] `FrameworkAdapter` interface has exactly 8 methods: `detect`, `discoverEntries`, `resolveModule`, `extractComponents`, `mapRouteToEntry`, `classifyEntry`, `enumerateRoutes`, `slotMarker`
- [ ] `test/adapters/FrameworkAdapter.test.ts` passes and asserts the exact 8-method set (fails if any method is removed)
- [ ] `grep -E 'isPageFile|isLayoutFile|isSpecialFile|deriveRoutesFromEntries' src/core/Analyzer.ts` returns zero matches
- [ ] `grep -E '"_layout"|"page\."|"not-found"|"children"' src/core/Analyzer.ts` returns zero matches (as logic conditions — not in comments)
- [ ] `NextJsAdapter` compiles without TypeScript errors and implements all 8 interface methods
- [ ] `vitest run` exits 0 with ≥ 353 passing tests
- [ ] `vitest run --update-snapshots` produces no diverging snapshots (or all divergences are deliberately reviewed and re-locked)
- [ ] `attachParallelSlot` is still defined in `src/core/Analyzer.ts` (not moved to adapter)
- [ ] `NextJsAdapter.slotMarker("children", "react")` returns `true`

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                      |
|--------------------|-------|------|--------|------------------------------------------------------------|
| Goal Clarity       | 0.92  | 0.75 | ✓      | 3 new methods, 5 leak sites, adapter migration — specific  |
| Boundary Clarity   | 0.85  | 0.70 | ✓      | attachParallelSlot confirmed generic; Expo deferred        |
| Constraint Clarity | 0.75  | 0.65 | ✓      | ≥353 green, grep checks, island rule, slotMarker: boolean  |
| Acceptance Criteria| 0.82  | 0.70 | ✓      | 9 pass/fail checkboxes; grep-verifiable                    |
| **Ambiguity**      | 0.15  | ≤0.20| ✓      |                                                            |

## Interview Log

| Round | Perspective  | Question summary                                  | Decision locked                                                                          |
|-------|--------------|---------------------------------------------------|------------------------------------------------------------------------------------------|
| 1     | Researcher   | How does `attachParallelSlot` get de-Next-ified?  | Stays in Analyzer.ts — tree mutation is generic; only entry classification delegates      |
| 1     | Researcher   | What does `slotMarker(name, importSource)` return?| Returns `boolean` — true if identifier is a slot injection point for this framework      |

---

*Phase: 10-interface-widening-analyzer-de-next-ification*
*Spec created: 2026-05-13*
*Next step: /gsd-discuss-phase 10 — implementation decisions (how to restructure Analyzer, enumerateRoutes signature, etc.)*
