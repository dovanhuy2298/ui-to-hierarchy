---
phase: "12"
reviewed: 2026-05-19T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/adapters/expo/ExpoRouterAdapter.ts
  - src/adapters/expo/discover.ts
  - src/adapters/expo/rn-primitives.ts
  - src/adapters/expo/route-map.ts
  - src/adapters/expo/segments.ts
  - src/core/Analyzer.ts
  - src/core/import-bindings.ts
  - test/adapters/expo/ExpoRouterAdapter.test.ts
  - test/adapters/expo/discover.test.ts
  - test/adapters/expo/rn-primitives.test.ts
  - test/adapters/expo/route-map.test.ts
  - test/adapters/expo/segments.test.ts
status: issues_found
findings:
  critical: 2
  warning: 7
  info: 4
  total: 13
---

# Phase 12: Code Review Report

**Reviewed:** 2026-05-19T00:00:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Phase 12 implements `ExpoRouterAdapter` and its utility modules (discovery, segment parsing, route mapping, RN primitive classification) plus a fix to `Analyzer.collectChildrenSlotLines` to support the Expo `<Slot />` pattern. The implementation is generally well-structured and the island isolation rule is respected.

Two critical bugs were found: a duplicate `@babel/types` import that aliases the same module under two names (`t` and `tTypes`) — a module initialisation hazard that can break tree-shaking and bundled output — and a logic error in `visitRenderNode` where RN `<Text>` children text extraction reads from the **unprocessed** `node.children` (pre-recursion) while already having computed `processedChildren` from the post-recursion pass, causing text content to be missed when dynamic children precede literal ones. Seven warnings cover design-level correctness risks: stale slot injection across multiple calls to `extractComponents`, the known `EXPO-SLOT-01` bug left untested, `_screenInfos` collected but silently discarded, `params` always returned empty, misleading `detect()` return value, and a path-separator edge case on Windows in `buildLayoutChain`. Four info items flag code quality issues including dead parameters and duplicated imports.

---

## Critical Issues

### CR-01: Duplicate `@babel/types` import — same module imported twice under two aliases

**File:** `src/adapters/expo/ExpoRouterAdapter.ts:13` and `src/adapters/expo/ExpoRouterAdapter.ts:500`

**Issue:** `@babel/types` is imported twice in the same file: once as `import * as t from "@babel/types"` at line 13 (used throughout the class and helpers above line 499) and again as `import * as tTypes from "@babel/types"` at line 500 (used in `extractProps` and `readTypeSlice` below it). Both aliases refer to the identical module. This is not just a style problem:

1. `tsup`/esbuild may treat these as two separate side-effectful imports, duplicating any module-level initialization cost.
2. The mid-file `import` statement at line 500 is syntactically illegal in standard ESM (imports must appear at the top of a module); TypeScript's downlevel emit may tolerate it but it will fail under strict ESM linters and native `node --input-type=module` execution.
3. The accompanying `import type { PropSignature, RenderNode } from "../types.js"` at line 499 has the same problem — a `type`-only import placed mid-file after executable code.

**Fix:** Consolidate to the existing `t` alias at the top of the file. Replace every `tTypes.` reference in `extractProps` and `readTypeSlice` (lines 502–575) with `t.`. Remove lines 499–500 entirely. Add `PropSignature` and `RenderNode` to the existing type imports near the top of the file (or in a dedicated type-import block before any code).

```typescript
// At top of file, consolidate:
import * as t from "@babel/types";
import type { PropSignature, RenderNode, ComponentDefinition, ParseContext, ResolveResult, RouteMatch } from "../types.js";

// Remove lines 499-500 entirely.
// Replace all tTypes.isXxx(...) with t.isXxx(...) in extractProps and readTypeSlice.
```

---

### CR-02: Text extraction in `visitRenderNode` reads pre-recursion children — misses interleaved text

**File:** `src/adapters/expo/ExpoRouterAdapter.ts:433-438`

**Issue:** In the `"Text"` branch of `visitRenderNode`, the loop that collects literal text reads from `node.children` (the original, unprocessed children):

```typescript
for (const child of node.children) {           // ← original children
  if (child.kind === "text" && child.value.trim()) {
    textParts.push(child.value.trim());
  }
}
```

