# Phase 12: ExpoRouterAdapter Routing & RN Primitives — Context

**Gathered:** 2026-05-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace every stub in `ExpoRouterAdapter` with real implementations: route discovery from `app/` (or `src/app/`), layout chain via `<Slot/>`, dynamic/group/index segment parsing, `<Tabs>`/`<Stack>` navigation enumeration, RN primitive classification by import source, and `<Text>` literal content extraction. The Analyzer machinery is already wired — Phase 12 fills the adapter so MCP tools return real trees for Expo Router projects.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**11 requirements are locked.** See `12-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `12-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- `src/adapters/expo/ExpoRouterAdapter.ts` — replace stub with real implementations of `discoverEntries`, `classifyEntry`, `enumerateRoutes`, `extractComponents`, `mapRouteToEntry`
- `src/adapters/expo/discover.ts` — root detection (`app/` vs `src/app/`), file globbing, warning when both exist
- `src/adapters/expo/segments.ts` — segment parser: static, dynamic, catch-all, optional-catch-all, group, index, special (`+not-found`)
- `src/adapters/expo/route-map.ts` — build URL route strings from file paths using segment parser; group transparency; index collapsing
- `src/adapters/expo/rn-primitives.ts` — allowlist definition + import-source classification helper + namespace import warning
- `<Slot/>`, `<Tabs>`, `<Stack>` JSX walker inside ExpoRouterAdapter's component extraction
- `slotMarker()` already correct — stays as-is
- Unit tests for `segments.ts` (including `[[...opt]]` via string input)
- Snapshot re-lock for `expo-basic` and `expo-tabs-and-dynamic`

**Out of scope (from SPEC.md):**
- `StyleSheet.create`, inline `style={{}}`, style array merging, NativeWind `className` — Phase 13
- Platform-suffix fallback (`Button.ios.tsx` vs `Button.android.tsx`) — Phase 14
- Integration test suite across both fixtures in both output formats — Phase 15
- `--init` template update — Phase 15
- `<Tabs.Screen>` with non-literal computed `name` (beyond emitting a warning) — deferred
- Namespace import resolution (`import * as RN` → classify `RN.Text`) — documented limitation only
- `useLocalSearchParams`, `useRouter`, `<Link href>` harvesting — v1.3+
- Drawer navigator, `expo-router/drawer` — v1.3+
- Sister-package primitives (`SafeAreaView` from `react-native-safe-area-context`) — v1.3+
- `[[...opt]]` fixture file addition — unit test of parser string is sufficient

</spec_lock>

<decisions>
## Implementation Decisions

### `<Tabs.Screen>` / `<Stack.Screen>` Tree Representation
- **D-01:** `<Tabs.Screen>` and `<Stack.Screen>` become **child TreeNodes** with `kind: "component"` — consistent with how the tree renders every JSX element. They are NOT flattened into the parent `<Tabs>`/`<Stack>` node as attributes.
- **D-02:** Literal `name` attribute → string attribute on the child node as-is.
- **D-03:** `options={...}` object → serialized via `JSON.stringify` compact as the `"options"` attribute value. Example: `{name: "options", value: '{"title":"Home"}'}`. Non-serializable values are omitted silently.

### Import Binding Sharing Strategy
- **D-04:** Extract `collectImportBindings` from `Analyzer.ts` into a new shared utility `src/core/import-bindings.ts`. This utility exports `collectImportBindings(ast: t.File): Map<string, ImportBinding>` and the `ImportBinding` interface.
- **D-05:** `Analyzer.ts` is refactored in Phase 12 to import from `../../core/import-bindings.js` (removing its internal copy). This is a net-zero behavior change — all existing tests remain green.
- **D-06:** `ExpoRouterAdapter` and `src/adapters/expo/rn-primitives.ts` import from `../../core/import-bindings.js`. Island rule is satisfied: adapters→core direction is permitted.

### `discoverEntries` Glob Scope
- **D-07:** `discoverEntries` returns **routing files only** — `.tsx`/`.jsx`/`.ts`/`.js` files under the Expo app root, excluding well-known non-routing subdirectories. Ignore patterns: `**/components/**`, `**/hooks/**`, `**/utils/**`, `**/node_modules/**`. Planner determines exact glob pattern.
- **D-08:** `src/app/` takes priority over `app/` when both exist (matches SPEC Req 1). Warning emitted naming both paths when both are present.

### `mapRouteToEntry` Entries Ordering
- **D-09:** `mapRouteToEntry(absRoot, route)` returns `entries` as the **full layout chain + page file**, in root→leaf→page order. Example for `expo-basic` route `/`: `entries = ["app/_layout.tsx", "app/index.tsx"]`. For `expo-tabs-and-dynamic` route `/[id]`: `entries = ["app/_layout.tsx", "app/(tabs)/_layout.tsx", "app/(tabs)/[id].tsx"]`.
- **D-10:** This matches the Next.js pattern established by Phase 4 / Phase 10 — Analyzer's slot mechanism handles layout chain wiring without adapter changes.

### `parseSegment` Return Shape
- **D-11:** Expo's `parseSegment` uses `name` field (not `param`) as specified by SPEC Req 3 acceptance criteria: `{ kind: "dynamic", name: "id" }`. This is a **distinct, simpler type** from Next.js `SegmentKind` (which uses `param`). Export as `ExpoSegment` type from `src/adapters/expo/segments.ts`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Spec
- `.planning/phases/12-exporouteradapter-routing-rn-primitives/12-SPEC.md` — Locked requirements, boundaries, 9 acceptance criteria. MUST read before planning.

