---
phase: 13-rn-style-signal-extraction
plan: "02"
subsystem: core/styles/rn
tags:
  - phase-13
  - wave-1
  - rn-styles
  - ast
dependency_graph:
  requires:
    - 13-01
  provides:
    - parseStyleSheetCreate (RN-04, RN-08)
    - extractRNInlineStyle (RN-05)
    - extractNativeWindClassNames (RN-07)
    - flattenStyleArray (RN-06)
  affects:
    - 13-03 (Wave 2: ExpoRouterAdapter wiring)
tech_stack:
  added: []
  patterns:
    - Babel AST CallExpression traversal with parentPath varName resolution
    - JSX attribute find + StringLiteral/JSXExpressionContainer branch guard (Pitfall 5)
    - Null-first sparse-hole guard in ArrayExpression iteration (Pitfall 4)
    - warnings: string[] parameter pattern (island-safe, no ctx import)
key_files:
  created: []
  modified:
    - src/core/styles/rn/stylesheet-create.ts
    - src/core/styles/rn/style-prop.ts
    - src/core/styles/rn/index.ts
    - test/core/styles/rn/stylesheet-create.test.ts
    - test/core/styles/rn/style-prop.test.ts
    - test/core/styles/rn/index.test.ts
decisions:
  - "parseStyleSheetCreate: computed-key entries produce empty keys[] (no per-key warning) — keeps noise low per SPEC"
  - "extractNativeWindClassNames: JSXExpressionContainer with non-tagged expr returns [] silently — deferred to v1.3"
  - "flattenStyleArray: varName resolves to full key-union, not per-property lookup — v1.2 explicit simplification"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-19"
  tasks_completed: 3
  files_changed: 6
---

# Phase 13 Plan 02: Wave 1 — RN Style Utility Modules Summary

**One-liner:** Implemented three pure AST→data core utilities for React Native style extraction: StyleSheet.create indexing, NativeWind className tokenization, and style-array key-union flattening — with 21 unit tests covering all 9 required shape cases.

## What Was Built

### parseStyleSheetCreate (RN-04, RN-08)
Full implementation in `src/core/styles/rn/stylesheet-create.ts`:
- Traverses Babel AST for `StyleSheet.create({...})` CallExpression nodes
- Resolves varName via `path.parentPath?.node` (guarded by `t.isVariableDeclarator`)
- Extracts literal object keys (Identifier + StringLiteral); skips computed keys silently
- RN-08 graceful degrade: non-ObjectExpression arg → pushes warning + skips entry
- Returns empty Map for files with no matching calls

### extractRNInlineStyle (RN-05)
Single-line delegation to `extractInlineStyle(jsxElement, source)` — no reimplementation.

### extractNativeWindClassNames (RN-07)
Full implementation in `src/core/styles/rn/style-prop.ts`:
- Finds `className` JSXAttribute; branches on val type FIRST (Pitfall 5)
- StringLiteral: strips `/(ios|android|web|native):/g`, trims, splits on whitespace, filters empty
- JSXExpressionContainer + TaggedTemplateExpression: pushes warning, returns []
- Other expressions: returns [] silently

### flattenStyleArray (RN-06)
Full implementation in `src/core/styles/rn/index.ts`:
- Guards `null` sparse holes FIRST (Pitfall 4) before any `t.is*` calls
- 9-case shape matrix: MemberExpression, LogicalExpression &&/||, StringLiteral, null, BooleanLiteral, nested ArrayExpression (warn), CallExpression (warn), unknown varName (warn)

## Test Results

| File | Tests | Passing | Failing | Todo |
|------|-------|---------|---------|------|
| stylesheet-create.test.ts | 5 | 5 | 0 | 0 |
| style-prop.test.ts | 7 | 7 | 0 | 0 |
| index.test.ts | 9 | 9 | 0 | 0 |
| **Total new** | **21** | **21** | **0** | **0** |

Full suite: 515 passing, 6 failing (pre-existing `select.test.ts` failures unrelated to this plan — confirmed by running suite before and after changes).

## Commits

| Hash | Message |
|------|---------|
| 8e31c57 | feat(phase-13): Wave 1 — implement RN style utility modules |

## Deviations from Plan

None — plan executed exactly as written. All behavior specifications matched the RESEARCH patterns. No new packages installed. Island rule preserved.

## Island Rule Verification

`grep -rE '(adapters/|src/adapters)' src/core/styles/rn/` returns empty — zero adapter imports in the three core files. `test/architecture/island.test.ts` passes.

## Known Stubs

None. All three Wave 0 stub functions have been fully implemented. No placeholder returns remain.

## Wave 2 Readiness

Wave 2 (Plan 03) can wire these utilities into `ExpoRouterAdapter` without further core changes. The three functions accept pre-parsed Babel ASTs and `warnings: string[]` parameters — no filesystem access, no adapter imports. The ExpoRouterAdapter only needs to:

1. Call `parseStyleSheetCreate(ast, source, ctx.warnings, fwdFile)` per file to build `fileStyleIndex`
2. Call `flattenStyleArray(styleArrayNode, fileStyleIndex, source, ctx.warnings, fwdFile)` per component with `style={[...]}` props
3. Call `extractRNInlineStyle(jsxElement, source)` for `style={{...}}` props
4. Call `extractNativeWindClassNames(jsxElement, ctx.warnings, fwdFile, line)` for `className` props
5. For one-hop imports: resolve binding → parseFile → parseStyleSheetCreate on target AST

All signatures are locked and unit-tested. No core changes expected in Wave 2.

## Self-Check: PASSED

- src/core/styles/rn/stylesheet-create.ts — exists, implements traversal with StyleSheet/parentPath/isObjectExpression
- src/core/styles/rn/style-prop.ts — exists, implements ios|android|web|native regex + TaggedTemplateExpression branch
- src/core/styles/rn/index.ts — exists, implements ArrayExpression loop with el===null first guard
- test/core/styles/rn/stylesheet-create.test.ts — 5 passing tests
- test/core/styles/rn/style-prop.test.ts — 7 passing tests
- test/core/styles/rn/index.test.ts — 9 passing tests
- Commit 8e31c57 — verified in git log
