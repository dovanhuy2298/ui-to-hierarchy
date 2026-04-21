# Phase 2: MCP Transport Shell - Research

**Researched:** 2026-04-21
**Domain:** @modelcontextprotocol/sdk stdio transport, McpServer registration, zod v4 tool schemas, Biome linter scoping, in-process test wiring
**Confidence:** HIGH — all critical claims verified against the locally installed SDK (`@modelcontextprotocol/sdk@1.29.0`) and zod (`4.3.6`) via live Node.js execution.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Tool Schema Shapes (D-01 — D-04)**
- D-01 Route validator: `z.string().regex(/^\/(?:[\w\-]+|\[[\w.]+\]|\[\.\.\.[\w]+\]|\[\[\.\.\.[\w]+\]\])(?:\/(?:[\w\-]+|\[[\w.]+\]|\[\.\.\.[\w]+\]|\[\[\.\.\.[\w]+\]\]))*$|^\/$/).describe(...)`. Accepts `/`, `/foo`, `/foo/[slug]`, `/[...rest]`, `/[[...opt]]`.
- D-02 Scope enum: `z.enum(['up','full','down']).default('full')`
- D-03 Identifier regex: `z.string().regex(/^[A-Z][A-Za-z0-9_]*$/)` — PascalCase-only
- D-04 Format param: `z.enum(['markdown','json']).default('markdown')`
- All zod fields carry `.describe('...')`. Every tool input includes `projectRoot?: z.string().describe(...)`.

**Error & Not-Implemented Contract (D-05 — D-07)**
- D-05 Response shape: `{ content: [{ type: 'text', text: <message> }], isError: true }`
- D-06 Shared error helpers in `src/mcp/errors.ts`: `notImplemented`, `invalidInput`, `internalError`
- D-07 Every handler wrapped in try/catch returning `internalError(name, err)` on escape

**Logging / Stderr Strategy (D-08, D-09)**
- D-08 Tiny in-house logger at `src/mcp/log.ts`, no new runtime dep. Writes JSON to stderr only. `log.debug` no-op unless `MCP_DEBUG=1`.
- D-09 Biome `noConsole` on `src/mcp/**` and `src/cli.ts`

**Server Wiring & Layout (D-10 — D-13)**
- D-10 File layout: `src/mcp/server.ts`, `src/mcp/log.ts`, `src/mcp/errors.ts`, `src/mcp/tools/{get-full-hierarchy,focus-on,find-by-text,find-by-style}.ts`
- D-11 `src/cli.ts` thin: `await startServer()` + top-level catch + exit(1)
- D-12 `new McpServer({ name: 'ui-to-hierarch', version: <from tsup define __TOOL_VERSION__> })`
- D-13 Per-tool `resolveRoot(args.projectRoot)` call; no server-level root caching

**Testing (D-14 — D-16)**
- D-14 Two-tier: Tier 1 in-process (`test/mcp/*.test.ts`) + Tier 2 spawned binary (`test/mcp/smoke.spawn.test.ts`, gated behind `test:smoke`)
- D-15 Natural noise only: `log.info('server starting')` + `log.info('tool called')`
- D-16 SC-5 (real client) = manual, captured in `02-VERIFICATION.md`

### Claude's Discretion
- Exact `.describe()` wording, tool `title`/`description` strings
- Tool module export shape (object, class, factory — uniform import in server.ts)
- Test fixture filenames and PassThrough plumbing helpers
- Biome include-path syntax for noConsole override block
- Logger timestamp format (ISO 8601 or `Date.now()`)

### Deferred Ideas (OUT OF SCOPE)
- Namespaced component identifiers (`Card.Header`)
- Per-tool title/description polish
- Automated Claude-Code-driving smoke test
- Rubbish-input fuzz for stdout cleanliness
- Structured JSON payloads inside error `content`
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MCP-01 | Ships as npm package with `bin` entry runnable via `npx ui-to-hierarch`; starts stdio MCP server using `StdioServerTransport` | `StdioServerTransport` API verified; `package.json` `bin` + tsup shebang already in place from Phase 1 |
| MCP-02 | Every tool input defined via zod schema with `.describe()` on every field, precise types (enums, regex-validated identifiers, route-shape validators) | zod v4 `z.object`, `z.enum`, `z.string().regex()`, `.describe()`, `.default()` all confirmed working with `registerTool` |
| MCP-03 | Tool handlers return `{ content, isError: true }` on user-facing failures; never propagate unhandled exceptions | `{ content: [{type:'text', text:'...'}], isError:true }` passes `CallToolResultSchema`; SDK does schema-boundary rejection (returns `isError:true`, does NOT call handler on invalid input) |
| MCP-04 | stdout reserved exclusively for JSON-RPC frames; all diagnostics routed to stderr; `noConsole` rule on server paths + smoke test parses every stdout line as JSON | Biome `noConsole` override syntax confirmed; `StdioServerTransport` constructor accepts custom `Readable`/`Writable` for testing; `InMemoryTransport` is cleaner for Tier 1 |
</phase_requirements>

