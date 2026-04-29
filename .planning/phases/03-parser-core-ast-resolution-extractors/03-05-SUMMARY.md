---
phase: 03-parser-core-ast-resolution-extractors
plan: 05
subsystem: core/render-flow
tags: [parser, render-flow, hoc, class-component, conditional-render, OUT-04, PARSE-04]
requires:
  - src/adapters/types.ts (RenderNode, JsxAttribute — Plan 03-01)
  - src/core/parser/index.ts (parseFile — Plan 03-02)
  - src/core/babel-shim.ts (traverse interop — Plan 03-01)
provides:
  - walkRenderFlow consumed by NextJsAdapter (Plan 03-06)
  - discoverComponents + unwrapHocChain consumed by NextJsAdapter (Plan 03-06)
affects:
  - tsconfig.json (excluded 3 new fixture dirs from typecheck)
tech-stack:
  added: []
  patterns:
    - Recursive WalkFn passed via parameter to break import cycle (conditionals.ts ↔ index.ts)
    - sliceSource() preserves !/!! negation prefix verbatim (no UnaryExpression special-case)
    - HOC name set + regex pair matches memo/forwardRef/observer + /^with[A-Z]/ + /HOC$/
    - ExportDefaultDeclaration visitor narrowed to wrapped-expression case to avoid duplication
key-files:
  created:
    - src/core/render-flow/conditionals.ts
    - src/core/render-flow/lists.ts
    - src/core/render-flow/index.ts
    - src/core/render-flow/component-detect.ts
    - test/core/render-flow/walkRenderFlow.test.ts
    - test/core/render-flow/component-detect.test.ts
    - test/fixtures/parser/render-flow/{ternary,logical-and,logical-or,nullish-coalesce,negation,map,nested}.tsx
    - test/fixtures/parser/hoc/{memo,forward-ref,observer,with-router,xyz-hoc}.tsx
    - test/fixtures/parser/classes/{extends-react-component,extends-pure-component,qualified}.tsx
  modified:
    - tsconfig.json
decisions:
  - "logical-or / nullish-coalesce fixtures use a JSX fallback on the right operand so walk(right) returns a non-null RenderNode (matches the OUT-04 assertion that elseBranch is not null)"
  - "Walker emits null (not error RenderNode) for unrecognized AST forms; calling code (Plan 06) decides surfacing — mitigates T-3-09"
  - "Class component's body field is the render() ClassMethod, not the class node, so walkRenderFlow can recurse into the method's BlockStatement directly"
metrics:
  duration: ~10 minutes
  completed: 2026-04-29
  tasks: 3
  files: 19
---

# Phase 03 Plan 05: Render-flow Walker + Component Discovery Summary

`walkRenderFlow` turns a Babel function/class-component body into a 7-kind `RenderNode` tree preserving conditional and list structure (OUT-04); `discoverComponents` finds every top-level component declaration and unwraps HOC chains (PARSE-04). Together they feed NextJsAdapter (Plan 06) the raw material for `ComponentDefinition[]`.

## What was built

### `src/core/render-flow/conditionals.ts`
- `walkConditional(node, source, file, walk)` — `cond ? a : b` → `branch{condition: source(test), thenBranch: walk(consequent), elseBranch: walk(alternate)}`.
- `walkLogical(node, source, file, walk)` — `&&` → then-only branch (else=null); `||` and `??` → both then and else populated. Negation prefixes (`!`, `!!`) are captured verbatim because `sliceSource` reads `node.left` directly — no UnaryExpression unwrap needed.
- `WalkFn` type exported here (single source of truth) and re-imported by index + lists.

### `src/core/render-flow/lists.ts`
- `isMapCall(node)` — narrow type guard for `<obj>.map(<fn>)`.
- `walkList(node, source, file, walk)` — emits `list{item: walk(arrowOrFnBody), iterableSource: source(callee.object)}`. Arrow expression bodies, arrow block bodies, and FunctionExpression block bodies are all supported by walking the return statement.

### `src/core/render-flow/index.ts`
- `walk: WalkFn` — main recursive walker handling all 7 RenderNode kinds plus passthrough for `ParenthesizedExpression`, `TSAsExpression`, `TSNonNullExpression`, `TSSatisfiesExpression`.
- `walkBlock` / `walkStatement` — descend into function bodies and `if-statement` → branch.
- `jsxElementToNode` — captures attributes (literal/expression/spread) + children; `isComponent = /^[A-Z]/.test(tag)`.
- `jsxFragmentToNode` — fragment with walked children.
- `walkRenderFlow(node, source, file)` — public entry; always returns a node, emits `kind: "error"` if no JSX is found.

