---
phase: 13-rn-style-signal-extraction
reviewed: 2026-05-19T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/core/styles/rn/stylesheet-create.ts
  - src/core/styles/rn/style-prop.ts
  - src/core/styles/rn/index.ts
  - test/core/styles/rn/stylesheet-create.test.ts
  - test/core/styles/rn/style-prop.test.ts
  - test/core/styles/rn/index.test.ts
  - src/adapters/expo/ExpoRouterAdapter.ts
  - test/fixtures/expo-tabs-and-dynamic/app/(tabs)/index.tsx
  - test/adapters/expo/ExpoRouterAdapter.test.ts
findings:
  critical: 2
  warning: 6
  info: 3
  total: 11
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-05-19T00:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 13 adds React Native style signal extraction across four channels (StyleSheet.create index, inline style, NativeWind className, style-array flattening) and wires all four into `ExpoRouterAdapter`. The core utility files (`stylesheet-create.ts`, `style-prop.ts`, `index.ts`) are architecturally clean and respect the island rule. The primary issues are in `ExpoRouterAdapter.ts`, which contains two distinct and potentially redundant style-signal collection paths that overlap in logic but diverge in detail — one of them silently produces wrong keys, and both operate on the same component concurrently. Several warning-level issues relate to missing operator guards, unreachable code paths in the recursive walker, and a test assertion that silently passes on wrong data shapes.

---

## Critical Issues

### CR-01: `flattenStyleArray` looks up `varName` from `memberEl.object.name` but ignores the property name — keys are always the full StyleSheet var's key list, not just the accessed key

**File:** `src/core/styles/rn/index.ts:63-76`

**Issue:** When a `style` array contains `styles.card`, the code resolves `memberEl.object.name` → `"styles"`, fetches `fileStyleIndex.get("styles")` → `["card", "bold"]`, and emits **all** keys for that stylesheet variable (`card` AND `bold`). The `memberEl.property.name` (the accessed key, `"card"`) is read to satisfy the `t.isIdentifier(memberEl.property)` guard but is never used to filter the returned keys.

This is **semantically incorrect**: `style={[styles.card]}` should yield only the keys defined inside `styles.card` (i.e. `padding`), not all keys registered under `styles`. With the current implementation, every access to any key in a stylesheet emits the complete key set of the entire stylesheet, conflating unrelated style keys.

Note that `parseStyleSheetCreate` stores top-level variable names (`styles.card`, `styles.bold`) as the *keys* of the Map (under the variable name `"styles"`), not individual property paths. The intended design therefore maps `styles.card → ["padding"]` or alternatively `styles → ["card", "bold"]` as key names (i.e. treating StyleSheet keys as the signals). The latter interpretation is what the test in `index.test.ts:39-46` exercises (it expects `["card", "bold"]` for `[styles.card]`), so the test is written to match the implementation bug rather than correct semantics — both test and implementation agree on wrong behavior.

If the design intent is truly "emit the StyleSheet key names as className signals" (and not "emit the CSS properties inside each key"), then `memberEl.property.name` is the only key that should be emitted, not all keys in the map entry. The current behavior emits *all* StyleSheet keys whenever *any* key is referenced.

**Fix:**
```typescript
// Current (wrong): emits ALL keys for the stylesheet var
const indexKeys = fileStyleIndex.get(varName);
if (indexKeys) {
  keys.push(...indexKeys);
}

// Correct option A: emit only the accessed key name (the property being accessed)
const accessedKey = memberEl.property.name;
const indexKeys = fileStyleIndex.get(varName);
if (indexKeys) {
  // Verify the key actually exists in this stylesheet before emitting
  if (indexKeys.includes(accessedKey)) {
    keys.push(accessedKey);
  } else {
    warnings.push(`StyleSheet key '${accessedKey}' not found in var '${varName}' at ${file}`);
  }
} else {
  warnings.push(`StyleSheet var '${varName}' not found in index at ${file}`);
}
```

The same duplicate logic in `resolveStyleExpressionKeys` in `ExpoRouterAdapter.ts` (lines 693-704) has the identical bug and requires the same fix.

---

### CR-02: Two separate style-signal collection paths operate in parallel on every RN primitive, producing duplicated entries in `classNames`

**File:** `src/adapters/expo/ExpoRouterAdapter.ts:385-401` and `src/adapters/expo/ExpoRouterAdapter.ts:728-814`

**Issue:** `buildComponentDefinition` calls **both** `collectRNPrimitiveStyles` (lines 391-401) **and** `postProcessRenderFlow` → `visitRenderNode` (line 386) on the same component body. Both paths independently process every RN primitive JSX element and emit style signals:

