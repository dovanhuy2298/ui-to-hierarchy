# Phase 13: RN Style Signal Extraction — Context

**Gathered:** 2026-05-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix EXPO-SLOT-01 snapshot re-lock (code fix already landed in commit `7b80ae0`) and implement four RN style extraction patterns in `ExpoRouterAdapter`: `StyleSheet.create` named-key indexing (in-file + one-hop import), inline `style={{}}` (reusing v1.0 extractor), `style={[...]}` array flattening, and NativeWind `className` extraction with platform-variant stripping. End result: `find_by_style` works on Expo Router projects.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**7 requirements are locked.** See `13-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `13-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- `src/core/Analyzer.ts` — verify and re-lock snapshots after EXPO-SLOT-01 fix (code fix already committed)
- Re-lock `test/adapters/expo/__snapshots__/*.md` after EXPO-SLOT-01 fix
- `src/core/styles/rn/stylesheet-create.ts` — new file; StyleSheet.create AST walker + doc-comment support matrix
- `src/core/styles/rn/style-prop.ts` — new file; inline `style={{}}` (reusing v1.0 extractor) + `className` NativeWind extraction
- `src/core/styles/rn/index.ts` — new file; `flattenStyleArray` export + barrel re-exports
- `ExpoRouterAdapter.ts` — wire `buildComponentDefinition` to call the three new extractors
- `test/fixtures/expo-tabs-and-dynamic/app/(tabs)/index.tsx` — add at least one `className="..."` NativeWind usage on an RN primitive
- Unit tests: `test/core/styles/rn/*.test.ts` — covering all pattern matrix cases
- Vitest snapshot re-lock after EXPO-SLOT-01 fix

**Out of scope (from SPEC.md):**
- Statically computing merged style results — Phase 13 key-union only, not value merge
- Type-aware resolution (TypeScript compiler API) — Babel syntactic analysis only
- `--platform` CLI flag exposure — deferred to Phase 14 (INTEG-05)
- React Navigation (non-Expo Router) style support — v1.3+
- Drawer navigator style extraction — v1.3+
- `FlatList renderItem` style introspection — v1.3+
- `src/init/template.ts` update — Phase 15 scope
- Integration suite expansion (format: json + markdown on Expo fixtures) — Phase 15 scope

</spec_lock>

<decisions>
## Implementation Decisions

### StyleSheet Index Architecture
- **D-01:** StyleSheet index is **adapter-internal** — stored as `Map<absFilePath, Map<varName, string[]>>`. No changes to `ParseResult` or `src/ir/`. This keeps the island rule intact: `src/core/` knows nothing about RN style mechanics.
- **D-02:** `ExpoRouterAdapter.extractComponents` builds the index during its file-parsing pass (calling `stylesheet-create.ts` per file). The per-file sub-map (`Map<varName, string[]>`) is passed as a parameter to `buildComponentDefinition` and to `flattenStyleArray(node, styleIndex)` — matching the function signature implied by the SPEC.

### One-Hop Import Resolution
- **D-03:** `stylesheet-create.ts` is self-contained for parsing — it exports a `parseStyleSheetCreate(ast, source)` function that takes a pre-parsed Babel AST. The **adapter** is responsible for path resolution: it reads the import-binding map (already built via `collectImportBindings`), finds the import's absPath using the existing project resolver, then calls `@babel/parser.parse()` on that file's content and passes the resulting AST to `parseStyleSheetCreate`. `stylesheet-create.ts` never touches the filesystem directly.
- **D-04:** Two-hop imports (re-exporting from another import) degrade to `{ raw }` + envelope warning, not an error. Fallback is safe — `find_by_style` simply won't match for that component.

### EXPO-SLOT-01 Status
- **D-05:** The `case "component"` logic in `injectChildrenSlots` was already fixed in commit `7b80ae0`. Phase 13 Req 1 is primarily: (1) run vitest to confirm the fix works, (2) re-lock both `expo-basic` and `expo-tabs-and-dynamic` snapshot baselines with `vitest -u` or `toMatchFileSnapshot` update, (3) verify `get_full_hierarchy` on `expo-basic` shows nested tree.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Spec
- `.planning/phases/13-rn-style-signal-extraction/13-SPEC.md` — 7 locked requirements, boundaries, 13 acceptance criteria, constraints. MUST read before planning.

### Core Files to Create
- `src/core/styles/rn/stylesheet-create.ts` — `parseStyleSheetCreate(ast, source)` → `Map<varName, string[]>`; doc-comment support matrix (in-file literal + one-hop → supported; computed keys, factory calls, hooks, two-hop → `{ raw }` + warning)
- `src/core/styles/rn/style-prop.ts` — `extractRNInlineStyle(jsxElement, source)` (delegates to v1.0 extractor) + `extractNativeWindClassNames(jsxElement)` (platform-variant strip + tokenize)
- `src/core/styles/rn/index.ts` — `flattenStyleArray(node, fileStyleIndex)` + barrel re-exports

