---
phase: 12-exporouteradapter-routing-rn-primitives
plan: "03"
subsystem: adapters/expo
tags: [expo-router, react-native, slot-injection, rn-primitives, tabs-screen, stack-screen]
dependency_graph:
  requires: [12-01, 12-02]
  provides: [ExpoRouterAdapter-full, Analyzer-slot-fix]
  affects: [src/core/Analyzer.ts, src/adapters/expo/ExpoRouterAdapter.ts]
tech_stack:
  added: []
  patterns:
    - JSXOpeningElement visitor for <Slot/> detection in collectChildrenSlotLines
    - pendingWarnings pattern: queue in discoverEntries, flush in extractComponents
    - RN primitive gating via import source + allowlist (isRNPrimitive)
    - Namespace import detection via ImportNamespaceSpecifier traversal
    - Tabs.Screen / Stack.Screen walker for navigator screen enumeration
    - Literal-property-only JSON serialization for options attribute
key_files:
  created: []
  modified:
    - src/core/Analyzer.ts
    - src/adapters/expo/ExpoRouterAdapter.ts
    - test/adapters/expo/ExpoRouterAdapter.test.ts
decisions:
  - "RN primitive text extraction uses __rnText synthetic attribute on RenderNode to avoid schema change"
  - "collectChildrenSlotLines JSXOpeningElement visitor added inside existing traverse call (same closure)"
  - "pendingWarnings flushed at extractComponents start before any file processing"
  - "serializeOptionsObject silently omits non-literal (expression) property values per D-03"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-19"
  tasks_completed: 2
  files_modified: 3
---

# Phase 12 Plan 03: ExpoRouterAdapter Real Implementation + Analyzer Slot Fix Summary

**One-liner:** Full ExpoRouterAdapter implementation with RN primitive classification, slot injection fix, and Tabs/Stack.Screen walker using Wave 1 utility modules.

## What Was Built

### Task 1: Analyzer.ts — JSXOpeningElement visitor (ROUTE-02 critical fix)

**Diff applied to `collectChildrenSlotLines`:**

Added a second visitor inside the existing `traverse(ast, { ... })` call alongside `JSXExpressionContainer`:

```typescript
JSXOpeningElement(path: { node: t.JSXOpeningElement }) {
  const nameNode = path.node.name;
  if (t.isJSXIdentifier(nameNode)) {
    const binding = bindings.get(nameNode.name);
    const importSource = binding?.source ?? "";
    if (adapter.slotMarker(nameNode.name, importSource)) {
      const line = path.node.loc?.start.line ?? 0;
      lines.add(line);
    }
  }
},
```

This enables `<Slot/>` self-closing JSX (JSXOpeningElement) to be recognized as a slot injection point for Expo Router. `NextJsAdapter.slotMarker` returns true only for `name === "children"` which cannot be a JSXOpeningElement name — zero Next.js regression.

### Task 2: ExpoRouterAdapter.ts — 8 methods with real implementations

| Method | Implementation summary |
|--------|------------------------|
| `detect()` | Unchanged (returns false — detection in detect.ts) |
| `discoverEntries(absRoot)` | detectDualRoots first; if both exist, push dual-root warning to pendingWarnings; delegate to expoDiscoverEntries |
| `classifyEntry(absPath)` | Regex sequence: `_layout.*` → layout; `+not-found.*` → special; any `+`-prefix → other; else → page |
| `enumerateRoutes(absRoot)` | Delegates to `expoEnumerateRoutes` from route-map.ts |
| `mapRouteToEntry(absRoot, route)` | Delegates to `expoMapRouteToEntry` from route-map.ts |
| `slotMarker(name, importSource)` | Unchanged: `name === "Slot" && importSource === "expo-router"` |
| `resolveModule(ctx, from, spec, imp)` | Delegates to `coreResolveModule` (same as NextJsAdapter) |
| `extractComponents(ctx, files, opts)` | Full implementation — see below |

**`extractComponents` flow:**
1. Flush `this.pendingWarnings` into `ctx.warnings`, then clear
2. For each entry file: `parseFile` → error path → `collectImportBindings`
3. Traverse for `ImportNamespaceSpecifier` from `react-native` → namespace import warning
4. Traverse for `JSXMemberExpression` where `object.name ∈ {Tabs, Stack} && property.name === Screen` → extract `name` (literal check) and `options` (literal-property JSON serialization)
5. `discoverComponents` + `buildComponentDefinition` with RN primitive post-processing
6. RN primitive post-processing: if binding source is `react-native` and tag in RN_PRIMITIVES → `isComponent: false`; for `Text` primitive + literal JSXText children → inject `__rnText` attribute

