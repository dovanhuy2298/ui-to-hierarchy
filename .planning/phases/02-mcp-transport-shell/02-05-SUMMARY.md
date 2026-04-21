---
phase: "02-mcp-transport-shell"
plan: "05"
subsystem: "test"
tags: ["testing", "mcp", "vitest", "InMemoryTransport", "StdioClientTransport"]
dependency_graph:
  requires: ["02-04"]
  provides: ["Tier1-tests", "Tier2-smoke-tests"]
  affects: ["test/mcp/server.test.ts", "test/mcp/smoke.spawn.test.ts"]
tech_stack:
  added: []
  patterns:
    - "InMemoryTransport.createLinkedPair() for in-process MCP server testing"
    - "StdioClientTransport with stderr:pipe for spawned binary smoke testing"
    - "asToolResponse() cast helper to work around SDK unknown content type"
    - "vitest define.__TOOL_VERSION__ to mirror tsup build-time substitution"
key_files:
  created: []
  modified:
    - "test/mcp/server.test.ts"
    - "test/mcp/smoke.spawn.test.ts"
    - "vitest.config.ts"
decisions:
  - "Used asToolResponse() cast helper rather than inline 'as' casts throughout — keeps assertion lines readable"
  - "Added define.__TOOL_VERSION__ to vitest.config.ts — tsup define is build-time only; vitest needs its own substitution"
metrics:
  duration_seconds: 231
  completed_date: "2026-04-21"
  tasks_completed: 2
  files_modified: 3
---

# Phase 02 Plan 05: Implement MCP Server Tests Summary

**One-liner:** Tier 1 in-process tests (InMemoryTransport + Client) and Tier 2 spawn smoke tests (StdioClientTransport) covering all four MCP tools — 16 Tier 1 tests + 5 Tier 2 tests, all passing.

## What Was Built

### Task 1 — Tier 1: test/mcp/server.test.ts

Replaced all 11 `it.todo` stubs with real tests across three describe blocks:

**MCP server — tool registration (MCP-01):**
- `initialize handshake succeeds` — createTestPair() resolves = handshake succeeded
- `listTools returns exactly 4 tools` — tools.length === 4
- `listTools returns get_full_hierarchy, focus_on, find_by_text, find_by_style` — name array check
- `each tool has a non-empty description` — every tool.description truthy
- `each tool has a non-empty title` — every tool.inputSchema truthy

**MCP server — tool schemas (MCP-02):**
- `get_full_hierarchy: route field is required and validates Next.js paths` — valid route reaches handler
- `get_full_hierarchy: format field defaults to markdown` — omitted format still reaches handler
- `focus_on: component field validates PascalCase only` — valid PascalCase reaches handler
- `focus_on: scope field defaults to full` — omitted scope still reaches handler
- `get_full_hierarchy: invalid route returns isError:true` — '/bad route' rejected at SDK boundary
- `focus_on: invalid component name returns isError:true` — 'lowercase' rejected at SDK boundary

**MCP server — not-implemented responses (MCP-03):**
- All four tools return `isError:true` with tool name in `content[0].text`
- `handler exception is caught and returns internalError response` — unit tests `internalError()` helper directly

**Test infrastructure helper:** `createTestPair()` wires a fresh `McpServer` + `InMemoryTransport` pair per test via `beforeEach/afterEach`.

### Task 2 — Tier 2: test/mcp/smoke.spawn.test.ts

Replaced all 5 `it.todo` stubs with a single shared spawned process (beforeAll/afterAll):

- `spawns node dist/cli.js without error` — client.connect() resolves
- `listTools returns 4 tools over stdio transport` — tools.length === 4
- `every stdout line from the server parses as valid JSON-RPC` — SDK would throw on framing errors; session completed cleanly
- `stderr contains at least one structured JSON log line at startup` — parses stderr lines, finds `{level, ...}` JSON
- `each tool call returns isError:true on stderr, not stdout` — all 4 tool calls return isError:true

## Test Counts

| Suite | Command | Tests | Result |
|-------|---------|-------|--------|
| Tier 1 (in-process) | `pnpm test` | 16 in server.test.ts + 62 others | 78 total passing |
| Tier 2 (spawn) | `pnpm run test:smoke` | 5 | 5 passing |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `__TOOL_VERSION__` undefined at vitest runtime**
- **Found during:** Task 1 first test run
- **Issue:** `createServer()` calls `new McpServer({ version: __TOOL_VERSION__ })`. tsup's `define` substitution is build-time only; vitest runs source TypeScript directly via tsx, so the identifier is never replaced.
- **Fix:** Added `define: { __TOOL_VERSION__: JSON.stringify("0.0.0-test") }` to `vitest.config.ts`
- **Files modified:** `vitest.config.ts`
- **Commit:** `e1667bf`

**2. [Rule 1 - Bug] TypeScript errors on `result.content[0]` from `client.callTool()`**
- **Found during:** Task 2 typecheck gate
- **Issue:** The SDK types `CallToolResult.content` as `unknown[]` at the `Client` layer. Accessing `.content[0].type` directly fails `tsc --noEmit` with TS18046 and TS2532.
- **Fix:** Added `asToolResponse(result: unknown): ToolResponse` cast helper at top of `server.test.ts`; all `callTool()` results flow through it before `.content` access. For the `internalError` unit test, extracted `content[0]` into a typed local variable to eliminate the possibly-undefined error.
- **Files modified:** `test/mcp/server.test.ts`
- **Commit:** `5f69e84`

## Verification Results

```
pnpm test          — 78/78 passing, 0 todo, exit 0
pnpm build         — dist/cli.js 6.73 KB, exit 0
pnpm run test:smoke — 5/5 passing, exit 0
pnpm lint          — 24 files checked, no fixes needed, exit 0
pnpm typecheck     — 0 errors, exit 0
```

Grep checks:
- `grep "it.todo" test/mcp/server.test.ts` — no match (PASS)
- `grep "it.todo" test/mcp/smoke.spawn.test.ts` — no match (PASS)
- `grep "InMemoryTransport" test/mcp/server.test.ts` — 3 matches (PASS)
- `grep "StdioClientTransport" test/mcp/smoke.spawn.test.ts` — 5 matches (PASS)
- `grep "isError" test/mcp/server.test.ts` — 17 matches (PASS)
- `grep "isError" test/mcp/smoke.spawn.test.ts` — 4 matches (PASS)

## Known Stubs

None introduced by this plan. The `notImplemented` stubs in the four tool handlers are pre-existing (created in plan 02-03/02-04) and are explicitly tested here as the expected response shape.

## Threat Flags

None. This plan only adds test files — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries.

## Self-Check: PASSED
