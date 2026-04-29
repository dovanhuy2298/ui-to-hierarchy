# Phase 4: Next.js App Router Adapter — Specification

**Created:** 2026-04-29
**Ambiguity score:** 0.19 (gate: ≤ 0.20)
**Requirements:** 6 locked

## Goal

`NextJsAdapter` becomes fully functional: its three currently-stubbed methods (`detect`, `discoverEntries`, `mapRouteToEntry`) implement Next.js App Router routing semantics, and every emitted `ComponentDefinition` carries a `runtime: "server" | "client"` field — closing requirements NEXT-01 through NEXT-04.

## Background

Phase 3 shipped the parser core and `NextJsAdapter.extractComponents` / `resolveModule`, but left the three routing-side methods raising `Error("not implemented in Phase 3")`:

- [src/adapters/next/NextJsAdapter.ts:42-50](src/adapters/next/NextJsAdapter.ts#L42-L50) — `detect`, `discoverEntries`, `mapRouteToEntry` are stubs
- [src/adapters/types.ts:202-233](src/adapters/types.ts#L202-L233) — `ComponentDefinition` is a locked 11-field shape; `runtime` is "deliberately absent — Phase 4 layers it via NEXT-04"
- `FrameworkAdapter` interface ([src/adapters/FrameworkAdapter.ts](src/adapters/FrameworkAdapter.ts)) is a locked 5-method contract (ARCH-01); `mapRouteToEntry` currently typed as `(absRoot, route) => string[]`, which cannot carry resolved dynamic params or parallel-route slots
- No fixture App Router projects exist under `test/fixtures/` for routing scenarios (route groups, parallel slots, intercepting routes, dynamic segments)
- Research artifact `.planning/research/PITFALLS.md` §3.1–3.4 already documents the failure modes (directory-based vs import-based layout chains, route-group/parallel/intercepting semantics, `"use client"` propagation, `default-export-only` rule for special files)

The phase exists because Phase 5's tools (`get_full_hierarchy`, `focus_on`, `find_by_text`, `find_by_style`) cannot operate without a route → entry mapping and a server/client boundary annotation per component.

## Requirements

1. **NEXT-01 — Directory-based layout chain reconstruction**: `mapRouteToEntry` walks `app/` upward from the matched route segment, collecting every `layout.tsx`/`layout.jsx` along the way plus per-segment siblings `template.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `default.tsx`.
   - Current: Method is a stub that throws.
   - Target: Returns a `RouteMatch` object whose `entries` array is ordered root-down (e.g. `[app/layout.tsx, app/(group)/layout.tsx, app/(group)/dashboard/layout.tsx, app/(group)/dashboard/page.tsx]`) with sibling special files attached per segment under a typed key.
   - Acceptance: For fixture `app/dashboard/settings/page.tsx` with layouts at `app/`, `app/dashboard/`, `app/dashboard/settings/`, the call `mapRouteToEntry(root, "/dashboard/settings")` returns all four files in root-down order, plus any `loading.tsx`/`error.tsx`/`not-found.tsx`/`template.tsx`/`default.tsx` siblings present at each segment.

2. **NEXT-02 — Route conventions: groups, parallel, intercepting, private**: Route groups `(name)` contribute layouts but contribute zero URL segments; parallel routes `@slot` are emitted as labeled slots on the parent (sidecar, not RenderNode); intercepting routes `(.)`, `(..)`, `(...)`, `(..)(..)` resolve with correct segment math; private folders `_name` are excluded from both routing and entry discovery.
   - Current: No routing logic exists; conventions unimplemented.
   - Target: `RouteMatch.slots: Record<string, string[]>` carries parallel slot entries (e.g. `{ children: [...], modal: ['app/@modal/login/page.tsx'] }`); group folders are transparent for URL matching but their `layout.tsx` files appear in `entries`; intercepting-route segment math matches Next.js docs; private folders are skipped in `discoverEntries` and `mapRouteToEntry`.
   - Acceptance: A fixture exercising all four conventions (`app/(marketing)/about/page.tsx`, `app/@modal/login/page.tsx`, `app/feed/(.)photo/[id]/page.tsx`, `app/_internal/scratch.tsx`) yields: `(marketing)` layout in chain but no `/marketing` URL segment; `@modal` produces a `slots.modal` entry on the matched parent; `(.)photo` resolves to the sibling `app/photo/` segment; `_internal` files appear in neither `discoverEntries` output nor any `RouteMatch`.

3. **NEXT-03 — Dynamic segment resolution with echoed params**: Routes containing `[slug]`, `[...rest]`, `[[...opt]]` match input route strings and the resolved param map is returned in `RouteMatch.params`.
   - Current: No matching logic; `mapRouteToEntry` signature returns `string[]` with no place to put params.
   - Target: `RouteMatch.params: Record<string, string | string[]>` echoes resolved values — `{ slug: "abc" }` for `[slug]`, `{ rest: ["a","b"] }` for `[...rest]`, `{ opt: [] }` (or absent key) for unmatched `[[...opt]]`. Static-segment-only routes return `params: {}`.
   - Acceptance: For fixture `app/blog/[slug]/page.tsx`, `mapRouteToEntry(root, "/blog/hello")` returns `params: { slug: "hello" }`; for `app/files/[...rest]/page.tsx`, `mapRouteToEntry(root, "/files/a/b/c")` returns `params: { rest: ["a","b","c"] }`; for `app/maybe/[[...opt]]/page.tsx`, both `/maybe` and `/maybe/x` succeed with appropriate `params`.

4. **NEXT-04 — Runtime boundary detection on every component**: First non-comment directive in a file (`"use client"` or `"use server"`) propagates as `runtime: "server" | "client"` on every `ComponentDefinition` extracted from that file. Default when neither directive is present: `"server"` (App Router default).
   - Current: `ComponentDefinition` is an 11-field locked shape with no `runtime` field; types.ts comment says "Phase 4 layers it via NEXT-04" but warns that adding a field is "milestone-level".
   - Target: `ComponentDefinition` becomes a 12-field shape with `runtime: "server" | "client"` populated by `extractComponents`. Field-count assertion in `test/adapters/types.test.ts` updated from 12 to 13 keys (existing test counts `Object.keys(...) === 12` per types.ts:200; the new field bumps it to 13). All Phase 3 tests still pass.
   - Acceptance: Fixture file with `"use client"` as line 1 (after optional shebang/comments) produces `ComponentDefinition.runtime === "client"`; file with no directive produces `"server"`; file with `"use server"` produces `"server"` (and the existing parse pipeline does not regress on any Phase 3 fixture).

5. **`detect()` heuristic**: `NextJsAdapter.detect(absRoot)` returns `true` only for projects that look like a Next.js App Router project.
   - Current: Method is a stub that throws.
   - Target: Returns `true` when the root contains `next.config.{js,mjs,cjs,ts}` AND a directory named `app/` (or `src/app/`); returns `false` otherwise. No reliance on `package.json` content (avoids false negatives in monorepos / pnpm workspaces).
   - Acceptance: Fixture with both `next.config.mjs` and `app/` → `true`; fixture with `next.config.js` but no `app/` (Pages-Router-only) → `false`; fixture with no `next.config.*` → `false`; fixture with `app/` under `src/` → `true`.

6. **`discoverEntries()` enumeration**: `NextJsAdapter.discoverEntries(absRoot)` returns the absolute paths of every App Router special file under `app/` (or `src/app/`).
   - Current: Method is a stub that throws.
   - Target: Returns absolute, forward-slash paths (project convention from Phase 3) for every file matching `{page,layout,template,loading,error,not-found,default}.{tsx,jsx,ts,js}` under the resolved `app/` root. Excludes any path containing a `_private` segment. Includes files inside route groups `(group)` and parallel-route folders `@slot`. Order: lexicographic by path.
   - Acceptance: Fixture tree with `app/page.tsx`, `app/(group)/layout.tsx`, `app/@modal/login/page.tsx`, `app/_lib/util.ts`, `app/blog/[slug]/page.tsx` returns exactly four paths (the four App Router files); `app/_lib/util.ts` is excluded.

## Boundaries

**In scope:**
- All routing logic for App Router (groups, parallel, intercepting, dynamic, private)
- `RouteMatch` return shape for `mapRouteToEntry` (extending `FrameworkAdapter` method signature, NOT adding a 6th method — preserves ARCH-01 5-method lock)
- `runtime` field added to `ComponentDefinition` (R8 amendment from 11 → 12 fields, with field-count test updated)
- `detect` heuristic + `discoverEntries` enumeration for the `app/` and `src/app/` layouts
- Fixture App Router projects under `test/fixtures/` covering all six requirements
- Unit tests for routing math + integration tests for the full `extractComponents → runtime` path

**Out of scope:**
- IR translation of `ComponentDefinition[] → ComponentGraph` — owned by Phase 5; Phase 4 stops at adapter output.
- Phase 5's MCP tools (`get_full_hierarchy`, `focus_on`, `find_by_text`, `find_by_style`) — Phase 4 leaves them as the existing Phase 2 stubs.
- Pages Router (`pages/` directory) — explicitly v2 per REQUIREMENTS Out-of-Scope.
- `route.ts` API handlers — not UI; emit nothing for them per PITFALLS §3.4.
- Server-component-passed-as-children deep analysis — PITFALLS §3.3 marks this a documented v1 limitation; `runtime` is per-file directive only.
- `metadata` / `generateMetadata` / `dynamic` / `revalidate` named exports — silently dropped (PITFALLS §3.4 default-export-only rule for special files).
- MDX `.mdx` route handling — out per N7 in FEATURES.md.
- Cross-call AST / route caching — ARCH-02 forbids in v1.
- Performance SLA — no hard target in v1 per PROJECT.md.

## Constraints

- **5-method `FrameworkAdapter` interface MUST remain locked** (ARCH-01). `mapRouteToEntry` return type changes (`string[] → RouteMatch`) but no method count change.
- **Adapter island rule** — `src/adapters/next/**` may import from `src/core/` but nothing under `src/core/`, `src/ir/`, or `src/renderers/` may import from `src/adapters/**`. Enforced by [test/architecture/island.test.ts](test/architecture/island.test.ts) + Biome `noRestrictedImports`.
- **D-12 no-throw rule** — none of the four adapter methods throw on user-data errors; failures surface via return shapes (`RouteMatch.matched: false`, empty `entries` array, `ParseContext.warnings`).
- **Forward-slash paths everywhere** — Windows-test-safe; reuse `toForwardSlash` from `src/core/paths.ts`.
- **No `node_modules` parsing** — already enforced by Phase 3 resolver; Phase 4 inherits.
- **stdout reserved for JSON-RPC** (MCP-04) — any diagnostic from Phase 4 logic uses `ParseContext.warnings` or `process.stderr`.
- **Babel / Node 20 + ESM** — same constraints as the rest of the project; no new runtime deps anticipated (filesystem walk via `node:fs/promises` and existing `tinyglobby` are sufficient).

## Acceptance Criteria

- [ ] `NextJsAdapter.detect(root)` returns correct boolean for the four `detect` fixture variants (with `app/`, with `src/app/`, Pages-only, no Next config)
- [ ] `NextJsAdapter.discoverEntries(root)` returns exactly the App Router special files under `app/` / `src/app/`, excludes `_private` folders, includes `(group)` and `@slot` folder contents
- [ ] `NextJsAdapter.mapRouteToEntry(root, "/dashboard/settings")` returns a `RouteMatch` whose `entries` array is the layout chain root-down with all sibling special files for each segment
- [ ] Route groups `(name)` contribute layouts to `entries` but do not affect URL segment matching
- [ ] Parallel routes `@slot` appear in `RouteMatch.slots` keyed by slot name (not in `entries`)
- [ ] Intercepting routes `(.)`, `(..)`, `(...)`, `(..)(..)` resolve to the correct sibling/ancestor segment
- [ ] Private folders `_name` are excluded from both `discoverEntries` and any `RouteMatch`
- [ ] Dynamic segments `[slug]`, `[...rest]`, `[[...opt]]` populate `RouteMatch.params` correctly for matching inputs and `matched: false` for non-matching inputs
- [ ] `ComponentDefinition.runtime` is `"client"` for files starting with `"use client"`, `"server"` otherwise (default)
- [ ] Field-count test on `ComponentDefinition` is updated and passes (12 → 13 keys)
- [ ] `test/architecture/island.test.ts` continues to pass (no `core/ir/renderers → adapters` import introduced)
- [ ] All Phase 3 tests still pass (no regression in `extractComponents`, `resolveModule`, render-flow walker)
- [ ] No method throws on malformed user input — failures surface via return shapes or `ctx.warnings`

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                                                |
|--------------------|-------|------|--------|---------------------------------------------------------------------------------------|
| Goal Clarity       | 0.85  | 0.75 | ✓      | NEXT-01..04 frozen + 4 ROADMAP success criteria; 6 numbered requirements derived.    |
| Boundary Clarity   | 0.80  | 0.70 | ✓      | Explicit out-of-scope list; Phase 5 IR translation excluded; v2 Pages Router excluded. |
| Constraint Clarity | 0.80  | 0.65 | ✓      | R8 amendment (11→12 fields) confirmed; 5-method interface preserved; no-throw locked. |
| Acceptance Criteria| 0.75  | 0.70 | ✓      | 13 pass/fail checks; fixture-shape implied but specific fixtures named in Phase plan.  |
| **Ambiguity**      | 0.19  | ≤0.20| ✓      | Gate passed after Round 1.                                                            |

## Interview Log

| Round | Perspective       | Question summary                                                                 | Decision locked                                                                                  |
|-------|-------------------|----------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------|
| 0     | Researcher (auto) | What exists today? What's the gap?                                               | 3 stub methods + missing `runtime` field; Phase 5 needs both before tools can wire up.            |
| 1     | Constraint Keeper | How does Phase 4 add `runtime` given R8 11-field lock + "milestone-level" caveat? | Add 12th field to `ComponentDefinition`; bump field-count test from 12 to 13 keys.                |
| 1     | Boundary Keeper   | Current `mapRouteToEntry: string[]` cannot carry NEXT-03 params — how to fix?    | Change return to `RouteMatch { entries; params; slots; matched }`; preserve 5-method interface.   |
| 1     | Boundary Keeper   | NEXT-02 demands `@slot` semantics but D-05 has no `slot` RenderNode kind.        | Slots live as a sidecar `RouteMatch.slots: Record<string, string[]>`; RenderNode union unchanged. |

---

*Phase: 04-next-js-app-router-adapter*
*Spec created: 2026-04-29*
*Next step: /gsd-discuss-phase 4 — implementation decisions (filesystem walk strategy, RouteMatch shape definition file, intercepting-route segment-math algorithm, fixture project layout)*
