---
phase: 04-next-js-app-router-adapter
plan: 03
subsystem: adapters/next
tags: [next, routing, segments, layout-chain, parallel-routes, dynamic-segments]
requires:
  - src/adapters/types.ts (RouteMatch interface from plan 01)
  - src/adapters/next/discover.ts (resolveAppRoot from plan 02)
  - src/core/paths.ts (toForwardSlash)
  - tinyglobby ^0.2.16
  - test/fixtures/next-app-router/* (kitchen-sink fixture from plan 01)
  - test/fixtures/next-detect-pages-only/, test/fixtures/__does_not_exist__ (D-12 cases)
provides:
  - classifySegment(folder) → SegmentKind  (pure regex classifier)
  - extractParam(folder) → { name, kind } | null
  - SegmentKind discriminated union (8 variants)
  - matchRoute(absRoot, route) → Promise<RouteMatch>  (NEXT-01/02/03)
affects:
  - plan 04 (NextJsAdapter.mapRouteToEntry will delegate to matchRoute)
tech-stack:
  added: []
  patterns:
    - "Per-call segment tree (ARCH-02): one tinyglobby pass → tree → walk URL → GC'd on return"
    - "Two-pass tree build: insert files, then promote @slot children to parallelSiblings"
    - "Group transparency via expandGroups (transitive: groups inside groups)"
    - "Intercepting alias under stripped target name (v1 — no nav-context simulation)"
    - "Slot subtrees probed at root regardless of main-match (T-04-13 separation)"
key-files:
  created:
    - src/adapters/next/segments.ts
    - src/adapters/next/route-map.ts
    - test/adapters/next/route-map.test.ts
  modified: []
decisions:
  - "Within-segment emission order locked: layout, template, loading, error, notFound, default, page"
  - "Intercepting v1 interpretation: alias child registered under stripped target — no navigation-context"
  - "Slot probing always runs at root; slot output never leaks into main entries"
  - "Optional catch-all empty match: /maybe matches app/maybe/[[...opt]]/page.tsx with params.opt = []"
metrics:
  duration: ~12 min
  completed: 2026-04-29
  tasks: 3
  files_changed: 3
---

# Phase 04 Plan 03: matchRoute & classifySegment Summary

Closed SPEC NEXT-01, NEXT-02, NEXT-03 (3 of 4 phase requirements). Shipped the
routing brain — `matchRoute(absRoot, route)` — backed by a pure regex
classifier `classifySegment` and a per-call segment tree that is GC'd on
return (ARCH-02). Plan 04-04 will wire the result into
`NextJsAdapter.mapRouteToEntry`.

## Public API

### `src/adapters/next/segments.ts`

```typescript
export type SegmentKind =
  | { kind: "static"; name: string }
  | { kind: "dynamic"; param: string }                       // [slug]
  | { kind: "catch-all"; param: string }                     // [...rest]
  | { kind: "optional-catch-all"; param: string }            // [[...opt]]
  | { kind: "group"; label: string }                         // (marketing)
  | { kind: "parallel"; slot: string }                       // @modal
  | { kind: "intercepting"; level: 0 | 1 | 2 | "root"; targetSegment: string } // (.)x / (..)x / (..)(..)x / (...)x
  | { kind: "private"; name: string };                       // _internal

export function classifySegment(folder: string): SegmentKind;
export function extractParam(
  folderName: string,
): { name: string; kind: "single" | "catch-all" | "optional-catch-all" } | null;
```

Pure file: 0 imports, 0 throws. Order-sensitive matchers verified by
the 13 classifier-specific tests:

| Order | Pattern | Why first |
| ----- | ------- | --------- |
| 1 | `[[...x]]` optional-catch-all | More specific than `[...x]` |
| 2 | `[...x]` catch-all | More specific than `[x]` |
| 3 | `[x]` dynamic | Bracket family |
| 4 | `(...)x` intercepting root | Otherwise eaten by group `(x)` |
| 5 | `(..)(..)x` intercepting level 2 | Two-paren prefix unique |
| 6 | `(..)x` intercepting level 1 | |
| 7 | `(.)x` intercepting level 0 | |
| 8 | `(x)` group | Plain paren |
| 9 | `@x` parallel | |
| 10 | `_x` private | |
| 11 | (fallthrough) | static |

### `src/adapters/next/route-map.ts`

```typescript
export async function matchRoute(absRoot: string, route: string): Promise<RouteMatch>;
```

D-12 no-throw: malformed route (non-string, missing leading `/`,
path-traversal `.`/`..` tokens), missing `app/`, glob failure, and
walker dead-ends all collapse to:

```typescript
{ matched: false, entries: [], params: {}, slots: {} }
```

When `matched: false` but a root-level `@slot` subtree contains a
matching sub-tree for the URL, the `slots` map is still populated
(e.g. `/login` returns `matched: false` but `slots.modal` includes
`app/@modal/login/page.tsx`).

## Within-Segment Emission Order

At every segment level visited (root layout down to terminal segment),
the walker emits files in this exact order:

```
layout, template, loading, error, notFound, default, page
```

`page.tsx` is appended LAST at the terminal node (or at the
optional-catch-all child when handling parent-path empty match).

## Intercepting Routes — v1 Interpretation

Next.js intercepting routes (`(.)x`, `(..)x`, `(..)(..)x`, `(...)x`)
have a navigation-context-dependent meaning in real Next.js: whether
the intercepting route renders depends on where the user navigated
FROM. v1 does not simulate navigation context.

**Algorithm:** during `buildTree`, when a folder classifies as
`{ kind: "intercepting", targetSegment }`, the same node is also
registered in the parent's `children` map under the bare
`targetSegment` name (insertion-order tie-breaker, first wins). The
URL walker therefore matches `/photo/123` against either:

- `app/photo/[id]/page.tsx` (the regular target), or
- `app/feed/(.)photo/[id]/page.tsx` (the intercept) — only when reachable
  from the same parent

The acceptance test asserts only that `/photo/123` matches without
throwing and produces a non-empty `entries` chain.

**Known v1 limitation, surfaced for plan 04-04 / Phase 5 to consider:**

- We do NOT distinguish "from-intercept" vs "direct" routing.
- We do NOT emit BOTH targets — the first registered wins.
- A future revision may emit intercepting pages under their real
  parent-segment paths, with a `routedVia: "intercept"` flag once we
  add navigation-context modeling.

## Optional Catch-All Empty Match (Pitfall 3)

`app/maybe/[[...opt]]/page.tsx` matches all of:

| URL          | params                |
| ------------ | --------------------- |
| `/maybe`     | `{ opt: [] }`         |
| `/maybe/x`   | `{ opt: ["x"] }`      |
| `/maybe/x/y` | `{ opt: ["x", "y"] }` |

Implementation: when URL tokens are exhausted at a node WITHOUT its
own `page.tsx`, the walker probes for an optional-catch-all child and
emits its `page.tsx` with `params[opt] = []`. This is the
"parent-path match" flow for optional catch-all — a Next.js semantic
(not a Next.js convention reused naively).

## Parallel Slots — No Leakage Confirmation (T-04-13)

`parallelSiblings` is a separate `Map<string, SegmentNode>` from
`children`. The walker:

1. Probes each `parallelSiblings` entry at the visited node against
   the SAME remaining URL segments via `walkSlot`.
2. Pushes the slot's matched entries (specials + page) into
   `slots[slotName]`.
3. NEVER pushes slot output into `entries`.

Verified by NEXT-02 test:

```typescript
expect(m.entries.some((p) => p.includes("/@modal/"))).toBe(false);
```

When `/login` is queried against the kitchen-sink fixture:

- Main `entries` does NOT match (no `app/login/page.tsx`).
- `slots.modal` contains `app/@modal/login/page.tsx`.
- `m.matched` is `false` (D-03 conservative — only main match flips
  the flag).

## Commits

| Task | Hash    | Subject                                                                  |
| ---- | ------- | ------------------------------------------------------------------------ |
| 1 RED  | 094e3ef | test(04-03): add failing tests for matchRoute + classifySegment        |
| 1 GRN  | d17d1de | feat(04-03): implement classifySegment + extractParam (NEXT-02/03)     |
| 2 GRN  | 6fa8faa | feat(04-03): implement matchRoute for NEXT-01/02/03                    |

Task 3 (test file) was completed inside the Task 1 RED commit and grew
no further code — the same 34-case file passes all classifier and
walker assertions.

## Verification

- `npx vitest run test/adapters/next/route-map.test.ts --reporter=dot` → **34/34 passed**
- `npx vitest run --reporter=dot` → **173 passed | 5 skipped** (pre-existing MCP smoke failure unchanged, documented in plan 04-02 SUMMARY)
- `grep -c "throw " src/adapters/next/segments.ts` → 0
- `grep -c "import " src/adapters/next/segments.ts` → 0
- `grep -c "throw " src/adapters/next/route-map.ts` → 0
- `grep -c 'import.*resolveAppRoot.*"./discover.js"' src/adapters/next/route-map.ts` → 1
- `grep -c 'from "tinyglobby"' src/adapters/next/route-map.ts` → 1
- `grep -c 'ignore: \["\*\*/_\*/\*\*"' src/adapters/next/route-map.ts` → 1
- `grep -c "matched: false, entries: \[\], params: {}, slots: {}" src/adapters/next/route-map.ts` → 2 (cloneEmpty body + early-return literal in matchRoute)
- Test file imports BOTH `matchRoute` and `classifySegment, extractParam` (Task 3 acceptance)
- 34 `it()` cases (Task 3 acceptance)