---

## Summary

Phase 2 builds the stdio MCP server shell: wire `McpServer` + `StdioServerTransport`, register four tools with zod v4 schemas, return stub "not implemented" responses, and guarantee stdout carries only JSON-RPC frames.

All critical APIs were verified live against the installed packages (`@modelcontextprotocol/sdk@1.29.0`, `zod@4.3.6`, `@biomejs/biome@2.4.12`). The research resolves every open question from the phase description:

1. `registerTool()` exact signature confirmed from `mcp.d.ts`.
2. `InMemoryTransport.createLinkedPair()` is the standard in-process testing mechanism — confirmed working end-to-end with all four tool schemas in a single Node execution.
3. Biome `overrides[].includes` + `linter.rules.suspicious.noConsole` is the correct scoping pattern.
4. `StdioClientTransport` for Tier 2 spawn tests supports `stderr: 'pipe'` to capture stderr separately.
5. No Windows-specific gotchas found — `StdioServerTransport` with `PassThrough` streams and `InMemoryTransport` both work on Windows (Node 24 confirmed).

**Primary recommendation:** Use `InMemoryTransport.createLinkedPair()` for Tier 1 unit tests (not `PassThrough` streams + manual JSON-RPC framing). Use `StdioClientTransport` with `stderr: 'pipe'` for the Tier 2 spawn smoke test. Pass `z.object({...})` (not raw shape) as `inputSchema` — both are accepted but `z.object` keeps schema reuse clean.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| MCP protocol framing | SDK (`StdioServerTransport`) | — | SDK owns JSON-RPC wire format; no hand-rolling |
| Tool schema validation | SDK (zod boundary) | Handler (try/catch) | SDK rejects invalid input before calling handler; handler adds a catch for runtime errors |
| Tool input types | `src/mcp/tools/*.ts` (zod schemas) | — | Each tool owns its own schema; `server.ts` imports and registers |
| Stderr logging | `src/mcp/log.ts` | — | Thin wrapper around `process.stderr.write`; never touches stdout |
| Error response shaping | `src/mcp/errors.ts` | — | Shared helpers used by all four tool handlers |
| CLI entrypoint | `src/cli.ts` | — | Thin: calls `startServer()`, wraps top-level errors |
| Server construction + registration | `src/mcp/server.ts` | — | Assembles McpServer, registers all four tools, connects transport |

---

## Standard Stack

### Core (verified from installed packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | `1.29.0` | `McpServer`, `StdioServerTransport`, `InMemoryTransport`, `Client`, `StdioClientTransport` | Official MCP SDK; only maintained JS/TS implementation |
| `zod` | `4.3.6` | Tool input schemas, Standard Schema compatible | SDK's `zod-compat` layer accepts `z4.$ZodType` natively; `registerTool` auto-derives JSON Schema |

### Dev Only (needed for Tier 2 smoke test and manual inspection)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@modelcontextprotocol/inspector` | `^0.21.2` | Interactive MCP debugging UI | Add as devDep; manual SC-5 verification |

**Installation:**
```bash
pnpm add -D @modelcontextprotocol/inspector
```

**Note:** `@modelcontextprotocol/inspector` is NOT currently in `package.json`. It must be added (D-16 / SC-5 manual verification). `test:smoke` script also needs adding to `package.json`.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `InMemoryTransport` | `PassThrough` streams + manual JSON-RPC framing | `InMemoryTransport.createLinkedPair()` is zero-boilerplate; `PassThrough` approach requires writing length-prefixed newline-delimited JSON manually — error-prone |
| `StdioClientTransport` (Tier 2) | `child_process.spawn` + manual stdin write | SDK client handles protocol handshake, `initialize`, capabilities negotiation automatically |

---

## Architecture Patterns

### System Architecture Diagram

```
npx ui-to-hierarch
       │
       ▼
  src/cli.ts
  (shebang entry, injected by tsup banner)
       │
       ▼ await startServer()
  src/mcp/server.ts
  ┌──────────────────────────────────┐
  │  new McpServer({ name, version }) │
  │         │                        │
  │  registerTool(×4)                │
  │    ├── get_full_hierarchy         │
  │    ├── focus_on                  │
  │    ├── find_by_text              │
  │    └── find_by_style             │
  │         │                        │
  │  new StdioServerTransport()      │
  │         │                        │
  │  server.connect(transport)       │
  └──────────────────────────────────┘
       │                 │
  process.stdin      process.stdout
  (JSON-RPC in)      (JSON-RPC out ONLY)
                         │
                    stderr ← src/mcp/log.ts
                    (structured JSON logs)

  Each tool call flow:
  client → SDK validates inputSchema → handler called
       ↓ invalid input                  ↓
  SDK returns { isError:true }    try { notImplemented() }
  (handler NOT called)            catch { internalError() }
```

