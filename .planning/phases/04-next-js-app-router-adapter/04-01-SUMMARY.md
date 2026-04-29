---
phase: 04-next-js-app-router-adapter
plan: 01
subsystem: adapters
tags: [next, types, fixtures, contracts]
requires:
  - src/adapters/types.ts (existing 11-field ComponentDefinition)
  - src/adapters/FrameworkAdapter.ts (existing 5-method interface)
provides:
  - RouteMatch interface (4 fields: matched, entries, params, slots)
  - ComponentDefinition.runtime: "server" | "client" (12th field, NEXT-04)
  - mapRouteToEntry return type: Promise<RouteMatch> | RouteMatch
  - Kitchen-sink fixture tree at test/fixtures/next-app-router/ (17 files)
  - Four micro-detect fixtures (test/fixtures/next-detect-*) for R5 truth table
affects:
  - test/adapters/types.test.ts (12 → 13 keys)
  - All Phase 4 wave 2/3 plans (consume RouteMatch + fixtures)
  - src/adapters/next/NextJsAdapter.ts (transient typecheck error until plan 04 wires runtime)
tech-stack:
  added: []
  patterns:
    - "RouteMatch flat-record (D-02 four-field shape, no tagged-object entries)"
    - "Per-file runtime field shared across all ComponentDefinitions from same source"
key-files:
  created:
    - test/fixtures/next-app-router/next.config.mjs
    - test/fixtures/next-app-router/app/layout.tsx
    - test/fixtures/next-app-router/app/page.tsx
    - test/fixtures/next-app-router/app/(marketing)/layout.tsx
    - test/fixtures/next-app-router/app/(marketing)/about/page.tsx
    - test/fixtures/next-app-router/app/@modal/login/page.tsx
    - test/fixtures/next-app-router/app/dashboard/layout.tsx
    - test/fixtures/next-app-router/app/dashboard/page.tsx
    - test/fixtures/next-app-router/app/dashboard/settings/layout.tsx
    - test/fixtures/next-app-router/app/dashboard/settings/page.tsx
    - test/fixtures/next-app-router/app/dashboard/settings/loading.tsx
    - test/fixtures/next-app-router/app/feed/(.)photo/[id]/page.tsx
    - test/fixtures/next-app-router/app/photo/[id]/page.tsx
    - test/fixtures/next-app-router/app/blog/[slug]/page.tsx
    - test/fixtures/next-app-router/app/files/[...rest]/page.tsx
    - test/fixtures/next-app-router/app/maybe/[[...opt]]/page.tsx
    - test/fixtures/next-app-router/app/_internal/scratch.tsx
    - test/fixtures/next-detect-with-app/next.config.mjs
    - test/fixtures/next-detect-with-app/app/page.tsx
    - test/fixtures/next-detect-with-src-app/next.config.js
    - test/fixtures/next-detect-with-src-app/src/app/page.tsx
    - test/fixtures/next-detect-pages-only/next.config.js
    - test/fixtures/next-detect-pages-only/pages/index.tsx
    - test/fixtures/next-detect-no-config/app/page.tsx
  modified:
    - src/adapters/types.ts
    - src/adapters/FrameworkAdapter.ts
    - test/adapters/types.test.ts
decisions:
  - "Appended `runtime` as 13th key in alphabetic-by-purpose order (boundary group at end)"
  - "RouteMatch uses flat 4-field shape with separate `slots` map (not tagged entries)"
  - "ARCH-01 5-method count preserved on FrameworkAdapter — only return type widened"
metrics:
  duration: ~10 min
  completed: 2026-04-29
---

# Phase 04 Plan 01: Types & Fixtures Summary

Locked the type contracts and on-disk fixture trees that every other Phase 4 plan consumes. Added `RouteMatch`, appended `runtime` to `ComponentDefinition` (12 → 13 fields), widened `FrameworkAdapter.mapRouteToEntry` return type, and laid down the kitchen-sink + four detect micro-fixtures.

## What Shipped

### Type Contracts

**`ComponentDefinition` (now 13 fields, alphabetic-by-purpose):**

| Group     | Fields                                                     |
| --------- | ---------------------------------------------------------- |
| identity  | name, file, line, kind                                     |
| wrappers  | wrappers                                                   |
| interface | props, textContent                                         |
| render    | renderFlow                                                 |
| styles    | classNames, inlineStyles, cssModuleRefs, styledTemplates   |
| boundary  | runtime ("server" \| "client") — NEW                       |

**`RouteMatch` shape (D-02):**

```typescript
export interface RouteMatch {
  matched: boolean;
  entries: string[];                          // forward-slash absolute, root-down, specials inlined
  params: Record<string, string | string[]>;  // [slug] → string, [...rest] → string[]
  slots: Record<string, string[]>;            // @modal → "modal" key (no `@`)
}
```

