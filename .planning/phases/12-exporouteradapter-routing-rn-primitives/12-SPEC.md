# Phase 12: ExpoRouterAdapter Routing & RN Primitives — Specification

**Created:** 2026-05-18
**Ambiguity score:** 0.146 (gate: ≤ 0.20)
**Requirements:** 11 locked

## Goal

`ExpoRouterAdapter` produces a real routing tree from an Expo Router project's `app/` directory — layout chains via `<Slot/>`, dynamic segments and groups rendered correctly, `<Tabs>`/`<Stack>` children enumerated, and RN primitives distinguished from user components by import source.

## Background

Phase 11 shipped `ExpoRouterAdapter` as a complete stub: `discoverEntries()` returns `[]`, `classifyEntry()` always returns `"other"`, `enumerateRoutes()` returns `[]`, `extractComponents()` returns `[]`, `mapRouteToEntry()` always returns `{ matched: false }`. Only `slotMarker()` is correctly implemented (`name === "Slot" && importSource === "expo-router"`). The Analyzer machinery is already wired — it calls `adapter.enumerateRoutes()` in `buildUnionIR()` and `adapter.slotMarker()` in `collectChildrenSlotLines()`. Two fixtures are ready: `expo-basic` (single layout + index + HomeScreen) and `expo-tabs-and-dynamic` (`(tabs)` group + `[id].tsx` + `+not-found.tsx`). Calling any MCP tool on an Expo project currently returns an empty or no-match result.

## Requirements

1. **Route discovery root**: Adapter discovers routes from `app/` or `src/app/`; when both exist `src/app/` wins.
   - Current: `discoverEntries()` returns `[]`; no root detection logic
   - Target: `expo/discover.ts` globs the correct root, emits envelope warning naming both directories when both exist
   - Acceptance: Against a fixture with both `app/` and `src/app/`, the returned tree is rooted at `src/app/_layout.tsx` and an envelope warning contains both paths

2. **Layout chain via `<Slot/>`**: `_layout.tsx` files compose a root → leaf chain; `<Slot/>` (any props, from `expo-router`) marks the children injection point.
   - Current: `slotMarker()` correct but `discoverEntries()` returns `[]` so no chain is built
   - Target: Analyzer's `collectChildrenSlotLines()` detects `<Slot>` components imported from `expo-router` (regardless of props) and injects `kind:"slot"` TreeNodes; layout chain mirrors the directory nesting
   - Acceptance: `expo-basic` tree is rooted at `app/_layout.tsx`; `app/index.tsx` appears as a child injected at the `<Slot/>` position with correct `file:line`

3. **Dynamic segment parsing**: Route segments `[param]`, `[...rest]`, `[[...opt]]` are labeled by kind in the rendered tree.
   - Current: No segment parser exists; segments would appear as raw directory names
   - Target: `expo/segments.ts` exports a `parseSegment(dir: string)` that classifies each directory name as `static | dynamic | catch-all | optional-catch-all | group | index | special`
   - Acceptance: Unit tests assert `parseSegment("[id]")` → `{ kind: "dynamic", name: "id" }`, `parseSegment("[...rest]")` → `{ kind: "catch-all", name: "rest" }`, `parseSegment("[[...opt]]")` → `{ kind: "optional-catch-all", name: "opt" }`; integration: `expo-tabs-and-dynamic` tree labels the `[id]` segment with its kind

4. **Route groups transparent in URL**: `(group)/` directories do not emit a URL segment but their `_layout.tsx` participates in the layout chain.
   - Current: No group handling
   - Target: `expo/route-map.ts` skips the group name when building route strings; the `_layout.tsx` inside `(group)/` is added to the layout chain
   - Acceptance: `expo-tabs-and-dynamic` route for `(tabs)/index.tsx` is `/` (not `/(tabs)`); the `(tabs)/_layout.tsx` appears in the tree's layout chain

5. **`index.tsx` as default route**: `app/index.tsx` maps to URL `/`; `app/settings/index.tsx` maps to `/settings`.
   - Current: No route mapping
   - Target: `expo/route-map.ts` strips `index` from the final route segment when building URL strings
   - Acceptance: `expo-basic` produces route `/` for `app/index.tsx`; any nested `index.tsx` produces its parent directory's URL