### Recommended Project Structure

```
src/
  cli.ts                         # bin entry — await startServer(), catch → exit(1)
  mcp/
    server.ts                    # startServer(): McpServer + StdioServerTransport
    log.ts                       # tiny stderr logger (no console)
    errors.ts                    # notImplemented(), invalidInput(), internalError()
    tools/
      get-full-hierarchy.ts      # schema + handler export
      focus-on.ts
      find-by-text.ts
      find-by-style.ts
  core/                          # (Phase 1) resolve-root, babel-shim, paths
  ir/                            # (Phase 1) zod schemas
  renderers/                     # (Phase 1) markdown, json
test/
  mcp/
    server.test.ts               # Tier 1: InMemoryTransport, initialize + list + call × 4
    smoke.spawn.test.ts          # Tier 2: StdioClientTransport, runs dist/cli.js
```

### Pattern 1: registerTool with z.object inputSchema

**What:** Pass a `z.object({...})` directly to `inputSchema` — the SDK's `zod-compat` layer accepts both `ZodRawShapeCompat` (plain shape record) and `AnySchema` (`z4.$ZodType`). Using `z.object` lets you assign the schema to a const for reuse in tests.

**When to use:** All four Phase 2 tool registrations.

```typescript
// Source: verified against @modelcontextprotocol/sdk@1.29.0 dist/esm/server/mcp.d.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'ui-to-hierarch',
  version: __TOOL_VERSION__,   // injected by tsup define
});

export const getFullHierarchyInputSchema = z.object({
  route: z
    .string()
    .regex(
      /^\/$|^\/(?:[\w\-]+|\[[\w.]+\]|\[\.\.\.[\w]+\]|\[\[\.\.\.[\w]+\]\])(?:\/(?:[\w\-]+|\[[\w.]+\]|\[\.\.\.[\w]+\]|\[\[\.\.\.[\w]+\]\]))*$/
    )
    .describe('Next.js App Router route path (e.g. /, /dashboard, /posts/[slug])'),
  format: z
    .enum(['markdown', 'json'])
    .default('markdown')
    .describe('Output format: markdown (default, LLM-friendly) or json (structured)'),
  projectRoot: z
    .string()
    .optional()
    .describe(
      'Absolute path to the project root. Defaults to UI_TO_HIERARCH_ROOT env var, then process.cwd().'
    ),
});

server.registerTool(
  'get_full_hierarchy',
  {
    title: 'Get Full Hierarchy',
    description:
      'Returns the ordered layout chain and page component subtree for a Next.js App Router route. Phase 2 stub — returns not-implemented error.',
    inputSchema: getFullHierarchyInputSchema,
  },
  async (args) => {
    // args is z.infer<typeof getFullHierarchyInputSchema>
    // args.format has been defaulted to 'markdown' by zod
    return notImplemented('get_full_hierarchy');
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
// server is now running; process must remain alive (connect() does not block)
// Node will stay alive because stdin (by default process.stdin) is open
```

### Pattern 2: InMemoryTransport for Tier 1 in-process tests

**What:** `InMemoryTransport.createLinkedPair()` returns `[serverTransport, clientTransport]`. Wire server to one, wire a `Client` instance to the other. No streams, no framing, no subprocess.

**When to use:** All `test/mcp/*.test.ts` unit tests (Tier 1).

```typescript
// Source: verified against @modelcontextprotocol/sdk@1.29.0 dist/esm/inMemory.d.ts
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { startServer } from '../../src/mcp/server.js';  // returns McpServer, not void

// NOTE: server.ts needs to export the McpServer instance (or a factory that returns it)
// so tests can wire it to InMemoryTransport instead of StdioServerTransport.
// One approach: export createServer() that returns the configured McpServer,
// and export startServer() that calls createServer(), connects StdioServerTransport, awaits.

// Test:
describe('mcp server', () => {
  it('lists all four tools', async () => {
    const server = createServer();  // returns McpServer with tools registered
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    const { tools } = await client.listTools();
    expect(tools.map(t => t.name)).toEqual(
      expect.arrayContaining(['get_full_hierarchy', 'focus_on', 'find_by_text', 'find_by_style'])
    );

    await client.close();
  });

  it('returns isError: true for get_full_hierarchy', async () => {
    // ... same wiring ...
    const result = await client.callTool({
      name: 'get_full_hierarchy',
      arguments: { route: '/dashboard' },
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('get_full_hierarchy');
  });
});
```

### Pattern 3: StdioClientTransport for Tier 2 spawn smoke test

**What:** `StdioClientTransport` spawns a subprocess and communicates over its stdin/stdout. Use `stderr: 'pipe'` to capture stderr separately for assertion.

