# Phase 2: MCP Transport Shell - Pattern Map

**Mapped:** 2026-04-21
**Files analyzed:** 12
**Analogs found:** 9 / 12

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/mcp/server.ts` | service | request-response | `src/renderers/envelope-builder.ts` | role-match |
| `src/mcp/log.ts` | utility | transform | `src/core/paths.ts` | role-match |
| `src/mcp/errors.ts` | utility | transform | `src/core/resolve-root.ts` | role-match |
| `src/mcp/tools/get-full-hierarchy.ts` | service | request-response | `src/renderers/envelope-builder.ts` | role-match |
| `src/mcp/tools/focus-on.ts` | service | request-response | `src/renderers/envelope-builder.ts` | role-match |
| `src/mcp/tools/find-by-text.ts` | service | request-response | `src/renderers/envelope-builder.ts` | role-match |
| `src/mcp/tools/find-by-style.ts` | service | request-response | `src/renderers/envelope-builder.ts` | role-match |
| `src/cli.ts` | config | request-response | `src/cli.ts` (Phase 1 stub) | exact (replace body) |
| `biome.json` | config | — | `biome.json` (Phase 1) | exact (add override block) |
| `package.json` | config | — | `package.json` (Phase 1) | exact (add entries) |
| `test/mcp/server.test.ts` | test | request-response | `test/core/resolve-root.test.ts` | role-match |
| `test/mcp/smoke.spawn.test.ts` | test | request-response | `test/renderers/json.test.ts` | partial-match |

---

## Pattern Assignments

### `src/mcp/server.ts` (service, request-response)

**Analog:** `src/renderers/envelope-builder.ts`

No direct MCP server analog exists yet — this is the first MCP file. The RESEARCH.md code examples are the canonical patterns. The envelope-builder analog provides the `__TOOL_VERSION__` guard and module export shape to copy.

**`__TOOL_VERSION__` guard pattern** (`src/renderers/envelope-builder.ts` lines 6-17):
```typescript
// Build-time define injected by tsup (see tsup.config.ts `define`).
// Under tsx / vitest the define is absent, so we guard with a typeof check and
// fall back to "0.0.0-dev". The ambient declaration keeps TS strict happy.
declare const __TOOL_VERSION__: string;

function getToolVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof __TOOL_VERSION__ !== "undefined") return __TOOL_VERSION__;
  } catch {
    // ReferenceError in dev (tsx/vitest) where the define hasn't replaced it.
  }
  return "0.0.0-dev";
}
```

**Core server pattern** (from RESEARCH.md — verified against SDK 1.29.0):
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'ui-to-hierarch',
    version: getToolVersion(),  // same guard as envelope-builder.ts
  });
  // import and registerTool for each of the four tool modules
  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // process stays alive; StdioServerTransport holds stdin open
}
```

**Import path convention** (CLAUDE.md §"MCP SDK — Concrete Usage Pattern"):
- Always use explicit subpath imports with `.js` extension: `from '@modelcontextprotocol/sdk/server/mcp.js'`
- Never `from '@modelcontextprotocol/sdk'` (root barrel)

**Split `createServer` / `startServer` is mandatory** (RESEARCH.md Pitfall 1): `startServer` hard-codes `StdioServerTransport` which steals stdin; tests must call `createServer` and wire `InMemoryTransport` themselves.

---

### `src/mcp/log.ts` (utility, transform)

**Analog:** `src/core/paths.ts`

The paths module is the closest existing utility — pure functions, single-concern, zero deps, typed exports. log.ts follows the same module shape but writes to `process.stderr`.

**Utility module shape** (`src/core/paths.ts` lines 1-26):
```typescript
import path from "node:path";

// Single exported function per concern, no class, no default export
export function toForwardSlash(p: string): string {
  return p.split(path.sep).join("/").replaceAll("\\", "/");
}

export function relFromRoot(absFile: string, absRoot: string): string {
  return toForwardSlash(path.relative(absRoot, absFile));
}
```