## Test Count: Before / After

| Baseline (Plan 12-02 end) | After Plan 12-03 | Delta |
|---------------------------|------------------|-------|
| 457 tests passing | 491 tests passing | +34 new tests |

Pre-existing failure: `test/cli/framework-flag.test.ts` (1 test) — vi.mocked hoisting issue unrelated to this plan, documented in STATE.md since Plan 02.

## Three Exact Warning Strings Emitted

**Dual-root warning:**
```
Both app/ and src/app/ exist at <absRoot>; using src/app/. Paths: <srcAppPath>, <appPath>
```
Example: `Both app/ and src/app/ exist at /project; using src/app/. Paths: /project/src/app, /project/app`

**Namespace import warning (SPEC Req 10 exact format):**
```
Namespace import '<localName>' from 'react-native' detected at <fwdFile>:<line> — members not classified as RN primitives
```
Example: `Namespace import 'RN' from 'react-native' detected at e:/app/screen.tsx:1 — members not classified as RN primitives`

**Non-literal screen name warning:**
```
Non-literal name prop on <<navigatorName>.Screen> at <fwdFile>:<line> — screen not enumerated
```
Example: `Non-literal name prop on <Tabs.Screen> at e:/app/(tabs)/_layout.tsx:5 — screen not enumerated`

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written with one architectural adaptation:

**Adaptation: RN text field via synthetic `__rnText` attribute**
- **Context:** The plan specified `text: "Hello world"` as a field on the node output. `RenderNode { kind: "jsx" }` does not have a `text` field in the locked R8 13-field `ComponentDefinition` schema.
- **Resolution:** Injected text content as a synthetic `__rnText` attribute on the `RenderNode` attributes array, keeping the same behavior observable in tests without requiring a schema change.
- **Alternative:** A future plan (13+) could promote `text` to a first-class TreeNode field at the IR level.

## Self-Check

### Files exist:
- [x] `src/core/Analyzer.ts` — modified with JSXOpeningElement visitor
- [x] `src/adapters/expo/ExpoRouterAdapter.ts` — full 8-method implementation
- [x] `test/adapters/expo/ExpoRouterAdapter.test.ts` — 35 GREEN tests

### Commits exist:
- [x] `b81f40f` — feat(12-03): extend collectChildrenSlotLines with JSXOpeningElement visitor
- [x] `b93bf4f` — feat(12-03): implement ExpoRouterAdapter + fix Analyzer slot detection

### Acceptance criteria:
- [x] `grep -nE "JSXOpeningElement\(path" src/core/Analyzer.ts` — 1 match
- [x] `grep -nE "adapter\.slotMarker\(" src/core/Analyzer.ts` — 2 matches (JSXExpressionContainer + JSXOpeningElement)
- [x] `collectChildrenSlotLines` contains exactly one `traverse(` invocation
- [x] `grep -nE "^\s*private pendingWarnings" src/adapters/expo/ExpoRouterAdapter.ts` — 1 match
- [x] `grep -nE 'from "\./discover\.js"'` — matches
- [x] `grep -nE 'from "\./route-map\.js"'` — matches
- [x] `grep -nE 'from "\./rn-primitives\.js"'` — matches
- [x] `grep -nE 'from "../../core/import-bindings\.js"'` — matches
- [x] `grep -nE 'from "@babel/traverse"' src/adapters/expo/ExpoRouterAdapter.ts` — 0 matches
- [x] `grep -nE "console\." src/adapters/expo/ExpoRouterAdapter.ts` — 0 matches
- [x] `grep -nE 'name === "Slot" && importSource === "expo-router"'` — 1 match
- [x] Full suite: 491 tests passing (strictly more than Wave 1 baseline of 457)
- [x] Test contains `Both app/ and src/app/` assertion
- [x] Test contains `Namespace import` assertion
- [x] Test contains `Non-literal name prop` assertion
- [x] Test contains Slot-injection tree shape assertion for expo-basic
- [x] Test asserts `<Text>Hello world</Text>` from react-native → `isComponent: false` + `__rnText: "Hello world"`
- [x] Test asserts `<Text>` from `@/components/Text` → `isComponent: true` (stays component)

## Self-Check: PASSED