**When to use:** `test/mcp/smoke.spawn.test.ts` (gated behind `test:smoke` script, requires prior `pnpm build`).

```typescript
// Source: verified against @modelcontextprotocol/sdk@1.29.0 dist/esm/client/stdio.d.ts
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const distCli = resolve(fileURLToPath(import.meta.url), '../../../dist/cli.js');

const transport = new StdioClientTransport({
  command: 'node',
  args: [distCli],
  stderr: 'pipe',            // capture stderr for assertion
});

const stderrChunks: Buffer[] = [];
transport.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

const client = new Client({ name: 'smoke-test', version: '0.0.0' });
await client.connect(transport);   // spawns process + runs MCP initialize handshake

const { tools } = await client.listTools();
// assert tools count === 4

// assert stderr contains at least one structured log line
const stderrText = Buffer.concat(stderrChunks).toString('utf8');
// each line should parse as JSON { level, msg, ts }

await client.close();  // sends close, process exits
```

### Pattern 4: errors.ts helper module

```typescript
// Source: from CONTEXT.md D-05, D-06 (locked decisions)
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export type ToolResponse = CallToolResult;

export function notImplemented(toolName: string): ToolResponse {
  return {
    content: [{
      type: 'text',
      text: `${toolName} is not implemented yet. Phase 2 (MCP Transport Shell) only ships the stdio surface; real parsing lands in Phase 5 (IR Queries & Tool Wire-up). See .planning/ROADMAP.md.`,
    }],
    isError: true,
  };
}

export function internalError(toolName: string, err: unknown): ToolResponse {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text', text: `${toolName} encountered an internal error: ${message}` }],
    isError: true,
  };
}

export function invalidInput(toolName: string, zodError: unknown): ToolResponse {
  // Used by Phase 5 handlers if they add extra zod parsing inside the handler.
  // In Phase 2 all handlers are stubs — included here so the module is Phase 5-ready.
  const message = zodError instanceof Error ? zodError.message : String(zodError);
  return {
    content: [{ type: 'text', text: `${toolName} received invalid input: ${message}` }],
    isError: true,
  };
}
```

### Pattern 5: log.ts stderr-only logger

```typescript
// Source: from CONTEXT.md D-08 (locked decision)
type Level = 'info' | 'warn' | 'error' | 'debug';

function emit(level: Level, msg: string, meta?: Record<string, unknown>): void {
  const entry = JSON.stringify({ level, msg, ...(meta ?? {}), ts: new Date().toISOString() });
  process.stderr.write(entry + '\n');
}

export const log = {
  info:  (msg: string, meta?: Record<string, unknown>) => emit('info',  msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => emit('warn',  msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
  debug: (msg: string, meta?: Record<string, unknown>) => {
    if (process.env.MCP_DEBUG === '1') emit('debug', msg, meta);
  },
};
```

### Pattern 6: Biome noConsole scoped override

**What:** Add a new `overrides` entry in `biome.json` that enables `suspicious.noConsole` as `"error"` for `src/mcp/**` and `src/cli.ts`, while leaving it unset for everything else.

**Confirmed syntax (biome.json `"$schema": "https://biomejs.dev/schemas/2.4.12/schema.json"`):**

```json
{
  "overrides": [
    {
      "includes": ["src/ir/**", "src/renderers/**", "src/core/**"],
      "linter": { "rules": { "style": { "noRestrictedImports": { ... } } } }
    },
    {
      "includes": ["src/mcp/**", "src/cli.ts"],
      "linter": {
        "rules": {
          "suspicious": {
            "noConsole": "error"
          }
        }
      }
    }
  ]
}
```

### Anti-Patterns to Avoid

