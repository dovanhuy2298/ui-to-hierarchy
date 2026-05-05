---
phase: 06-hardening-fixture-gates
plan: 03
subsystem: test-fixtures
tags: [fixture, monorepo, pnpm, tsconfig-paths, extends-chain, barrel]
requires: []
provides:
  - "test/fixtures/phase-06/pnpm-monorepo/ — two-app pnpm monorepo fixture for SPEC R3"
  - "Cross-app non-contamination anchors: 'Buy now' (web only), 'Manage users' (admin only), 'DataTable' (admin + packages/ui only)"
  - "Two-level tsconfig extends chain (apps/<app>/tsconfig.json → ../../tsconfig.base.json)"
  - "@acme/ui + @acme/ui/* path aliases pointing into packages/ui/src"
affects:
  - "Wave 1 integration suite (06-04-PLAN) consumes this fixture"
tech-stack:
  added: []
  patterns:
    - "tsconfig-paths-only resolution (D-05) — no fake node_modules"
    - "Real pnpm-workspace.yaml + minimal root package.json marker (D-06)"
    - "Barrel re-export from per-component leaf files"
key-files:
  created:
    - "test/fixtures/phase-06/pnpm-monorepo/pnpm-workspace.yaml"
    - "test/fixtures/phase-06/pnpm-monorepo/package.json"
    - "test/fixtures/phase-06/pnpm-monorepo/tsconfig.base.json"
    - "test/fixtures/phase-06/pnpm-monorepo/apps/web/tsconfig.json"
    - "test/fixtures/phase-06/pnpm-monorepo/apps/web/package.json"
    - "test/fixtures/phase-06/pnpm-monorepo/apps/web/next.config.js"
    - "test/fixtures/phase-06/pnpm-monorepo/apps/web/app/layout.tsx"
    - "test/fixtures/phase-06/pnpm-monorepo/apps/web/app/page.tsx"
    - "test/fixtures/phase-06/pnpm-monorepo/apps/admin/tsconfig.json"
    - "test/fixtures/phase-06/pnpm-monorepo/apps/admin/package.json"
    - "test/fixtures/phase-06/pnpm-monorepo/apps/admin/next.config.js"
    - "test/fixtures/phase-06/pnpm-monorepo/apps/admin/app/layout.tsx"
    - "test/fixtures/phase-06/pnpm-monorepo/apps/admin/app/page.tsx"
    - "test/fixtures/phase-06/pnpm-monorepo/packages/ui/package.json"
    - "test/fixtures/phase-06/pnpm-monorepo/packages/ui/src/index.ts"
    - "test/fixtures/phase-06/pnpm-monorepo/packages/ui/src/button.tsx"
    - "test/fixtures/phase-06/pnpm-monorepo/packages/ui/src/datatable.tsx"
  modified: []
decisions:
  - "Followed D-05 verbatim path map (@acme/ui + @acme/ui/*) in tsconfig.base.json"
  - "Followed D-06 verbatim pnpm-workspace.yaml shape and minimal monorepo-root package.json"
  - "Followed D-07 import shape — apps/web imports Button only ('Buy now'); apps/admin imports Button + DataTable ('Manage users')"
metrics:
  duration_seconds: 111
  completed: "2026-05-05"
  task_count: 1
  file_count: 17
---

# Phase 06 Plan 03: pnpm-monorepo Fixture Summary

Hand-crafted 17-file pnpm monorepo fixture under `test/fixtures/phase-06/pnpm-monorepo/` providing the SPEC R3 scenario: two Next.js App Router apps (`apps/web`, `apps/admin`) sharing a `@acme/ui` package via tsconfig path aliases, with a two-level `extends` chain and a barrel-leaf import path. No `node_modules`; resolution flows entirely through tsconfig per D-05.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Author pnpm-monorepo fixture tree | a0e8894 | 17 fixture files under test/fixtures/phase-06/pnpm-monorepo/ |

## What Was Built