6. **`<Tabs>` navigation enumeration**: `<Tabs>` and `<Tabs.Screen name="..." options={...}>` inside `_layout.tsx` are enumerated; non-literal `name` emits a warning.
   - Current: No JSX walker for navigation components
   - Target: `<Tabs>` walker extracts each `<Tabs.Screen>` with its literal `name` attribute and summarized `options` as node attributes; a non-literal `name` emits an envelope warning naming the file and JSX position
   - Acceptance: `expo-tabs-and-dynamic` tree enumerates all `<Tabs.Screen>` nodes with their `name` values; adding a non-literal `name` (e.g., `name={tabName}`) to the fixture produces a warning, not a crash

7. **`<Stack>` navigation enumeration**: `<Stack>` and `<Stack.Screen name="..." options={...}>` inside `_layout.tsx` are enumerated analogously to Tabs.
   - Current: No Stack walker
   - Target: Same walker handles `<Stack>` and `<Stack.Screen>` with `name` + summarized `options`
   - Acceptance: A `_layout.tsx` containing `<Stack>` with literal-named screens produces enumerated nodes; non-literal name → warning (same behavior as Tabs)

8. **Expo special file handling**: `+not-found.tsx` registered as a special sibling (no URL); `+html.tsx`, `+native-intent.tsx`, `+api.ts` are silently skipped.
   - Current: No classification; all files would be treated as pages (once discoverEntries works)
   - Target: `classifyEntry()` returns `"special"` for `+not-found.tsx`; returns `"other"` for `+html.tsx`, `+native-intent.tsx`, `+api.ts` (excluded from routing)
   - Acceptance: `expo-tabs-and-dynamic` tree includes `+not-found.tsx` as a special sibling node; `+html.tsx` and `+api.ts` do not appear in the tree

9. **RN primitive classification**: Named RN primitives imported from `react-native` are classified as `kind: "element"`.
   - Current: `extractComponents()` returns `[]`; no import-source-aware classification
   - Target: `expo/rn-primitives.ts` exports an allowlist (`View`, `Text`, `ScrollView`, `Image`, `Pressable`, `TouchableOpacity`, `TouchableHighlight`, `TouchableWithoutFeedback`, `FlatList`, `SectionList`, `Modal`, `KeyboardAvoidingView`, `SafeAreaView`); `extractComponents()` checks the import binding's source — allowlist name + `react-native` source → `kind: "element"`
   - Acceptance: A component using `import { Text, View } from "react-native"` produces nodes with `kind: "element"`; the same tag names imported from `@/components` produce `kind: "component"`

10. **Import-source disambiguation**: A user component sharing a primitive name stays `kind: "component"` when imported from a non-`react-native` source; namespace imports (`import * as RN from "react-native"`) emit a warning and are not classified.
    - Current: No classification at all
    - Target: Classification is keyed on (tagName, importSource) pair; namespace imports produce an envelope warning: `"Namespace import 'RN' from 'react-native' detected at file:line — members not classified as RN primitives"`
    - Acceptance: `<Text>` from `@/components/Text` → `kind: "component"`; `<Text>` from `react-native` → `kind: "element"`; `import * as RN from "react-native"` + `<RN.Text>` → warning emitted, node stays `kind: "component"` (not element)

11. **`<Text>` text content extraction**: Literal string children of `<Text>` imported from `react-native` populate the node's `text` field.
    - Current: No text extraction on RN primitives
    - Target: When the JSX walker encounters `<Text>` (`kind: "element"`, source `react-native`), it collects direct literal-string children into the node's text content — same structure as v1.0 web text extraction
    - Acceptance: `<Text>Hello world</Text>` → node with `text: "Hello world"`; `<Text>{dynamic}</Text>` → node with no `text` field (expression, not literal)

## Boundaries

**In scope:**
- `src/adapters/expo/ExpoRouterAdapter.ts` — replace stub with real implementations of `discoverEntries`, `classifyEntry`, `enumerateRoutes`, `extractComponents`, `mapRouteToEntry`
- `src/adapters/expo/discover.ts` — root detection (`app/` vs `src/app/`), file globbing, warning when both exist
- `src/adapters/expo/segments.ts` — segment parser: static, dynamic, catch-all, optional-catch-all, group, index, special (`+not-found`)
- `src/adapters/expo/route-map.ts` — build URL route strings from file paths using segment parser; group transparency; index collapsing
- `src/adapters/expo/rn-primitives.ts` — allowlist definition + import-source classification helper + namespace import warning
- `<Slot/>`, `<Tabs>`, `<Stack>` JSX walker inside ExpoRouterAdapter's component extraction
- `slotMarker()` already correct — stays as-is (any `<Slot>` from `expo-router`, regardless of props, is a slot)
- Unit tests for `segments.ts` (including `[[...opt]]` via string input, no fixture file needed)
- Snapshot re-lock for `expo-basic` and `expo-tabs-and-dynamic`

