---
phase: 03-parser-core-ast-resolution-extractors
plan: 03
subsystem: parser
tags: [resolver, tsconfig-paths, barrel-chase, cycle-guard, node-modules, parse-02, parse-03]
requires:
  - "src/adapters/types.ts (Plan 03-01) — ParseContext, ResolveResult contracts"
  - "src/core/parser/index.ts (Plan 03-02) — parseFile primitive consumed during barrel chase"
  - "src/core/babel-shim.ts — only allowed traverse entry"
  - "src/core/paths.ts — toForwardSlash for D-07 path normalization"
  - "get-tsconfig ^4.14 — getTsconfig + createPathsMatcher (PARSE-03)"
provides:
  - "src/core/resolver/index.ts#resolveModule — entry point for FrameworkAdapter (PARSE-02 + PARSE-03)"
  - "src/core/resolver/barrel.ts#chaseBarrel — re-export chase with cycle guard (T-3-03 mitigation)"
  - "src/core/resolver/tsconfig.ts — getPathsMatcher + loadTsconfigOnce wrappers"
  - "src/core/resolver/relative.ts — probeFile (D-13 ext order) + joinRelative"
  - "src/core/resolver/node-modules.ts — detectNodeModules + packageNameFromSpecifier"
affects:
  - "Plan 03-04 (extractors) — consumes resolveModule when chasing imports referenced by JSX"
  - "Plan 03-05 (render-flow) — consumes resolveModule for JSX target lookups"
  - "Plan 03-06 (NextJsAdapter) — wires resolveModule through FrameworkAdapter.resolveModule"
tech-stack:
  added: []  # all deps already present
  patterns:
    - "Discriminated ResolveResult union — never throw, exhaustive caller pattern-match (D-12)"
    - "Per-call resolverCache keyed by (fromFile, specifier, importedName) (D-03)"
    - "Multi-target paths first-wins with documented ext order (D-13)"
    - "Forking visited Set per star-export branch (siblings don't poison each other)"
    - "WeakMap-keyed matcher cache + WeakSet load flag — cache lifecycle bound to ParseContext"
    - "Type-only imports across the adapter island (with biome-ignore rationale)"
key-files:
  created:
    - "src/core/resolver/relative.ts"
    - "src/core/resolver/tsconfig.ts"
    - "src/core/resolver/node-modules.ts"
    - "src/core/resolver/barrel.ts"
    - "src/core/resolver/index.ts"
    - "test/core/resolver/relative.test.ts"
    - "test/core/resolver/tsconfig-paths.test.ts"
    - "test/core/resolver/barrel.test.ts"
    - "test/fixtures/parser/resolver/shadcn-barrel/tsconfig.json"
    - "test/fixtures/parser/resolver/shadcn-barrel/src/components/ui/index.ts"
    - "test/fixtures/parser/resolver/shadcn-barrel/src/components/ui/button.tsx"
    - "test/fixtures/parser/resolver/shadcn-barrel/src/page.tsx"
    - "test/fixtures/parser/resolver/barrel-cycle/tsconfig.json"
    - "test/fixtures/parser/resolver/barrel-cycle/src/a.ts"
    - "test/fixtures/parser/resolver/barrel-cycle/src/b.ts"
    - "test/fixtures/parser/resolver/barrel-cycle/src/page.tsx"
    - "test/fixtures/parser/resolver/multi-target/tsconfig.json"
    - "test/fixtures/parser/resolver/multi-target/src/components/Foo.tsx"
    - "test/fixtures/parser/resolver/multi-target/lib/components/Bar.tsx"
    - "test/fixtures/parser/resolver/multi-target/page.tsx"
    - "test/fixtures/parser/resolver/extends-chain/tsconfig.base.json"
    - "test/fixtures/parser/resolver/extends-chain/tsconfig.json"
    - "test/fixtures/parser/resolver/extends-chain/src/x.ts"
  modified:
    - "tsconfig.json (excluded test/fixtures/parser/resolver/** from compilation — fixtures contain JSX without --jsx flag and are read by the resolver, not compiled)"
