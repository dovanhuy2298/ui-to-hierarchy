---
phase: "02-mcp-transport-shell"
plan: "03"
subsystem: "mcp/tools"
tags: ["mcp", "tools", "zod", "stub"]
dependency_graph:
  requires: ["02-01", "02-02"]
  provides: ["TOOL-01", "TOOL-02", "TOOL-03", "TOOL-04"]
  affects: ["src/mcp/server.ts (plan 02-04)"]
tech_stack:
  added: []
  patterns: ["named-export tool module", "zod inputSchema + handler stub", "resolveRoot per call (D-13)", "try/catch internalError"]
key_files:
  created:
    - src/mcp/tools/get-full-hierarchy.ts
    - src/mcp/tools/focus-on.ts
    - src/mcp/tools/find-by-text.ts
    - src/mcp/tools/find-by-style.ts
decisions:
  - "D-01 route regex applied verbatim (minus useless \\- escape fixed by Biome)"
  - "D-02 scope enum with default 'full' on focus-on"
  - "D-03 PascalCase regex /^[A-Z][A-Za-z0-9_]*$/ on focus-on"
  - "D-04 format enum with default 'markdown' on get-full-hierarchy"
  - "Single-line function signature required by Biome line-length rules"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-21"
  tasks_completed: 2
  files_created: 4
---

# Phase 02 Plan 03: MCP Tool Stubs Summary

**One-liner:** Four MCP tool modules (TOOL-01 through TOOL-04) with zod schemas, locked regex/enum decisions, and notImplemented stub handlers.

## What Was Built

### Task 1 — get-full-hierarchy.ts + focus-on.ts (commit 7aae551)

**src/mcp/tools/get-full-hierarchy.ts** — TOOL-01
- Exports: `name = "get_full_hierarchy"`, `title`, `description`, `inputSchema`, `handler`
- `route`: D-01 regex `/^\/$|^\/(?:[\w-]+|\[[\w.]+\]|...)...*$/` — validates Next.js App Router paths, rejects trailing slashes, query strings, empty strings
- `format`: `z.enum(["markdown","json"]).default("markdown")` (D-04)
- `projectRoot`: `z.string().optional()` — all four tools share this field
- Handler: calls `resolveRoot(args.projectRoot)`, returns `notImplemented(name)`, wrapped in try/catch `internalError`

**src/mcp/tools/focus-on.ts** — TOOL-02
- Exports: `name = "focus_on"`, `title`, `description`, `inputSchema`, `handler`
- `component`: D-03 regex `/^[A-Z][A-Za-z0-9_]*$/` — PascalCase only, rejects lowercase and kebab-case
- `scope`: `z.enum(["up","full","down"]).default("full")` (D-02)
- Handler: same resolveRoot + notImplemented + try/catch pattern

### Task 2 — find-by-text.ts + find-by-style.ts (commit 9759de7)

**src/mcp/tools/find-by-text.ts** — TOOL-03
- Exports: `name = "find_by_text"`, `title`, `description`, `inputSchema`, `handler`
- `query`: `z.string()` — accepts any string including empty (semantic validation deferred to Phase 5)

**src/mcp/tools/find-by-style.ts** — TOOL-04
- Exports: `name = "find_by_style"`, `title`, `description`, `inputSchema`, `handler`
- `class_or_prop`: `z.string()` — accepts class names and style prop names

All four tools: every zod field has `.describe()` with a non-empty string. No `console.*` calls.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Useless regex escape in get-full-hierarchy route pattern**
- **Found during:** Task 2 lint run
- **Issue:** `[\w\-]` contains an unnecessary backslash before `-`; Biome `noUselessEscapeInRegex` flagged it as an error
- **Fix:** Changed `[\w\-]` to `[\w-]` — functionally identical, lint-clean
- **Files modified:** `src/mcp/tools/get-full-hierarchy.ts`
- **Commit:** 9759de7

**2. [Rule 1 - Bug] Biome formatter: multi-line handler signatures**
- **Found during:** Task 2 lint run (affects all four files)
- **Issue:** Biome's line-length rule collapsed multi-line `handler(args: ...,\n): Promise<...>` into single-line form
- **Fix:** Applied `npx biome check --write` to auto-format all four tool files
- **Files modified:** All four tool files
- **Commit:** 9759de7

## Verification Results

```
pnpm lint      -> Checked 23 files in 16ms. No fixes applied.  EXIT 0
pnpm typecheck -> TypeScript compilation completed              EXIT 0
pnpm test      -> 8 passed | 2 skipped, 57 tests | 21 todo     EXIT 0
```

Grep checks:
- `get-full-hierarchy.ts`: exports `name = "get_full_hierarchy"`, `notImplemented` present
- `focus-on.ts`: exports `name = "focus_on"`, `internalError` present
- `find-by-text.ts`: exports `name = "find_by_text"`, `resolveRoot` present
- `find-by-style.ts`: exports `name = "find_by_style"`, 2 `.describe(` calls present

## Known Stubs

All four tool handlers are intentional stubs per plan design:
- Each returns `notImplemented(name)` immediately after `resolveRoot`
- Real parsing/query logic lands in Phase 5 (IR Queries & Tool Wire-up)
- These stubs are required by the plan — they are not accidental

## Self-Check: PASSED

Files exist:
- src/mcp/tools/get-full-hierarchy.ts — FOUND
- src/mcp/tools/focus-on.ts — FOUND
- src/mcp/tools/find-by-text.ts — FOUND
- src/mcp/tools/find-by-style.ts — FOUND

Commits exist:
- 7aae551 feat(02-03): add get-full-hierarchy and focus-on tool stubs — FOUND
- 9759de7 feat(02-03): add find-by-text and find-by-style tool stubs — FOUND