**Core logger pattern** (from RESEARCH.md D-08 — locked decision):
```typescript
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

**Critical constraint:** Never write to `process.stdout` — only `process.stderr`. stdout is reserved for the SDK's `StdioServerTransport` JSON-RPC frames.

---

### `src/mcp/errors.ts` (utility, transform)

**Analog:** `src/core/resolve-root.ts`

Like resolve-root.ts: a small utility module, explicit typed returns, named exports, no side effects.

**Utility module shape** (`src/core/resolve-root.ts` lines 1-18):
```typescript
import path from "node:path";
import { toForwardSlash } from "./paths.js";

export function resolveRoot(explicit?: string): string {
  const candidate = explicit ?? process.env.UI_TO_HIERARCH_ROOT ?? process.cwd();
  return toForwardSlash(path.resolve(candidate));
}
```

**Core error helpers pattern** (from RESEARCH.md D-05/D-06 — locked decision):
```typescript
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
  const message = zodError instanceof Error ? zodError.message : String(zodError);
  return {
    content: [{ type: 'text', text: `${toolName} received invalid input: ${message}` }],
    isError: true,
  };
}
```

---

### `src/mcp/tools/get-full-hierarchy.ts` (service, request-response)

**Analog:** `src/renderers/envelope-builder.ts`

The envelope-builder is the closest analog: a function that takes typed inputs, imports from `core/`, and returns a typed output. Tool modules follow the same shape but export the tool definition object consumed by `server.ts`.

**Zod schema + tool definition export pattern** (from RESEARCH.md — verified):
```typescript
import { z } from 'zod';
import { resolveRoot } from '../../core/resolve-root.js';
import { notImplemented, internalError } from '../errors.js';
import { log } from '../log.js';

