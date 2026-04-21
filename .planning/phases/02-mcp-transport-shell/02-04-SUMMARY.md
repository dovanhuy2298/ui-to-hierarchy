---
phase: "02-mcp-transport-shell"
plan: "04"
subsystem: "mcp-server"
tags: ["mcp", "server", "cli", "stdio", "integration"]
dependency_graph:
  requires:
    - "02-02"  # errors.ts, log.ts
    - "02-03"  # all 4 tool modules
  provides:
    - "src/mcp/server.ts — createServer() factory, startServer() entry"
    - "src/cli.ts — thin stdio CLI entry"
  affects:
    - "dist/cli.js — runnable MCP server binary"
tech_stack:
  added: []
  patterns:
    - "McpServer factory pattern: createServer() returns configured server without transport"
    - "startServer() wires StdioServerTransport — single instantiation point"
    - "Namespace imports for tool modules (import * as tool) for uniform registerTool calls"
key_files:
  created:
    - "src/mcp/server.ts"
  modified:
    - "src/cli.ts"
decisions:
  - "createServer and startServer kept separate per RESEARCH.md Pitfall 1 — tests use createServer + InMemoryTransport"
  - "No shebang in src/cli.ts source — tsup banner injects it in dist/cli.js"
  - "Namespace imports (import * as tool) used for all 4 tool modules to allow uniform registerTool call pattern"
metrics:
  duration: "7 minutes"
  completed: "2026-04-21"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 02 Plan 04: MCP Server Factory and CLI Entry Summary

**One-liner:** McpServer factory (`createServer`) + stdio entry point (`startServer`) wiring all 4 tool stubs into a runnable `npx` CLI binary.

## What Was Built

### src/mcp/server.ts (created)

- `createServer(): McpServer` — instantiates `McpServer({ name: "ui-to-hierarch", version: __TOOL_VERSION__ })`, registers all 4 tools via `server.registerTool()`, emits `log.info("server created")`.
- `startServer(): Promise<void>` — emits `log.info("server starting")`, calls `createServer()`, creates `new StdioServerTransport()`, calls `await server.connect(transport)`.
- Tool modules imported as namespaces (`import * as getFullHierarchy from "./tools/get-full-hierarchy.js"`) for a uniform `registerTool` call pattern.
- Exports only `createServer` and `startServer` — no other surface.
- Zero `console.*` calls.

### src/cli.ts (replaced)

- Replaced the 2-line stub (`process.stderr.write` + `process.exit(0)`) with the spec-compliant entry.
- Calls `startServer().catch()` with `log.error("server error", { message })` + `process.exit(1)`.
- No shebang in source — `tsup` `banner: { js: "#!/usr/bin/env node" }` injects it into `dist/cli.js`.
- Zero `console.*` calls (satisfies Biome `noConsole` rule).

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm lint` | Exit 0 — 24 files checked, no issues |
| `pnpm typecheck` | Exit 0 — TypeScript compilation completed |
| `pnpm build` | Exit 0 — `dist/cli.js` 6.73 KB produced in 20ms |
| `head -1 dist/cli.js` | `#!/usr/bin/env node` (shebang confirmed) |
| `grep "registerTool" src/mcp/server.ts` | 4 matches (one per tool) |
| `grep "console\." src/cli.ts` | No matches |
| `grep "console\." src/mcp/server.ts` | No matches |

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `0b3f5d7` | `feat(02-04): create src/mcp/server.ts — McpServer factory and stdio entry point` |
| Task 2 | `aecd9ca` | `feat(02-04): replace src/cli.ts stub with startServer() entry` |

## Deviations from Plan

None — plan executed exactly as written.

## Threat Model Coverage

T-02-09 (Information Disclosure) — mitigated: `cli.ts` catch block surfaces only `err.message`, not stack trace.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `src/mcp/server.ts` exists | FOUND |
| `src/cli.ts` exists | FOUND |
| `dist/cli.js` exists | FOUND |
| Commit `0b3f5d7` exists | FOUND |
| Commit `aecd9ca` exists | FOUND |
