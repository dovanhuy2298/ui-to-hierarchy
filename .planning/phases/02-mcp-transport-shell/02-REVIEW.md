---
phase: 02-mcp-transport-shell
reviewed: 2026-04-29T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - biome.json
  - package.json
  - src/cli.ts
  - src/global.d.ts
  - src/mcp/errors.ts
  - src/mcp/log.ts
  - src/mcp/server.ts
  - src/mcp/tools/find-by-style.ts
  - src/mcp/tools/find-by-text.ts
  - src/mcp/tools/focus-on.ts
  - src/mcp/tools/get-full-hierarchy.ts
  - test/mcp/errors.test.ts
  - test/mcp/log.test.ts
  - test/mcp/server.test.ts
  - test/mcp/smoke.spawn.test.ts
  - vitest.config.ts
findings:
  critical: 0
  warning: 0
  info: 11
  total: 11
status: issues_found
---

# Phase 02 Code Review — MCP Transport Shell (re-review, maintainability focus)

**Reviewed:** 2026-04-29
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found (low severity — all Info, no Critical/Warning)

> Note: this review supersedes the 2026-04-21 review in this same file. The earlier WR-01/WR-02/WR-03 and IN-01/IN-04 from that pass have been resolved (see commits 1ace2b8, 1c9a37e, 26b7f70 and the existing fix report). This re-review focuses on the maintainability concerns the user explicitly asked about ("Xem code đã dễ dàng maintain chưa").

## Summary

Phase 2 ships a clean, well-scoped MCP stdio shell. Module boundaries are good (`server.ts` orchestrates, `tools/*` declare metadata + handler, `errors.ts` centralizes responses, `log.ts` is tiny and focused), and the test pyramid (in-process InMemoryTransport + spawned smoke tests) is the right shape. Stderr-only logging, no-stdout discipline, and the build-time `__TOOL_VERSION__` runtime fallback are all correct.

Security: nothing material. No secrets, no `eval`, no injection surface beyond `resolveRoot()` which is called only with caller-supplied `projectRoot` (acceptable for a local CLI). No buffer/stream issues. Tool handlers swallow exceptions via `internalError`, satisfying D-07.

Bugs: none found. Logic is straightforward stub-level.

The findings below are entirely **maintainability / future-extensibility** concerns. None are blockers; most are "this will hurt a little when Phase 3+ lands".

## Critical Issues

None.

## Warnings

None.

## Info

### IN-01: Tool registration boilerplate will scale poorly