### Core Files to Modify
- `src/adapters/expo/ExpoRouterAdapter.ts` — extend `extractComponents` to build `Map<absPath, Map<varName, string[]>>` style index; extend `buildComponentDefinition` to call all three extractors
- `test/fixtures/expo-tabs-and-dynamic/app/(tabs)/index.tsx` — add `className="ios:p-4 android:p-2 text-lg"` on an RN primitive

### Architecture Rules
- `test/architecture/island.test.ts` — island rule: `src/core/` cannot import `src/adapters/`. `src/core/styles/rn/` is a core utility — MUST contain zero adapter references.
- `src/adapters/FrameworkAdapter.ts` — 8-method interface; no changes needed for Phase 13.

### Existing Utilities to Reuse
- `src/core/extractors/inline-style.ts` — `extractInlineStyle(jsxElement, source)` — MUST be reused (not reimplemented) in `style-prop.ts` per SPEC constraint
- `src/core/import-bindings.ts` — `collectImportBindings(ast)` — use in ExpoRouterAdapter to get import binding map for one-hop resolution
- `src/core/paths.ts` — `toForwardSlash` — apply to all resolved absPath values (Windows path invariant)

### Snapshot Baselines (need re-locking after EXPO-SLOT-01 fix)
- `test/adapters/expo/__snapshots__/expo-basic.md` — currently locked to broken output; must be re-locked to show injected tree
- `test/adapters/expo/__snapshots__/expo-tabs-and-dynamic.md` — same

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/extractors/inline-style.ts` → `extractInlineStyle` — handles `style={{}}` literal + computed fallback to `{ raw }`. Phase 13 delegates to this; no re-implementation.
- `src/core/import-bindings.ts` → `collectImportBindings(ast)` — already extracts import-binding map per file; use in ExpoRouterAdapter to resolve `styles` varName → import specifier → absPath.
- Existing project resolver (used in `NextJsAdapter` for component resolution) — same mechanism to convert relative specifier to absPath for one-hop StyleSheet imports.
- `src/core/paths.ts` → `toForwardSlash` — mandatory for all file paths emitted to tree output.

### Established Patterns
- **Island rule:** `src/core/styles/rn/` → must not import from `src/adapters/`. AST walker functions take `ast` + `source` params; filesystem/resolver responsibility stays in the adapter.
- **No-throw contract:** All unsupported patterns emit `{ raw: <source-text> }` + envelope warning; `{ isError: false }` always returned.
- **`pendingWarnings` pattern:** Queue warnings in adapter pass; flush + clear at start of next phase (Phase 12 established this).
- **`{ raw }` sentinel:** Already used by `extractInlineStyle` for computed values — same convention for unsupported StyleSheet patterns.
- **`warnings` channel:** Push to `ParseContext.warnings[]` — never `console.*`.
- **Forward-slash path invariant:** All `file:line` output uses `toForwardSlash` — new extractor code must not break this.

### Integration Points
- `ExpoRouterAdapter.extractComponents(ctx, entryFiles)` — existing pass over routing files; extend here to build style index by calling `parseStyleSheetCreate` per file
- `ExpoRouterAdapter.buildComponentDefinition(jsxElement, ctx, fileStyleIndex)` — extend to call `extractRNInlineStyle`, `flattenStyleArray`, `extractNativeWindClassNames`
- `src/core/Analyzer.ts` `injectChildrenSlots` — EXPO-SLOT-01 fix already applied; Phase 13 only needs snapshot re-lock + verification

</code_context>

<specifics>
## Specific Ideas

- `flattenStyleArray(node, fileStyleIndex)` signature: `node` is the `JSXExpressionContainer` value (the array expression); `fileStyleIndex` is `Map<varName, string[]>` for the current file — keys resolved from member expressions like `styles.card`, string literals used as-is, conditional `&&`/`||` members included as union (not excluded at runtime).
- NativeWind platform-variant regex locked in SPEC: `/(ios|android|web|native):/g` — strip before whitespace-tokenizing into `classNames[]`.
- `tw\`...\`` tagged template: emit envelope warning "NativeWind tw`` tagged template not supported — use className string"; do NOT attempt to extract tokens from it.
- EXPO-SLOT-01: After re-lock, both snapshot files should show `app/index.tsx` content appearing as children under the `<Slot>` position in `app/_layout.tsx` tree.
- Unit test file organization: one test file per module — `test/core/styles/rn/stylesheet-create.test.ts`, `test/core/styles/rn/style-prop.test.ts`, `test/core/styles/rn/index.test.ts` (for `flattenStyleArray`).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 13-rn-style-signal-extraction*
*Context gathered: 2026-05-19*