D-12 no-throw: any failure (malformed route, missing app/, etc.) collapses to:

```typescript
{ matched: false, entries: [], params: {}, slots: {} }
```

**`FrameworkAdapter.mapRouteToEntry` signature (5-method count preserved):**

```typescript
mapRouteToEntry(absRoot: string, route: string): Promise<RouteMatch> | RouteMatch;
```

### Fixture Tree — `test/fixtures/next-app-router/` (17 files)

```
next.config.mjs
app/
├── layout.tsx                             # root layout (no directive)
├── page.tsx                               # root page
├── (marketing)/
│   ├── layout.tsx                         # group layout
│   └── about/page.tsx                     # "use client" line-1 variant
├── @modal/login/page.tsx                  # parallel slot
├── dashboard/
│   ├── layout.tsx
│   ├── page.tsx
│   └── settings/
│       ├── layout.tsx
│       ├── page.tsx                       # NEXT-01 acceptance terminal
│       └── loading.tsx                    # sibling for special-files test
├── feed/(.)photo/[id]/page.tsx            # intercepting (NEXT-02)
├── photo/[id]/page.tsx                    # sibling target of (.)photo
├── blog/[slug]/page.tsx                   # "use server" + dynamic
├── files/[...rest]/page.tsx               # catch-all
├── maybe/[[...opt]]/page.tsx              # leading-comments + use client + optional catch-all
└── _internal/scratch.tsx                  # private-folder exclusion
```

**D-16 runtime variants represented:**

| Variant                          | File                                              |
| -------------------------------- | ------------------------------------------------- |
| Line-1 `"use client"`            | `app/(marketing)/about/page.tsx`                  |
| No directive (server default)    | `app/layout.tsx`, `app/page.tsx`, etc.            |
| Line-1 `"use server"`            | `app/blog/[slug]/page.tsx`                        |
| Leading comments + `"use client"`| `app/maybe/[[...opt]]/page.tsx`                   |

### Detect Fixtures — `test/fixtures/next-detect-*/` (4 trees, 7 files, R5 truth table)

| Fixture                       | Has `next.config.*` | Has `app/` | Has `src/app/` | Has `pages/` | detect() expected |
| ----------------------------- | ------------------- | ---------- | -------------- | ------------ | ----------------- |
| `next-detect-with-app/`       | yes (`.mjs`)        | yes        | no             | no           | true              |
| `next-detect-with-src-app/`   | yes (`.js`)         | no         | yes            | no           | true              |
| `next-detect-pages-only/`     | yes (`.js`)         | no         | no             | yes          | false             |
| `next-detect-no-config/`      | no                  | yes        | no             | no           | false             |

## Commits

| Task | Hash    | Subject                                                                            |
| ---- | ------- | ---------------------------------------------------------------------------------- |
| 1    | af6d2aa | feat(04-01): add RouteMatch + runtime field, widen mapRouteToEntry                 |
| 2    | 2b4bf9d | feat(04-01): add kitchen-sink Next.js App Router fixture tree                      |
| 3    | a3b3218 | feat(04-01): add four micro-detect fixtures for R5 truth table                     |

## Verification

- `npx vitest run test/adapters/types.test.ts test/adapters/FrameworkAdapter.test.ts --reporter=dot` → 2/2 passed
- `grep -c "export interface RouteMatch" src/adapters/types.ts` → 1
- `grep -c "Promise<RouteMatch> | RouteMatch" src/adapters/FrameworkAdapter.ts` → 1
- `grep -c "toHaveLength(13)" test/adapters/types.test.ts` → 1; `toHaveLength(12)` → 0
- All 17 kitchen-sink + 7 micro-detect fixture files exist on disk

## Confirmation Notes

- `test/adapters/next/NextJsAdapter.test.ts` lines 25-29 ("throws not implemented" assertions) remain in place — Plan 04-04 is the wave that rewrites NextJsAdapter and removes them.
- `src/adapters/next/NextJsAdapter.ts` will exhibit a transient typecheck error because `extractComponents` still returns 12-field records (no `runtime`). This is **intentional and scoped** — Plan 04-04 fixes it. Vitest tests do not block on `tsc --noEmit`, so the test suite remains green.
- Method count on `FrameworkAdapter` interface unchanged (still 5) — ARCH-01 lock preserved; only the `mapRouteToEntry` return type widened.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- src/adapters/types.ts → modified (RouteMatch + runtime field)
- src/adapters/FrameworkAdapter.ts → modified (RouteMatch import + return type)
- test/adapters/types.test.ts → modified (13-key count assertion)
- All 17 kitchen-sink fixture files present
- All 7 micro-detect fixture files present
- Commits af6d2aa, 2b4bf9d, a3b3218 confirmed via `git log --oneline`