## Threat Model Notes

| Threat ID | Disposition | Status                                                                                   |
| --------- | ----------- | ---------------------------------------------------------------------------------------- |
| T-04-09 (path traversal `/../etc`)         | mitigate | Top-of-`matchRoute` guard rejects `.`/`..` URL tokens → `cloneEmpty()`. Verified by D-12 test. |
| T-04-10 (info disclosure via `_private`)   | mitigate | (1) glob `ignore: ["**/_*/**", ...]`; (2) classifier `private` variant short-circuits tree-build. Verified by NEXT-02 test across 6 routes. |
| T-04-11 (symlink loop)                     | mitigate | tinyglobby has built-in inode tracking; tree-build is finite by construction.            |
| T-04-12 (10000-segment URL)                | accept   | URL-bounded recursion; no v1 SLA. Cap can be added later if observed.                   |
| T-04-13 (slot leakage into entries)        | mitigate | `parallelSiblings` separate from `children`; walker only writes to `slots[*]`. Verified by NEXT-02 negative assertion. |

## TDD Gate Compliance

Both Task 1 and Task 2 are `tdd="true"`. Gate sequence verified in `git log`:

| Gate    | Commit  | Evidence                                                              |
| ------- | ------- | --------------------------------------------------------------------- |
| RED     | 094e3ef | `test(04-03): add failing tests` — confirmed FAIL before GREEN commit |
| GREEN-1 | d17d1de | `feat(04-03): implement classifySegment + extractParam`               |
| GREEN-2 | 6fa8faa | `feat(04-03): implement matchRoute for NEXT-01/02/03`                 |

