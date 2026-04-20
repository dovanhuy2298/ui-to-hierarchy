# Phase 2: MCP Transport Shell - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a runnable stdio MCP server: `npx ui-to-hierarch` starts `StdioServerTransport`, registers the four v1 tools (`get_full_hierarchy`, `focus_on`, `find_by_text`, `find_by_style`) with strict zod schemas, and returns structured `{ isError: true }` "not implemented" responses for every call. stdout is guaranteed to carry only JSON-RPC frames; all diagnostics go to stderr.

Out of scope for Phase 2: any real parsing, adapter logic, AST work, query implementation, fixture projects. Handlers are stubs. Tool logic lands in Phases 3–5. Real-client e2e across fixture repos is Phase 6.

</domain>

<decisions>
## Implementation Decisions

### Tool Schema Shapes (D-01 — D-04)

- **D-01 — Route validator (TOOL-01 input):** `z.string().regex(/^\/(?:[\w\-]+|\[[\w.]+\]|\[\.\.\.[\w]+\]|\[\[\.\.\.[\w]+\]\])(?:\/(?:[\w\-]+|\[[\w.]+\]|\[\.\.\.[\w]+\]|\[\[\.\.\.[\w]+\]\]))*$|^\/$/).describe(...)`. Accepts `/`, `/foo`, `/foo/[slug]`, `/[...rest]`, `/[[...opt]]`. Rejects whitespace, query strings, hash, trailing slash on non-root, non-Next.js shapes early — full route-to-entry mapping lives in Phase 4.
- **D-02 — Scope enum (TOOL-02 input):** `z.enum(['up','full','down']).default('full')`. Default `'full'` because ancestors+subtree is the safest fallback when an agent forgets the param.
- **D-03 — Identifier regex (TOOL-02 `component`):** `z.string().regex(/^[A-Z][A-Za-z0-9_]*$/)`. PascalCase-only — JSX components are always PascalCase; rejects lowercase tags and kebab-case. Compound/namespaced forms (`Card.Header`) are NOT supported in v1; revisit if Phase 4/5 needs them.
- **D-04 — Format param (TOOL-01 `format?`):** `z.enum(['markdown','json']).default('markdown')`. Markdown default matches OUT-01 (LLM-friendly). Enum (not boolean) preserves room for v2 output renderers (XML/Mermaid are listed in REQUIREMENTS v2).

**Schema authoring rules applied to ALL four tools:**
- Every zod field carries `.describe('...')` with a one-line purpose statement (SC-2).
- Tool inputs also expose `projectRoot?: z.string().describe(...)` per D-10.
- Zod v4 is used (Standard Schema) so `registerTool` auto-derives JSON Schema for the wire protocol — no hand-rolled `inputSchema`.

### Error & Not-Implemented Contract (D-05 — D-07)

- **D-05 — Response shape:** Every handler returns `{ content: [{ type: 'text', text: <message> }], isError: true }`. Message template:
  `"{tool_name} is not implemented yet. Phase 2 (MCP Transport Shell) only ships the stdio surface; real parsing lands in Phase 5 (IR Queries & Tool Wire-up). See .planning/ROADMAP.md."`
  Message is actionable — names the next phase, points to ROADMAP for tracking.
- **D-06 — Shared error helpers:** New module `src/mcp/errors.ts` exports at minimum:
  - `notImplemented(toolName: string): ToolResponse`
  - `invalidInput(toolName: string, zodError: z.ZodError): ToolResponse` — for use by Phase 5 handlers when zod parse fails inside handler (the SDK also rejects at the schema boundary, but extra guards are cheap).
  - `internalError(toolName: string, err: unknown): ToolResponse` — wraps unexpected throws so SC-3 ("no unhandled exceptions ever escape") holds.
  All four tool handlers in Phase 2 are one-liners that return `notImplemented(toolName)`.
- **D-07 — Exception safety:** Every tool handler is wrapped in `try { ... } catch (err) { return internalError(toolName, err); }` from day one, even though the body is a stub. Sets the pattern for Phase 5 without retrofit.

### Logging / Stderr Strategy (D-08, D-09)

- **D-08 — Tiny in-house logger:** New module `src/mcp/log.ts` — no new runtime dependency. API: `log.info(msg, meta?)`, `log.warn(...)`, `log.error(...)`, `log.debug(...)`. Implementation writes `JSON.stringify({ level, msg, meta, ts: new Date().toISOString() }) + '\n'` to `process.stderr`. `log.debug` is a no-op unless `process.env.MCP_DEBUG === '1'`. stdout is never touched by this module — only JSON-RPC frames emitted by the SDK transport go to stdout.
- **D-09 — Biome `noConsole` enforcement:** Enable `suspicious.noConsole` in `biome.json` scoped to `src/mcp/**` and `src/cli.ts`. Test files, IR, and renderers keep console freedom. Rule blocks CI if a future contributor reintroduces `console.log` on server paths (SC-4). The CLI's current `console.error("mcp server not implemented yet")` from Phase 1 is replaced by `log.info(...)` in the startup path — keeping cli.ts clean under the rule.