- `collectRNPrimitiveStyles` pushes into `accumulatedClassNames` (the `ComponentDefinition.classNames` field).
- `visitRenderNode` injects synthetic `className` attributes onto `RenderNode` objects (which are later scraped by `scrapeStyleAttributes`).

The net effect is that style signals for NativeWind classNames and style-array keys are collected **twice** for each RN primitive: once into `ComponentDefinition.classNames` directly, and once via synthetic render-node attributes that are again extracted downstream. The fixture test at `ExpoRouterAdapter.test.ts:647-655` asserts that `classNameValues` contains `"card"` and `"bold"`, which passes because `collectRNPrimitiveStyles` fills `accumulatedClassNames`, but does not verify that duplicates are absent.

The `postProcessRenderFlow` path also calls `resolveStyleExpressionKeys` (line 746) which re-parses the attribute's source string using `parseExpression` — duplicating logic already handled via the pre-built `fileStyleIndex`. If this is intentional architecture (AST path for `collectRNPrimitiveStyles`, render-node path for `visitRenderNode`), it needs to be documented and de-duplicated at output time. Currently neither path guards against double-emission.

**Fix:** Decide on a single authoritative style-signal collection path and remove or disable the other. If the render-node injection approach (synthetic `className` attributes) is the chosen path (for Analyzer compatibility), then `accumulatedClassNames` should not also be populated by `collectRNPrimitiveStyles`. If `accumulatedClassNames` is authoritative, then `visitRenderNode` should not inject synthetic `className` attributes for the same signals.

At minimum, add deduplication before returning from `buildComponentDefinition`:
```typescript
// Deduplicate className tokens by value+file+line
const seen = new Set<string>();
const deduped = accumulatedClassNames.filter((t) => {
  const key = `${t.kind}:${t.value}:${t.file}:${t.line}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
```

---

## Warnings

### WR-01: `LogicalExpression` handler in `flattenStyleArray` does not restrict the operator — `||` and `??` are treated identically to `&&`

**File:** `src/core/styles/rn/index.ts:56-60`

**Issue:** The guard `t.isLogicalExpression(el) && t.isMemberExpression(el.right)` accepts any logical operator (`&&`, `||`, `??`). The docstring and tests only mention `&&` and `||`, but `??` (nullish coalescing) is also a `LogicalExpression` in Babel's AST. More importantly, for `||` and `??`, the right operand is a *fallback* that only executes when the left is falsy/nullish, so including its keys unconditionally is a reasonable approximation — but this is not documented. For `&&`, the right side is conditional on the left. The current code silently treats all three the same. A future maintainer adding explicit operator docs will have no warning that `??` is already handled.

**Fix:** Add an explicit operator check and comment:
```typescript
const memberEl = t.isMemberExpression(el)
  ? el
  : t.isLogicalExpression(el) &&
    (el.operator === "&&" || el.operator === "||" || el.operator === "??") &&
    t.isMemberExpression(el.right)
    ? el.right
    : null;
