---
phase: 04-next-js-app-router-adapter
verified: 2026-04-29T00:00:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 4: Next.js App Router Adapter — Verification Report

**Phase Goal:** `NextJsAdapter` implements all 5 methods; routing correctly composes layout chains for route groups, parallel slots, intercepting routes, and dynamic segments. Every component carries `runtime: "server" | "client"`.

**Verified:** 2026-04-29
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `mapRouteToEntry("/dashboard/settings")` returns the layout chain directory-walked upward, including `template/loading/error/not-found` siblings (NEXT-01) | VERIFIED | `src/adapters/next/route-map.ts` `walk()` + `harvestSpecials()` collect specials in documented order at every segment; tests `route-map.test.ts:71,75,86` assert chain `app/layout` first, `app/dashboard/settings/page` last, with `loading.tsx` sibling included |
| 2 | Groups `(group)` contribute layouts but not URL segments; private `_folder` excluded; parallel `@slot` appears as labeled slots; intercepting `(.)`, `(..)`, `(..)(..)`, `(...)` resolve with correct segment math (NEXT-02) | VERIFIED | `segments.ts:34-58` regex classifier handles all 4 intercepting variants + group + parallel + private; `route-map.ts:141-153,176-194` `promoteParallel()` + `expandGroups()` implement transparency; tests `route-map.test.ts:24-58,98,104,112` cover each convention |
| 3 | Dynamic `[slug]`, `[...rest]`, `[[...opt]]` match route inputs and resolved params echo in response (NEXT-03) | VERIFIED | `route-map.ts:284-316` walker populates `params` for each dynamic kind; tests `route-map.test.ts:136-156` assert `params.slug` (string), `params.rest` (string[]), `params.opt` (`[]`, `["x"]`, `["x","y"]`) |
| 4 | Every component node carries `runtime: "server" | "client"` derived from first non-comment directive (NEXT-04) | VERIFIED | `NextJsAdapter.ts:137-139` reads `ast.program.directives[0]?.value.value`; `runtime` field present in `ComponentDefinition` (`types.ts:241`) and synthetic parse-error path (`NextJsAdapter.ts:94`); tests `runtime.test.ts` cover all 4 D-16 fixture variants + per-file scope + 13-key shape |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/adapters/types.ts` | RouteMatch interface + 12-field ComponentDefinition with runtime | VERIFIED | `RouteMatch` exported lines 286-291 with 4 fields (matched/entries/params/slots); `ComponentDefinition.runtime: "server" | "client"` at line 241 |
| `src/adapters/FrameworkAdapter.ts` | `mapRouteToEntry` returns `Promise<RouteMatch> | RouteMatch`; 5 methods preserved | VERIFIED | Line 46 signature widened; 5-method count intact (detect, discoverEntries, resolveModule, extractComponents, mapRouteToEntry) |
| `src/adapters/next/NextJsAdapter.ts` | 3 stubs replaced with delegating shims; runtime plumbed | VERIFIED | Lines 43-53 async shims to detect/discover/route-map; lines 137-139 directive read; line 155 `runtime` on returned object; line 94 on synthetic parse-error record. `grep "not implemented"` returns 0 |
| `src/adapters/next/detect.ts` | `next.config.*` AND `app/`-or-`src/app/` heuristic | VERIFIED | Lines 22-36 do the two-step probe via `fs.access`; never imports config files (T-04-03 mitigated) |
| `src/adapters/next/discover.ts` | App Router specials enumeration with `_*` exclusion | VERIFIED | Lines 37-51 single tinyglobby pass; ignore `**/_*/**`; forward-slash + lex-sort |
| `src/adapters/next/segments.ts` | Pure regex classifier for all 8 segment kinds | VERIFIED | Lines 34-58 ordered regex match — optional-catch-all → catch-all → dynamic → 4 intercepting variants → group → parallel → private → static |
| `src/adapters/next/route-map.ts` | Segment-tree builder + walker producing RouteMatch | VERIFIED | `buildTree()` lines 92-139 with intercepting-alias registration; `walk()` lines 222-328; D-12 no-throw envelope at lines 351-422 |
| `test/fixtures/next-app-router/**` | 17-file kitchen-sink fixture covering all SPEC R1-R3+R5 examples | VERIFIED | `app/layout.tsx`, `app/page.tsx`, `(marketing)/about`, `@modal/login`, `dashboard/settings/{layout,page,loading}.tsx`, `feed/(.)photo/[id]`, `photo/[id]`, `blog/[slug]`, `files/[...rest]`, `maybe/[[...opt]]`, `_internal/scratch.tsx` all present on disk |
| `test/fixtures/next-detect-*/**` | 4 micro-fixtures for R5 truth table | VERIFIED | `with-app`, `with-src-app`, `pages-only`, `no-config` all present with correct shape |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `NextJsAdapter` | `detect.ts` | `import { detect as detectNextProject } from "./detect.js"` | WIRED | Line 38; called line 44 |
| `NextJsAdapter` | `discover.ts` | `import { discoverEntries as discoverNextEntries } from "./discover.js"` | WIRED | Line 39; called line 48 |
| `NextJsAdapter` | `route-map.ts` | `import { matchRoute } from "./route-map.js"` | WIRED | Line 40; called line 52 |
| `route-map.ts` | `discover.ts` | `import { resolveAppRoot } from "./discover.js"` | WIRED | Line 29; called line 361 (single-source-of-truth for app-root probe) |
| `route-map.ts` | `segments.ts` | `import { classifySegment, type SegmentKind } from "./segments.js"` | WIRED | Line 30; used at tree-build line 110 |
| `buildComponentDefinition` | `ast.program.directives` | First-directive read | WIRED | `NextJsAdapter.ts:137` `ast.program.directives[0]?.value.value` |
| `FrameworkAdapter.mapRouteToEntry` | `RouteMatch` | Return-type import | WIRED | `FrameworkAdapter.ts:1,46` |
| `ComponentDefinition.runtime` | 13-key shape test | `Object.keys` length assertion | WIRED | `test/adapters/types.test.ts` `toHaveLength(13)` confirmed by passing test |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full vitest suite | `npx vitest run --reporter=dot` | 188 passed, 0 failed | PASS |
| TypeScript typecheck | `npx tsc --noEmit` | exit 0, no errors | PASS |
| Phase 4 targeted tests (62 cases across architecture + types + 4 next/* test files) | `npx vitest run test/architecture test/adapters/types.test.ts test/adapters/next/{runtime,route-map,detect,discover}.test.ts` | 62 passed, 0 failed | PASS |
| Stub removed | `grep "not implemented in Phase 3" src/adapters/next/NextJsAdapter.ts` | 0 matches | PASS |
| Detect fixture truth table | `detect.test.ts:9,13,17,21` covers `with-app→true`, `with-src-app→true`, `pages-only→false`, `no-config→false` | 4 cases pass | PASS |
| Runtime D-16 variants | `runtime.test.ts` covers `"use client"` line-1, no-directive, `"use server"`, leading-comments-then-`"use client"` | 8 cases pass | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| NEXT-01 | 04-03-PLAN | Layout chain reconstruction (directory-based) | SATISFIED | `route-map.ts` walker + `harvestSpecials`; `route-map.test.ts:71-90` |
| NEXT-02 | 04-03-PLAN | Groups/parallel/intercepting/private routing semantics | SATISFIED | `segments.ts` classifier + `route-map.ts` walker special-case logic; `route-map.test.ts:24-58,98-127` |
| NEXT-03 | 04-03-PLAN | Dynamic segment param echo | SATISFIED | `route-map.ts:284-316`; `route-map.test.ts:136-156` |
| NEXT-04 | 04-01-PLAN, 04-04-PLAN | runtime field on every ComponentDefinition | SATISFIED | `types.ts:241` + `NextJsAdapter.ts:137-155,94`; `runtime.test.ts` 8 cases |

No orphaned requirements — all 4 NEXT requirements claimed by phase plans and all are satisfied.

### Anti-Patterns Found

None. Verified via:
- `grep "not implemented" src/adapters/next/NextJsAdapter.ts` → 0
- `grep "TODO|FIXME|XXX|HACK|PLACEHOLDER" src/adapters/next/*.ts` → 0
- No empty implementations (`return null`, `return []`) in non-error paths; the no-match `cloneEmpty()` shape in `route-map.ts:57-59` is the documented D-12 no-throw envelope, not a stub
- Synthetic parse-error record (`NextJsAdapter.ts:76-95`) is the documented D-12 fallback, not a stub

### Human Verification Required

None — Phase 4 deliverables are syntactic / structural and fully covered by automated fixtures and assertions. No UI rendering, no real-time behavior, no external service integration.

### Gaps Summary

No gaps. All four ROADMAP success criteria are satisfied by passing tests against on-disk fixtures, all 5 `FrameworkAdapter` methods are functional (no throwing stubs), every artifact exists and is wired into both producers and consumers, and the 188-test suite is green with a clean typecheck.

Notable observations (informational, not gaps):
- The summary's "Pre-existing Out-of-Scope Issues" notes 59 biome lint errors in plan 02/03 files. These pre-date plan 04-04 and were intentionally not addressed under scope-boundary rules. Lint cleanup, if desired, is a separate housekeeping task.
- Planning-doc updates (`ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`) for NEXT-01..04 status flips were intentionally deferred to the orchestrator post-merge per the executor invocation directive — also informational, not a verification gap.

---

*Verified: 2026-04-29*
*Verifier: Claude (gsd-verifier)*