### Server Wiring & Layout (D-10 — D-13)

- **D-10 — `src/mcp/` file layout:**
  ```
  src/mcp/
    server.ts          # startServer(): builds McpServer, registers tools, connects StdioServerTransport
    log.ts             # tiny stderr logger (D-08)
    errors.ts          # shared error helpers (D-06)
    tools/
      get-full-hierarchy.ts
      focus-on.ts
      find-by-text.ts
      find-by-style.ts
  ```
  Each `tools/{name}.ts` exports `{ name, title, description, inputSchema, handler }`. `server.ts` imports the four modules and calls `server.registerTool(...)` for each. Scales cleanly to Phase 5 when handlers grow.
- **D-11 — CLI vs server split:** `src/cli.ts` stays thin: shebang (injected by tsup banner per Phase 1), no argv parsing in v1 (zero flags), `await startServer()`, `catch` wraps top-level errors and `process.exit(1)` with a stderr log. `src/mcp/server.ts` exports `startServer(): Promise<void>` — testable in-process without spawning a subprocess.
- **D-12 — `McpServer` identity:** `new McpServer({ name: 'ui-to-hierarch', version: <from package.json via tsup replace, same mechanism as Phase 1 D-14> })`. Same version-injection trick used for the JSON envelope `toolVersion` field.
- **D-13 — `resolveRoot` call site (ARCH-03):** Per-tool. Every tool's zod input includes `projectRoot?: z.string().describe('Absolute path to the project to analyze. Defaults to UI_TO_HIERARCH_ROOT env var, then process.cwd().')`. Handler begins with `const resolvedRoot = resolveRoot(args.projectRoot)` and echoes it in the response envelope (when Phase 5 builds real responses). Server startup does NOT read or cache a root — a single running server can serve multiple projects sequentially.

### Testing (D-14 — D-16)

- **D-14 — Two-tier smoke test strategy (SC-4):**
  - **Tier 1 — in-process unit tests (`test/mcp/*.test.ts`):** Instantiate the McpServer in-process, wire it to a pair of `PassThrough` streams as transport, drive JSON-RPC `initialize` + `tools/list` + `tools/call` messages, assert every stdout-side line parses as a JSON-RPC frame and each tool returns `isError: true` with the expected template. Fast; runs in default `pnpm test`.
  - **Tier 2 — spawned binary smoke (`test/mcp/smoke.spawn.test.ts`):** After `pnpm build`, spawn `node dist/cli.js` as a subprocess, connect with `@modelcontextprotocol/sdk/client` over stdio, call `listTools` and each tool once. Capture stdout + stderr separately. Assert: (a) every stdout line is a valid JSON-RPC frame, (b) stderr contains at least one structured log line (startup info), (c) all four tool calls return `isError: true`. Gated behind a `test:smoke` script (not default `test`) because it needs a prior build.
- **D-15 — Stderr noise injection:** Natural noise only. The tiny logger emits at least one `log.info('server starting', { version })` at startup and `log.info('tool called', { name })` per call. Test asserts those appear on stderr channel and NOT on stdout. No synthetic/garbage input injection in v1 — keep SC-4 scoped to "real runtime noise doesn't leak."
- **D-16 — SC-5 (Claude Code real-client check) = manual verification:** Captured in `02-VERIFICATION.md` at phase close: tester adds the built binary to Claude Code MCP config (`{ command: 'npx', args: ['-y', '.', '<published or local>'] }` or a local `node dist/cli.js` config for pre-publish), runs `/mcp` list, calls each tool once, pastes the observed tool list + one error response into VERIFICATION.md. No automated Claude-Code-driving script in v1 — Phase 6 owns end-to-end fixture coverage.

### Claude's Discretion

Downstream agents decide these without re-asking:
- Exact wording of per-field `.describe()` text (keep it one line, action-verb style).
- Exact wording of each tool's `title` and `description` strings shown in MCP clients (keep concise; mention they return errors in Phase 2).
- Whether tool modules export a class, a plain object, or a factory — shape is up to the planner as long as `server.ts` imports are uniform.
- Test fixture filenames inside `test/mcp/` and how `PassThrough` plumbing is factored into a helper.
- Exact Biome include-path syntax for the `noConsole` override block.
- Whether the logger's timestamp format is strict ISO 8601 or `Date.now()` — both are acceptable; pick one.

### Folded Todos

None — no pending todos matched this phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope & locked requirements
- `.planning/PROJECT.md` — Vision, in/out of scope.
- `.planning/REQUIREMENTS.md` — specifically **MCP-01, MCP-02, MCP-03, MCP-04** (phase requirements) and **ARCH-03** (project-root resolution).
- `.planning/ROADMAP.md` §"Phase 2: MCP Transport Shell" — success criteria SC-1…SC-5.

