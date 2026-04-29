# Phase 4: Next.js App Router Adapter — Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the three `NextJsAdapter` stub methods (`detect`, `discoverEntries`, `mapRouteToEntry`) with real Next.js App Router routing semantics, and add a `runtime: "server" | "client"` field to every emitted `ComponentDefinition`. Closes NEXT-01 through NEXT-04.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**6 requirements are locked.** See `04-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `04-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- All routing logic for App Router (groups, parallel, intercepting, dynamic, private)
- `RouteMatch` return shape for `mapRouteToEntry` (extending `FrameworkAdapter` method signature, NOT adding a 6th method)
- `runtime` field added to `ComponentDefinition` (R8 amendment 11 → 12 fields, with field-count test updated)
- `detect` heuristic + `discoverEntries` enumeration for `app/` and `src/app/` layouts
- Fixture App Router projects under `test/fixtures/`
- Unit tests for routing math + integration tests for `extractComponents → runtime` path

**Out of scope (from SPEC.md):**
- IR translation (`ComponentDefinition[] → ComponentGraph`) — Phase 5 owns
- Phase 5 MCP tools (`get_full_hierarchy`, `focus_on`, `find_by_text`, `find_by_style`)
- Pages Router (v2)
- `route.ts` API handlers
- Server-component-as-children deep analysis (PITFALLS §3.3 — v1 limitation)
- `metadata` / `generateMetadata` / `dynamic` / `revalidate` named exports
- MDX `.mdx` route handling
- Cross-call AST / route caching (ARCH-02)
- Performance SLA

</spec_lock>

<decisions>
## Implementation Decisions

### RouteMatch shape & location