decisions:
  - "Used `import type` from src/adapters with biome-ignore rationale, matching Plan 03-02 — type-only imports are erased at compile time, preserving the D-11 island invariant. Architecture test (test/architecture/island.test.ts) explicitly allows this pattern via negative-lookahead `(?!type\\s)`."
  - "Excluded resolver fixtures from tsconfig.json (analogous to Plan 03-02's parse-error fixture exclusion) — JSX-bearing fixture files would fail tsc --noEmit because the project tsconfig has no `--jsx` setting (we never compile fixtures, only parse them via Babel)."
  - "Forked the visited set per star-export branch (`new Set(visited)`) so sibling re-exports don't poison each other — a barrel may legitimately `export *` from two siblings, neither of which is a cycle. Direct `export { X } from \"...\"` chains keep the same Set (linear chain semantics)."
  - "WeakSet-based loadedFlag for tsconfig — distinguishes 'pre-populated null' from 'not yet loaded'. Caller (Plan 06) may pre-populate ctx.tsconfig; if so we honor it, otherwise we walk from ctx.resolvedRoot exactly once."
metrics:
  completed: "2026-04-29"
  duration: "~18 minutes"
  tasks: 3
  files_created: 23
  files_modified: 1
---

# Phase 03 Plan 03: Module Resolver (PARSE-02 + PARSE-03) Summary

Module resolver implementing PARSE-02 (barrel chase + cycle guard) and PARSE-03 (tsconfig paths + extends chain), composing four sub-modules behind a single `resolveModule(ctx, fromFile, specifier, importedName)` entry that NEVER throws and emits forward-slash absolute paths everywhere.

## What Was Built

- **`src/core/resolver/relative.ts`** — `probeFile(basePath)` walks the D-13 extension order (exact, `.ts`, `.tsx`, `.js`, `.jsx`, `/index.{ts,tsx,js,jsx}`), returning forward-slash absolute paths via `toForwardSlash(path.resolve(...))`. `joinRelative(fromFile, specifier)` produces the absolute base for `./` / `../` specifiers.
- **`src/core/resolver/tsconfig.ts`** — `loadTsconfigOnce(ctx)` wraps `getTsconfig` with a WeakSet load flag (handles pre-populated ctx + extends-chain via the dependency). `getPathsMatcher(ctx)` caches the `createPathsMatcher` result in a WeakMap keyed by ParseContext so the matcher is GC'd with the context. T-3-04: trust `get-tsconfig` for safe extends-chain traversal.
- **`src/core/resolver/node-modules.ts`** — `detectNodeModules(absForwardSlash)` returns the package name (or null) using `lastIndexOf("/node_modules/")` — handles nested workspace deps and scoped packages. `packageNameFromSpecifier(specifier)` returns the package name for bare specifiers and null for relative/alias paths.
- **`src/core/resolver/barrel.ts`** — `chaseBarrel(ctx, startFile, importedName, resolveSpecifier, visited)`:
  - Walks `FunctionDeclaration` / `VariableDeclarator` / `ClassDeclaration` for the local declaration (returns `{ ok: true, kind: "local" }`).
  - Walks `ExportNamedDeclaration` with `source` to find `export { X } from "..."` re-exports — recurses with the renamed local.
  - Collects `ExportAllDeclaration` sources and recurses each — FORKS the `visited` Set per star branch so sibling stars don't poison each other.
  - Cycle guard: `if (visited.has(startFile))` returns `{ ok: false, kind: "cycle", chain }`. T-3-03 mitigation; asserted by the `barrel-cycle` fixture.
  - Specifier resolution is INJECTED to break the import cycle with `index.ts` (the file-only resolution lives in `index.ts` and is passed as a callback).
- **`src/core/resolver/index.ts`** — `resolveModule` entry:
  1. Cache check on `${fromFile}::${specifier}::${importedName}` (D-03).
  2. `resolveSpecifierToFile`: try tsconfig-paths matcher (multi-target first-wins per D-13), then relative-probe, then bare→external (D-12).
  3. After file found: parse it; if local declaration of `importedName` exists → done, else hand off to `chaseBarrel` with `resolveSpecifierToFile` injected.
  4. Cache + return.
- **4 mini-project fixtures (D-15)** — real on-disk projects so `get-tsconfig` reads real files (no mocking):
  - `shadcn-barrel/`: `@/components/ui` with `index.ts` re-exporting `Button` from `./button.tsx`.
  - `barrel-cycle/`: `a.ts ↔ b.ts` re-exporting `Thing` from each other.
  - `multi-target/`: `paths: { "@/*": ["src/*", "lib/*"] }`; `Foo` lives only in `src/`, `Bar` only in `lib/` — first-wins must find both.
  - `extends-chain/`: `tsconfig.json` extends `tsconfig.base.json` which holds the `#config/*` path.