### `src/core/render-flow/component-detect.ts`
- `HOC_NAMES = {memo, forwardRef, observer}`, `HOC_PATTERNS = [/^with[A-Z]/, /HOC$/]`.
- `unwrapHocChain(node)` — peels CallExpression layers outermost-to-innermost; returns `{wrappers: string[], inner: t.Node}`.
- `isReactComponentSuperclass(node)` — accepts `Component`, `PureComponent`, `React.Component`, `React.PureComponent`.
- `discoverComponents(ast)` — visits `FunctionDeclaration` (capitalized), `VariableDeclarator` (with HOC unwrap), `ClassDeclaration` (with React-component superclass test), and `ExportDefaultDeclaration` (only the wrapped-expression case, to avoid double-emission).
- Class component's `body` field is the `render()` ClassMethod node, so `walkRenderFlow` recurses naturally.

## Test coverage

| Suite | Cases | What it asserts |
|-------|-------|-----------------|
| `walkRenderFlow.test.ts` | 7 | ternary/`&&`/`\|\|`/`??`/negation/`.map`/nested all produce the locked branch or list shape; `!cond` condition starts with `!`; `iterableSource` contains `items` |
| `component-detect.test.ts` | 5 + 3 | All 5 HOC patterns return correct `wrappers[]` and `kind: "function"`; all 3 class fixtures return `kind: "class"`, `wrappers: []` |

All 15 tests pass (`npx vitest run test/core/render-flow/`).

## Verification results

- `npx tsc --noEmit` — exits 0
- `npx biome check src/core/render-flow/ test/core/render-flow/` — exits 0
- `npx vitest run test/core/render-flow/` — 2 files / 15 tests, all pass
- Architecture island test (ARCH-01) — still passing; type-only imports erase the runtime edge from `src/core/render-flow/` to `src/adapters/types`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Logical-or / nullish-coalesce fixtures had no JSX fallback**
- **Found during:** Task 3 vitest run
- **Issue:** Plan-provided fixtures used `<div>{a || b}</div>` with both operands as identifiers. Walker correctly returns null when neither operand contains JSX, so the test's `expect(elseBranch).not.toBeNull()` failed. The walker is correct — the fixture didn't exercise the asserted shape.
- **Fix:** Updated both fixtures to use a JSX literal on the right operand (`<div>{a || <span>fallback</span>}</div>`). The fix is to the test fixture, not the production code.
- **Files modified:** `test/fixtures/parser/render-flow/logical-or.tsx`, `test/fixtures/parser/render-flow/nullish-coalesce.tsx`
- **Commit:** rolled into task 3 commit `2016cb8`

**2. [Rule 3 - Blocking] tsconfig did not exclude new fixture dirs**
- **Found during:** Task 3 typecheck
- **Issue:** Fixture `.tsx` files trigger `TS17004: Cannot use JSX unless --jsx flag is provided` because tsconfig has no `jsx` compiler option (we never compile JSX — we feed it to Babel). `tsconfig.json` already excluded `test/fixtures/parser/parse-errors/**` for the same reason.
- **Fix:** Added the three new fixture dirs (`render-flow`, `hoc`, `classes`) to tsconfig's exclude list.
- **Files modified:** `tsconfig.json`
- **Commit:** rolled into task 3 commit `2016cb8`

## Self-Check: PASSED

Files created — verified on disk:
- FOUND: `src/core/render-flow/conditionals.ts`
- FOUND: `src/core/render-flow/lists.ts`
- FOUND: `src/core/render-flow/index.ts`
- FOUND: `src/core/render-flow/component-detect.ts`
- FOUND: `test/core/render-flow/walkRenderFlow.test.ts`
- FOUND: `test/core/render-flow/component-detect.test.ts`
- FOUND: 7 render-flow + 5 HOC + 3 class fixture files

Commits — verified in `git log`:
- FOUND: `9790ed5` — Task 1 (conditionals + lists)
- FOUND: `5eeec22` — Task 2 (walkRenderFlow + component-detect)
- FOUND: `2016cb8` — Task 3 (fixtures + tests + tsconfig exclude)
