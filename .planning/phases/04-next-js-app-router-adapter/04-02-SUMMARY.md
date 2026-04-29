---
phase: 04-next-js-app-router-adapter
plan: 02
subsystem: adapters/next
tags: [next, filesystem, detect, discover, tinyglobby]
requires:
  - src/core/paths.ts (toForwardSlash)
  - tinyglobby ^0.2.16
  - test/fixtures/next-app-router/* (plan 01)
  - test/fixtures/next-detect-* (plan 01)
provides:
  - detect(absRoot) → Promise<boolean>  (R5)
  - discoverEntries(absRoot) → Promise<string[]>  (R6)
  - resolveAppRoot(absRoot) → Promise<string | null>  (helper for plan 03)
affects:
  - plan 03 (route-map.ts will import resolveAppRoot)
  - plan 04 (NextJsAdapter wires both methods)
tech-stack:
  added: []
  patterns:
    - "fs.access existence-probe (no import() of user code) — D-12 + T-04-07"
    - "Single-pass tinyglobby with absolute:true, ignore:['**/_*/**','**/node_modules/**']"
    - "Forward-slash discipline via toForwardSlash; explicit code-point lex-sort"
key-files:
  created:
    - src/adapters/next/detect.ts
    - src/adapters/next/discover.ts
    - test/adapters/next/detect.test.ts
    - test/adapters/next/discover.test.ts
  modified: []
decisions:
  - "detect uses fs.access only — never import()s next.config.* (T-04-07 mitigation)"
  - "resolveAppRoot is a public export of discover.ts so plan 03 reuses the same probe"
  - "Glob ignore list is hard-coded in discover.ts; plan 03 must replicate exactly (T-04-06)"
  - "route.ts is NOT in the special-file allow-list — Next.js Route Handlers are out of scope for v1 UI hierarchy"
metrics:
  duration: ~12 min
  completed: 2026-04-29
  tasks: 4
  files_changed: 4
---

# Phase 04 Plan 02: detect & discoverEntries Summary

Closed SPEC R5 and R6: implemented the two purely-filesystem methods of `NextJsAdapter` as standalone modules with no parser involvement, no `RouteMatch` machinery. Plus exported `resolveAppRoot` for plan 03 to reuse, and locked the glob-ignore policy that plan 03's `route-map.ts` must mirror.

## Public API

### `src/adapters/next/detect.ts`

```typescript
export async function detect(absRoot: string): Promise<boolean>;
```

R5 truth table (verified by 6 tests):

| Fixture                       | next.config.* | app/ | src/app/ | detect() |
| ----------------------------- | ------------- | ---- | -------- | -------- |
| `next-detect-with-app/`       | mjs           | yes  | —        | true     |
| `next-detect-with-src-app/`   | js            | —    | yes      | true     |
| `next-detect-pages-only/`     | js            | —    | —        | false    |
| `next-detect-no-config/`      | —             | yes  | —        | false    |
| `__does_not_exist__`          | —             | —    | —        | false (no-throw, D-12) |

Implementation: pure `fs.access` probe, no `import()` of user config (T-04-07 mitigation). `try/catch` collapses ENOENT/EACCES to `false`.

### `src/adapters/next/discover.ts`

```typescript
export async function resolveAppRoot(absRoot: string): Promise<string | null>;
export async function discoverEntries(absRoot: string): Promise<string[]>;
```

`resolveAppRoot`: returns `<absRoot>/app` if it exists, else `<absRoot>/src/app`, else `null`. Reusable from plan 03's `route-map.ts`.

`discoverEntries`: single tinyglobby pass under `cwd: appRoot`, returns forward-slash absolute paths sorted by explicit code-point comparator (Pitfall 4).

**Glob string used:**

```
**/{page,layout,template,loading,error,not-found,default}.{tsx,jsx,ts,js}
```

**Ignore list (hard-coded, must be mirrored by plan 03):**

```
**/_*/**            # private folders (D-09)
**/node_modules/**  # T-04-06 — no info disclosure
```

**Allow-list enforcement (verified by grep + regex test):**

| In allow-list  | NOT in allow-list |
| -------------- | ----------------- |
| page           | route             |
| layout         | middleware        |
| template       | global-error      |
| loading        | (any other name)  |
| error          |                   |
| not-found      |                   |
| default        |                   |

`route.ts` / `route.tsx` are **deliberately excluded** — Route Handlers are HTTP endpoints, not UI components. `grep -cE "route\.ts|route\.tsx" src/adapters/next/discover.ts` → 0.

## Confirmation: `resolveAppRoot` Exported for Plan 03

```bash
$ grep -c "export async function resolveAppRoot" src/adapters/next/discover.ts
1
```

Plan 03's `src/adapters/next/route-map.ts` will `import { resolveAppRoot } from "./discover.js"` so the "app or src/app" probe lives in one place.

## Commits

| Task | Hash    | Subject                                                                   |
| ---- | ------- | ------------------------------------------------------------------------- |
| 1    | 8b69be2 | feat(04-02): add NextJsAdapter detect.ts (R5 truth table)                 |
| 2    | f9060bd | test(04-02): add R5 detect truth-table coverage (6 cases)                 |
| 3    | 9d8daba | feat(04-02): add NextJsAdapter discover.ts (R6) + resolveAppRoot helper   |
| 4    | 4a3133a | test(04-02): add R6 discoverEntries + resolveAppRoot coverage (12 cases)  |

## Verification

- `npx vitest run test/adapters/next/detect.test.ts test/adapters/next/discover.test.ts --reporter=dot` → **18/18 passed (6 + 12)**
- `grep -c 'from "tinyglobby"' src/adapters/next/discover.ts` → 1
- `grep -c "toForwardSlash" src/adapters/next/discover.ts` → 2
- `grep -c '"\*\*/_\*/\*\*"' src/adapters/next/discover.ts` → 1
- `grep -c "throw " src/adapters/next/discover.ts` → 0
- `grep -c "throw " src/adapters/next/detect.ts` → 0
- `grep -c "import.*tinyglobby" src/adapters/next/detect.ts` → 0 (detect must NOT use globs)
- `grep -c "import.*node:fs/promises" src/adapters/next/detect.ts` → 1
- `grep -cE "route\.ts|route\.tsx" src/adapters/next/discover.ts` → 0
- `grep -c 'describe("R5' test/adapters/next/detect.test.ts` → 1
- `grep -c 'describe("R6' test/adapters/next/discover.test.ts` → 1
- `grep -c 'describe("resolveAppRoot' test/adapters/next/discover.test.ts` → 1