- **Passing raw shape to inputSchema instead of z.object:** Both work, but a raw shape `{ route: z.string() }` can't be imported/reused in tests as a typed schema. Use `z.object({...})` and export the const.
- **Using `server.tool()` (deprecated) instead of `server.registerTool()`:** The `.tool()` overloads are marked `@deprecated` in `mcp.d.ts`. Use `registerTool()`.
- **Importing HTTP/SSE transports:** `StdioServerTransport` is the only Phase 2 transport. Importing `streamableHttp.js` or `sse.js` adds `express`/`hono`/`cors` to the runtime dep graph.
- **Using `import { McpServer } from '@modelcontextprotocol/sdk'`:** While the root export exists, always use explicit subpath imports with `.js` extension per CLAUDE.md. The SDK has a `./*` catch-all but explicit paths are more maintainable.
- **Calling `console.log` / `console.error` in `src/mcp/` or `src/cli.ts`:** Use `log.*` from `src/mcp/log.ts`. The Biome `noConsole` override will block CI on these paths.
- **Server-level root caching:** `resolveRoot` is called per tool call (D-13). A single server instance must handle multiple sequential calls with different `projectRoot` values.
- **Writing to stdout from `log.ts` or error helpers:** `process.stdout` is reserved for the SDK's `StdioServerTransport`. Any write from application code corrupts the JSON-RPC stream.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON-RPC framing | Custom line reader + message parser | `StdioServerTransport` | Content-length headers, backpressure, error recovery are all handled |
| Schema → JSON Schema conversion | Manual `inputSchema` object literal | `registerTool` + zod v4 | SDK calls `normalizeObjectSchema` internally; zod's Standard Schema descriptor auto-generates the wire format |
| MCP initialize handshake | Manual `{"jsonrpc":"2.0","method":"initialize",...}` | `client.connect(transport)` | SDK client handles capabilities negotiation, protocol version, `initialized` notification |
| In-process test transport | Custom `EventEmitter` pipe | `InMemoryTransport.createLinkedPair()` | Already exists in SDK at `@modelcontextprotocol/sdk/inMemory.js`; tested against all SDK internals |
| Subprocess communication in tests | `child_process.spawn` + manual stdin/stdout | `StdioClientTransport` | Handles process lifecycle, stderr piping, EOF, exit codes |

**Key insight:** The MCP SDK ships both the server and client primitives — the same package used to build the server also provides the test client. There is no need to use raw streams or manual JSON framing anywhere in Phase 2.

---

## Common Pitfalls

### Pitfall 1: `server.ts` exports `startServer()` but tests need `createServer()`
**What goes wrong:** `startServer()` connects `StdioServerTransport` (which reads from `process.stdin`). When called from tests, it steals stdin and blocks vitest's own stdio.
**Why it happens:** The CLI and test wiring use different transports, but a single `startServer()` that hard-codes `StdioServerTransport` cannot be reused for in-process tests.
**How to avoid:** Split into two exports:
- `createServer(): McpServer` — builds and registers tools, returns the server (no transport connected)
- `startServer(): Promise<void>` — calls `createServer()`, wires `StdioServerTransport`, calls `server.connect(transport)`
- Tests call `createServer()` and wire `InMemoryTransport` themselves.
**Warning signs:** Tests hang or exit immediately; vitest reports "couldn't read from stdin."

### Pitfall 2: SDK schema-boundary validation hides, but does not replace, handler-level guards
**What goes wrong:** Assuming the SDK's zod validation means the handler never receives bad input — then removing the try/catch.
**Why it happens:** The SDK does reject invalid input before calling the handler (verified: `handler called with bad input: false`). But this covers only schema shape errors. Runtime errors inside the handler (e.g., `resolveRoot` throws because `projectRoot` is syntactically valid but points to a nonexistent path) still escape.
**How to avoid:** Keep `try { ... } catch (err) { return internalError(toolName, err); }` in every handler even though Phase 2 bodies are stubs (D-07).
**Warning signs:** Unhandled promise rejections appearing on stderr after a tool call.

### Pitfall 3: `__TOOL_VERSION__` not declared in TypeScript types
**What goes wrong:** `tsc --noEmit` fails on `__TOOL_VERSION__` because the tsup `define` substitution is a build-time constant, not a runtime variable.
**Why it happens:** tsup uses esbuild's `define` to replace the string at build time; TypeScript sees it as an undeclared identifier.
**How to avoid:** Add a `global.d.ts` or an `env.d.ts` in `src/`:
```typescript
declare const __TOOL_VERSION__: string;
```
Phase 1 likely already includes this — verify before creating a new file.
**Warning signs:** `typecheck` script fails with "Cannot find name '__TOOL_VERSION__'".

### Pitfall 4: Biome `overrides` array ordering
**What goes wrong:** A later override silently suppresses an earlier one for the same file path if both match.
**Why it happens:** Biome documentation says "the order of the patterns matter. If a file can match three patterns, only the first one is used." — but the actual behavior is each matching override is merged in order (later overrides win per-rule). For `noConsole`, only one override applies it so there is no conflict. The pitfall is if a future override for `test/**` turns the rule off after the `src/mcp/**` override turns it on.
**How to avoid:** Order overrides from broadest to most specific, or keep `src/mcp/**` and `src/cli.ts` as the final override for `noConsole`.
**Warning signs:** `biome check src/mcp/log.ts` passes even after a `console.log` is introduced.

### Pitfall 5: Windows line endings corrupting JSON-RPC on stdout
**What goes wrong:** If any code writes to stdout with `\r\n` (Windows default text mode), the JSON-RPC stream parser on the client side may fail to parse messages.
**Why it happens:** Node's `process.stdout` in text mode on Windows may convert `\n` to `\r\n`.
**How to avoid:** `StdioServerTransport` writes binary (calls `stdout.write(Buffer)`) so this is a non-issue for SDK-managed output. The pitfall arises only if application code writes directly to `process.stdout`. Since `log.ts` writes to `process.stderr` and application code should never touch `process.stdout`, no action needed beyond the `noConsole` guard.
**Warning signs:** MCP Inspector shows parsing errors on first connect; `pnpm run test:smoke` fails with "unexpected token \r".

