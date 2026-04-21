---
phase: 02-mcp-transport-shell
verified: 2026-04-21T10:30:00Z
status: human_needed
score: 4/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Point MCP Inspector at the built binary: `npx @modelcontextprotocol/inspector node dist/cli.js`. In the Inspector UI, confirm: (a) the connection succeeds, (b) four tools are listed — get_full_hierarchy, focus_on, find_by_text, find_by_style — and (c) calling any tool shows an isError response with actionable guidance text."
    expected: "Inspector connects, all four tools enumerable with their typed schemas visible, and each tool call returns a structured error message referencing Phase 5."
    why_human: "Success criterion 1 specifies `npx ui-to-hierarch` + MCP Inspector enumeration. The Tier 2 smoke test uses StdioClientTransport (a programmatic MCP client) and passes, but the roadmap explicitly names MCP Inspector as the target client for human validation. Inspector also provides visual schema inspection that smoke tests cannot replicate."
  - test: "Optionally verify with Claude Code as a real MCP client by adding the server to a Claude Code session's MCP config (`command: npx, args: [-y, ui-to-hierarch]` or `command: node, args: [./dist/cli.js]`) and confirming tool enumeration succeeds."
    expected: "Claude Code lists all four tools and can call each one, receiving structured not-implemented responses."
    why_human: "Success criterion 5 ('One real MCP client (Claude Code) connects and lists tools successfully') is the end-to-end client contract. This cannot be verified in a headless test environment."
---

# Phase 2: MCP Transport Shell Verification Report

**Phase Goal:** A real MCP client can launch the server via `npx`, discover all four tools with typed schemas, and receive structured "not implemented" errors — with stdout guaranteed clean
**Verified:** 2026-04-21T10:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `npx ui-to-hierarch` starts a stdio MCP server that MCP Inspector can connect to and enumerate all four tools | PARTIAL | `pnpm build` exits 0 producing `dist/cli.js` with `#!/usr/bin/env node` shebang. Tier 2 smoke test spawns `node dist/cli.js` via `StdioClientTransport` and confirms 4 tools enumerated. MCP Inspector connection requires human testing. |
| 2 | Every tool's input schema is zod with `.describe()` on every field and precise types | VERIFIED | All four tool files verified: route regex, PascalCase regex, scope enum, format enum — each field has a non-empty `.describe()` string. Tier 1 tests confirm invalid input is rejected at schema boundary. |
| 3 | Calling any tool returns `{ content, isError: true }` with actionable guidance — no unhandled exceptions ever escape the handler | VERIFIED | All four handlers call `notImplemented(name)` wrapped in `try/catch` returning `internalError`. `notImplemented` message contains tool name + "Phase 5" + "ROADMAP.md". 16 Tier 1 tests confirm isError:true for all 4 tools and schema-rejection cases. |
| 4 | A smoke test pipes stderr noise through the server and asserts every stdout line parses as JSON-RPC; noConsole rule blocks console.log on server paths | VERIFIED | `pnpm run test:smoke` exits 0 (5/5 passing). `grep console. src/mcp/**` = 0 matches. `grep console. src/cli.ts` = 0 matches. `pnpm lint` exits 0. stderr JSON log lines asserted by Tier 2 test. |
| 5 | One real MCP client (Claude Code) connects and lists tools successfully | HUMAN NEEDED | Tier 2 smoke test with `StdioClientTransport` is a real MCP client that connects and lists 4 tools over stdio transport — this passes. But the roadmap names Claude Code/MCP Inspector specifically, which requires human verification. |

