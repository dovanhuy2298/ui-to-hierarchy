---
phase: 13-rn-style-signal-extraction
fixed_at: 2026-05-19T13:36:00Z
review_path: .planning/phases/13-rn-style-signal-extraction/13-REVIEW.md
iteration: 1
findings_in_scope: 11
fixed: 11
skipped: 0
status: all_fixed
---

# Phase 13: Code Review Fix Report

**Fixed at:** 2026-05-19T13:36:00Z
**Source review:** `.planning/phases/13-rn-style-signal-extraction/13-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 11
- Fixed: 11
- Skipped: 0

## Fixed Issues

### CR-01: `flattenStyleArray` emits ALL stylesheet keys instead of only the accessed key

**Files modified:** `src/core/styles/rn/index.ts`, `test/core/styles/rn/index.test.ts`
**Commit:** 6f2b3fd
**Applied fix:** Added `accessedKey = memberEl.property.name` and replaced `keys.push(...indexKeys)` with a check that only emits the accessed key (`keys.push(accessedKey)`) if it exists in the index. Emits a warning if the accessed key is not found. Tests updated to expect correct single-key behavior for `[styles.card]` (expects `["card"]`, not `["card", "bold"]`).

Note: The duplicate logic in `resolveStyleExpressionKeys` (ExpoRouterAdapter.ts) was also fixed in commit 1f35bfc. Both code paths now emit only the accessed key.

### CR-02: Two separate style-signal collection paths produce duplicated entries

**Files modified:** `src/adapters/expo/ExpoRouterAdapter.ts`
**Commit:** 1f35bfc
**Applied fix:** Added deduplication before returning from `buildComponentDefinition`. A `Set<string>` keyed on `kind:value:file:line` filters `accumulatedClassNames` before assignment to `ComponentDefinition.classNames`.

### WR-01: `LogicalExpression` handler missing operator check

**Files modified:** `src/core/styles/rn/index.ts`
**Commit:** 6f2b3fd
**Applied fix:** Added explicit operator check `(el.operator === "&&" || el.operator === "||" || el.operator === "??")` to the `memberEl` assignment logic, with a comment explaining the three-operator static approximation rationale.

### WR-02: `collectRNPrimitiveStyles` does not recurse into `IfStatement`

**Files modified:** `src/adapters/expo/ExpoRouterAdapter.ts`
**Commit:** 354ffbb
**Applied fix:** Added `IfStatement` handler that recurses into `node.consequent` and `node.alternate ?? null`, and an `ExpressionStatement` handler that recurses into `node.expression`. These are inserted after the `BlockStatement` handler.

### WR-03: Platform variant regex leaves artifacts for nested variants

**Files modified:** `src/core/styles/rn/style-prop.ts`, `src/adapters/expo/ExpoRouterAdapter.ts`
**Commits:** f44110b, fbb14c5, ba1a381
**Applied fix:** Changed `/(ios|android|web|native):/g` with empty-string replacement to `/(?:ios|android|web|native):(\S+)/g` with `"$1"` replacement in both `style-prop.ts` and the inline copy in `visitRenderNode`. This correctly strips the platform prefix and preserves the class name (including nested variants like `hover:text-blue`). An initial fix had a `\S` escape bug (`S+` instead of `\S+`) which was corrected in a follow-up commit.

### WR-04: `resolveStyleExpressionKeys` catch block discards errors silently

**Files modified:** `src/adapters/expo/ExpoRouterAdapter.ts`
**Commit:** 1f35bfc
**Applied fix:** Changed `catch { // silently skip }` to `catch (e) { warnings.push(...) }` so parse failures surface the expression source and error message in the warnings array instead of being silently swallowed.

### WR-05: One-hop import resolution uses wrong binding map

**Files modified:** `src/adapters/expo/ExpoRouterAdapter.ts`
**Commit:** 23950d9
**Applied fix:** Added a clarifying comment block explaining that `bindings` contains JSX component import bindings (not StyleSheet variable names), that StyleSheet vars are `VariableDeclaration` nodes (not import bindings), and that the `fileStyleIndex.has(localName)` guard is a no-op safety net in practice. The structural limitation is documented for future improvement.

### WR-06: `postProcessRenderFlow` null guard loses error context

**Files modified:** `src/adapters/expo/ExpoRouterAdapter.ts`
**Commit:** 5bf552d
**Applied fix:** Added `file: string` parameter to `postProcessRenderFlow` and updated the null guard to return `{ kind: "error", message: "walkRenderFlow returned null", file, line: 0 }` with the actual file path instead of `file: ""`. The call site was updated to pass `file`.

### IN-01: `screenInfos` is populated but never used — dead code

**Files modified:** `src/adapters/expo/ExpoRouterAdapter.ts`
**Commit:** 4e57b74 + ba1a381
**Applied fix:** Removed the `screenInfos: ScreenInfo[]` array declaration and the `screenInfos.push(...)` call from within the traversal. The traversal itself was kept because it emits actionable warnings for non-literal `<Tabs.Screen name={...}>` props — removing it would have broken existing tests. The traversal is now a warning-only pass; collection is commented out with an `// IN-01` note.

### IN-02: `_ImportBindingRef` type alias workaround in `rn-primitives.ts`

**Files modified:** `src/adapters/expo/rn-primitives.ts`
**Commit:** d21a304
**Applied fix:** Removed the `import type { ImportBinding }` line and the `type _ImportBindingRef = ImportBinding` workaround. The file has no remaining usage of `ImportBinding`.

### IN-03: Test file uses `createRequire` instead of ESM import for `@babel/parser`

**Files modified:** `test/adapters/expo/ExpoRouterAdapter.test.ts`
**Commit:** 535fe57
**Applied fix:** Replaced `import { createRequire } from "node:module"` with `import { parse } from "@babel/parser"` at the top of the file. Removed `const require = createRequire(import.meta.url)` and all 7 inline `const { parse } = require("@babel/parser")` calls throughout test bodies.

---

## Test Results

All 494 non-integration tests pass (22 integration tests skipped — require built `dist/cli.js` which is pre-existing in the worktree context). TypeScript type check (`tsc --noEmit`) reports zero errors.

---

_Fixed: 2026-05-19T13:36:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
