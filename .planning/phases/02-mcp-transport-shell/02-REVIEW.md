---
phase: 02-mcp-transport-shell
reviewed: 2026-04-21T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - src/global.d.ts
  - src/cli.ts
  - src/mcp/errors.ts
  - src/mcp/log.ts
  - src/mcp/server.ts
  - src/mcp/tools/get-full-hierarchy.ts
  - src/mcp/tools/focus-on.ts
  - src/mcp/tools/find-by-text.ts
  - src/mcp/tools/find-by-style.ts
  - test/mcp/errors.test.ts
  - test/mcp/log.test.ts
  - test/mcp/server.test.ts
  - test/mcp/smoke.spawn.test.ts
  - vitest.config.ts
  - package.json
  - biome.json
  - tsup.config.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-04-21T00:00:00Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

This phase delivers the MCP stdio transport shell: server wiring (`createServer` / `startServer`), four stub tool handlers, a structured stderr logger, error helpers, and two test tiers (in-process `InMemoryTransport` + spawned binary smoke test). The overall design is sound — the `createServer` / `startServer` split is correct, stdout is strictly reserved for JSON-RPC frames, error responses never leak stack traces, and the test coverage is well-structured.

Three warnings and four info items follow. No critical (security/data-loss/crash) issues were found.

---

## Warnings

### WR-01: `__TOOL_VERSION__` used before tsup `define` substitution — crashes in `vitest run` without the config shim

**File:** `src/mcp/server.ts:21` and `src/mcp/server.ts:63` and `src/mcp/server.ts:74`

**Issue:** `__TOOL_VERSION__` is a build-time constant declared in `src/global.d.ts` and substituted by tsup's `define` at bundle time. `vitest.config.ts` correctly mirrors the substitution with `define: { __TOOL_VERSION__: JSON.stringify("0.0.0-test") }`. However, `vitest.config.ts` has **no `globals: true`** and no reference to `src/global.d.ts`, so the substitution only works because Vite's `define` replaces the string at transform time. The fragile part: if any test file imports `src/mcp/server.ts` outside of `vitest run` (e.g., via `tsx src/mcp/server.ts` in isolation, or in a future test runner that does not perform the define-substitution), the reference to the undeclared global will throw `ReferenceError: __TOOL_VERSION__ is not defined` at runtime.

The `global.d.ts` declaration only satisfies the TypeScript compiler — it does not inject the value at runtime.

**Fix:** Add a runtime fallback in `server.ts` so the code is defensive regardless of build context:

```typescript
// At the top of src/mcp/server.ts, after imports:
const TOOL_VERSION =
  typeof __TOOL_VERSION__ !== "undefined" ? __TOOL_VERSION__ : "0.0.0-unknown";

// Then use TOOL_VERSION instead of the raw constant everywhere.
```

Alternatively, read the version from `package.json` at runtime as a single source of truth and drop the `define` approach entirely — but that requires a dynamic import and is more disruptive.

---

### WR-02: `smoke.spawn.test.ts` — `afterAll` does not close the spawned transport, only the client

**File:** `test/mcp/smoke.spawn.test.ts:43-45`

**Issue:** `afterAll` calls `await client.close()` but does not call `await transport.close()`. `StdioClientTransport.close()` terminates the spawned child process. `Client.close()` sends the MCP `close` notification over the transport and resolves — but does not guarantee that `transport.close()` is invoked, meaning the child process (the `node dist/cli.js` server) may linger as an orphan between test runs. In CI this can cause port/handle conflicts and prevent the vitest process from exiting cleanly (open handle warning).

**Fix:**

```typescript
afterAll(async () => {
  await client.close();
  await transport.close(); // terminate the spawned child process
}, 10000);
```

---

### WR-03: `find_by_text` — `query` field has no minimum-length constraint, allowing empty-string calls through schema validation

**File:** `src/mcp/tools/find-by-text.ts:13-18`

**Issue:** The `query` parameter is declared as `z.string()` with no `.min(1)` guard. An empty-string query (`""`) passes schema validation, reaches the handler, and returns a `notImplemented` response — harmless now, but in Phase 5 when real search lands, an empty query would either return the entire component tree (unbounded output) or require ad-hoc defensive checks in the search logic. Setting the constraint at the schema boundary is cheaper and provides clearer MCP error messages.

