# Phase 13: RN Style Signal Extraction — Specification

**Created:** 2026-05-19
**Ambiguity score:** 0.148 (gate: ≤ 0.20)
**Requirements:** 7 locked

## Goal

Calling `find_by_style(key)` on an Expo Router project surfaces matches whether the style was declared via `StyleSheet.create`, inline `style={{}}`, a merged `style={[...]}` array, or a NativeWind `className` — and `<Slot />` injection is fixed so the full layout tree is visible before style search runs.

## Background

Phase 12 completed ExpoRouterAdapter routing and RN primitive classification, but two gaps remain:

1. **EXPO-SLOT-01** (blocker): `injectChildrenSlots` in `src/core/Analyzer.ts` only handles `kind:"element"` nodes for slot injection. Expo's `<Slot />` renders as `kind:"component"` (uppercase tag), so the slot replacement never fires — the page tree is never substituted into the layout chain. Both `expo-basic` and `expo-tabs-and-dynamic` snapshot baselines are locked against broken output. This must be fixed first.

2. **Style extraction gap**: `ExpoRouterAdapter.buildComponentDefinition` returns `classNames: []`, `inlineStyles: {}`, `cssModuleRefs: []` — empty, hardcoded. Four RN-specific style patterns are unsupported: `StyleSheet.create` named lookup, style array merging, NativeWind `className`, and graceful degradation for unsupported shapes.

The v1.0 inline-style extractor (`src/core/extractors/inline-style.ts`) already handles `style={{ key: value }}` literals and returns `{ raw }` for computed values — it should be reused for RN parity.

The existing fixtures have `StyleSheet.create` and style arrays but no NativeWind `className` usage. Phase 13 adds `className` to `expo-tabs-and-dynamic`.

## Requirements

1. **EXPO-SLOT-01 fix**: `injectChildrenSlots` correctly replaces `kind:"component"` slot markers.
   - Current: `case "component"` in `injectChildrenSlots` (`src/core/Analyzer.ts` ~line 507) recurses on children without checking if the node's line matches a registered slot line; `<Slot />` is never converted to `kind:"slot"`; page subtrees are never injected
   - Target: When a `kind:"component"` node's line matches a slot line registered by `collectChildrenSlotLines`, the function returns `{ kind: "slot", name: "children", file, line }` — enabling `replaceSlot` to substitute the page tree at that position
   - Acceptance: `get_full_hierarchy` on `expo-basic` returns a tree where `app/index.tsx` content appears nested under `app/_layout.tsx`; both snapshot baselines are re-locked to show the correct injected tree; vitest suite stays green

2. **StyleSheet.create indexing** (RN-04): `StyleSheet.create` calls are parsed and their named keys indexed.
   - Current: No `src/core/styles/rn/` directory exists; `ExpoRouterAdapter` returns empty `inlineStyles: {}`
   - Target: `core/styles/rn/stylesheet-create.ts` exports a function that walks a Babel AST, finds `StyleSheet.create({...})` call expressions, and returns a map of `{ varName: string, keys: string[] }` for literal object arguments; a doc-comment support matrix in that file lists: supported (in-file literal object, one-hop imported literal object), unsupported (computed keys, factory functions, hook-returned styles, two-hop imports → all degrade to `{ raw }` + warning)
   - Acceptance: Calling `find_by_style("card")` on `expo-basic` (which has `StyleSheet.create({ container: {...} })` via `styles.container`) returns the matching `<View>` node with `file:line`; calling `find_by_style("card")` on `expo-tabs-and-dynamic` (which has `StyleSheet.create({ card: {...}, bold: {...} })`) returns the `<View style={[styles.card, ...]}>` node

3. **One-hop import resolution for StyleSheet** (RN-04): `style={styles.card}` where `styles` is imported from another file in the same project is resolved to the literal key.
   - Current: No cross-file StyleSheet lookup exists
   - Target: If `import styles from "./styles"` and `styles.ts` exports `StyleSheet.create({ card: {...} })`, the key `card` is found; two-hop (import re-exports another import) falls back to `{ raw }` + warning
   - Acceptance: A unit test with two in-memory files (one importing StyleSheet from the other) confirms key lookup; the support matrix doc-comment explicitly states "one-hop only"

4. **Inline style on RN primitives** (RN-05): `style={{ padding: 8 }}` on RN elements is extracted.
   - Current: `ExpoRouterAdapter.buildComponentDefinition` sets `inlineStyles: {}` unconditionally
   - Target: `core/styles/rn/style-prop.ts` reuses `src/core/extractors/inline-style.ts` (the v1.0 web extractor — no reimplementation); `ExpoRouterAdapter` calls it for any JSX element where `isRNPrimitive` is true and a `style` prop exists; result populates `inlineStyles` in the `ComponentDefinition`
   - Acceptance: `find_by_style("fontWeight")` on `expo-tabs-and-dynamic` (which has `<Text style={{ fontWeight: "bold" }}>`) returns the matching `<Text>` node; existing v1.0 inline-style tests still pass unchanged