- **3 vitest suites — 10 passing tests:**
  - `relative.test.ts` (3): probe finds `.tsx` extension, finds `index.ts`, returns null on miss; forward-slash assertions.
  - `tsconfig-paths.test.ts` (4): `@/*` resolves through barrel, multi-target first-wins, extends chain, D-03 cache identity (`a === b`).
  - `barrel.test.ts` (3): shadcn-style chase resolves to `button.tsx`, cycle returns `{ kind: "cycle" }` with chain ≥ 2 (no stack overflow), missing import does NOT throw and returns `not-found`.

## Acceptance Criteria — Verified

- `src/core/resolver/relative.ts` exports `probeFile` and `joinRelative`.
- `EXT_ORDER` and `INDEX_ORDER` arrays match the plan literal.
- `src/core/resolver/tsconfig.ts` calls `createPathsMatcher`.
- `src/core/resolver/node-modules.ts` exports `detectNodeModules` and `packageNameFromSpecifier`.
- `src/core/resolver/index.ts` exports `resolveModule` with the locked signature.
- `src/core/resolver/barrel.ts` exports `chaseBarrel` with `visited.has`/`visited.add`/`new Set(visited)` cycle/branch handling.
- No `throw` outside declared error returns (resolver is throw-free per D-12).
- Resolver cache key includes all three variables (`fromFile`, `specifier`, `importedName`) with `::` separator.
- All 4 fixture directories present with the specified files.
- All 3 vitest suites green (10/10 tests pass), plus the existing architecture island test (1/1) — total 11/11 across resolver + island scope.
- `npx tsc --noEmit` exits 0.
- `npx @biomejs/biome check src/core/resolver/` exits 0.
- All asserted absolutePaths are forward-slash (no `\\`); each test file has at least one `endsWith` + `includes("\\\\").toBe(false)` pair.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Resolver fixtures fail `tsc --noEmit` without `--jsx`**

- **Found during:** Task 3 (final verification).
- **Issue:** The fixture `.tsx` files (`button.tsx`, `Foo.tsx`, `Bar.tsx`, `page.tsx`) were swept into compilation by `include: ["test/**/*"]` and tsc errored with `TS17004: Cannot use JSX unless the '--jsx' flag is provided` and `TS2307: Cannot find module '@/components/ui'` (the project tsconfig has no `paths`). Same class of issue Plan 03-02 hit with parse-error fixtures.
- **Fix:** Added `"test/fixtures/parser/resolver/**"` to the `tsconfig.json` `exclude` array (now contains both `parse-errors/**` and `resolver/**`). Resolver consumes these fixtures via Babel (no `--jsx` flag needed) and reads the fixture's OWN `tsconfig.json` via `get-tsconfig` (the project tsconfig is irrelevant to fixture parsing).
- **Files modified:** `tsconfig.json`.
- **Committed in:** `bf30336` (Task 3 commit).

**2. [Rule 3 — Blocking] Biome formatter: long type alias on multiple lines + `!` non-null assertion**

- **Found during:** Task 2 biome check.
- **Issue 1:** Multi-line `type SpecifierResolver = (...)` exceeded the formatter's preferred shape (Biome wanted single-line because total width fits within 100 chars).
- **Issue 2:** `p.node.source!.value` triggered `style/noNonNullAssertion`. The narrowing `if (!p.node.source) return` was upstream of the closure capture, so TypeScript-level narrowing was already correct, but Biome flagged the `!` regardless.
- **Fix:** Collapsed `SpecifierResolver` to a single line. Refactored `ExportNamedDeclaration` visitor to capture `const src = p.node.source` immediately after the early-return so the narrowed local is reused without `!`.
- **Files modified:** `src/core/resolver/barrel.ts`.
- **Committed in:** `a204b53` (Task 2 commit).

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking issues from tooling friction). No architectural changes, no scope creep, no Rule 4 escalations.
**Impact on plan:** Both fixes are mechanical adjustments — the resolver behavior, tests, and fixture shape all match the plan exactly.