**Fix:**

```typescript
query: z
  .string()
  .min(1)
  .describe(
    "Text string to search for in rendered component output (e.g., Submit, Cancel, Hello World).",
  ),
```

The same applies to `find_by_style`'s `class_or_prop` field (`src/mcp/tools/find-by-style.ts:13-17`), which also lacks `.min(1)`.

---

## Info

### IN-01: `server.test.ts` — test description for "each tool has a non-empty title" is misleading

**File:** `test/mcp/server.test.ts:82-88`

**Issue:** The `it` description reads `"each tool has a non-empty title"` but the assertion body checks `tool.inputSchema` (not `tool.title`). This is a copy-paste error in the test label. The assertion itself is already covered by a different test ("each tool has a non-empty description"), so the test body may have been meant to check `tool.annotations?.title` or the registered `title` field. Either the description or the assertion is wrong.

**Fix:** Correct the description to match the assertion:

```typescript
it("each tool has a non-empty inputSchema", async () => {
  const { tools } = await pair.client.listTools();
  for (const tool of tools) {
    expect(tool.inputSchema, `${tool.name} should have an inputSchema`).toBeTruthy();
  }
});
```

Or, if the intent was to assert the title, add the correct assertion:

```typescript
it("each tool has a non-empty title", async () => {
  const { tools } = await pair.client.listTools();
  for (const tool of tools) {
    expect(tool.annotations?.title, `${tool.name} should have a title`).toBeTruthy();
  }
});
```

---

### IN-02: `biome.json` — `noExplicitAny` disabled globally, but test files perform unsafe `as any`-equivalent casts

**File:** `biome.json:15-17`

**Issue:** `"noExplicitAny": "off"` is set at the project root level, disabling the rule for all files including source. The test files work around the SDK's opaque `unknown[]` content type with casts like `result as ToolResponse` and `first as { type: "text"; text: string }`. These are acceptable given the SDK's current type shapes, but the blanket global disable means future careless `any` usage in `src/` will not be caught by the linter. A more targeted approach would be to keep the rule enabled at root and override it only in `test/**`.

**Fix:**

```json
"linter": {
  "enabled": true,
  "rules": {
    "recommended": true
  }
},
"overrides": [
  {
    "includes": ["test/**"],
    "linter": {
      "rules": {
        "suspicious": { "noExplicitAny": "off" }
      }
    }
  },
  ...existing overrides...
]
```

---

### IN-03: `tsup.config.ts` — `dts: false` means no `.d.ts` is emitted, but `package.json` exports declare a `types` field

**File:** `package.json:16-17` and `tsup.config.ts:15`

**Issue:** `package.json` exports include `"types": "./dist/index.d.ts"`, but `tsup.config.ts` has `dts: false`. The `dist/index.d.ts` file will never be produced, so the types export resolves to a non-existent file. Any downstream consumer that imports the package programmatically (not via `npx`) will receive a TypeScript error. This is low-priority if the package is intended as a CLI-only binary, but the `exports` field creates a false promise.

**Fix (option A — remove the dead export):** Delete the `exports` block from `package.json` entirely, since the binary is CLI-only and not designed to be imported.

**Fix (option B — generate types):** Enable `dts: true` in `tsup.config.ts` and add an `src/index.ts` barrel if library consumers are an eventual goal.

---

### IN-04: `smoke.spawn.test.ts` — `stderrChunks` is module-level state shared across test runs

**File:** `test/mcp/smoke.spawn.test.ts:18`

**Issue:** `const stderrChunks: Buffer[] = []` is declared at module scope and never reset. If `vitest` re-runs the module (watch mode, or if the smoke suite is ever included in `pnpm test` alongside unit tests), chunks from a previous process may accumulate and cause false positives in the `"contains at least one structured JSON log line"` assertion. The risk is low given `test:smoke` is a separate script, but it is a latent correctness issue.

**Fix:** Move `stderrChunks` inside `beforeAll` and assign to a `let` declared in the `describe` scope:

```typescript
describe("MCP smoke — spawned binary (MCP-01, MCP-04)", () => {
  let stderrChunks: Buffer[];
  // ...
  beforeAll(async () => {
    stderrChunks = []; // fresh for each run
    // ...
  });
});
```

---

_Reviewed: 2026-04-21T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