5. **Style array flattening** (RN-06): `style={[styles.a, styles.b, dynamic && styles.c]}` contributes all member keys to `find_by_style` recall.
   - Current: No `flattenStyleArray` utility exists; style arrays on RN primitives are ignored
   - Target: `core/styles/rn/index.ts` exports `flattenStyleArray(node, styleIndex)` that walks a `JSXExpressionContainer` containing an `ArrayExpression`; each element is resolved (StyleSheet key lookup, inline literal, or conditional `&&`/`||` expression); all resolved keys are unioned into the component's style index; conditional members (runtime-unknown) are included as-is — `find_by_style("c")` hits even though `dynamic && styles.c` is not always true
   - Acceptance: ≥ 8 unit test cases covering: plain member (`styles.a`), two members, conditional `&&`, conditional `||`, nested array (warn + skip), `null` member (skip), string literal member (emit as key), non-literal member (`fn()` → `{ raw }` + warning); `find_by_style("bold")` on `expo-tabs-and-dynamic` returns the `<View style={[styles.card, active && styles.bold]}>` node

6. **NativeWind className extraction** (RN-07): `className="ios:p-4 android:p-2 text-lg"` on RN primitives extracts stripped tokens.
   - Current: No NativeWind extraction exists; `classNames: []` hardcoded in ExpoRouterAdapter; no NativeWind usage in current fixtures
   - Target: `core/styles/rn/style-prop.ts` detects `className` prop on RN primitives; strips platform prefix variants via regex `/(ios|android|web|native):/g` before tokenizing on whitespace; cleaned tokens populate `classNames` array in `ComponentDefinition`; `tw\`...\`` tagged template literal emits an explicit envelope warning ("NativeWind tw`` tagged template not supported — use className string") and is NOT silently dropped; `expo-tabs-and-dynamic` fixture is updated to add at least one `className="..."` usage on an RN primitive
   - Acceptance: `find_by_style("p-4")` on the updated `expo-tabs-and-dynamic` fixture returns the node that has `className="ios:p-4 android:p-2 text-lg"` (with `p-4` accessible after stripping `ios:`); a unit test confirms `tw\`text-lg\`` emits a warning and `find_by_style("text-lg")` does NOT return a match for that component

7. **Unsupported StyleSheet patterns degrade gracefully** (RN-08): Computed keys, factory calls, hook-returned styles, two-hop imports emit `{ raw }` + warning.
   - Current: Any unsupported pattern would either throw or silently return nothing
   - Target: `stylesheet-create.ts` catches all non-literal-object `StyleSheet.create` arguments (computed property keys, function call results, `useStyles()` return values); for each, emits `{ raw: <source-text-of-argument> }` as a sentinel value on that style reference, and adds an envelope warning naming the pattern and file:line; the MCP tool returns `{ isError: false }` with the warning in the envelope — no throw, no silent failure
   - Acceptance: A fixture or unit test where `StyleSheet.create(getStyles())` is called causes `find_by_style` to return an empty match set for that file AND the response envelope contains a warning string mentioning "unsupported StyleSheet.create pattern"; vitest suite green

## Boundaries

**In scope:**
- `src/core/Analyzer.ts` — fix `injectChildrenSlots` `case "component"` slot matching (EXPO-SLOT-01)
- Re-lock `test/adapters/expo/__snapshots__/*.md` after EXPO-SLOT-01 fix
- `src/core/styles/rn/stylesheet-create.ts` — new file; StyleSheet.create AST walker + doc-comment support matrix
- `src/core/styles/rn/style-prop.ts` — new file; inline `style={{}}` (reusing v1.0 extractor) + `className` NativeWind extraction
- `src/core/styles/rn/index.ts` — new file; `flattenStyleArray` export + barrel re-exports
- `ExpoRouterAdapter.ts` — wire `buildComponentDefinition` to call the three new extractors
- `test/fixtures/expo-tabs-and-dynamic/app/(tabs)/index.tsx` — add at least one `className="..."` NativeWind usage on an RN primitive
- Unit tests: `test/core/styles/rn/*.test.ts` — covering all pattern matrix cases
- Vitest snapshot re-lock after EXPO-SLOT-01 fix

