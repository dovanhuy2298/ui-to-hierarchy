---
phase: 06-hardening-fixture-gates
plan: 01
subsystem: test-fixtures
tags: [fixture, shadcn, barrel, app-router, spec-r1]
requires: []
provides:
  - shadcn-barrels-fixture
affects:
  - test/fixtures/phase-06/shadcn-barrels
tech-stack:
  added: []
  patterns:
    - "tsconfig-paths-only resolution target (no node_modules)"
    - "App Router minimal shape (next.config.js + app/layout.tsx + app/page.tsx)"
    - "2-hop barrel chain: page → @/components/ui (index.ts) → ./button|./card → leaf .tsx"
key-files:
  created:
    - test/fixtures/phase-06/shadcn-barrels/tsconfig.json
    - test/fixtures/phase-06/shadcn-barrels/next.config.js
    - test/fixtures/phase-06/shadcn-barrels/app/layout.tsx
    - test/fixtures/phase-06/shadcn-barrels/app/page.tsx
    - test/fixtures/phase-06/shadcn-barrels/app/components/ui/index.ts
    - test/fixtures/phase-06/shadcn-barrels/app/components/ui/button.tsx
    - test/fixtures/phase-06/shadcn-barrels/app/components/ui/card.tsx
  modified: []
decisions:
  - "Followed D-05 strictly: no node_modules, no package.json — pure tsconfig-paths resolution target"
  - "Used 2-hop barrel chain (CONTEXT.md default) rather than deeper chain — simplest shape that exercises R1"
  - "Embedded find_by_text target 'Click me' in app/page.tsx (visible-text invariant) and 'flex'/'flex-col' className tokens in leaf components (find_by_style invariant)"
metrics:
  duration: ~5 minutes
  completed: 2026-05-05
  tasks_completed: 1
  files_created: 7
  files_modified: 0
---

# Phase 06 Plan 01: shadcn-barrels Fixture Summary

Hand-crafted Next.js App Router fixture proving SPEC R1 barrel-chain resolution lands on leaf component files (`button.tsx`, `card.tsx`) rather than the barrel `index.ts`.

## What Was Built

A 7-file fixture tree at `test/fixtures/phase-06/shadcn-barrels/` representing a minimal shadcn-style Next.js project:

- `tsconfig.json` — defines `"@/*": ["./app/*"]` path alias so `@/components/ui` resolves to `./app/components/ui`.
- `next.config.js` — Next.js detection marker (`module.exports = {};`).
- `app/layout.tsx` — root layout (html/body wrapper).
- `app/page.tsx` — imports `{ Button, Card } from "@/components/ui"` and renders `<Card><Button>Click me</Button></Card>`.
- `app/components/ui/index.ts` — barrel re-exporting `Button` and `Card` from per-component leaf files.
- `app/components/ui/button.tsx` — leaf with className `"flex items-center gap-2 px-4 py-2"`.
- `app/components/ui/card.tsx` — leaf with className `"flex flex-col rounded-lg border p-4"`.

The barrel chain `page.tsx → @/components/ui (index.ts) → ./button → button.tsx` is wired and ready for the Wave 1 integration suite (06-04) to verify that Phase 3's resolver chases through the barrel to the leaf.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1    | Author shadcn-barrels fixture tree | `d79b06a` | All 7 fixture files |

## Verification

All acceptance criteria from the plan passed:

- All 7 required files exist; no `node_modules/` directory present.
- `tsconfig.json` defines `"@/*"` path alias (1 match).
- `app/page.tsx` imports from `"@/components/ui"` (1 match) and contains find_by_text target `Click me` (1 match).
- `app/components/ui/index.ts` exports both `Button` and `Card` (1 match each).
- `app/components/ui/button.tsx` carries find_by_style target `flex` (1 match).
- All 5 `.tsx`/`.ts` source files parse cleanly with `@babel/parser` (`{ plugins: ['jsx', 'typescript'] }`) — confirms the project's existing parser will accept them when the integration suite invokes resolution.

## Deviations from Plan

None — plan executed exactly as written.

The plan specified file shapes verbatim; all 7 files were created with the prescribed content. No deviation rules triggered (no bugs, no missing critical functionality, no blocking issues, no architectural questions). D-05 (no `node_modules`, no `package.json`) was honored.

### Process note (not a content deviation)

During initial Write operations the agent inadvertently used the absolute path `e:\ui-to-hierarch\test\fixtures\...` (main repo) instead of the worktree path `e:\ui-to-hierarch\.claude\worktrees\agent-adacb27b26c94402a\test\fixtures\...`. The misplaced files were removed from the main repo and re-written to the correct worktree location before any commit was attempted, so the committed history contains only the intended fixture files in the correct path.

## Self-Check: PASSED

- Created files exist:
  - FOUND: `test/fixtures/phase-06/shadcn-barrels/tsconfig.json`
  - FOUND: `test/fixtures/phase-06/shadcn-barrels/next.config.js`
  - FOUND: `test/fixtures/phase-06/shadcn-barrels/app/layout.tsx`
  - FOUND: `test/fixtures/phase-06/shadcn-barrels/app/page.tsx`
  - FOUND: `test/fixtures/phase-06/shadcn-barrels/app/components/ui/index.ts`
  - FOUND: `test/fixtures/phase-06/shadcn-barrels/app/components/ui/button.tsx`
  - FOUND: `test/fixtures/phase-06/shadcn-barrels/app/components/ui/card.tsx`
- Commit exists: FOUND `d79b06a` (`test(06-01): add shadcn-barrels fixture ...`)
- No `node_modules/` under fixture: confirmed.
- All `.tsx`/`.ts` files parse with `@babel/parser`: confirmed.