But `processedChildren` (the recursively visited children) has already been computed from `node.children.map(...)` just above. Reading `node.children` instead of `processedChildren` is harmless for direct `kind:"text"` children (they are leaf nodes — recursion does not change them), but it means that if a child `kind:"jsx"` node wraps text content that only becomes visible after recursion (for example nested RN `<Text>` inside an outer `<Text>`), those deeper text nodes are silently lost. More concretely, the `processedChildren` list is never used for text scanning at all, which suggests the scan was intended to run on `processedChildren` so results are consistent with what is actually returned.

Additionally, the text concatenation uses `textParts.join("").trim()` — joining without any separator means adjacent words from multiple `<Text>` children run together without a space.

**Fix:** Either scan `processedChildren` for consistency, or (better) keep the current shallow scan of `node.children` but document it as intentionally shallow. Also fix the join separator:

```typescript
// Option A: scan processedChildren (consistent with returned tree):
for (const child of processedChildren) {
  if (child.kind === "text" && child.value.trim()) {
    textParts.push(child.value.trim());
  }
}
const textValue = textParts.join(" ").trim(); // space separator

// Option B: keep node.children scan but fix separator:
const textValue = textParts.join(" ").trim();
```

---

## Warnings

### WR-01: `_screenInfos` collected in `extractComponents` but passed as unused parameter to `buildComponentDefinition`

**File:** `src/adapters/expo/ExpoRouterAdapter.ts:277-341`

**Issue:** `extractComponents` spends a full `traverse` pass collecting `screenInfos: ScreenInfo[]` per file (lines 279–326), then passes the array to `buildComponentDefinition` as `_screenInfos` (leading underscore prefix = intentionally unused). The screen metadata — `navigatorName`, `screenName`, `optionsValue`, `line` — is never incorporated into the returned `ComponentDefinition`. The work and the warning path for non-literal name props are executed, but no consumer ever reads the screen information. This is silently dead functionality. SPEC Req 11 states screen enumeration should surface in the output.

**Impact:** Tabs.Screen / Stack.Screen data collected for route mapping is completely lost from the output. Callers that depend on knowing which tabs/screens are declared cannot retrieve this information.

**Fix:** Either propagate `screenInfos` into the `ComponentDefinition` (e.g., via `props` or a dedicated `screenSlots` field if the type permits), or surface it via a synthetic attribute on the navigator JSX node in the render flow tree. At minimum add a comment explaining this is intentionally deferred and track it as a spec gap.

---

### WR-02: Slot injection state is mutated across `extractComponents` calls — `pendingWarnings` flushed once but `ctx.astCache` is shared

**File:** `src/adapters/expo/ExpoRouterAdapter.ts:225-226`

**Issue:** `pendingWarnings` is correctly flushed once and reset. However, `collectChildrenSlotLines` inside `Analyzer.buildTreeForEntry` mutates `slotLines` (a `Set`) in-place via `slotLines.delete(sl)` (Analyzer.ts lines 543, 567). This set is freshly created per `buildTreeForEntry` call, so there is no cross-call contamination there. But `extractComponents` itself is called with an external `ctx` whose `astCache` persists across calls (the `Analyzer` reuses the same `ctx` instance). If `extractComponents` is called twice for the same file path, `parseFile` will return the cached AST on the second call. The actual problem is that the `ExpoRouterAdapter` instance accumulates `pendingWarnings` between calls to `discoverEntries` and `extractComponents` — if `discoverEntries` is called multiple times (e.g., once for each route in a multi-route scan), warnings accumulate unboundedly and are only flushed into the first `extractComponents` call's `ctx`. The second `ctx` receives no duplicate-root warning even if it should.

**Impact:** In multi-route usage via `Analyzer`, dual-root warnings can be silently dropped or attributed to the wrong parse context.

**Fix:** Either emit the warning immediately in `discoverEntries` directly into a passed-in warnings array, or document that `discoverEntries` must only be called once per adapter instance.

---

### WR-03: `buildLayoutChain` silently succeeds on Windows when forward-slash paths are fed to `fs.access` via `toNativePath` — but `toNativePath` only handles POSIX-to-Windows, not the reverse

**File:** `src/adapters/expo/route-map.ts:96-148`