## Authentication Gates

None.

## Threat Mitigations Applied

- **T-3-03 (DoS via cycle / unbounded recursion)** — `visited: Set<string>` is carried through every `chaseBarrel` call. Direct re-export chains share the Set (linear visit semantics); star-export branches fork via `new Set(visited)` so sibling stars don't false-positive as cycles. The `barrel-cycle` fixture (`a.ts ↔ b.ts`) is asserted to return `{ ok: false, kind: "cycle" }` with `chain.length >= 2` — no stack overflow.
- **T-3-04 (Tampering / extends chain)** — accepted: trusted `get-tsconfig@^4.14` (by privatenumber, the tsx author) for safe extends-chain traversal. JSDoc on `tsconfig.ts` documents this trust assumption.
- **T-3-02 (path traversal)** — partial mitigation: resolver emits absolute paths but does NOT validate they fall under `ctx.resolvedRoot`. JSDoc on `resolveModule` documents that containment checking is the caller's responsibility (Plan 06 NextJsAdapter). The static-analysis-only constraint bounds the threat: we never execute resolved code.
- **T-3-07 (deep barrel star tree)** — accepted, no depth cap in v1; bounded by visited Set + per-call cache. Revisit in Phase 6 if pathological repos surface.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: file-stat | `src/core/resolver/relative.ts` | New `existsSync`/`statSync` calls on caller-supplied paths. The trust boundary (resolved fromFile + tsconfig-matcher candidates) is upstream — the resolver itself only reads file metadata, never content. parseFile's existing file-read flag (Plan 03-02) covers the actual content read. Document for the verifier so containment checks land at the NextJsAdapter wiring step (Plan 06). |

## Known Stubs

None. All three tasks land their full intended surface; no placeholders or "coming soon" markers. The `ambiguous` ResolveResult variant is reserved (declared by Plan 03-01, never emitted in v1) — this is by design per the discriminated-union exhaustive-match contract, not a stub.

## Task Commits

1. **Task 1: resolver primitives (probeFile, tsconfig matcher, node_modules)** — `37654ce` (feat)
2. **Task 2: resolveModule entry + chaseBarrel with cycle guard** — `a204b53` (feat)
3. **Task 3: 4 fixtures + 3 vitest suites + tsconfig exclude** — `bf30336` (test)

## Self-Check: PASSED

**Files exist (23/23 created + 1 modified):**

- src/core/resolver/relative.ts — FOUND
- src/core/resolver/tsconfig.ts — FOUND
- src/core/resolver/node-modules.ts — FOUND
- src/core/resolver/barrel.ts — FOUND
- src/core/resolver/index.ts — FOUND
- test/core/resolver/relative.test.ts — FOUND
- test/core/resolver/tsconfig-paths.test.ts — FOUND
- test/core/resolver/barrel.test.ts — FOUND
- test/fixtures/parser/resolver/shadcn-barrel/{tsconfig.json, src/page.tsx, src/components/ui/{index.ts, button.tsx}} — 4/4 FOUND
- test/fixtures/parser/resolver/barrel-cycle/{tsconfig.json, src/{a.ts, b.ts, page.tsx}} — 4/4 FOUND
- test/fixtures/parser/resolver/multi-target/{tsconfig.json, page.tsx, src/components/Foo.tsx, lib/components/Bar.tsx} — 4/4 FOUND
- test/fixtures/parser/resolver/extends-chain/{tsconfig.base.json, tsconfig.json, src/x.ts} — 3/3 FOUND
- tsconfig.json — FOUND (modified)

**Commits exist (3/3):**

- 37654ce — FOUND (feat — Task 1 primitives)
- a204b53 — FOUND (feat — Task 2 resolveModule + chaseBarrel)
- bf30336 — FOUND (test — Task 3 fixtures + tests + tsconfig exclude)

**Verification commands re-run:**

- `npx tsc --noEmit` → exits 0
- `npx @biomejs/biome check src/core/resolver/` → 0 violations
- `npx vitest run test/core/resolver/ test/architecture/` → 11/11 pass (3 relative + 4 tsconfig-paths + 3 barrel + 1 island)

---
*Phase: 03-parser-core-ast-resolution-extractors*
*Plan: 03*
*Completed: 2026-04-29*
