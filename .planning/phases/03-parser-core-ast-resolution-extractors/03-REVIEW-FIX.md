---
phase: 03-parser-core-ast-resolution-extractors
fixed_at: 2026-04-29T06:30:00Z
review_path: .planning/phases/03-parser-core-ast-resolution-extractors/03-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 03: Code Review Fix Report

**Fixed at:** 2026-04-29T06:30:00Z
**Source review:** .planning/phases/03-parser-core-ast-resolution-extractors/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (all Warnings; 4 Info findings excluded by `critical_warning` scope)
- Fixed: 5
- Skipped: 0

## Fixed Issues

### WR-01: `clsx`/`cn` object-expression with `false` value emits spurious raw token

**Files modified:** `src/core/extractors/tailwind/resolve-args.ts`
**Commit:** e3d197e
**Applied fix:** Inside the `ObjectExpression` branch of `walk`, treat `BooleanLiteral` keys uniformly: `true` emits literal token(s), `false` is dropped entirely. Both cases now `continue` past the raw-slice catch-all so `cn({ foo: false })` no longer leaks a spurious `{ kind: "raw", source: "foo: false" }` token. Matches clsx/cn semantics where falsy values suppress the class.

### WR-02: Resolver does not handle bare named re-export of imported binding

**Files modified:** `src/core/resolver/index.ts`
**Commit:** 9443fdb
**Applied fix:** In `doResolve`, the AST traversal now also collects `ImportDeclaration` specifiers (mapping local name → import source) and inspects bare `ExportNamedDeclaration` nodes (`source === null`). When a bare `export { Foo }` is detected and `Foo` corresponds to an imported binding, `doResolve` recurses into the original import source via `resolveSpecifierToFile` + `chaseBarrel` (carrying the local-import name). This handles the common pattern:
```ts
import { Foo } from "./internal/foo";
export { Foo };
```
The single-pass traversal collects imports and exports together; declaration-then-export is the conventional ES module order, so by the time the bare export visitor fires, the import map is populated. `chaseBarrel` continues to handle `export { ... } from "..."` (re-export-from) and `export *` forms unchanged.

### WR-03: Inline-style spread-key collision when `start` offsets are absent

**Files modified:** `src/core/extractors/inline-style.ts`
**Commit:** 3bd5d3d
**Applied fix:** Replaced byte-offset key (`__spread_${prop.start ?? 0}`) with a monotonic counter (`__spread_${spreadIdx++}`) scoped to a single element. Two spreads on the same JSX element now get distinct keys (`__spread_0`, `__spread_1`) regardless of whether `prop.start` is populated, eliminating the silent overwrite when AST positions are absent.

### WR-04: Multiple JSX elements' inline styles overwrite each other in `collectStyleSignals`

**Files modified:** `src/adapters/types.ts`
**Commit:** cc50765
**Applied fix:** Applied option (a) — the minimum viable fix from the review. Added a JSDoc block on `ComponentDefinition.inlineStyles` documenting:
- Last-wins merge semantics across elements within a component
- Why the limitation exists (R8 locked 11-field shape)
- Spread-key (`__spread_<n>`) and `__raw__` conventions
- Explicit warning to consumers: do not assume the map represents a single element's styles
The `Object.assign` collision in `collectStyleSignals` is left intact — the contract change required for option (b) (per-element scoping) would touch the locked R8 shape.

### WR-05: `walkBlock` only honors the FIRST top-level `return`/`if` and ignores variable bindings

**Files modified:** `src/core/render-flow/index.ts`
**Commit:** 56bba47
**Applied fix:** Added a JSDoc block above `walkBlock` enumerating the three v1 limitations:
1. No symbolic-binding inlining — local `const`/`let` JSX bindings are not substituted.
2. First top-level `if`/`return` wins — trailing statements are discarded.
3. Only `if`/`else` early-return is recognized as a branching pattern.
Note that resolving these requires a local-binding map and statement-flow analysis, deferred to v2. Documentation-only fix per the review's recommendation.

---

_Fixed: 2026-04-29T06:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
