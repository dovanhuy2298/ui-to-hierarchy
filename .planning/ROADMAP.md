# Roadmap — ui-to-hierarchyMCP

**Milestone:** v1 — Next.js App Router parser shipped as stdio MCP server
**Granularity:** standard (6 phases)
**Coverage:** 24/24 v1 requirements mapped
**Created:** 2026-04-20

## Phases

- [ ] **Phase 1: Scaffolding & IR Foundation** — Project skeleton, IR types, markdown/JSON renderers unit-testable against fixtures
- [x] **Phase 2: MCP Transport Shell** — `npx` stdio server with zod-validated tool surface (stubs return "not implemented")
- [ ] **Phase 3: Parser Core** — Babel AST + module resolution + style extractors + adapter interface
- [ ] **Phase 4: Next.js App Router Adapter** — Routing, layout chains, route groups / parallel / intercepting / dynamic segments
- [ ] **Phase 5: IR Queries & Tool Wire-up** — All four MCP tools fully functional end-to-end
- [ ] **Phase 6: Hardening & Fixture Gates** — Integration tests, Windows/pnpm/shadcn fixtures, real-client verification

## Phase Details

### Phase 1: Scaffolding & IR Foundation

**Goal**: Project skeleton compiles and IR + renderers are provably correct against hand-written fixtures, independent of any parser
**Depends on**: Nothing (first phase)
**Requirements**: OUT-01, ARCH-03
**Success Criteria** (what must be TRUE):

1. `pnpm build` produces an ESM bundle with a shebanged `bin/ui-to-hierarch` entry
2. A hand-written IR fixture round-trips through the markdown renderer producing a stable snapshot tree with `file:line` on every node (forward-slash paths on Windows)
3. The same IR fixture round-trips through the JSON renderer producing schema-valid structured output
4. Babel ESM/CJS interop shim (`traverse.default ?? traverse`) is covered by a unit test that fails loudly if interop regresses
5. Project-root resolution helper honors arg > `UI_TO_HIERARCH_ROOT` > `process.cwd()` and echoes resolved root in a canned metadata envelope
   **Plans**: 5 plans

- [ ] 01-01-PLAN.md — Project scaffold (package.json, tsconfig, tsup, vitest, biome, island dirs, cli stub)
- [ ] 01-02-PLAN.md — IR zod schema (9-kind discriminatedUnion + envelope)
- [ ] 01-03-PLAN.md — Babel traverse ESM interop shim + test
- [ ] 01-04-PLAN.md — paths helper + resolveRoot (ARCH-03)
- [ ] 01-05-PLAN.md — Renderers (markdown + JSON) + envelope-builder + fixtures + snapshots
      **UI hint**: no

### Phase 2: MCP Transport Shell

**Goal**: A real MCP client can launch the server via `npx`, discover all four tools with typed schemas, and receive structured "not implemented" errors — with stdout guaranteed clean
**Depends on**: Phase 1
**Requirements**: MCP-01, MCP-02, MCP-03, MCP-04
**Success Criteria** (what must be TRUE):

1. `npx ui-to-hierarch` starts a stdio MCP server that MCP Inspector can connect to and enumerate all four tools
2. Every tool's input schema is zod with `.describe()` on every field and precise types (route-shape validator, scope enum, identifier regex)
3. Calling any tool returns `{ content, isError: true }` with actionable guidance — no unhandled exceptions ever escape the handler
4. A smoke test pipes stderr noise through the server and asserts every stdout line parses as JSON-RPC; ESLint `no-console` rule blocks `console.log` on server paths
5. One real MCP client (Claude Code) connects and lists tools successfully
   **Plans**: 5 plans

- [x] 02-01-PLAN.md — Wave 0: global.d.ts, test stubs, test:smoke script, biome noConsole, inspector devDep
- [x] 02-02-PLAN.md — Wave 1: src/mcp/errors.ts + src/mcp/log.ts (error helpers + stderr logger)
- [x] 02-03-PLAN.md — Wave 1: src/mcp/tools/\*.ts (four tool schemas + stub handlers)
- [x] 02-04-PLAN.md — Wave 2: src/mcp/server.ts + src/cli.ts replacement (wiring + build)
- [x] 02-05-PLAN.md — Wave 3: Tier 1 + Tier 2 test implementation + phase gate verification
      **UI hint**: no

### Phase 3: Parser Core (AST + Resolution + Extractors)

**Goal**: Given any TSX file, the parser produces a framework-agnostic `ComponentDefinition[]` with render flow, style signals, conditional branches, and resolved import paths — exposed behind the 5-method `FrameworkAdapter` contract
**Depends on**: Phase 1
**Requirements**: PARSE-01, PARSE-02, PARSE-03, PARSE-04, OUT-02, OUT-03, OUT-04, ARCH-01
**Success Criteria** (what must be TRUE):