### Pitfall 6: `StdioClientTransport` default environment filtering
**What goes wrong:** The spawned `dist/cli.js` process doesn't see expected env vars (like `PATH` for resolving `node`) because `StdioClientTransport` uses `getDefaultEnvironment()` which filters to a safe subset of env vars.
**Why it happens:** The SDK intentionally avoids inheriting the full environment for security. `getDefaultEnvironment()` includes `PATH`, `HOME`, `TEMP`, `TMPDIR`, `USERPROFILE` but not arbitrary vars.
**How to avoid:** For the smoke test, pass `env: { ...getDefaultEnvironment(), UI_TO_HIERARCH_ROOT: process.cwd() }` if needed. For basic stdio communication, `getDefaultEnvironment()` includes `PATH` so `node dist/cli.js` should resolve correctly.
**Warning signs:** Smoke test subprocess exits immediately with "command not found" or `ENOENT`.

---

## Code Examples

### Verified: McpServer construction + registerTool + connect
```typescript
// Source: verified against @modelcontextprotocol/sdk@1.29.0 dist/esm/server/mcp.d.ts
// (live execution: all four tools registered and called successfully)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'ui-to-hierarch',
    version: __TOOL_VERSION__,
  });
  // register all four tools here...
  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // process stays alive because StdioServerTransport holds stdin open
}
```

### Verified: Full Tier 1 test wiring with InMemoryTransport
```typescript
// Source: verified working — Node 24, SDK 1.29.0, zod 4.3.6 (live execution this session)
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createServer } from '../../src/mcp/server.js';

const server = createServer();
const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);

const client = new Client({ name: 'test', version: '0.0.0' });
await client.connect(clientTransport);

// listTools
const { tools } = await client.listTools();

// callTool
const result = await client.callTool({ name: 'get_full_hierarchy', arguments: { route: '/' } });
// result.isError === true, result.content[0].type === 'text'

await client.close();
```

### Verified: zod v4 schema patterns for all four tools
```typescript
// Source: verified — zod@4.3.6, all four schemas parsed successfully (live execution)
import { z } from 'zod';

// TOOL-01: get_full_hierarchy
export const getFullHierarchyInput = z.object({
  route: z
    .string()
    .regex(/^\/$|^\/(?:[\w\-]+|\[[\w.]+\]|\[\.\.\.[\w]+\]|\[\[\.\.\.[\w]+\]\])(?:\/(?:[\w\-]+|\[[\w.]+\]|\[\.\.\.[\w]+\]|\[\[\.\.\.[\w]+\]\]))*$/)
    .describe('Next.js App Router route path (e.g., /, /dashboard, /posts/[slug])'),
  format: z
    .enum(['markdown', 'json'])
    .default('markdown')
    .describe('Output format: markdown (default, LLM-friendly) or json (structured)'),
  projectRoot: z
    .string()
    .optional()
    .describe('Absolute path to project root. Defaults to UI_TO_HIERARCH_ROOT env var, then process.cwd().'),
});

// TOOL-02: focus_on
export const focusOnInput = z.object({
  component: z
    .string()
    .regex(/^[A-Z][A-Za-z0-9_]*$/)
    .describe('JSX component name in PascalCase (e.g., Card, DashboardLayout)'),
  scope: z
    .enum(['up', 'full', 'down'])
    .default('full')
    .describe('Traversal scope: up (ancestors only), full (ancestors + subtree), down (subtree only)'),
  projectRoot: z
    .string()
    .optional()
    .describe('Absolute path to project root. Defaults to UI_TO_HIERARCH_ROOT env var, then process.cwd().'),
});

// TOOL-03: find_by_text
export const findByTextInput = z.object({
  query: z
    .string()
    .describe('Text string to search for in rendered component output'),
  projectRoot: z
    .string()
    .optional()
    .describe('Absolute path to project root. Defaults to UI_TO_HIERARCH_ROOT env var, then process.cwd().'),
});

// TOOL-04: find_by_style
export const findByStyleInput = z.object({
  class_or_prop: z
    .string()
    .describe('CSS class name or style prop to search for (e.g., flex, bg-blue-500, color)'),
  projectRoot: z
    .string()
    .optional()
    .describe('Absolute path to project root. Defaults to UI_TO_HIERARCH_ROOT env var, then process.cwd().'),
});
```