**Score:** 4/5 truths verified (1 requires human confirmation)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/global.d.ts` | `declare const __TOOL_VERSION__: string` | VERIFIED | File exists, declaration confirmed. `pnpm typecheck` exits 0. |
| `src/mcp/errors.ts` | `notImplemented`, `internalError`, `invalidInput`, `ToolResponse` exports | VERIFIED | All four exports present, isError:true on all, notImplemented message references Phase 5 and ROADMAP.md. |
| `src/mcp/log.ts` | `log` object with info/warn/error/debug writing to stderr | VERIFIED | No `console.*` calls, uses `process.stderr.write`, `log.debug` gated on `MCP_DEBUG === '1'`. |
| `src/mcp/tools/get-full-hierarchy.ts` | TOOL-01 schema + stub handler | VERIFIED | Exports name/title/description/inputSchema/handler. Route regex, format default, resolveRoot, notImplemented, try/catch internalError — all present. |
| `src/mcp/tools/focus-on.ts` | TOOL-02 schema + stub handler | VERIFIED | PascalCase regex, scope enum with default 'full', resolveRoot, notImplemented, try/catch internalError — all present. |
| `src/mcp/tools/find-by-text.ts` | TOOL-03 schema + stub handler | VERIFIED | query field with .describe(), resolveRoot, notImplemented, try/catch internalError — all present. |
| `src/mcp/tools/find-by-style.ts` | TOOL-04 schema + stub handler | VERIFIED | class_or_prop field with .describe(), resolveRoot, notImplemented, try/catch internalError — all present. |
| `src/mcp/server.ts` | `createServer()` + `startServer()` exports | VERIFIED | createServer registers exactly 4 tools via registerTool. startServer wires StdioServerTransport. log.info emitted on server created/starting. |
| `src/cli.ts` | Thin entry calling `startServer().catch()` with log.error + process.exit(1) | VERIFIED | No console.* calls. Imports from `./mcp/log.js` and `./mcp/server.js`. catch handler uses log.error. |
| `test/mcp/server.test.ts` | Tier 1 in-process tests — all stubs filled | VERIFIED | 0 `it.todo` remaining. 16 tests across 3 describe blocks covering MCP-01/02/03. pnpm test: 78/78 passing. |
| `test/mcp/smoke.spawn.test.ts` | Tier 2 spawned binary tests | VERIFIED | 0 `it.todo` remaining. 5 tests. `pnpm run test:smoke`: 5/5 passing. |
| `dist/cli.js` | Built binary with shebang | VERIFIED | `pnpm build` exits 0. `head -1 dist/cli.js` = `#!/usr/bin/env node`. Size: 6.73 KB. |
| `package.json` | test:smoke script + @modelcontextprotocol/inspector devDep | VERIFIED | `"test:smoke": "vitest run test/mcp/smoke.spawn.test.ts"` present. Inspector at `^0.21.2` in devDependencies. |
| `biome.json` | noConsole:error override for src/mcp/** and src/cli.ts | VERIFIED | Second overrides entry present with `includes: ["src/mcp/**", "src/cli.ts"]` and `noConsole: "error"`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/cli.ts` | `src/mcp/server.ts` | `import { startServer }` | WIRED | Confirmed in source. startServer().catch() pattern present. |
| `src/cli.ts` | `src/mcp/log.ts` | `import { log }` | WIRED | Confirmed in source. log.error used in catch block. |
| `src/mcp/server.ts` | `src/mcp/tools/get-full-hierarchy.ts` | `import * as getFullHierarchy` | WIRED | All 4 tool namespaces imported and registered via server.registerTool. |
| `src/mcp/server.ts` | `src/mcp/log.ts` | `import { log }` | WIRED | log.info('server created') and log.info('server starting') both present. |
| `src/mcp/tools/get-full-hierarchy.ts` | `src/mcp/errors.ts` | `import { notImplemented, internalError }` | WIRED | Confirmed in all 4 tool files. |
| `src/mcp/tools/*.ts` | `src/core/resolve-root.ts` | `import { resolveRoot }` | WIRED | All 4 tools call resolveRoot(args.projectRoot). |
| `test/mcp/server.test.ts` | `src/mcp/server.ts` | `import { createServer }` | WIRED | createTestPair() helper wires InMemoryTransport correctly. |
| `test/mcp/smoke.spawn.test.ts` | `dist/cli.js` | `StdioClientTransport({ command: 'node', args: [distCli] })` | WIRED | existsSync guard + beforeAll spawn confirmed. |

### Data-Flow Trace (Level 4)

Not applicable. This phase ships stub handlers that intentionally return `notImplemented()` with no data source. Data will flow in Phase 5 (IR Queries & Tool Wire-up). The stubs are the correct expected behavior for this phase.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| pnpm test exits 0 | `pnpm test` | 78/78 passing, 0 todo | PASS |
| pnpm build exits 0 | `pnpm build` | dist/cli.js 6.73 KB produced | PASS |
| pnpm run test:smoke exits 0 | `pnpm run test:smoke` | 5/5 passing | PASS |
| pnpm lint exits 0 | `pnpm lint` | 24 files checked, no fixes applied | PASS |
| pnpm typecheck exits 0 | `pnpm typecheck` | 0 errors | PASS |
| dist/cli.js has shebang | `head -1 dist/cli.js` | `#!/usr/bin/env node` | PASS |
| No console.* in src/mcp/** | grep | 0 matches | PASS |
| No it.todo remaining in tests | grep | 0 matches | PASS |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MCP-01 | 02-01, 02-03, 02-04, 02-05 | Ships as npm package with bin entry runnable via `npx`; starts stdio MCP server via StdioServerTransport | SATISFIED | package.json `bin` entry present. dist/cli.js produced. Tier 2 smoke test connects via StdioClientTransport and lists 4 tools. |
| MCP-02 | 02-03, 02-05 | Every tool input defined via zod schema with .describe() on every field, precise types | SATISFIED | All 4 tools verified: route regex, PascalCase regex, scope enum, format enum — all with non-empty .describe() strings. Tier 1 schema rejection tests pass. |
| MCP-03 | 02-02, 02-03, 02-05 | Tool handlers return { content, isError: true } — never propagate unhandled exceptions | SATISFIED | notImplemented() and internalError() verified. All 4 tool handlers use try/catch. 16 Tier 1 tests confirm isError:true. |
| MCP-04 | 02-01, 02-02, 02-04, 02-05 | stdout reserved for JSON-RPC; diagnostics to stderr; noConsole on server paths; smoke test asserts JSON stdout | SATISFIED | log.ts writes only to process.stderr. No console.* in src/mcp/** or src/cli.ts. Biome noConsole:error active. Tier 2 smoke test confirms stdout JSON-RPC integrity and stderr JSON log lines. |

No orphaned requirements. All four Phase 2 requirements (MCP-01 through MCP-04) are claimed and satisfied by plans 02-01 through 02-05.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| All 4 tool handlers | `return notImplemented(name)` immediately after resolveRoot | INFO | Intentional stub per Phase 2 design. Real parsing deferred to Phase 5. Tests explicitly assert this behavior. Not a defect. |

No blockers. No unintentional stubs or TODOs found.

### Human Verification Required

#### 1. MCP Inspector Connection and Tool Enumeration

**Test:** Build the project with `pnpm build`, then run:
```
npx @modelcontextprotocol/inspector node dist/cli.js
```
In the Inspector UI: (a) verify connection succeeds without errors, (b) confirm four tools are listed — `get_full_hierarchy`, `focus_on`, `find_by_text`, `find_by_style`, (c) inspect each tool's schema to confirm route regex, PascalCase constraint, scope enum, and format enum are visible, (d) call any tool (e.g., `get_full_hierarchy` with `route: /`) and confirm the response shows `isError: true` with actionable guidance text referencing Phase 5.

**Expected:** Inspector connects cleanly. All four tools are enumerable with their typed schemas. Each tool call returns a structured error message that includes the tool name and "Phase 5 (IR Queries & Tool Wire-up)" reference.

**Why human:** Success criterion 1 explicitly names MCP Inspector as the target enumeration client. The Tier 2 smoke test with StdioClientTransport covers the programmatic API contract, but visual schema inspection and the Inspector UX cannot be verified headlessly.

#### 2. Claude Code End-to-End (Optional but Recommended)

**Test:** Add the server to a Claude Code session's MCP configuration:
```json
{ "command": "node", "args": ["E:/ui-to-hierarch/dist/cli.js"] }
```
Ask Claude Code to list the available tools. Then ask it to call `get_full_hierarchy` on a route.

**Expected:** Claude Code enumerates all four tools. Calling any tool returns a readable "not implemented" error that correctly names the tool and references the roadmap. No stdout corruption or unhandled exceptions.

**Why human:** Success criterion 5 ('One real MCP client (Claude Code) connects and lists tools successfully') requires a live Claude Code session that cannot be driven by automated tests.

### Gaps Summary

No gaps blocking goal achievement. All four requirements are fully implemented and tested programmatically. The two human verification items above are confirmation of already-passing automated tests in a human-observable environment — they are not expected to surface defects.

---

_Verified: 2026-04-21T10:30:00Z_
_Verifier: Claude (gsd-verifier)_