No REFACTOR commits — no post-GREEN cleanup needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] route-map.ts stub between Task 1 and Task 2**
- **Found during:** Task 1 GREEN
- **Issue:** Task 3's test file imports both `matchRoute` and `classifySegment` from a single test file. Running classifier tests alone with `-t "classifySegment"` still triggers Vitest's module-load phase, which fails on the missing `route-map.js` import. Vitest cannot skip module-load via `-t` filtering.
- **Fix:** Created a 10-line stub of `route-map.ts` returning `cloneEmpty()` so Task 1 verify could run. The stub was replaced wholesale by the Task 2 GREEN commit. Stub never reached Task 1's commit boundary as a stand-alone artifact — both files landed in the same commit with the comment "route-map.ts ships as a stub (full impl in next commit)".
- **Files modified:** `src/adapters/next/route-map.ts` (stub)
- **Commits:** d17d1de (introduces stub alongside segments.ts), 6fa8faa (replaces stub)

**2. [Rule 2 — Critical Functionality] Slot probing on no-main-match**
- **Found during:** Task 2 GREEN run (one failing test out of 34)
- **Issue:** The plan's `<behavior>` specified slot probing happens at each level the slot was registered; it did NOT spell out behavior when the main URL has no main-tree match (e.g. `/login` has no `app/login/page.tsx` but DOES have `app/@modal/login/page.tsx`). The NEXT-02 acceptance test asserts `Array.isArray(m.slots.modal) === true` regardless of main-match outcome.
- **Fix:** Added a root-level slot probe at the end of `matchRoute` that runs unconditionally; results merge with walker-emitted slots and surface even on `matched: false`. Slot output never leaks into main `entries` (T-04-13 still upheld — `expect(...includes("/@modal/")).toBe(false)` passes).
- **Files modified:** `src/adapters/next/route-map.ts` (matchRoute final block)
- **Commit:** 6fa8faa

## Self-Check: PASSED

- `src/adapters/next/segments.ts` → exists, exports `classifySegment`, `extractParam`, type `SegmentKind`
- `src/adapters/next/route-map.ts` → exists, exports `matchRoute`
- `test/adapters/next/route-map.test.ts` → exists, 34 it() cases passing
- Commit 094e3ef confirmed (RED test)
- Commit d17d1de confirmed (segments.ts + stub)
- Commit 6fa8faa confirmed (matchRoute full implementation)
- 34/34 plan tests green; full suite shows only the pre-existing out-of-scope MCP smoke failure