### Monorepo root (3 files)
- `pnpm-workspace.yaml` — `apps/*` + `packages/*` (D-06 verbatim)
- `package.json` — `{ "name": "monorepo-root", "private": true }` (resolveRoot marker per ARCH-03)
- `tsconfig.base.json` — `@acme/ui` → `packages/ui/src/index.ts` and `@acme/ui/*` → `packages/ui/src/*` (D-05 verbatim path map)

### apps/web (5 files)
- `tsconfig.json` extends `../../tsconfig.base.json`
- `package.json` — `@acme/web` private
- `next.config.js` — empty `module.exports = {}`
- `app/layout.tsx` — html/body root layout
- `app/page.tsx` — imports `Button` only from `@acme/ui`; renders `<Button label="Buy now" />`

### apps/admin (5 files)
- Mirrors apps/web structure
- `app/page.tsx` — imports BOTH `Button` and `DataTable`; renders `<Button label="Manage users" />` and `<DataTable />`

### packages/ui (4 files)
- `package.json` — `@acme/ui` private with `main: ./src/index.ts`
- `src/index.ts` — barrel: `export { Button } from "./button"; export { DataTable } from "./datatable";`
- `src/button.tsx` — `Button({ label })` leaf with Tailwind classes
- `src/datatable.tsx` — `DataTable()` leaf with grid Tailwind classes

## Cross-Contamination Anchors (D-07)

The integration suite (Wave 1, 06-04) will assert these uniqueness properties:

| Anchor string | Appears in | Asserts |
|---------------|------------|---------|
| `Buy now` | apps/web/app/page.tsx only | `--root apps/web` returns Button with this label |
| `Manage users` | apps/admin/app/page.tsx only | `--root apps/admin` returns Button with this label |
| `DataTable` | apps/admin/app/page.tsx + packages/ui/* | `--root apps/web` does NOT include DataTable |

Verified via the plan's automated check (`node -e "..."`) — all checks passed: 17 files exist, no Buy-now leakage into admin, no Manage-users/DataTable leakage into web, 0 node_modules directories.

## Acceptance Criteria — All Pass

- 17 files exist at listed paths.
- `tsconfig.base.json` contains `@acme/ui` (count ≥ 1).
- Both apps' `tsconfig.json` contain `extends` (count = 1 each).
- `apps/web/app/page.tsx` contains `Buy now` (count = 1); admin tree has zero `Buy now` matches.
- `apps/admin/app/page.tsx` contains `Manage users` (count = 1); web tree has zero `Manage users` matches.
- `apps/admin/app/page.tsx` contains `DataTable` (count ≥ 1); web tree has zero `DataTable` matches.
- `packages/ui/src/index.ts` contains both `export { Button }` and `export { DataTable }` (count = 1 each).
- Zero `node_modules` directories under the fixture tree.
- `pnpm-workspace.yaml` exists and contains `apps/*` line.

## Deviations from Plan

None — plan executed exactly as written. The 17-file tree matches the spec verbatim, all D-05/D-06/D-07 constraints honored, all acceptance criteria satisfied on the first pass.

## Decisions Made

- D-05 (tsconfig-paths-only, no node_modules): honored — no `node_modules` directory was created anywhere under the fixture tree.
- D-06 (real pnpm-workspace.yaml + minimal root package.json): honored verbatim.
- D-07 (two apps, shared barrel, non-overlapping trees): honored — `Buy now` ⊥ `Manage users` ⊥ `DataTable` across web/admin source files.
- Per Assumption A5: each app has a minimal `package.json` to give `resolveRoot` a usable workspace marker at zero install cost.

## Threat Surface Scan

No new runtime threat surface. Fixture is test-only static data; all identifiers (`@acme/web`, `@acme/admin`, `@acme/ui`, "Buy now", "Manage users") are synthetic. T-06-03 (Information Disclosure) remains accepted per the plan's threat model.

## Self-Check: PASSED

- Fixture files (17): FOUND under `test/fixtures/phase-06/pnpm-monorepo/`
- Commit `a0e8894`: FOUND in git log on `worktree-agent-ad314bd4c52d63923`
- Automated verification (`node -e "..."`): PASSED (`ok`)
- node_modules count: 0 (PASSED)
- Total file count under fixture root: 17 (matches spec)
