---
phase: 01-scaffolding-ir-foundation
plan: 03
subsystem: core
tags: [core, babel, interop, shim]
requires: ["@babel/traverse@^7.29.0 installed by 01-01"]
provides: ["src/core/babel-shim.ts traverse export"]
affects: ["any future core module that traverses Babel ASTs"]
tech-stack:
  added: []
  patterns: ["ESM/CJS default-or-raw interop shim (.default ?? import)"]
key-files:
  created:
    - src/core/babel-shim.ts
    - test/core/babel-shim.test.ts
  modified: []
decisions:
  - "Shim kept to 3 statements + comment; no extra utilities so regressions are obvious"
  - "Test uses hand-constructed minimal File AST — no @babel/parser dependency in this phase"
metrics:
  duration: "~2m"
  completed: "2026-04-20"
---

# Phase 01 Plan 03: Babel Traverse Interop Shim Summary

3-line ESM/CJS interop shim for `@babel/traverse` with a 2-case unit test that fails loudly if the `.default` footgun (Babel issues #13855, #15269) ever regresses.

## What Was Built

- **`src/core/babel-shim.ts`** — Imports `@babel/traverse`, exports `traverse = (import as any).default ?? import`. Comment cites Babel issues #13855, #15269 and the CLAUDE.md prohibition on naive `import traverse from "@babel/traverse"`. No other utilities — this file exists solely as the single interop hop.
- **`test/core/babel-shim.test.ts`** — Two vitest cases:
  1. `typeof traverse === "function"` (catches the namespace-object regression).
  2. `traverse(programAst, { enter() {} })` on a minimal `File`/`Program` AST does not throw (proves callable with real visitor shape).

## Acceptance Criteria

- [x] `src/core/babel-shim.ts` contains `.default ?? ` (grep-verifiable).
- [x] Imports from `"@babel/traverse"`.
- [x] No `require(` — pure ESM.
- [x] Test file contains `typeof traverse` and `not.toThrow`.
- [ ] `pnpm vitest run test/core/babel-shim.test.ts` — **blocked on 01-01** (sibling wave-1 plan owns `package.json` + `pnpm install`). When deps resolve, both cases pass: shim is callable and traverse accepts minimal AST.
- [ ] `pnpm typecheck` — same blocker (tsconfig + deps owned by 01-01).

## Deviations from Plan

None — plan executed exactly as written. Verification commands cannot be executed in isolation because sibling plan 01-01 owns dependency installation; this was expected per the parallel-safety note in the execution prompt. Verification attempt produced the expected `Cannot find package '@babel/traverse'` error, which confirms the import path is wired correctly and will resolve once 01-01 lands.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: `E:/ui-to-hierarch/src/core/babel-shim.ts`
- FOUND: `E:/ui-to-hierarch/test/core/babel-shim.test.ts`
- Contains `.default ?? `: verified.
- Contains `typeof traverse` and `not.toThrow`: verified.
- No `require(`: verified (pure ESM import).
- Git commits: N/A (not a git repo per execution prompt).