1. Babel parses TSX with the full plugin set + `errorRecovery`; syntax errors become `TreeNode { kind: "error" }` instead of silently skipping files
2. A named import landing in a barrel file resolves to its true source file via recursive `ExportNamedDeclaration` / `ExportAllDeclaration` chase (tested against a shadcn-style fixture, cycle-guarded)
3. tsconfig `paths` + `baseUrl` + `extends` chain resolves `@/*`, `~/*`, `#*` aliases via `get-tsconfig`
4. HOC wrappers (`memo`, `forwardRef`, `observer`, `with*`, `*HOC`) are unwrapped and annotated; `ClassDeclaration` components are extracted
5. Extractors emit layout-only Tailwind by default (`fullClasses: true` reveals all), inline `style` objects, CSS Modules references, and styled-components template literals; conditional branches (ternary, `&&`, `||`, `??`, `!`, `.map` as list) are preserved in render flow
6. `FrameworkAdapter` interface is defined with exactly 5 methods and nothing in `core/` or `ir/` imports from `adapters/`
   **Plans**: TBD
   **UI hint**: no

### Phase 4: Next.js App Router Adapter

**Goal**: `NextJsAdapter` implements all 5 methods; routing correctly composes layout chains for route groups, parallel slots, intercepting routes, and dynamic segments
**Depends on**: Phase 3
**Requirements**: NEXT-01, NEXT-02, NEXT-03, NEXT-04
**Success Criteria** (what must be TRUE):

1. Given route `/dashboard/settings`, `mapRouteToEntry` returns the layout chain directory-walked upward from `app/`, including `template.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx` siblings
2. Route groups `(group)` contribute layouts but not URL segments; private `_folder` is excluded; parallel routes `@slot` appear as labeled slots on the parent; intercepting `(.)`, `(..)`, `(...)`, `(..)(..)` resolve with correct segment math
3. Dynamic route inputs match `[slug]`, `[...rest]`, `[[...opt]]` patterns and resolved params are echoed in response metadata
4. Every component node carries `runtime: "server" | "client"` derived from first non-comment `"use client"` / `"use server"` directive
   **Plans**: TBD
   **UI hint**: no

### Phase 5: IR Queries & Tool Wire-up

**Goal**: All four MCP tools are fully functional end-to-end; `Analyzer` orchestrates per-call pipeline with no cross-call state
**Depends on**: Phase 4
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04, ARCH-02
**Success Criteria** (what must be TRUE):

1. `get_full_hierarchy(route, format?)` returns the ordered layout chain + page subtree for any valid Next.js route, in markdown (default) or JSON
2. `focus_on(component, scope)` returns ancestors-only (`up`), ancestors + subtree (`full`), or subtree-only (`down`) with file:line on every node
3. `find_by_text(query)` returns matching nodes with file:line and emits fuzzy suggestions when no exact match exists
4. `find_by_style(class_or_prop)` returns nodes whose classes or style props match, with file:line
5. Each tool invocation constructs a fresh `Analyzer` with per-call AST cache; no cross-call cache exists (verified by test that mutates a file between calls and sees the new tree)
   **Plans**: TBD
   **UI hint**: no

### Phase 6: Hardening & Fixture Gates

**Goal**: v1 is provably correct on realistic Next.js project shapes across Windows + pnpm monorepos + shadcn barrels, and end-to-end verified with a real MCP client
**Depends on**: Phase 5
**Requirements**: ARCH-04
**Success Criteria** (what must be TRUE):

1. Integration test suite spawns the published binary and exercises all four tools against at least three fixture Next.js projects (shadcn-style barrel re-exports, nested layouts + route groups + parallel slots, pnpm monorepo workspace)
2. Full suite passes on Windows CI with forward-slash path normalization verified
3. MCP Inspector session walks each tool successfully and Claude Code end-to-end hits each tool against a real project without stdout corruption
4. p95 parse+query latency is measured on a medium fixture and recorded in a perf note (informs v2 cache decision)
   **Plans**: TBD
   **UI hint**: no

## Progress

| Phase                          | Plans Complete | Status      | Completed |
| ------------------------------ | -------------- | ----------- | --------- |
| 1. Scaffolding & IR Foundation | 5/5            | Complete    | 2026-04-20 |
| 2. MCP Transport Shell         | 5/5            | Complete    | 2026-04-21 |
| 3. Parser Core                 | 0/0            | Not started | -         |
| 4. Next.js App Router Adapter  | 0/0            | Not started | -         |
| 5. IR Queries & Tool Wire-up   | 0/0            | Not started | -         |
| 6. Hardening & Fixture Gates   | 0/0            | Not started | -         |