## Threat Model Notes (from PLAN)

| Threat ID | Disposition | Status |
| --------- | ----------- | ------ |
| T-04-04 (symlink outside project) | mitigate | Glob `cwd: appRoot` confines walk; no `realpath` call. |
| T-04-05 (symlink loop)            | mitigate | tinyglobby has built-in inode tracking + finite allow-list bounds output. |
| T-04-06 (node_modules walk)       | mitigate | `**/node_modules/**` in ignore list. |
| T-04-07 (`import()` of next.config.ts) | accept  | `detect.ts` only calls `fs.access` — verified by grep. |
| T-04-08 (massive `app/` DoS)      | accept   | No v1 perf SLA; revisit in Phase 6 perf gate. |

## Deviations from Plan

None — plan executed exactly as written. All implementations match the verbatim code blocks supplied in the plan's `<action>` sections.

## Pre-Existing Test Failure (Out of Scope)

`test/mcp/smoke.spawn.test.ts > MCP smoke — spawned binary` fails at the worktree base (verified by running it on the unchanged base before any plan-04-02 work). It is unrelated to phase 04 (MCP transport plumbing, not Next adapter). Logged as out-of-scope per executor scope boundary rules; not addressed by this plan.

## Self-Check: PASSED

- `src/adapters/next/detect.ts` → exists, contains `export async function detect`
- `src/adapters/next/discover.ts` → exists, contains both `resolveAppRoot` and `discoverEntries` exports
- `test/adapters/next/detect.test.ts` → exists, 6 it() cases
- `test/adapters/next/discover.test.ts` → exists, 12 it() cases (9 in R6 describe + 3 in resolveAppRoot describe)
- Commits 8b69be2, f9060bd, 9d8daba, 4a3133a all confirmed via `git log --oneline`
- 18/18 plan tests green; full suite shows only the pre-existing MCP smoke failure