### Tech stack (locked in CLAUDE.md)
- `CLAUDE.md` §"Technology Stack" — MCP SDK `^1.29.0`, zod `^4.1.4`, Node `>=20`, tsup `^8.5.1`, vitest `^4.3.6`, Biome (Phase 1 pick).
- `CLAUDE.md` §"MCP SDK — Concrete Usage Pattern" — `registerTool` is the 2026 idiomatic API; `StdioServerTransport` is the only v1 transport; import paths include `.js` extension.
- `CLAUDE.md` §"What NOT to Use" — NO pre-1.0 SDK, NO HTTP/SSE transports, NO zod v3.

### Prior phase context (carry-forward)
- `.planning/phases/01-scaffolding-ir-foundation/01-CONTEXT.md` §"Directory Layout" (D-16, D-17) — island rule: `mcp/` can import from `ir/` but `ir/renderers/core/` never import `mcp/`.
- `.planning/phases/01-scaffolding-ir-foundation/01-CONTEXT.md` §"JSON Renderer & Envelope" (D-12–D-15) — when Phase 5 implements real responses, the envelope shape is already locked; Phase 2 doesn't build envelopes, but error responses must not invent a competing shape.
- `.planning/phases/01-scaffolding-ir-foundation/01-CONTEXT.md` §"Project-Root Resolution" (D-21) — `src/core/resolve-root.ts` helper already exists from Phase 1; `mcp/tools/*` import and call it per D-13 above.

### External references
- [MCP TypeScript SDK — server docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) — `McpServer` + `registerTool` + `StdioServerTransport` canonical pattern.
- [Biome `noConsole` rule](https://biomejs.dev/linter/rules/no-console/) — for the scoped enforcement in `biome.json`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 1)
- `src/core/resolve-root.ts` — used by every tool handler per D-13.
- `src/core/babel-shim.ts` — not used in Phase 2, but living proof the island boundary works.
- `src/ir/*` zod schemas — not used in Phase 2 handlers (stubs), but the zod v4 conventions set there (discriminatedUnion, `.describe()` style) are the style guide for the tool input schemas.
- `src/renderers/*` — untouched by Phase 2. Phase 5 wires them into handlers.
- `package.json` `bin` field + tsup shebang banner — already produce `dist/cli.js` executable. Phase 2 just replaces the stub body.
- `biome.json` — add the `src/mcp/**` + `src/cli.ts` override for `noConsole` (D-09).

### Established Patterns
- **Zod as single source of truth** (Phase 1 D-04): tool input types inferred via `z.infer<typeof schema>`, no hand-written interfaces.
- **Island imports** (Phase 1 D-16/D-17): `src/mcp/` imports from `src/core/` and `src/ir/` freely; nothing imports back into `mcp/`.
- **Forward-slash paths on Windows** (Phase 1 D-07): `resolveRoot` already returns forward-slash-normalized absolute path; tool metadata and future responses inherit that.

### Integration Points
- `src/cli.ts` — replace stub body with `await startServer()`.
- `biome.json` — scoped `noConsole` override block.
- `package.json` — add `test:smoke` script + `@modelcontextprotocol/inspector` as a dev dep for manual SC-5; `@modelcontextprotocol/sdk` runtime dep already planned in Phase 1 stack.
- `tsup.config.ts` — externals list gets `@modelcontextprotocol/sdk` (already planned per CLAUDE.md).

</code_context>

<specifics>
## Specific Ideas

- The SDK's `registerTool` accepts a Standard-Schema-compatible validator; zod v4 works directly. Do NOT manually produce JSON Schema.
- Import paths MUST include `.js` extension (SDK ships explicit subpath exports). Example: `from '@modelcontextprotocol/sdk/server/mcp.js'`, `from '@modelcontextprotocol/sdk/server/stdio.js'`.
- stdio is the ONLY transport in v1. Never import HTTP/SSE transports — they pull express/hono/cors into the `npx` install footprint even when tree-shaken (see CLAUDE.md §"What NOT to Use").
- Tool message templates MUST name both the tool and the phase where real implementation lands. This gives agents an actionable next step rather than a dead-end error.

</specifics>

<deferred>
## Deferred Ideas

- **Namespaced component identifiers** (`Card.Header`, `Menu.Item`) — if Phase 4/5 finds real demand, relax the D-03 regex. Deferred because PascalCase-only catches 95% of v1 fixtures.
- **Per-tool title/description wording polish** — left to planner/executor to draft; revise during VERIFICATION if MCP clients display them awkwardly.
- **Automated Claude-Code-driving smoke test** — Phase 6 (Hardening & Fixture Gates) owns end-to-end coverage across real clients and fixture repos.
- **Rubbish-input fuzz for stdout cleanliness** — not needed for v1; revisit only if a stdout leak is ever observed.
- **Structured JSON payloads inside error `content`** — keeping text-only for v1; structured error codes can be added in a future phase if agents start needing to branch on them.

</deferred>

---

*Phase: 02-mcp-transport-shell*
*Context gathered: 2026-04-20*