### Verified: Biome noConsole override block (biome.json 2.4.12)
```json
{
  "overrides": [
    {
      "includes": ["src/ir/**", "src/renderers/**", "src/core/**"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "patterns": [
                  {
                    "group": ["**/adapters", "**/adapters/**", "**/mcp", "**/mcp/**"],
                    "message": "ARCH-01: ir/ renderers/ core/ must not import adapters/ or mcp/"
                  }
                ]
              }
            }
          }
        }
      }
    },
    {
      "includes": ["src/mcp/**", "src/cli.ts"],
      "linter": {
        "rules": {
          "suspicious": {
            "noConsole": "error"
          }
        }
      }
    }
  ]
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `new Server(...)` + `setRequestHandler` | `new McpServer(...)` + `registerTool(...)` | SDK pre-1.0 → 1.x | `McpServer` wraps `Server` and provides typed, Standard-Schema-integrated registration; `setRequestHandler` still exists but is low-level |
| `server.tool(name, shape, cb)` | `server.registerTool(name, config, cb)` | 1.x series | `tool()` deprecated; `registerTool` has explicit `title`, `description`, `annotations`, `outputSchema` fields in the config object |
| zod v3 `z.object({})` with manual JSON Schema | zod v4 `z.object({})` as `AnySchema` | MCP SDK 1.17.5+ | SDK `zod-compat` accepts `z4.$ZodType` natively; no need for `zodToJsonSchema()` or peer version dance |
| `import traverse from '@babel/traverse'` | `(traverse as any).default ?? traverse` shim | Ongoing ESM/CJS issue | Phase 1 already ships this shim — unchanged for Phase 2 |

**Deprecated / outdated:**
- `server.tool()` overloads: still callable but JSDoc says `@deprecated Use registerTool instead.` Avoid in all new code.
- `CompatibilityCallToolResultSchema`: backwards-compat for protocol 2024-10-07 clients. Not needed for Phase 2.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@modelcontextprotocol/inspector@^0.21.2` is the correct version for manual SC-5 | Standard Stack (dev dep) | Minor — wrong version installed; run `npm view @modelcontextprotocol/inspector version` before adding | 

**All other claims were verified via live Node.js execution or direct inspection of installed package `.d.ts` files this session.**

---

## Open Questions

1. **Does `server.ts` need to export `McpServer` or just `createServer()` / `startServer()`?**
   - What we know: Tests need to call `createServer()` to wire `InMemoryTransport` themselves. `startServer()` hard-codes `StdioServerTransport`.
   - What's unclear: Whether the planner wants a factory pattern (`createServer()` returns `McpServer`) or an accessor pattern (module-level singleton exposed).
   - Recommendation: Export `createServer(): McpServer` (factory) + `startServer(): Promise<void>` (called by `cli.ts`). This is the minimal surface and is consistent with D-11.

2. **`__TOOL_VERSION__` global declaration — already in Phase 1?**
   - What we know: `tsup.config.ts` already has `define: { __TOOL_VERSION__: JSON.stringify(pkg.version) }`. The declaration must exist somewhere for `tsc --noEmit` to pass.
   - What's unclear: Phase 1 execution status — if Phase 1 plans were executed, the declaration exists; if not, it needs creating in Wave 0.
   - Recommendation: Wave 0 task should verify `src/global.d.ts` or `src/env.d.ts` contains `declare const __TOOL_VERSION__: string;`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | 24.13.0 | — |
| `@modelcontextprotocol/sdk` | McpServer, StdioServerTransport, InMemoryTransport | ✓ | 1.29.0 | — |
| `zod` | Tool input schemas | ✓ | 4.3.6 | — |
| `@biomejs/biome` | noConsole rule | ✓ | 2.4.12 | — |
| `vitest` | Tier 1 tests | ✓ | 4.1.4 | — |
| `tsup` | Build | ✓ | (in devDeps) | — |
| `@modelcontextprotocol/inspector` | SC-5 manual verification | ✗ | — | Skip SC-5 until added; not blocking |

**Missing dependencies with no fallback:** None that block Phase 2 execution.

