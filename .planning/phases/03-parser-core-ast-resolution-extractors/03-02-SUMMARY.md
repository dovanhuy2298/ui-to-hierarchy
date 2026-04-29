---
phase: 03-parser-core-ast-resolution-extractors
plan: 02
subsystem: parser
tags: [parser, babel, ast, cache, parse-error]
requires:
  - "src/adapters/types.ts (Plan 03-01) — ParseContext, ParseResult contracts"
  - "src/core/paths.ts — toForwardSlash for D-07 cache key normalization"
provides:
  - "src/core/parser/index.ts#parseFile — Babel parse primitive with per-call AST cache"
  - "src/core/parser/plugins.ts#PARSER_PLUGINS — locked 10-plugin set (PARSE-01)"
affects:
  - "Wave 2 plans (resolver, render-flow, extractors) consume parseFile"
  - "Wave 3 NextJsAdapter calls parseFile via ctx.astCache"
tech-stack:
  added: []
  patterns:
    - "Pure function over ParseContext — no module-level state (D-01)"
    - "ParseResult discriminated union — never throws (D-12 for resolver, same shape here)"
    - "Forward-slash absolute path as cache key (D-07)"
    - "errorRecovery: true with warning emission for non-fatal parse errors"
key-files:
  created:
    - "src/core/parser/index.ts"
    - "src/core/parser/plugins.ts"
    - "src/adapters/types.ts (mirror of Plan 03-01 spec for parallel-worktree compile)"
    - "test/core/parser/parseFile.test.ts"
    - "test/fixtures/parser/parse-errors/syntax-error.tsx"
    - "test/fixtures/parser/parse-errors/recoverable.tsx"
    - "test/fixtures/parser/parse-errors/valid-baseline.tsx"
  modified:
    - "tsconfig.json (exclude broken-on-purpose parse-error fixtures)"
decisions:
  - "Used biome-ignore for type-only adapters import: import type is erased at compile time so the D-11 runtime island invariant is preserved while satisfying biome v2's noRestrictedImports (which applies to type-only imports too, contradicting plan assumption)"
  - "Excluded test/fixtures/parser/parse-errors/** from tsconfig — these files contain intentional syntax errors and would otherwise fail tsc --noEmit"
  - "Mirrored src/adapters/types.ts from Plan 03-01 spec into this worktree (byte-identical) so Plan 03-02 compiles in isolation; orchestrator merge with Plan 03-01's authoritative copy is conflict-free"
  - "Used ReturnType<typeof parse> instead of @babel/types#File for the local `ast` var so the augmented `errors` field on Babel's ParseResult is visible to TypeScript"
metrics:
  completed: "2026-04-29"
  duration: "~25 minutes"
  tasks: 2
  files: 7
---

# Phase 03 Plan 02: parseFile primitive (PARSE-01) Summary

Babel parse primitive (`parseFile`) with locked 10-plugin set, errorRecovery, and per-call AST cache (D-02). Wave 2 modules (resolver, render-flow, extractors) and Wave 3 NextJsAdapter all consume this single entry point.

## What Was Built

- **`src/core/parser/plugins.ts`** — `PARSER_PLUGINS` constant: the locked 10-item Babel plugin tuple from SPEC R1 (`jsx`, `typescript`, `decorators-legacy`, `classProperties`, `classPrivateProperties`, `classPrivateMethods`, `dynamicImport`, `topLevelAwait`, `importAssertions`, `explicitResourceManagement`). Adds 4 plugins beyond the prototype to absorb current TC39 syntax without surprise parse errors.
- **`src/core/parser/index.ts#parseFile(ctx, absPath)`** — pure function over `ParseContext`. Reads source via `node:fs#readFileSync`, parses with `parse(...)` + `errorRecovery: true`, and returns `ParseResult` (`{ kind: "ok", ast, source }` or `{ kind: "error", message, line }`). Read failures map to `kind: "error"` with `line: 0`. Recoverable parse errors stay `kind: "ok"` and append a warning to `ctx.warnings`. Cache key is `toForwardSlash(absPath)`; same value object on re-entry (`===`).
- **6 vitest cases** covering happy path, unrecoverable parse error (no throw escapes), unreadable file, recoverable parse error warning, and cache identity for both ok and error paths.
- **3 fixtures** (`valid-baseline.tsx`, `syntax-error.tsx`, `recoverable.tsx`) under `test/fixtures/parser/parse-errors/`.

## Acceptance Criteria — Verified