### Core Files to Create
- `src/adapters/expo/discover.ts` — root detection + file globbing
- `src/adapters/expo/segments.ts` — `parseSegment(dir)` returning `ExpoSegment`
- `src/adapters/expo/route-map.ts` — URL route string builder
- `src/adapters/expo/rn-primitives.ts` — allowlist + import-source classification
- `src/core/import-bindings.ts` — NEW shared utility extracted from Analyzer.ts

### Core Files to Modify
- `src/adapters/expo/ExpoRouterAdapter.ts` — replace all 5 stubs with real implementations
- `src/core/Analyzer.ts` — refactor: import `collectImportBindings` from `src/core/import-bindings.ts` instead of internal function

### Architecture Rules
- `test/architecture/island.test.ts` — island rule: `src/core/` cannot import `src/adapters/`. `src/core/import-bindings.ts` is a core utility — it must NOT reference any adapter types.
- `src/adapters/FrameworkAdapter.ts` — 8-method interface; `ExpoRouterAdapter` must satisfy it at compile time.

### Reference Implementation (Next.js patterns to mirror)
- `src/adapters/next/discover.ts` — `resolveAppRoot` pattern (src/app vs app priority, tinyglobby usage)
- `src/adapters/next/segments.ts` — `classifySegment` — reference for regex patterns; Expo `parseSegment` is simpler (no parallel slots, no intercepting routes)
- `src/adapters/next/route-map.ts` — layout chain construction pattern for `mapRouteToEntry`
- `src/adapters/next/NextJsAdapter.ts` — `extractComponents` structure (walkAst, JSX element harvesting)

### Existing Test Fixtures
- `test/fixtures/expo-basic/` — `app/_layout.tsx` (Slot), `app/index.tsx` (View + Text), `app/components/HomeScreen.tsx`
- `test/fixtures/expo-tabs-and-dynamic/` — `(tabs)/_layout.tsx` (Tabs + Tabs.Screen), `(tabs)/[id].tsx`, `+not-found.tsx`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/adapters/next/discover.ts` → `resolveAppRoot(absRoot)` pattern — reuse the `src/app` vs `app` priority logic; Expo version mirrors it exactly
- `src/adapters/next/segments.ts` → regex patterns for `[param]`, `[...rest]`, `[[...opt]]`, `(group)` — copy and simplify (drop parallel/intercepting/private variants not used in Expo)
- `src/core/Analyzer.ts` → `collectImportBindings` (lines 135–162) — the exact function being extracted to `src/core/import-bindings.ts`; also `walkAst` / `collectJsxElements` patterns are available in `NextJsAdapter.ts` for JSX walking reference
- `src/core/paths.ts` → `toForwardSlash` — must be applied to all paths in tree output (existing Windows invariant)
- `tinyglobby` — already a dep; use for `discover.ts` file globbing

### Established Patterns
- **Island rule:** `src/adapters/expo/` → `src/core/` imports OK; reverse is forbidden. New `src/core/import-bindings.ts` must contain zero adapter references.
- **No-throw contract:** `mapRouteToEntry` returns `{ matched: false }` on any failure; `parseSegment` returns `{ kind: "static", name: dir }` as fallback for unrecognized patterns
- **Forward-slash path invariant:** All file paths emitted to tree output use `toForwardSlash` (from `src/core/paths.ts`)
- **`warnings` channel:** All warnings pushed to `ParseContext.warnings[]` — never `console.*`
- **`collectImportBindings` namespace import handling:** `ImportNamespaceSpecifier` is intentionally skipped (v1 carve-out) — this is the hook for the namespace import warning in Req 10

### Integration Points
- `src/core/Analyzer.ts` `buildUnionIR()` — calls `adapter.enumerateRoutes(root)` → returns route strings
- `src/core/Analyzer.ts` `buildTreeForEntry()` — calls `adapter.classifyEntry(absPath)` and `adapter.extractComponents(ctx, entryFiles)`
- `src/core/Analyzer.ts` `collectChildrenSlotLines()` (private method) — calls `adapter.slotMarker(name, importSource)` for each JSX identifier; already handles Expo `<Slot/>` via `slotMarker` (Phase 11)
- `test/adapters/FrameworkAdapter.test.ts` — 8-method locking test; no changes needed but ExpoRouterAdapter must pass it post-implementation

</code_context>

<specifics>
## Specific Ideas

- `ExpoSegment` type (from `segments.ts`) uses `name` field (not `param`) per SPEC acceptance criteria: `{ kind: "dynamic", name: "id" }`, `{ kind: "catch-all", name: "rest" }`, `{ kind: "optional-catch-all", name: "opt" }`, `{ kind: "group", name: "tabs" }`, `{ kind: "index" }`, `{ kind: "static", name: "settings" }`, `{ kind: "special", name: "+not-found" }`
- `<Tabs.Screen>` / `<Stack.Screen>` walker: look for `JSXMemberExpression` where `object.name === "Tabs" && property.name === "Screen"` (or `Stack`). Extract `name` attribute as string, `options` attribute as `JSON.stringify` of its object shape.
- Non-literal `name` on `<Tabs.Screen>` → push to `ctx.warnings[]`: `"Non-literal name prop on <Tabs.Screen> at file:line — screen not enumerated"`
- Namespace import warning format: `"Namespace import 'RN' from 'react-native' detected at file:line — members not classified as RN primitives"` (SPEC Req 10 exact text)
- `discoverEntries` returns all `.tsx`/`.jsx`/`.ts`/`.js` files under the Expo app root EXCEPT those under known non-routing subdirectories; `classifyEntry` then returns `"layout"` for `_layout.tsx`, `"special"` for `+not-found.tsx`, `"other"` for skipped files (`+html.tsx`, `+api.ts`), `"page"` for everything else

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 12-exporouteradapter-routing-rn-primitives*
*Context gathered: 2026-05-18*