**File:** `src/mcp/server.ts:29-67`
**Issue:** The four `server.registerTool(...)` calls are mechanically identical — same shape, only the imported namespace varies. Each new tool added in Phase 3+ requires copy-pasting an 8-line block, and the "did I forget to register one?" failure mode is silent (server just doesn't expose the tool). The four namespace imports also obscure the registration surface — there's no single discoverable "list of tools".
**Fix:** Introduce a `tools` array (typed) and iterate. Each tool module already exports the right shape; lift it to a contract:

```ts
// src/mcp/tools/index.ts
import * as getFullHierarchy from "./get-full-hierarchy.js";
import * as focusOn from "./focus-on.js";
import * as findByText from "./find-by-text.js";
import * as findByStyle from "./find-by-style.js";

export interface ToolModule {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  handler: (args: any) => Promise<ToolResponse>;
}

export const tools: ToolModule[] = [getFullHierarchy, focusOn, findByText, findByStyle];

// server.ts
for (const t of tools) {
  server.registerTool(t.name, { title: t.title, description: t.description, inputSchema: t.inputSchema }, t.handler);
}
```

This also gives `test/mcp/server.test.ts` a single source of truth for "expected tool count" instead of the hardcoded `4`.

### IN-02: Tool stub files duplicate the same try/catch + `_root` pattern verbatim

**File:** `src/mcp/tools/find-by-style.ts:28-35`, `find-by-text.ts:28-35`, `focus-on.ts:33-40`, `get-full-hierarchy.ts:35-42`
**Issue:** Every handler is:
```ts
try { const _root = resolveRoot(args.projectRoot); return notImplemented(name); }
catch (err) { return internalError(name, err); }
```
The `_root` variable is unused (its only purpose is to validate the path eagerly). When Phase 5 wires real logic, four files will need the same edit, which is exactly the kind of friction that creates inconsistency between tools.
**Fix:** Either (a) remove the `_root` call from stubs entirely (validation will be added when each handler is wired up) and keep stubs literally one-liners returning `notImplemented(name)`, or (b) introduce a small helper:

```ts
// errors.ts
export async function withErrorBoundary(toolName: string, fn: () => Promise<ToolResponse>) {
  try { return await fn(); } catch (err) { return internalError(toolName, err); }
}
```

Then each handler becomes a single line: `return withErrorBoundary(name, async () => { const root = resolveRoot(args.projectRoot); ... });`. Phase 5 wire-up then changes one body, not four boilerplates.

### IN-03: `projectRoot` schema fragment is duplicated across all four tools

**File:** `src/mcp/tools/find-by-style.ts:20-25`, `find-by-text.ts:20-25`, `focus-on.ts:25-30`, `get-full-hierarchy.ts:27-32`
**Issue:** The same 6-line `projectRoot` zod field with identical `.describe(...)` is repeated four times. If the description ever changes (e.g., add monorepo guidance), four edits are needed.
**Fix:** Extract a shared schema fragment in (e.g.) `src/mcp/tools/common.ts`:

```ts
export const projectRootSchema = z.string().optional().describe(
  "Absolute path to the Next.js project root. Defaults to UI_TO_HIERARCH_ROOT env var, then process.cwd().",
);
```

…and reuse it: `z.object({ ..., projectRoot: projectRootSchema })`.

### IN-04: `Phase 5` reference is hardcoded in five places

**File:** `src/mcp/errors.ts:14`, `src/mcp/tools/find-by-style.ts:11`, `find-by-text.ts:11`, `focus-on.ts:10`, `get-full-hierarchy.ts:10`, plus a test assertion in `test/mcp/errors.test.ts:28`
**Issue:** Five source locations and one test assertion all hardcode "Phase 5 (IR Queries & Tool Wire-up)". If the roadmap renumbers (very plausible during planning), every stub description and the centralized `notImplemented` message will drift independently. Tests will catch *some* drift but not all (only the centralized helper text).
**Fix:** Either (a) drop the per-tool "Phase 2 stub — …" sentence from each tool description and rely solely on `notImplemented()`'s centralized message at runtime, or (b) export a single `PHASE_5_REFERENCE` constant from `errors.ts` and reuse it. Option (a) is preferred — descriptions are wire-protocol surface that LLM clients see, and they shouldn't carry developer-roadmap noise.

### IN-05: `asToolResponse` cast helper hides a type-safety gap

**File:** `test/mcp/server.test.ts:15-17`, lines 113-114, 137, 202-235
**Issue:** Tests cast `client.callTool()`'s `unknown` content into `ToolResponse`, then re-cast each `content[0]` to `{ type: string; text: string }`. The double-cast reads as ceremony, and the inline `(r.content[0] as { type: string; text: string }).text` is repeated ~6 times. When Phase 5 introduces structured/JSON content variants, every site needs updating.
**Fix:** Add one helper near `asToolResponse`:
```ts
function firstText(r: ToolResponse): string {
  const item = r.content[0];
  if (!item || item.type !== "text") throw new Error("expected text content");
  return (item as { type: "text"; text: string }).text;
}
```
This is exactly what `test/mcp/errors.test.ts:9-13` already does — lift it to a shared `test/helpers.ts` so both test files use one definition.

### IN-06: One comment cites a planning doc that won't ship

**File:** `src/mcp/server.ts:22`
**Issue:** Most comments are valuable (the tsup-banner shebang note in `cli.ts:4`, the `__TOOL_VERSION__` fallback rationale, "Does NOT connect a transport"). However, `// CRITICAL: Keep createServer and startServer separate (see RESEARCH.md Pitfall 1)` cites a planning doc that won't be shipped — once `.planning/` is rotated/archived the reference rots. Inline the *reason* rather than the doc pointer.
**Fix:** Replace with: `// Keep createServer (returns server, no transport) and startServer (wires stdio) separate so tests can inject InMemoryTransport without touching real stdio.`

### IN-07: `smoke.spawn.test.ts` references `pnpm build` but the project has no committed package manager pin

**File:** `test/mcp/smoke.spawn.test.ts:9, 24`
**Issue:** Comments and the error message say `pnpm build` / `pnpm run test:smoke`, but `package.json` has no `packageManager` field and the project README/CLAUDE.md don't mandate pnpm. A contributor running `npm run build` will hit the same `dist/` output but be confused by the error message.
**Fix:** Use the manager-agnostic phrasing: `Run 'npm run build' (or your package manager's equivalent) before 'npm run test:smoke'.` Or add `"packageManager": "pnpm@..."` to `package.json` to make the tooling choice authoritative.

### IN-08: `log` meta key collision lets caller overwrite canonical fields

**File:** `src/mcp/log.ts:13-18`
**Issue:** `JSON.stringify({ level, msg, ...meta, ts })` — `meta` is spread *after* `level` and `msg`, so a caller passing `log.info("real", { level: "error" })` will produce a line whose `level` is `"error"`. Today all callers are well-behaved, but the silent override will fool log scrapers if a buggy call sneaks in.
**Fix:** Spread meta first, then write canonical fields last so they win:
```ts
const entry = JSON.stringify({ ...(meta ?? {}), level, msg, ts: new Date().toISOString() });
```

### IN-09: Smoke test asserts only "≥1 JSON log line", not "all stderr is structured"

**File:** `test/mcp/smoke.spawn.test.ts:69-86`
**Issue:** The test passes if any single stderr line parses as JSON with a `level` field. It does NOT assert that *all* non-empty lines parse as JSON — meaning a regression that mixes `console.log` output into stderr would still pass as long as at least one structured line exists. This weakens the contract that the biome `noConsole: error` override on `src/mcp/**` is supposed to backstop at runtime.
**Fix:** Assert all non-empty lines are structured JSON:
```ts
const nonJsonLines = lines.filter((line) => {
  try { JSON.parse(line); return false; } catch { return true; }
});
expect(nonJsonLines, `Unstructured stderr lines: ${nonJsonLines.join("\n")}`).toHaveLength(0);
expect(jsonLines.length).toBeGreaterThan(0);
```

### IN-10: `ToolResponse = CallToolResult` is a paper-thin alias

**File:** `src/mcp/errors.ts:1-3`
**Issue:** `ToolResponse` is just a one-line alias for `CallToolResult`. It's fine today, but Phase 5 will likely want to model error vs. success variants explicitly. Flagging so the team treats this as a known-thin abstraction rather than a real domain type.
**Fix:** Defer until Phase 5. No action needed in this phase.

### IN-11: Adding a new tool is a 4-file change

**File:** `src/mcp/server.ts:4-7`, `test/mcp/server.test.ts:58-72`
**Issue:** Related to IN-01. Today there's no barrel/registry for tools, so adding a tool means: (1) create the tool file, (2) edit `server.ts` imports, (3) edit `server.ts` registerTool block, (4) edit `test/mcp/server.test.ts` count + names list. Four-file edits for a one-file addition is the textbook signal that a registry is missing.
**Fix:** Combined with IN-01 — a `src/mcp/tools/index.ts` barrel exporting `tools[]` reduces this to: (1) create the tool file, (2) add it to the barrel; the test count auto-derives from `tools.length`.

---

## Maintainability scorecard (per user emphasis)

| Concern | Status |
|---|---|
| Module boundaries | Good — `server.ts` / `tools/*` / `errors.ts` / `log.ts` cleanly separated |
| Naming + discoverability | Mixed — tool registration not discoverable without grepping (IN-01) |
| Tool stub duplication | High — IN-02, IN-03, IN-04 are all variants of the same copy-paste |
| Type safety in source | Good — strict TS, zod-derived inference, no `any` leaks |
| Type safety in tests | Mixed — cast ceremony around `ToolResponse` (IN-05) |
| Test ergonomics for Phase 3+ | Good base, but `firstText` duplication (IN-05) and weak stderr assertion (IN-09) need refactor before handlers grow |
| Future-extensibility | One real friction point (IN-01/IN-11): adding a tool is a 4-file change |
| Comment signal-to-noise | Mostly good; one stale doc reference (IN-06) |

---

_Reviewed: 2026-04-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