**Missing dependencies with fallback:**
- `@modelcontextprotocol/inspector`: Not blocking — SC-5 is manual and does not gate `pnpm test`. Add to devDependencies in Wave 0.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | `vitest.config.ts` (`test.include: ["test/**/*.test.ts"]`) |
| Quick run command | `pnpm test` (vitest run) |
| Full suite command | `pnpm test` |
| Smoke run command | `pnpm run test:smoke` (requires prior `pnpm build`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MCP-01 | `npx ui-to-hierarch` starts stdio server | smoke/manual | `pnpm run test:smoke` (Tier 2) | ❌ Wave 0 |
| MCP-01 | Tools discovered via `listTools` | unit (in-process) | `pnpm test` | ❌ Wave 0 |
| MCP-02 | Every tool input has zod schema with `.describe()` | unit | `pnpm test` | ❌ Wave 0 |
| MCP-02 | Invalid input returns `isError:true` (not crash) | unit | `pnpm test` | ❌ Wave 0 |
| MCP-03 | Each tool returns `{ content, isError: true }` | unit | `pnpm test` | ❌ Wave 0 |
| MCP-03 | No unhandled exceptions escape handlers | unit | `pnpm test` | ❌ Wave 0 |
| MCP-04 | Every stdout line parses as JSON-RPC | smoke | `pnpm run test:smoke` | ❌ Wave 0 |
| MCP-04 | At least one structured log line on stderr at startup | smoke | `pnpm run test:smoke` | ❌ Wave 0 |
| MCP-04 | `noConsole` Biome rule blocks `console.*` on server paths | lint | `pnpm lint` | ❌ Wave 0 (biome.json edit) |

### Sampling Rate
- **Per task commit:** `pnpm test`
- **Per wave merge:** `pnpm test && pnpm lint && pnpm typecheck`
- **Phase gate:** Full suite + `pnpm run test:smoke` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/mcp/server.test.ts` — Tier 1: in-process InMemoryTransport tests covering MCP-01, MCP-02, MCP-03
- [ ] `test/mcp/smoke.spawn.test.ts` — Tier 2: spawned binary smoke for MCP-01, MCP-04
- [ ] `package.json` `test:smoke` script: `"test:smoke": "vitest run test/mcp/smoke.spawn.test.ts"`
- [ ] `biome.json` noConsole override block for `src/mcp/**`, `src/cli.ts`
- [ ] `package.json` devDep: `@modelcontextprotocol/inspector@^0.21.2`
- [ ] Verify `declare const __TOOL_VERSION__: string;` exists in `src/` (from Phase 1); create if missing

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | stdio transport; no network authentication surface |
| V3 Session Management | No | stdio transport; single-session by design |
| V4 Access Control | No | tool access controlled by MCP client (Claude Code, Inspector) |
| V5 Input Validation | Yes | zod v4 schemas; SDK does schema-boundary validation before handler call |
| V6 Cryptography | No | no secrets, no tokens, no encryption in Phase 2 |

### Known Threat Patterns for stdio MCP

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed JSON-RPC injected via stdin | Tampering | SDK `StdioServerTransport` handles malformed input gracefully; SDK returns protocol-level error |
| stdout pollution leaking application logs | Information Disclosure | `noConsole` Biome rule + `log.ts` writes only to stderr; verified by Tier 2 smoke test |
| Handler throwing and leaking stack traces | Information Disclosure | `internalError()` wraps unknown errors; never surface raw `err.stack` to client |
| projectRoot path traversal (later phases) | Elevation of Privilege | `resolveRoot()` returns absolute path; Phase 3+ parsers should sandbox to resolvedRoot |

---

## Sources

### Primary (HIGH confidence)
- `node_modules/@modelcontextprotocol/sdk@1.29.0/dist/esm/server/mcp.d.ts` — `McpServer.registerTool()` exact signature, `ToolCallback` type, `ZodRawShapeCompat` vs `AnySchema` distinction
- `node_modules/@modelcontextprotocol/sdk@1.29.0/dist/esm/inMemory.d.ts` — `InMemoryTransport.createLinkedPair()` API
- `node_modules/@modelcontextprotocol/sdk@1.29.0/dist/esm/server/stdio.d.ts` — `StdioServerTransport(stdin?, stdout?)` constructor
- `node_modules/@modelcontextprotocol/sdk@1.29.0/dist/esm/client/stdio.d.ts` — `StdioClientTransport({ command, args, stderr, env, cwd })`
- `node_modules/@modelcontextprotocol/sdk@1.29.0/dist/esm/server/zod-compat.d.ts` — `AnySchema`, `ZodRawShapeCompat`, `ShapeOutput`, `SchemaOutput` types
- `node_modules/@modelcontextprotocol/sdk@1.29.0/package.json` — subpath exports map confirming import paths
- Live Node.js execution (this session, Node 24.13.0, Windows): end-to-end McpServer + InMemoryTransport + Client + all four schemas verified working
- `biome.json` (project root, schema 2.4.12) — existing override structure confirmed

### Secondary (MEDIUM confidence)
- [Biome noConsole rule docs](https://biomejs.dev/linter/rules/no-console/) — `allow` option, override syntax via `includes`
- [Biome configuration reference](https://biomejs.dev/reference/configuration/#overrides) — `overrides[].includes` glob scoping

### Tertiary (LOW confidence)
- None — all material claims are HIGH confidence from local package inspection and live execution.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from installed packages + live execution
- Architecture: HIGH — all patterns tested end-to-end in Node 24 on Windows this session
- Pitfalls: HIGH — pitfalls 1–3 verified by live experiments; pitfalls 4–6 from official SDK type signatures + Windows platform knowledge

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (SDK 1.x is stable; Biome 2.x is stable; zod 4.x is stable)