**Issue:** `toNativePath` converts forward slashes to `sep` (backslash on Windows). This is used in `buildLayoutChain` when checking for the existence of `_layout.*` files. However, `fwdAppRoot` and `fwdPageFile` are forward-slash paths produced by `toForwardSlash()`. The conversion `fwdPath.split("/").join(sep)` works correctly on POSIX (no-op) and on Windows (replaces `/` with `\`). This is correct. The real risk is the inverse case: if `resolveExpoRoot` returns a path from `join(absRoot, "src", "app")` where `absRoot` itself already contains backslashes (e.g., on Windows with `path.resolve`), and then `toForwardSlash` converts them, the subsequent `toNativePath` re-introduces backslashes. On Windows this round-trips correctly, but only as long as `toForwardSlash` is applied consistently. The `buildLayoutChain` function calls `toNativePath(layoutFwd)` where `layoutFwd` is assembled from `fwdAppRoot` (already forward-slash). This is correct. **However**, `fwdPageFile` passed to `buildLayoutChain` from `mapRouteToEntry` is `toForwardSlash(file)` where `file` comes from `tinyglobby` with `absolute: true`. On Windows, `tinyglobby` may return paths with forward slashes already, making this doubly safe, but the guarantee depends on `tinyglobby` internals.

The actual observable bug: the `sep` import is used only in `toNativePath`, but `toNativePath` is only called for `access()` checks in `buildLayoutChain`. If `fwdPageFile` contains a Windows-style absolute path like `E:/project/app/index.tsx` after `toForwardSlash`, then `prefix` computation at line 110 (`fwdAppRoot.endsWith("/") ? ...`) handles it correctly. There is no actual crash path here, but the dependency on `tinyglobby`'s path format for Windows correctness is undocumented and untested.

**Impact:** On Windows CI, `buildLayoutChain` may fail to find `_layout` files if `tinyglobby` returns mixed-separator paths, causing layout chains to be empty and route trees to degrade to page-only.

**Fix:** Add an explicit `toForwardSlash` call on the paths returned from `tinyglobby` in `mapRouteToEntry` (lines 201-209) before they are used in `buildLayoutChain`. This is already done in `enumerateRoutes` (line 169: `toForwardSlash(file)`) but not consistently applied in `mapRouteToEntry`'s `pageFile` assignment — `pageFile = fwdFile` where `fwdFile = toForwardSlash(file)` is correct, but the `buildLayoutChain` call should also verify its input is forward-slash-only.

---

### WR-04: `mapRouteToEntry` always returns `params: {}` — dynamic route parameters silently discarded

**File:** `src/adapters/expo/route-map.ts:225-234`

**Issue:** When a route like `/[id]` matches a file, the dynamic parameter `id` and its value are never extracted or populated in `params`. The returned `RouteMatch` always has `params: {}`. The code in `mapRouteToEntry` finds the page file by comparing the computed route string to the requested route (e.g., both are `"/[id]"` literally), so no actual URL value is present to extract. However, the adapter is supposed to populate `params` so that consumers can understand what dynamic parameters exist on the route. The current behavior makes `params` useless.

**Impact:** Callers who consume `RouteMatch.params` to understand route parameters will always see an empty object, breaking any feature that depends on parameter enumeration (e.g., generating proper documentation for dynamic routes).

**Fix:** Populate `params` with parameter names extracted from the matched route pattern. When `entryToRoute` returns a route string like `/[id]` and the requested route is `/[id]`, extract all `[param]` tokens and populate `params` with their names (values can be `""` since this is static analysis). Add a note that values are statically unknown.

---

### WR-05: `detect()` always returns `false` — misleading implementation that breaks automatic framework detection

**File:** `src/adapters/expo/ExpoRouterAdapter.ts:143-148`

**Issue:** The `detect` method is part of the `FrameworkAdapter` interface and is supposed to return `true` when the adapter's framework is detected in the project. The comment says "Always returns false — real detection is in src/adapters/expo/detect.ts". This means any code path that calls `adapter.detect(root)` (e.g., an auto-detection loop that iterates registered adapters) will incorrectly conclude that Expo Router is not present, even when it is. The correct `detect.ts` file is decoupled from the adapter instance.

**Impact:** Any orchestrator using the `FrameworkAdapter.detect()` interface for auto-detection will never select `ExpoRouterAdapter`, silently failing to parse Expo Router projects without user intervention.

**Fix:** Either delegate to the standalone `detect.ts` logic from within `ExpoRouterAdapter.detect()`:

```typescript
import { detect as expoDetect } from "./detect.js";

async detect(absRoot: string): Promise<boolean> {
  return expoDetect(absRoot);
}
```

Or document clearly in the interface that `detect()` is not used on an already-instantiated adapter and the method should be removed from the interface for this case.

---

### WR-06: `collectChildrenSlotLines` in `Analyzer.ts` uses `JSXOpeningElement` visitor to detect `<Slot />` — but `<Slot />` as a self-closing element will also fire the `JSXExpressionContainer` visitor if `{children}` is nearby, risking double-counting

**File:** `src/core/Analyzer.ts:1116-1148`

**Issue:** The `collectChildrenSlotLines` method uses two separate visitor callbacks: `JSXExpressionContainer` (catches `{children}` for Next.js) and `JSXOpeningElement` (catches `<Slot />` for Expo). Both check `adapter.slotMarker()`. For Expo Router, `slotMarker("Slot", "expo-router")` returns `true`. A file that contains `<Slot />` will trigger `JSXOpeningElement`, adding the slot line. If the same file also happens to have `{children}` used elsewhere (e.g., as a prop to another component), the `JSXExpressionContainer` visitor will call `slotMarker("children", "")` which returns `false` for Expo — so this specific cross-contamination does not occur.

The actual risk is subtler: if a file contains both `<Slot />` AND a JSX expression container wrapping an identifier called `Slot` (e.g., `{Slot}` as a value expression, not a JSX element), the `JSXExpressionContainer` visitor would also fire with `expr.name === "Slot"` and `importSource === "expo-router"`, adding the line of the expression container as a slot line. This would cause the slot injection algorithm to inject a spurious `kind:"slot"` node at the wrong line.

**Impact:** Edge-case false-positive slot injection in files where `Slot` appears both as a JSX element and as a reference expression. The resulting tree would have an extra slot node at an incorrect line.

**Fix:** Add a guard in the `JSXExpressionContainer` visitor to skip identifiers when `slotMarker` would match a JSX element (not a `{children}`-style pattern). The cleanest fix is to make `slotMarker` take a third argument indicating context (`"jsx-element" | "expression-container"`) so adapters can return `true` only for the appropriate context:

```typescript
// Or simply: only fire JSXExpressionContainer for "children"-style markers:
JSXExpressionContainer(path) {
  const expr = path.node.expression;
  if (t.isIdentifier(expr) && expr.name === "children") {
    // Only check slotMarker for expression-container style
    if (adapter.slotMarker(expr.name, "")) {
      lines.add(path.node.loc?.start.line ?? 0);
    }
  }
}
```

---

### WR-07: Known `EXPO-SLOT-01` bug acknowledged but not tracked with a failing test

**File:** `test/adapters/expo/ExpoRouterAdapter.test.ts:609-613`

**Issue:** The snapshot test for `expo-tabs-and-dynamic` includes a comment:

```
// NOTE: Due to Bug EXPO-SLOT-01 (see 12-04-SUMMARY.md), the Slot injection
// algorithm does not substitute page content into the <Slot/> component node,
// so (tabs)/_layout.tsx, [id].tsx, and Tabs.Screen do NOT appear in this snapshot.
// This snapshot locks the current (limited) baseline; fix is tracked in EXPO-SLOT-01.
```

The snapshot "locks" a broken baseline. This means the test suite will permanently pass against incorrect output until `EXPO-SLOT-01` is fixed, with no automated signal that the fix is needed. A known-broken behavior should be captured as an `expect.fail()` or a TODO test that is explicitly marked to fail, not silently accepted in a snapshot.

**Impact:** `EXPO-SLOT-01` can be forgotten or deprioritized indefinitely because the test suite gives a green signal on broken behavior. CI will never alert on the regression.

**Fix:** Add a companion test that asserts the **incorrect** behavior explicitly and is decorated to be updated when the fix lands:

```typescript
it.fails("EXPO-SLOT-01: (tabs)/_layout.tsx content is NOT injected into Slot — fix pending", async () => {
  // This should fail until EXPO-SLOT-01 is resolved:
  expect(content).toMatch(/\(tabs\)\/_layout\.tsx/);
});
```

---

## Info

### IN-01: Duplicate `@babel/types` import also introduced by mid-file `import` placement (style issue companion to CR-01)

**File:** `src/adapters/expo/ExpoRouterAdapter.ts:499-500`

**Issue:** Beyond the semantic problem noted in CR-01, placing `import` statements at line 499 (after ~490 lines of executable class and function code) violates the ESM specification requirement that `import` declarations are hoisted and must appear before executable statements in source order. TypeScript's compiler processes them syntactically, but static analysis tools, bundlers in strict mode, and native ESM loaders may reject or warn on mid-file imports. The `import type` on line 499 is erased at compile time and is less risky, but the `import * as tTypes` on line 500 is a runtime import.

**Fix:** Move all imports to the top of the file. (This is resolved by applying the CR-01 fix.)

---

### IN-02: Dead parameters `_screenInfos` and `_ctx` in `buildComponentDefinition`

**File:** `src/adapters/expo/ExpoRouterAdapter.ts:353-354`

**Issue:** `buildComponentDefinition` accepts `_screenInfos: ScreenInfo[]` and `_ctx: ParseContext` but uses neither. The underscore prefix acknowledges they are unused, but this is code smell pointing at incomplete implementation (also noted in WR-01). If screen metadata is intentionally deferred, these parameters should be removed until the feature is implemented; they inflate the function signature and confuse maintainers.

**Fix:** Remove `_screenInfos` and `_ctx` from the signature (and from the call site at line 331-340) until screen metadata propagation is implemented.

---

### IN-03: `_jsxElements: t.JSXElement[]` parameter to `postProcessRenderFlow` is unused

**File:** `src/adapters/expo/ExpoRouterAdapter.ts:403-411`

**Issue:** `postProcessRenderFlow` accepts `_jsxElements: t.JSXElement[]` (also with the dead-code underscore prefix) and never uses it. The parameter was presumably scaffolded for a future approach that turned out not to be needed. The JSX elements collected by `collectJsxElements` are computed, passed here, and discarded.

**Fix:** Remove the `_jsxElements` parameter from `postProcessRenderFlow` and the `jsxElements` variable from `buildComponentDefinition` (lines 361-362, 374). This eliminates the `collectJsxElements` call entirely if no other use remains.

---

### IN-04: `discoverEntries` test at line 110 has a defensive backslash check that contradicts its own assertion

**File:** `test/adapters/expo/discover.test.ts:110-113`

**Issue:**

```typescript
expect(result.some((p) => p.endsWith("/app/_layout.tsx") || p.endsWith("\\app\\_layout.tsx"))).toBe(true);
```

The test asserts forward-slash paths are returned (line 112: `!p.includes("\\")` is checked) but the `endsWith` predicate on line 110 also accepts backslash paths as valid. This is contradictory: if the function correctly returns forward-slash paths, the backslash branch in `endsWith` will never match; if it returns backslash paths, the later assertion at line 112 would fail. The backslash alternative is dead code that makes the test less precise on Windows.

**Fix:** Remove the `|| p.endsWith("\\app\\_layout.tsx")` alternative. The test already has a separate forward-slash invariant check.

```typescript
expect(result.some((p) => p.endsWith("/app/_layout.tsx"))).toBe(true);
```

---

## Summary

**2 critical issues** require changes before this code ships:

1. **CR-01** — The duplicate `@babel/types` import (both `t` and `tTypes` pointing at the same module) with a mid-file `import` statement is technically illegal in strict ESM and must be fixed by consolidating to a single top-of-file import.

2. **CR-02** — The `<Text>` RN primitive text extraction reads `node.children` (the original) instead of `processedChildren` (the recursed result), producing inconsistent results for nested content, and the join separator is missing, causing word concatenation without spaces.

**7 warnings** represent design or correctness gaps: the collected `screenInfos` are silently discarded (WR-01); `pendingWarnings` flush semantics can lose warnings across multi-call scenarios (WR-02); Windows path-separator correctness in `buildLayoutChain` depends on undocumented `tinyglobby` behavior (WR-03); `params` in `RouteMatch` is always empty even for dynamic routes (WR-04); `detect()` always returns `false` breaking auto-detection (WR-05); the dual slot visitor in `Analyzer` can produce false-positive slot injection for files where `Slot` appears as both a JSX element and a reference expression (WR-06); and the known `EXPO-SLOT-01` bug is locked into a passing snapshot rather than a failing test (WR-07).

**4 info items** flag dead parameters, unused computed values, and an internally contradictory test assertion.

---

_Reviewed: 2026-05-19T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