export const inputSchema = z.object({
  route: z
    .string()
    .regex(
      /^\/$|^\/(?:[\w\-]+|\[[\w.]+\]|\[\.\.\.[\w]+\]|\[\[\.\.\.[\w]+\]\])(?:\/(?:[\w\-]+|\[[\w.]+\]|\[\.\.\.[\w]+\]|\[\[\.\.\.[\w]+\]\]))*$/
    )
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

export const toolDef = {
  name: 'get_full_hierarchy' as const,
  title: 'Get Full Hierarchy',
  description: 'Returns the ordered layout chain and page component subtree for a Next.js App Router route. Phase 2 stub — returns not-implemented error.',
  inputSchema,
  handler: async (args: z.infer<typeof inputSchema>) => {
    log.info('tool called', { name: 'get_full_hierarchy' });
    try {
      const _root = resolveRoot(args.projectRoot);  // call resolveRoot per D-13
      return notImplemented('get_full_hierarchy');
    } catch (err) {
      return internalError('get_full_hierarchy', err);
    }
  },
};
```

**Zod field style** (from `src/ir/schema.ts` lines 82-86):
```typescript
// Every field uses z.string(), z.number().int().nonnegative(), etc.
// Optional fields use .optional() not z.optional(field)
const BaseNode = {
  file: z.string(),
  line: z.number().int().nonnegative(),
  layoutHint: z.string().optional(),
};
```

---

### `src/mcp/tools/focus-on.ts` (service, request-response)

Same pattern as `get-full-hierarchy.ts`. Schema from RESEARCH.md D-02/D-03:

```typescript
export const inputSchema = z.object({
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
```

---

### `src/mcp/tools/find-by-text.ts` (service, request-response)

Same pattern. Schema:
```typescript
export const inputSchema = z.object({
  query: z
    .string()
    .describe('Text string to search for in rendered component output'),
  projectRoot: z
    .string()
    .optional()
    .describe('Absolute path to project root. Defaults to UI_TO_HIERARCH_ROOT env var, then process.cwd().'),
});
```

---

### `src/mcp/tools/find-by-style.ts` (service, request-response)

Same pattern. Schema:
```typescript
export const inputSchema = z.object({
  class_or_prop: z
    .string()
    .describe('CSS class name or style prop to search for (e.g., flex, bg-blue-500, color)'),
  projectRoot: z
    .string()
    .optional()
    .describe('Absolute path to project root. Defaults to UI_TO_HIERARCH_ROOT env var, then process.cwd().'),
});
```

---

### `src/cli.ts` (config, request-response)

**Analog:** `src/cli.ts` (Phase 1 stub — replace body entirely)

**Current body** (`src/cli.ts` lines 1-2):
```typescript
console.error("mcp server not implemented yet");
process.exit(0);
```

**Replacement pattern** (from CONTEXT.md D-11):
```typescript
import { startServer } from './mcp/server.js';
import { log } from './mcp/log.js';

await startServer().catch((err: unknown) => {
  log.error('startup failed', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
```

**Critical:** No `console.error` / `console.log` — the `noConsole` Biome rule applies to `src/cli.ts`. Use `log.*` from `src/mcp/log.ts`.

---

### `biome.json` (config — add noConsole override)

**Analog:** `biome.json` (existing Phase 1 file — add a second override entry)

**Existing `overrides` array** (`biome.json` lines 29-50) — the island import restriction block shows exact override syntax:
```json
"overrides": [
  {
    "includes": ["src/ir/**", "src/renderers/**", "src/core/**"],
    "linter": {
      "rules": {
        "style": {
          "noRestrictedImports": {
            "level": "error",
            "options": {
              "patterns": [...]
            }
          }
        }
      }
    }
  }
]
```

**New block to append** (from RESEARCH.md Pattern 6 — verified against biome 2.4.12):
```json
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
```

**Ordering constraint** (RESEARCH.md Pitfall 4): Place the `noConsole` override last in the array so it wins if future overrides for `test/**` intersect.

---

### `package.json` (config — add 3 entries)

**Analog:** `package.json` (existing Phase 1 file — targeted additions only)

**Existing scripts block** (`package.json` lines 21-28):
```json
"scripts": {
  "dev": "tsx src/cli.ts",
  "build": "tsup",
  "test": "vitest run",
  "test:watch": "vitest",
  "lint": "biome check .",
  "typecheck": "tsc --noEmit"
}
```

**Add to scripts:**
```json
"test:smoke": "vitest run test/mcp/smoke.spawn.test.ts"
```

**Add to devDependencies:**
```json
"@modelcontextprotocol/inspector": "^0.21.2"
```

Note: `@modelcontextprotocol/sdk` is already in `dependencies` at `^1.29.0` (line 34) — no change needed there.

---

### `test/mcp/server.test.ts` (test, request-response)

**Analog:** `test/core/resolve-root.test.ts`

The resolve-root test is the closest analog: `describe`/`it` blocks, `vitest` imports, `afterEach` cleanup, testing a utility function in isolation.

**Test file structure** (`test/core/resolve-root.test.ts` lines 1-5):
```typescript
import { describe, it, expect, afterEach, vi } from "vitest";
import { resolveRoot } from "../../src/core/resolve-root.js";

describe("resolveRoot", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
```

**Core Tier 1 test pattern** (from RESEARCH.md Pattern 2 — verified):
```typescript
import { describe, it, expect, afterEach } from "vitest";
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createServer } from '../../src/mcp/server.js';

describe('mcp server', () => {
  it('lists all four tools', async () => {
    const server = createServer();
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
    // same wiring pattern...
    const result = await client.callTool({
      name: 'get_full_hierarchy',
      arguments: { route: '/dashboard' },
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe('text');
    expect((result.content[0] as { type: 'text'; text: string }).text).toContain('get_full_hierarchy');
  });
});
```

**Import path convention** (`test/core/resolve-root.test.ts` line 2): always use `../../src/...js` relative path with `.js` extension.

---

### `test/mcp/smoke.spawn.test.ts` (test, request-response)

**Analog:** `test/renderers/json.test.ts` (partial — uses same describe/it structure and vitest imports; Tier 2 spawn logic comes from RESEARCH.md Pattern 3)

**Test file structure** (`test/renderers/json.test.ts` lines 1-6):
```typescript
import { describe, expect, it } from "vitest";
import { EnvelopeSchema } from "../../src/ir/index.js";
import { buildEnvelope, renderJson } from "../../src/renderers/index.js";
import { deepBranch, empty, kitchenSink, singleLeaf } from "../fixtures/ir/index.js";
```

**Core Tier 2 spawn pattern** (from RESEARCH.md Pattern 3 — verified against SDK 1.29.0):
```typescript
import { describe, it, expect, afterAll } from "vitest";
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const distCli = resolve(fileURLToPath(import.meta.url), '../../../dist/cli.js');

describe('smoke: spawned binary', () => {
  it('stdout carries only JSON-RPC frames and stderr has structured log', async () => {
    const transport = new StdioClientTransport({
      command: 'node',
      args: [distCli],
      stderr: 'pipe',  // capture stderr for assertion
    });

    const stderrChunks: Buffer[] = [];
    transport.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    const client = new Client({ name: 'smoke-test', version: '0.0.0' });
    await client.connect(transport);

    const { tools } = await client.listTools();
    expect(tools).toHaveLength(4);

    const stderrText = Buffer.concat(stderrChunks).toString('utf8');
    const lines = stderrText.split('\n').filter(Boolean);
    // every stderr line must parse as JSON with { level, msg, ts }
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }

    await client.close();
  });
});
```

**This test requires a prior `pnpm build`** — gated behind `test:smoke` script, not `pnpm test`.

---

## Shared Patterns

### Zod v4 Schema Style
**Source:** `src/ir/schema.ts` (lines 1-2, 82-86) + `src/ir/envelope.ts`
**Apply to:** All four tool input schema files

```typescript
import { z } from "zod";

// Named export for the schema const (not inline, allows reuse in tests)
export const myToolInput = z.object({
  field: z.string().describe('One-line action-verb description'),
  optionalField: z.string().optional().describe('...'),
});

// Type inferred from schema — no hand-written interface
export type MyToolInput = z.infer<typeof myToolInput>;
```

Key rules from existing code:
- `z.string().optional()` not `z.optional(z.string())`
- Every field has `.describe('...')` with an action-verb one-liner
- Export the schema const by name so tests can import it

### `__TOOL_VERSION__` Guard
**Source:** `src/renderers/envelope-builder.ts` (lines 6-17)
**Apply to:** `src/mcp/server.ts`

The same guard used in envelope-builder.ts must be used in server.ts for the `McpServer` version field. Copy the `declare const __TOOL_VERSION__: string` + `getToolVersion()` function verbatim — this is the established project pattern.

### Import Path Convention
**Source:** All existing `src/` files
**Apply to:** All Phase 2 files

```typescript
// node builtins: "node:" prefix
import path from "node:path";

// internal: relative path with ".js" extension (even for .ts source)
import { resolveRoot } from "../../core/resolve-root.js";

// npm packages: bare specifier with ".js" subpath where required
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
```

### Test Import Convention
**Source:** `test/core/resolve-root.test.ts` (line 2), `test/renderers/json.test.ts` (lines 1-4)
**Apply to:** Both test files

```typescript
// vitest imports from "vitest" (not @vitest/...)
import { describe, it, expect, afterEach, vi } from "vitest";

// src imports: always ../../src/...js (two levels up from test/mcp/)
import { createServer } from "../../src/mcp/server.js";
```

### Error Return Shape
**Source:** CONTEXT.md D-05, RESEARCH.md Pattern 4
**Apply to:** All four tool handler functions

Every tool handler's return must conform to:
```typescript
{ content: [{ type: 'text', text: string }], isError: true }
```
This is the `CallToolResult` shape from `@modelcontextprotocol/sdk/types.js`. Never return raw strings or throw from a handler.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/mcp/server.ts` (McpServer wiring) | service | request-response | No existing MCP server files in codebase; RESEARCH.md code examples are primary reference |
| `test/mcp/smoke.spawn.test.ts` (spawn logic) | test | request-response | No subprocess-spawning tests exist yet; RESEARCH.md Pattern 3 is the reference |
| `src/mcp/log.ts` | utility | transform | No logging utility exists; pattern is a locked decision (D-08), fully specified in RESEARCH.md |

---

## Metadata

**Analog search scope:** `src/core/`, `src/ir/`, `src/renderers/`, `src/cli.ts`, `biome.json`, `package.json`, `test/core/`, `test/ir/`, `test/renderers/`
**Files scanned:** 16
**Pattern extraction date:** 2026-04-21