**Out of scope:**
- Statically computing merged style results (e.g., resolving `[styles.a, styles.b]` into a flat combined object) — Phase 13 works on key-union only, not value merge
- Type-aware resolution (e.g., using TypeScript compiler API to follow type aliases) — Babel syntactic analysis only
- `--platform` CLI flag — mechanism deferred to Phase 14 (INTEG-05), no flag exposure in Phase 13
- React Navigation (non-Expo Router) style support — v1.3+ scope
- Drawer navigator style extraction — v1.3+ scope
- `FlatList renderItem` style introspection — v1.3+ scope
- `src/init/template.ts` update — Phase 15 scope
- Integration suite expansion (format: json + markdown on Expo fixtures) — Phase 15 scope

## Constraints

- **EXPO-SLOT-01 must be fixed before style extraction is wired**: Snapshot re-locking depends on correct tree output. The style extraction modules can be authored in parallel, but integration into ExpoRouterAdapter and final snapshot lock happen after the bug fix.
- **v1.0 inline-style extractor must be reused, not reimplemented**: `src/core/extractors/inline-style.ts` is the canonical implementation; `style-prop.ts` imports and delegates to it.
- **StyleSheet.create support: in-file literal + one-hop import only**: Everything beyond one hop degrades to `{ raw }` + warning. This is a deliberate v1.2 scope decision (documented in the support matrix doc-comment).
- **`flattenStyleArray` must cover ≥ 8 shape cases**: Conditional `&&`, conditional `||`, null member, string literal, non-literal (`fn()`) — all must be tested to prevent silent miss.
- **NativeWind platform variant regex is exhaustive for v1.2**: `/(ios|android|web|native):/g` — no additional prefixes added without a new requirement.
- **Windows path invariant**: No backslashes in file:line output — existing resolver invariant, must not be broken by new extractor code.
- **Full vitest suite stays green**: Baseline is 494 tests (post Phase 12); Phase 13 must add tests and not regress any existing case.

## Acceptance Criteria

- [ ] `get_full_hierarchy` on `expo-basic` shows `app/index.tsx` content nested under `app/_layout.tsx` (EXPO-SLOT-01 fixed)
- [ ] Both `expo-basic` and `expo-tabs-and-dynamic` snapshot baselines are re-locked to correct injected tree output
- [ ] `find_by_style("container")` on `expo-basic` returns the `<View style={styles.container}>` node with correct `file:line`
- [ ] `find_by_style("card")` on `expo-tabs-and-dynamic` returns the `<View style={[styles.card, ...]}>` node
- [ ] `find_by_style("fontWeight")` on `expo-tabs-and-dynamic` returns the `<Text style={{ fontWeight: "bold" }}>` node
- [ ] `find_by_style("bold")` on `expo-tabs-and-dynamic` returns the `<View style={[styles.card, active && styles.bold]}>` node (conditional member included)
- [ ] `find_by_style("p-4")` on `expo-tabs-and-dynamic` returns the node with `className="ios:p-4 ..."` (after platform strip)
- [ ] `tw\`text-lg\`` tagged template emits an envelope warning; `find_by_style("text-lg")` does NOT match that component
- [ ] Unsupported `StyleSheet.create` pattern returns empty match + envelope warning, no throw
- [ ] `core/styles/rn/stylesheet-create.ts` has a doc-comment support matrix listing supported and unsupported patterns
- [ ] ≥ 8 unit test cases for `flattenStyleArray` covering the full shape matrix
- [ ] Full vitest suite passes with total case count ≥ 494 (Phase 12 baseline)
- [ ] No backslashes in file:line output from Expo fixture queries

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                |
|--------------------|-------|------|--------|------------------------------------------------------|
| Goal Clarity       | 0.85  | 0.75 | ✓      | 5 ROADMAP success criteria + EXPO-SLOT-01 clarified  |
| Boundary Clarity   | 0.88  | 0.70 | ✓      | EXPO-SLOT-01 in scope; fixture addition confirmed    |
| Constraint Clarity | 0.82  | 0.65 | ✓      | v1.0 reuse, one-hop only, ≥8 tests, regex specified  |
| Acceptance Criteria| 0.85  | 0.70 | ✓      | 13 pass/fail checkboxes, all tool-query verifiable   |
| **Ambiguity**      | 0.148 | ≤0.20| ✓      |                                                      |

## Interview Log

| Round | Perspective | Question summary                                    | Decision locked                                                    |
|-------|-------------|----------------------------------------------------|--------------------------------------------------------------------|
| 1     | Researcher  | Is EXPO-SLOT-01 fix in Phase 13 scope?             | Yes — Phase 13 fixes EXPO-SLOT-01 first, then does style extraction |
| 1     | Researcher  | Does NativeWind need fixture coverage or unit test? | Fixture — add className to expo-tabs-and-dynamic                  |

---

*Phase: 13-rn-style-signal-extraction*
*Spec created: 2026-05-19*
*Next step: /gsd:discuss-phase 13 — implementation decisions (how to build what's specified above)*