- All 10 plugin strings present in `plugins.ts` (10/10 string matches).
- `parseFile` exported from `src/core/parser/index.ts`; `errorRecovery: true` and `toForwardSlash` both present.
- No `@babel/traverse` or `babel-shim` import in the parser primitive (parse-only).
- `npx tsc --noEmit` exits 0.
- `npx @biomejs/biome check src/core/parser/` exits 0.
- `npx vitest run test/core/parser/parseFile.test.ts` exits 0 (6/6 tests pass).
- All 3 fixture files present on disk.
- Cache identity (`expect(a).toBe(b)`) asserted for both ok and error paths (2 occurrences).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `TsconfigResult` → `TsConfigResult` casing**
- **Found during:** Task 1 typecheck.
- **Issue:** `get-tsconfig` exports `TsConfigResult` (capital C in `Config`), not `TsconfigResult` as the plan specced.
- **Fix:** Renamed the import + field type in `src/adapters/types.ts`.
- **Files modified:** `src/adapters/types.ts`.
- **Commit:** `0063c2e`.

**2. [Rule 3 - Blocking] `File` type missing augmented `errors` field**
- **Found during:** Task 1 typecheck.
- **Issue:** `@babel/types#File` does not declare `errors`; Babel's `parse(...)` returns `ParseResult<File>` which intersects `File` with `{ errors: null | ParseError[] }`. Typing the local var as `File` lost the augmentation, so `ast.errors` raised TS2339.
- **Fix:** Use `type BabelParseReturn = ReturnType<typeof parse>;` for the local var so the augmented shape is visible. Also guarded with `ast.errors?.length ?? 0` for null safety.
- **Files modified:** `src/core/parser/index.ts`.
- **Commit:** `0063c2e`.

**3. [Rule 3 - Blocking] biome v2 enforces `noRestrictedImports` on type-only imports**
- **Found during:** Task 1 biome check.
- **Issue:** Plan 03-02 assumed biome's `noRestrictedImports` would skip `import type`. In Biome 2.4.13 it does not — the type-only import from `../../adapters/types.js` raised the ARCH-01 error.
- **Fix:** Added a single-line `// biome-ignore lint/style/noRestrictedImports: type-only import; erased at compile time (D-11 island invariant unaffected)` directly above the import. Added a multi-line block-comment rationale above the ignore. The runtime D-11 island invariant is preserved because `import type` produces no runtime edge.
- **Files modified:** `src/core/parser/index.ts`.
- **Commit:** `0063c2e`.

**4. [Rule 3 - Blocking] tsc included broken parse-error fixtures**
- **Found during:** Task 2 typecheck.
- **Issue:** `tsconfig.json` `include: ["test/**/*"]` swept the intentionally-broken `syntax-error.tsx` and `recoverable.tsx` fixtures into compilation, raising TS1005/TS1109.
- **Fix:** Added `"exclude": ["test/fixtures/parser/parse-errors/**"]` to `tsconfig.json`.
- **Files modified:** `tsconfig.json`.
- **Commit:** `c9331de`.

**5. [Rule 3 - Blocking] Plan 03-02 depends on Plan 03-01 types in parallel worktree**
- **Found during:** Task 1 setup.
- **Issue:** Plan 03-02 imports `ParseContext`/`ParseResult` from `src/adapters/types.ts`, which is owned by Plan 03-01 (also wave 1, parallel worktree). Without that file the parser primitive cannot compile in this worktree.
- **Fix:** Mirrored `src/adapters/types.ts` from Plan 03-01's spec verbatim — both worktrees produce byte-identical content, so the orchestrator merge is conflict-free. Documented the duplication in a header JSDoc.
- **Files modified:** `src/adapters/types.ts` (new).
- **Commit:** `0063c2e`.

## Authentication Gates

None.

## Threat Mitigations Applied

- **T-3-01 (DoS via pathological input)** — `errorRecovery: true` keeps Babel bounded; thrown ParseError is caught and returned as `{ kind: "error" }`. Asserted by the "no throw escapes" test.
- **T-3-02 (information disclosure)** — Only `err.message` is propagated; `err.stack` is never read. Phase 2's MCP error envelope further redacts.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: file-read | `src/core/parser/index.ts` | New `readFileSync(absPath, "utf8")` call. The trust boundary (user-supplied projectRoot → resolved file path) is upstream of parseFile (resolver layer in Plan 03-03 will own path-traversal and node_modules-boundary checks); parseFile itself reads whatever absolute path it is handed. Document for the verifier so resolver-level mitigations are required before NextJsAdapter wiring. |

## Known Stubs

None. The plan deliberately stops at the parser primitive; resolver/extractors/NextJsAdapter are owned by Plans 03-03/04/05/06.

## Self-Check: PASSED

- `src/core/parser/index.ts` — FOUND
- `src/core/parser/plugins.ts` — FOUND
- `src/adapters/types.ts` — FOUND
- `test/core/parser/parseFile.test.ts` — FOUND
- `test/fixtures/parser/parse-errors/syntax-error.tsx` — FOUND
- `test/fixtures/parser/parse-errors/recoverable.tsx` — FOUND
- `test/fixtures/parser/parse-errors/valid-baseline.tsx` — FOUND
- Commit `0063c2e` — FOUND
- Commit `c9331de` — FOUND