```

---

### WR-02: `collectRNPrimitiveStyles` does not recurse into `ExpressionStatement`, `VariableDeclaration`, `IfStatement`, or most statement types — RN primitives inside `if` branches are silently skipped

**File:** `src/adapters/expo/ExpoRouterAdapter.ts:540-635`

**Issue:** The recursive walker handles `BlockStatement` by iterating `node.body` statements and recursing into each. However, when it hits an `ExpressionStatement` or `IfStatement` (an `if/else` branch in a component body), there is no handler — the function falls through to the implicit no-op at the end of the function. For example:

```tsx
export default function Comp() {
  if (Platform.OS === "ios") {
    return <View style={styles.ios} />;
  }
  return <View style={styles.android} />;
}
```

The `if` branch's `BlockStatement` is a `consequent` of an `IfStatement`. The walker sees the `IfStatement` (it is a statement in the `BlockStatement`'s `body`), does not match any branch, and returns without recursing into `node.consequent` or `node.alternate`. The `ReturnStatement` inside the `if`'s block is therefore never visited.

The `ConditionalExpression` handler at line 598 handles ternary expressions in *expressions*, but JSX components commonly use full `if` statements to conditional-render RN primitives.

**Fix:** Add an `IfStatement` handler and handlers for common statement wrappers:
```typescript
if (t.isIfStatement(node)) {
  collectRNPrimitiveStyles(node.consequent, ...rest);
  collectRNPrimitiveStyles(node.alternate ?? null, ...rest);
  return;
}
if (t.isExpressionStatement(node)) {
  collectRNPrimitiveStyles(node.expression, ...rest);
  return;
}
```

---

### WR-03: `extractNativeWindClassNames` platform-variant regex strips prefix but leaves a space artifact when the variant is mid-string

**File:** `src/core/styles/rn/style-prop.ts:49-51`

**Issue:** The regex `/(ios|android|web|native):/g` strips the prefix label and colon but not the class name that follows. The replacement produces an empty string in place of `"ios:"`, leaving the *class name itself* intact. However, the replacement does not remove trailing/leading spaces around the deleted variant label in some inputs. Specifically for `"ios:p-4"`, the result is `"p-4"` (correct). For `"ios:p-4 android:p-2"`, the replacement of `"ios:"` and `"android:"` produces `"p-4 p-2"` (correct). But for a pathological input like `"  ios:p-4  "`, `stripped.trim()` handles it.

The deeper issue: the regex replaces *only the variant prefix* (`ios:`), not the entire variant+class token pair. If a user writes `"ios:hover:text-blue"` (NativeWind nested variant), the result is `"hover:text-blue"` — the `hover:` remnant is not a CSS class but will be emitted as a className token. This is an edge case but produces silent incorrect output.

**Fix:** The regex should match the full variant-prefixed token and replace it with just the class part:
```typescript
const PLATFORM_VARIANT_RE = /(?:ios|android|web|native):(\S+)/g;
const stripped = val.value.replace(PLATFORM_VARIANT_RE, "$1");
```
This correctly handles nested variants: `"ios:hover:text-blue"` → `"hover:text-blue"` (still a NativeWind variant, handled downstream). If the intent is to strip only one level of platform prefix, the current approach is acceptable but should be documented.

---

### WR-04: `visitRenderNode` re-parses the style attribute source string via `parseExpression` at runtime for every node — this duplicates the pre-built `fileStyleIndex` and can fail silently

**File:** `src/adapters/expo/ExpoRouterAdapter.ts:665-711`

**Issue:** `resolveStyleExpressionKeys` calls `parseExpression(expressionSource, ...)` inside a try/catch (line 673). The `expressionSource` comes from `attr.value.source` — a source-slice of the original style attribute. This re-parse:

1. Duplicates AST work already done by `parseStyleSheetCreate` and `flattenStyleArray`.
2. Can silently fail (the catch block discards errors on line 708) when the source slice is syntactically incomplete (e.g., if `attr.value.source` is `"[styles.card, active && styles.bold]"` and position offsets are slightly off due to the wrapping JSX).
3. Bypasses the already-validated `fileStyleIndex` built at parse time, causing the `fileStyleIndex` and `resolveStyleExpressionKeys` results to diverge if the index was extended by one-hop import resolution (lines 240-264 in `extractComponents`).

Specifically: one-hop imports populate `fileStyleIndex` with additional keys resolved from imported files. `resolveStyleExpressionKeys` uses the same `fileStyleIndex` parameter, so it will correctly find those keys — but only if the `varName` in the re-parsed expression matches the local alias in `fileStyleIndex`. If the import is `import { theme } from "./theme"` and `fileStyleIndex.set("theme", [...])` was populated by the one-hop resolver, then `resolveStyleExpressionKeys` will correctly use it. However, if `parseExpression` fails silently, the style signal for this element is entirely lost.

**Fix:** Remove `resolveStyleExpressionKeys` and instead use the already-parsed AST node (available as `styleAttr.value` in `visitRenderNode` context). The render-node approach does not have the original AST — this is a structural limitation of operating on `RenderNode` (not the raw AST). The correct fix is to pass style signals from the AST-level pass (`collectRNPrimitiveStyles`) rather than re-parsing render-node attribute strings.

---

### WR-05: One-hop StyleSheet import resolution in `extractComponents` matches on `localName` but `collectImportBindings` returns the local *component* binding map — StyleSheet variable names are not component names and may shadow or be missing

**File:** `src/adapters/expo/ExpoRouterAdapter.ts:240-264`

**Issue:** The one-hop resolution loop at line 240 iterates `bindings` (returned by `collectImportBindings`) and checks `if (fileStyleIndex.has(localName)) continue`. The intent is: if a local name is already in the StyleSheet index (i.e., it's a locally-defined StyleSheet var), skip import resolution for it. However, `bindings` is the *JSX import bindings* map (component names and their sources), not a StyleSheet variable map.

A StyleSheet variable `const styles = StyleSheet.create(...)` is not an import binding — it's a `VariableDeclaration`. So `bindings` will contain entries like `{ "View": {source: "react-native"}, "Text": ... }` but never `{ "styles": ... }`. The loop will iterate all component import bindings looking for StyleSheet variables, which will always produce a mismatch. The `fileStyleIndex.has(localName)` guard will rarely fire (only if someone names a component `"styles"`, which is extremely unlikely), and the `binding.source.startsWith(".")` check will filter most non-relative imports — but the semantic intent (detect which imports are stylesheet exports) is not correctly implemented.

**Fix:** Either (a) use a separate pass specifically looking for import specifiers that match known StyleSheet variable names by cross-referencing `fileStyleIndex.keys()` against import declarations in the AST, or (b) collect StyleSheet-related imports with a distinct traversal that looks for `import { myTheme } from "./theme"` where `myTheme` appears as a variable referenced in `StyleSheet.create` call sites.

---

### WR-06: `postProcessRenderFlow` returns a synthetic error node when passed `null` — but its callers always pass the result of `walkRenderFlow` which may legitimately return an error node, masking the original error

**File:** `src/adapters/expo/ExpoRouterAdapter.ts:651-656`

**Issue:** `postProcessRenderFlow` guards `if (!node) return { kind: "error", message: "null render flow", ... }`. The function is called at line 386 with `renderFlow` as the argument. `renderFlow` is itself the result of `walkRenderFlow(comp.body, source, file)`. If `walkRenderFlow` returns `null` (possible when component body is unrecognized), the synthetic error node replaces it with the generic message `"null render flow"` — discarding any error details from `walkRenderFlow`.

In practice, `walkRenderFlow` likely always returns a non-null `RenderNode`, but if the return type is `RenderNode | null`, this silent replacement is a correctness concern for debugging. The original error information from `walkRenderFlow` is lost.

**Fix:**
```typescript
function postProcessRenderFlow(
  node: RenderNode | null,
  ...
): RenderNode {
  if (!node) {
    // walkRenderFlow returned null — surface this as an explicit error
    return { kind: "error", message: "walkRenderFlow returned null", file, line: 0 };
  }
  return visitRenderNode(node, bindings, fileStyleIndex, warnings);
}
```
The `file` context should be threaded through to produce a useful error. Currently the returned error node has `file: ""` and `line: 0`, which is not actionable.

---

## Info

### IN-01: `screenInfos` is populated but never used — dead code with acknowledged SPEC gap

**File:** `src/adapters/expo/ExpoRouterAdapter.ts:287-335`

**Issue:** The `screenInfos: ScreenInfo[]` array is populated by the `JSXElement` traversal at lines 288-335, but is never read after `components` are built (line 338). The comment at line 340 says "screenInfos propagation into ComponentDefinition is deferred." This is acknowledged dead code. However, the traversal runs on every file for every call to `extractComponents`, adding parse overhead with no output.

**Fix:** Either remove the traversal entirely and restore it when the deferred phase lands, or gate it behind a flag. If keeping it, the `ScreenInfo` interface and `screenInfos` variable accumulation are wasted allocation on every parse cycle.

---

### IN-02: `_ImportBindingRef` type alias in `rn-primitives.ts` is a workaround for `--noUnusedLocals` on a type-only import that is never actually used

**File:** `src/adapters/expo/rn-primitives.ts:19`

**Issue:** The type alias `type _ImportBindingRef = ImportBinding` exists solely to prevent the `--noUnusedLocals` lint error on the `ImportBinding` import. The comment admits this: "Explicitly reference it to satisfy --noUnusedLocals." This is a code smell — if the import has no real use, remove it. The comment says it is "kept for future type tightening (D-06)," but that is speculative.

**Fix:** Remove the import and the alias. If `ImportBinding` is needed for a future type tightening, re-add it when the concrete need arrives.

---

### IN-03: Test file uses `createRequire` to access `@babel/parser` instead of a top-level ESM import

**File:** `test/adapters/expo/ExpoRouterAdapter.test.ts:11,20,230,282`

**Issue:** `const require = createRequire(import.meta.url)` is used in test bodies to `require("@babel/parser")` inline (e.g., line 229: `const { parse } = require("@babel/parser")`). This bypasses the ESM module system and produces a CJS-interop load, which is exactly the pattern the project's CLAUDE.md warns against for `@babel/traverse`. For consistency and to avoid subtle CJS/ESM interop issues in test output, the parser should be imported at the top of the file as an ESM import.

**Fix:**
```typescript
// Remove createRequire usage; add at top of file:
import { parse } from "@babel/parser";
// Remove `const require = createRequire(import.meta.url)` and all inline `require("@babel/parser")` calls.
```

---

_Reviewed: 2026-05-19T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