**Out of scope:**
- `StyleSheet.create`, inline `style={{}}`, style array merging, NativeWind `className` — Phase 13
- Platform-suffix fallback (`Button.ios.tsx` vs `Button.android.tsx` resolution) — Phase 14
- Integration test suite across both fixtures in both output formats — Phase 15
- `--init` template update — Phase 15
- `<Tabs.Screen>` with non-literal computed `name` (beyond emitting a warning) — deferred
- Namespace import resolution (`import * as RN` → classify `RN.Text`) — documented limitation only
- `useLocalSearchParams`, `useRouter`, `<Link href>` harvesting — v1.3+
- Drawer navigator, `expo-router/drawer` — v1.3+
- Sister-package primitives (`SafeAreaView` from `react-native-safe-area-context`, `expo-image`) — v1.3+
- `[[...opt]]` fixture file addition — unit test of parser string is sufficient for v1.2

## Constraints

- All 389 existing tests must remain green after Phase 12; new tests add to the count, never subtract
- No new runtime dependencies beyond what Phase 11 installed; use `tinyglobby` (already a dep) for file discovery
- Static analysis only — no execution of user code; `app.config.ts` and `tailwind.config.*` are not parsed
- `slotMarker()` remains the single gate for children injection — do not add a second code path in Analyzer.ts
- `layoutHint` field stays Next.js-specific in v1.2; RN nodes leave it unset (established decision from Phase 11 STATE.md)
- Windows backslash guard: any path emitted to tree output must use forward slashes (existing invariant from v1.0)

## Acceptance Criteria

- [ ] Calling `get_full_hierarchy` on `expo-basic` returns a tree rooted at `app/_layout.tsx` with `app/index.tsx` as a child injected at the `<Slot/>` position, with correct `file:line` on every node
- [ ] Calling `get_full_hierarchy` on `expo-tabs-and-dynamic` returns a tree where `(tabs)` is absent from the URL route, `[id]` is labeled with its dynamic segment kind, `+not-found.tsx` appears as a special sibling, and `+html.tsx` / `+native-intent.tsx` / `+api.ts` are absent
- [ ] `<Tabs.Screen>` nodes from `expo-tabs-and-dynamic` are enumerated with `name` and summarized `options` attributes
- [ ] `<Text>` imported from `react-native` → `kind: "element"` with text content from literal string children
- [ ] `<Text>` imported from `@/components/Text` → `kind: "component"`, no text extraction as primitive
- [ ] When fixture has both `app/` and `src/app/`, tree is rooted at `src/app/` and an envelope warning names both directories
- [ ] `parseSegment("[[...opt]]")` unit test passes → `{ kind: "optional-catch-all", name: "opt" }`
- [ ] `import * as RN from "react-native"` usage in a fixture file produces an envelope warning containing "Namespace import"
- [ ] All 389 existing tests remain green; total test count increases

## Ambiguity Report

| Dimension           | Score | Min  | Status | Notes                                                          |
|---------------------|-------|------|--------|----------------------------------------------------------------|
| Goal Clarity        | 0.88  | 0.75 | ✓      | 5 success criteria directly testable                           |
| Boundary Clarity    | 0.88  | 0.70 | ✓      | Files named; explicit out-of-scope with reasoning              |
| Constraint Clarity  | 0.78  | 0.65 | ✓      | Test count, no new deps, backslash guard, layoutHint locked    |
| Acceptance Criteria | 0.85  | 0.70 | ✓      | 9 pass/fail checkboxes                                         |
| **Ambiguity**       | 0.146 | ≤0.20| ✓      |                                                                |

## Interview Log

| Round | Perspective | Question summary                              | Decision locked                                                                 |
|-------|-------------|-----------------------------------------------|---------------------------------------------------------------------------------|
| 1     | Researcher  | Named `<Slot>` vs bare `<Slot/>`              | Any `<Slot>` from `expo-router` (with or without props) → slotMarker = true    |
| 1     | Researcher  | `[[...opt]]` fixture file vs unit test        | Parser logic + unit test with string input; no fixture file needed              |
| 1     | Researcher  | RN namespace import scope                     | Emit warning, document as limitation, do not classify as element                |

---

*Phase: 12-exporouteradapter-routing-rn-primitives*
*Spec created: 2026-05-18*
*Next step: /gsd:discuss-phase 12 — implementation decisions (how to build what's specified above)*