- **D-01:** `RouteMatch` lives in `src/adapters/types.ts` (alongside `ComponentDefinition`, `ResolveResult`). Phase 5's `toIR()` imports from the shared adapter types module — keeps the import surface flat.
- **D-02:** Shape is the four-field flat record:
  ```ts
  interface RouteMatch {
    matched: boolean;
    entries: string[];                       // forward-slash absolute, root-down layout chain incl. siblings
    params: Record<string, string | string[]>; // dynamic segment values
    slots: Record<string, string[]>;         // parallel-route entries keyed by slot name (e.g. "modal")
  }
  ```
  - `entries` is `string[]` (not tagged objects). Role (layout/page/loading/...) is recoverable from filename — Phase 5 must re-parse files anyway, so duplicating role inline buys nothing.
  - Sibling special files (`template.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `default.tsx`) are inlined into `entries` at their segment position, not separated into a sidecar field.
  - `slots` keys are dynamic strings (Next.js parallel-route folder name minus `@`), not a fixed enum — `@modal`, `@dashboard`, anything users author.
- **D-03:** No-match return shape: `{ matched: false, entries: [], params: {}, slots: {} }`. D-12 no-throw applies. Caller checks `matched` flag. This includes "route doesn't match any page" AND "app/ directory missing".
- **D-04:** `FrameworkAdapter.mapRouteToEntry` signature changes from `(absRoot, route) => string[] | Promise<string[]>` to `(absRoot, route) => RouteMatch | Promise<RouteMatch>`. Method count stays 5 — preserves ARCH-01 lock.

### Filesystem walk

- **D-05:** Use `tinyglobby` (already in stack) for both `discoverEntries` and the walk inside `mapRouteToEntry`.
- **D-06:** Discovery glob: `app/**/{page,layout,template,loading,error,not-found,default}.{tsx,jsx,ts,js}` with `ignore: ['**/_*/**', '**/node_modules/**']`. Run twice if needed (root variants `app/` and `src/app/`) — first hit wins.
- **D-07:** All four adapter methods return `Promise<T>` (use the `Promise<T> | T` union the interface already permits). Matches `tinyglobby` native async API; Phase 5 awaits.
- **D-08:** Forward-slash normalization at the boundary — every path that leaves `discoverEntries` / `mapRouteToEntry` passes through `toForwardSlash` from `src/core/paths.ts`. Windows-test-safe.
- **D-09:** Private folder exclusion (`_*`) is enforced by glob `ignore` pattern — single source of truth, no per-walker flag plumbing.

### Runtime detection (NEXT-04)

- **D-10:** Computed inside `buildComponentDefinition` (in `src/adapters/next/NextJsAdapter.ts`). Reads `parsed.ast.program.directives[0]` and matches `"use client"` / `"use server"`. Per-file value is shared by every `ComponentDefinition` extracted from that file (file-level scope, not per-component).
- **D-11:** `ParseResult` shape in `src/adapters/types.ts` is **not** modified — runtime is a Next-specific concept and lives in the Next adapter. Keeps the parser core (`src/core/parser/`) framework-agnostic and respects the island rule (D-11 from Phase 3).
- **D-12:** Default when no directive present: `"server"` (App Router default per SPEC R4). Files with `"use server"` directive also map to `"server"` (server-actions modules — still server runtime).
- **D-13:** Field-count test in `test/adapters/types.test.ts` bumps from `=== 12` to `=== 13` keys (matches R8 amendment 11 → 12 fields plus the existing assertion-key counted).

### Fixture layout

- **D-14:** Hybrid strategy:
  - **One kitchen-sink fixture** at `test/fixtures/next-app-router/` covering all four conventions in a single tree (groups, parallel, intercepting, dynamic, private, runtime variants). Mirrors SPEC acceptance examples literally: `app/dashboard/settings/page.tsx`, `app/(marketing)/about/page.tsx`, `app/@modal/login/page.tsx`, `app/feed/(.)photo/[id]/page.tsx`, `app/_internal/scratch.tsx`, `app/blog/[slug]/page.tsx`, `app/files/[...rest]/page.tsx`, `app/maybe/[[...opt]]/page.tsx`.
  - **Focused micro-fixtures** for `detect` (4 variants per SPEC R5: with `app/`, with `src/app/`, Pages-Router-only, no `next.config.*`) under `test/fixtures/next-detect-*/`.
- **D-15:** Fixtures are real on-disk files (not generated programmatically per test). Matches Phase 3's `test/fixtures/parser/` precedent — readable, reproducible, fast on Windows CI.
- **D-16:** Fixture `runtime` coverage: at least one file with `"use client"` as line 1, one with `"use server"`, one with no directive, one with leading comments + directive (boundary case). All under the kitchen-sink fixture.

### Claude's Discretion

- **Intercepting-route segment math algorithm** — exact iteration shape (recursive vs. table-driven) left to planner. PITFALLS.md §3.2 documents the failure modes; matching Next.js docs is the contract.
- **Route matching strategy** — building a route trie once per `mapRouteToEntry` call vs. scan-and-match per call. ARCH-02 forbids cross-call cache; within-call structure is open.
- **`detect()` filesystem probing order** — try `next.config.{js,mjs,cjs,ts}` in any order; existence of any one + `app/` (or `src/app/`) is sufficient.
- **Warning channel usage** — `mapRouteToEntry` does not receive `ParseContext` (SPEC R7 / ARCH-01). Diagnostics for malformed route strings either silently return `matched:false` or surface via planner-chosen mechanism.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements (locked)
- `.planning/phases/04-next-js-app-router-adapter/04-SPEC.md` — Locked requirements (NEXT-01..04 + R5 detect + R6 discoverEntries). Read first.
- `.planning/REQUIREMENTS.md` §Next.js App Router — NEXT-01..04 source.
- `.planning/PROJECT.md` — Non-negotiables (stdio, static-only, TypeScript + Babel, Node 20+).
- `.planning/ROADMAP.md` §Phase 4 — Goal + 4 success criteria.

### Research and pitfalls
- `.planning/research/PITFALLS.md` §3.1 — Directory-based vs import-based layout chain.
- `.planning/research/PITFALLS.md` §3.2 — Route group / parallel / intercepting semantics.
- `.planning/research/PITFALLS.md` §3.3 — `"use client"` propagation rules; server-component-as-children v1 limitation.
- `.planning/research/PITFALLS.md` §3.4 — Default-export-only rule for special files; `route.ts` exclusion.
- `.planning/research/ARCHITECTURE.md` — Adapter island rule (ARCH-01, D-11).
- `.planning/research/FEATURES.md` — N7: MDX out-of-scope.
- `.planning/research/STACK.md` — `tinyglobby`, `get-tsconfig`, Babel pinned versions.

### Phase 3 contracts (locked, must not regress)
- `src/adapters/FrameworkAdapter.ts` — 5-method interface lock (ARCH-01). Only `mapRouteToEntry` return type changes.
- `src/adapters/types.ts` — `ComponentDefinition` 11-field lock (R8); `RenderNode` 7-kind union (D-05); `ParseResult`, `ParseContext`, `ResolveResult`. Add `RouteMatch` here. Bump `ComponentDefinition` to 12 fields (add `runtime`).
- `src/adapters/next/NextJsAdapter.ts` — Current stub locations (lines 40, 44, 48); `buildComponentDefinition` (line 103) is where `runtime` gets plumbed.
- `src/core/paths.ts` — `toForwardSlash` helper (D-08 normalization).
- `test/architecture/island.test.ts` — Layer 2 enforcement that core/ir/renderers do not import from adapters/.
- `test/adapters/types.test.ts` — Field-count assertion (bump 12 → 13).

### Prior phase decisions (carry forward)
- `.planning/phases/03-parser-core-ast-resolution-extractors/03-CONTEXT.md` — D-01..D-13 (pure functions, ParseContext threading, no-throw, island rule).
- `.planning/phases/02-mcp-transport-shell/02-CONTEXT.md` — MCP-04 stdout/stderr discipline.
- `.planning/phases/01-scaffolding-ir-foundation/01-CONTEXT.md` — Forward-slash path convention; ARCH-03 root resolution.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`tinyglobby`** — already in stack and dependency. Use for both `discoverEntries` and the layout-chain walk.
- **`toForwardSlash` from `src/core/paths.ts`** — normalizes Windows backslashes; apply at every adapter boundary.
- **`buildComponentDefinition` in `NextJsAdapter.ts`** — already orchestrates the 11-field shape. Add a single field assignment (`runtime: <computed>`) and a one-liner directive read.
- **`parseFile`** — already returns `{ ast, source }`; `ast.program.directives` is populated by `@babel/parser` when `errorRecovery: true` and the source has a leading directive. No parser changes needed.
- **`ResolveResult` discriminated union pattern** — mirror it for any internal route-matching helpers (D-12 no-throw style).

### Established Patterns
- **D-12 no-throw rule** — every adapter method surfaces errors via return shapes (`RouteMatch.matched: false`, empty arrays, `ResolveResult { ok: false }`), never via thrown exceptions.
- **ParseContext threading** — pure functions take `ctx` first parameter. `mapRouteToEntry` and `discoverEntries` do NOT receive ctx (per ARCH-01 signatures) — they are filesystem-only.
- **Adapter island** — `src/adapters/next/**` may import from `src/core/`; never the reverse. New routing helpers belong under `src/adapters/next/`.
- **Per-call cache pattern** — Phase 3 uses `astCache` + `resolverCache` on `ParseContext`. Within `mapRouteToEntry`, any per-call route-trie / directory-listing cache lives as a local variable — no global state, no cross-call cache (ARCH-02).

### Integration Points
- `RouteMatch` declared in `src/adapters/types.ts` → consumed by Phase 5 `toIR()`.
- `NextJsAdapter.mapRouteToEntry` signature change → typed at the `FrameworkAdapter` interface, propagates to any future adapter.
- `runtime` field on `ComponentDefinition` → consumed by Phase 5 IR translator (decides client/server boundary in the rendered tree).
- `discoverEntries` output → feeds Phase 5 Analyzer's per-call enumeration.

### Constraints from existing code
- `FrameworkAdapter` interface declares `mapRouteToEntry` returns `Promise<string[]> | string[]`. **Update the interface itself** to `Promise<RouteMatch> | RouteMatch` — this is the SPEC-approved widening. The `FrameworkAdapter.test.ts` 5-key check stays green (key count unchanged).
- `types.test.ts` field-count assertion needs the 12 → 13 bump in lockstep with the `runtime` field addition; ship both in the same commit to avoid red CI windows.

</code_context>

<specifics>
## Specific Ideas

- **Glob ignore pattern is the single private-folder gate** — both `discoverEntries` and the layout-chain walk use the same `ignore: ['**/_*/**']`. No per-method `if (segment.startsWith('_'))` checks.
- **SPEC acceptance examples become fixture filenames verbatim** — `app/dashboard/settings/page.tsx`, `app/(marketing)/about/page.tsx`, `app/@modal/login/page.tsx`, `app/feed/(.)photo/[id]/page.tsx`, `app/_internal/scratch.tsx`, `app/blog/[slug]/page.tsx`, `app/files/[...rest]/page.tsx`, `app/maybe/[[...opt]]/page.tsx`. One-to-one mapping makes acceptance verification mechanical.
- **`runtime` propagation is per-file, not per-component** — when a file has multiple component declarations, every emitted `ComponentDefinition` from that file shares the same `runtime` value (file-level directive scope is the JS spec).

</specifics>

<deferred>
## Deferred Ideas

- **Cross-call route trie cache** — ARCH-02 forbids in v1. Revisit after v1 ships if Phase 6 perf measurements show route walking is hot.
- **Route discovery tool (`get_route_map()`)** — listed as a v2 feature in REQUIREMENTS.md.
- **Pages Router support** — explicitly v2.
- **MDX `.mdx` route handling** — out-of-scope per FEATURES.md N7.
- **Server-component-passed-as-children deep analysis** — PITFALLS §3.3 documents this as a v1 limitation. `runtime` stays per-file directive only.
- **`metadata` / `generateMetadata` / `dynamic` / `revalidate` named exports** — silently dropped in v1 per PITFALLS §3.4 default-export-only rule.

</deferred>

---

*Phase: 04-next-js-app-router-adapter*
*Context gathered: 2026-04-29*
