# Project Research Summary — ui-to-hierarchyMCP

**Domain:** MCP stdio server — static-analysis over Next.js App Router (TypeScript/TSX), with pluggable multi-framework architecture
**Researched:** 2026-04-20
**Confidence:** HIGH on stack, architecture, and pitfalls; MEDIUM-HIGH on feature landscape

## Executive Summary

Classic compiler architecture (frontend → IR → backend) wrapped in MCP stdio. A working Bun prototype (`generate-component-hierarchy.ts`) already encodes the hardest semantic work — Babel traversal, render-flow extraction, ancestor-chain focus, class-token collection, recursion/duplicate folding, conditional branches. v1 is largely a **port + generalization + MCP shell** rather than greenfield design. The prototype targets RN/Expo; v1 targets Next.js App Router, and the prototype's logic will become a second adapter later.

**Approach:** Build IR + renderers first (unit-testable against hand-written fixtures), then port parser into a `NextJsAdapter`, wire MCP shell last. MCP layer is thin — tool handlers must stay trivial glue. Biggest risk is **token bloat**: industry tooling (Aider repomap, Serena, next-devtools-mcp) converges on one conclusion — force scoped queries, never dump the whole tree, make `focus_on` the primary verb. Prototype already has `--focus`/`--scope up|full|down`; preserve this.

**Top risks:** (1) stdout corruption from stray `console.log` silently killing the transport; (2) Next.js App Router routing edges (route groups, parallel `@slot`, intercepting `(.)`) — non-trivial enough to warrant a sub-phase; (3) barrel re-exports breaking import resolution on every real shadcn project; (4) Babel/ESM interop (`traverse.default` shim); (5) token-budget blowout if `get_full_hierarchy` is default verb instead of scoped. All preventable with known patterns.

## Top Key Findings

1. **The prototype is ~60% of v1.** IR types (lines 96–114), `buildAsciiTree`, `buildFocusedAsciiTree`, `buildRenderFlowFromStatements`, `collectClassTokensFromExpression`, `expandedComponents`/duplicate folding, `summarizeCondition`, `LAYOUT_CLASS_PREFIXES`, `filterLayoutClasses` all port directly. Don't lose them.
2. **The niche is genuinely open.** Every comparable tool either requires a running process (next-devtools-mcp/Serena/Storybook) or operates at symbol/AST level (Aider, ast-grep, tree-sitter). Static App-Router-aware render-tree with layout hints does not exist today.
3. **Token budget is a first-class design constraint.** Industry consensus treats "serialize everything by default" as canonical MCP failure mode. Scoping tools (`focus_on`, `find_by_*`) are table stakes; dumping tools are anti-features.
4. **Markdown ASCII trees beat JSON/XML for LLM consumption.** Markdown 40–60% fewer tokens than XML; LLMs emit ASCII trees unprompted. Default markdown, opt-in JSON, no XML.
5. **`McpServer.registerTool` with zod v4 is the 2026 idiomatic wiring.** Don't use lower-level `Server`/`setRequestHandler` — common tutorial trap.
6. **Next.js App Router routing is the single hardest sub-problem.** Route groups `(auth)`, parallel `@slot`, intercepting `(.)foo`/`(..)bar`, dynamic `[slug]`/`[...rest]`/`[[...opt]]`, private `_folder`. `mapRouteToEntry` is directory-based, not import-based. Own sub-phase.
7. **Adapters must be an island.** Nothing outside `adapters/<framework>/` may mention framework-specific concepts. Extractors live outside adapters. Renderers never touch adapter code.
8. **Parse-on-demand is correct for v1** and performant enough. Caching is v2, gated on measured SLA miss.

## The Stack (Locked)

| Concern         | Pick                               | Version            | Non-negotiable Notes                                                                                                                                            |
| --------------- | ---------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language        | TypeScript                         | `^5.20.1`          | `moduleResolution: "bundler"`, strict                                                                                                                           |
| Runtime         | Node.js LTS                        | `>=20`             | Not Bun at runtime. `npx` UX constraint                                                                                                                         |
| Module system   | ESM                                | `"type": "module"` | No dual-build — CLI only                                                                                                                                        |
| MCP SDK         | `@modelcontextprotocol/sdk`        | `^1.29.0`          | `McpServer` + `registerTool`, NOT `Server` + `setRequestHandler`                                                                                                |
| MCP transport   | `StdioServerTransport`             | (from SDK)         | stdio only v1                                                                                                                                                   |
| Validation      | `zod`                              | `^4.1.4`           | Standard-Schema native                                                                                                                                          |
| AST parser      | `@babel/parser`                    | `^7.29.2`          | plugins: jsx, typescript, decorators-legacy, classProperties, dynamicImport, topLevelAwait, importAssertions, explicitResourceManagement; `errorRecovery: true` |
| AST traversal   | `@babel/traverse` + `@babel/types` | `^7.29.0`          | ESM interop shim: `(traverse as any).default ?? traverse`                                                                                                       |
| tsconfig reader | `get-tsconfig`                     | `^4.14.0`          | NOT `tsconfig-paths`                                                                                                                                            |
| File globbing   | `tinyglobby`                       | `^0.2.16`          | NOT `fast-glob`                                                                                                                                                 |
| Bundler         | `tsup`                             | `^8.5.1`           | ESM-only, `banner.js` for shebang                                                                                                                               |
| Test runner     | `vitest`                           | `^4.3.6`           | `toMatchFileSnapshot` for tree output                                                                                                                           |
| Dev runner      | `tsx`                              | `^4.21.0`          | Not `ts-node`                                                                                                                                                   |
| MCP debugging   | `@modelcontextprotocol/inspector`  | `^0.21.2`          | Essential for tool iteration                                                                                                                                    |

**Do NOT use:** `@babel/core`, HTTP/SSE transports in v1, `ts-node`, `fast-glob`, `zod` v3, pre-1.0 MCP SDK, Bun at runtime, dual ESM+CJS.

## Top 5 Risks + Mitigations

| #   | Risk                                                                        | Severity | Mitigation                                                                                                                                                                         | Phase |
| --- | --------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| R1  | stdout corruption silently kills transport                                  | CRITICAL | ESLint `no-console` on server paths; diagnostics via stderr / `sendLoggingMessage`; smoke test parses every stdout line as JSON; `dotenv.config({quiet:true})`                     | 1     |
| R2  | Layout chain reconstruction is directory-based, not import-based            | CRITICAL | Route resolver walks `app/` upward; treat special files (`layout`/`page`/`loading`/`error`/`not-found`/`template`) as convention-wired                                             | 3b    |
| R3  | Barrel re-exports break resolution on every real shadcn project             | HIGH     | Full barrel chase: on named import landing in file without local binding, scan `ExportNamedDeclaration` + `ExportAllDeclaration`, recurse; cache export map per file; guard cycles | 3a    |
| R4  | Token bloat by default                                                      | HIGH     | Force `route` argument (no dump-whole-app tool); `focus_on` as primary drill verb; `layoutOnly` flag; token-budget assertions in tests                                             | 2 + 4 |
| R5  | Babel ESM/CJS interop silently produces object instead of function (#13855) | MED-HIGH | Defensive shim: `const traverse = (_traverse as any).default ?? _traverse`. Unit test imports                                                                                      | 1     |

## Open Questions

1. **Performance SLA on large monorepos.** Decide at Phase 5 whether to add transitive-closure parsing (parse only from queried route) or accept full-repo parse.
2. **`React.createElement` / `cloneElement` coverage in v1.** Radix/MUI/compiled output use heavily. Yes/no before Phase 3a freezes visitor set.
3. **Class component support.** Legacy codebases ship them. Research recommends "never skip — minimal visitor." Confirm.
4. **Parallel/intercepting route output shape.** Parallel `@modal` as labeled slot clear; intercepting `(.)foo` has no industry convention. May warrant short `/gsd-research-phase`.
5. **Project-root discovery policy.** Explicit `projectRoot` arg only, or also `UI_TO_HIERARCH_ROOT` env + `process.cwd()` fallback?
6. **Styled-components/emotion coverage bar.** Opt-in "best effort" — what's threshold? Defer until a real user hits it.

## Recommended Phase Structure (6 phases)

### Phase 1 — Scaffolding & IR Foundation

- **Goal:** Project skeleton compiles; IR types + renderers pass unit tests against hand-written fixtures
- **Requirements:** T16 npm shell, T6 markdown+JSON renderers, T12 recursion/duplicate folding, T5 file:line typing, T13 text truncation
- **Delivers:** `src/ir/types.ts`, `src/renderers/{markdown,json}.ts`, `src/utils/*`, `package.json` with bin, tsup build, Babel ESM interop shim
- **Dependencies:** None
- **Avoids:** R5, 6.1/6.2, 4.3 path normalization

### Phase 2 — MCP Transport Shell

- **Goal:** `npx ui-to-hierarch` starts, registers tools with zod schemas, responds to ListTools + CallTool with canned output. Validated via MCP Inspector AND one real client (Claude Code)
- **Requirements:** T16 end-to-end, tool-surface design for T1–T4 (schemas only), 7.1–7.4 agent-UX hygiene
- **Delivers:** `src/server/*`, `src/tools/*` with "not implemented" MCP errors, `src/tools/schemas.ts` (zod + `.describe()`), `src/core/errors.ts`
- **Dependencies:** Phase 1
- **Avoids:** R1, 1.2, 1.3, 1.4, 7.1 (unique `ui_hierarchy_*` names), 7.3 (precise types)

### Phase 3a — Parser Core (Babel + Module Resolution)

- **Goal:** Given a TSX file, produce `ComponentDefinition[]` with render flow, class tokens, props, text, file:line. Resolve imports (barrels, aliases) to absolute paths
- **Requirements:** T7 style extraction (Tailwind/inline; CSS Modules by reference; styled-components best-effort), T8 branches, T11 `"use client"`, T12, T13, T14, T15 tsconfig paths, D12 branch labels
- **Delivers:** `src/adapters/FrameworkAdapter.ts` interface, `src/extractors/*`, `src/core/moduleResolver.ts` with barrel chase, `src/adapters/next/extractComponents.ts`
- **Dependencies:** Phase 1
- **Avoids:** 2.1, 2.3, 2.4, 2.6, 2.7, 4.1, R3 barrel resolution, 4.3 pnpm/symlinks, 4.4 skip node_modules, 5.1 dynamic className, 6.4
- **Research flag:** NEEDED — Babel ESM interop, HOC unwrap, barrel algorithms

### Phase 3b — Next.js App Router Adapter (Routing + Conventions)

- **Goal:** `NextJsAdapter` implements all five methods. `discoverEntries` walks `app/`; `mapRouteToEntry` correctly composes layout chains for route groups, parallel slots, intercepting routes, dynamic segments
- **Requirements:** T1 (needs `mapRouteToEntry`), T9, T10, D3 slot flow, D5 implicit via `discoverEntries`
- **Delivers:** `src/adapters/next/{detect,discoverEntries,routeMap,useClientBoundary}.ts`, `src/core/adapterDispatcher.ts`
- **Dependencies:** Phase 3a
- **Avoids:** R2, 3.2 groups+parallel+intercepting, 3.3 `"use client"` propagation, 3.4 named exports as metadata
- **Research flag:** NEEDED — parallel routes, intercepting routes, slot contract under-documented

### Phase 4 — IR Queries + Tool Handler Wire-up

- **Goal:** All four MCP tools fully functional. `Analyzer` pipeline orchestrates discover → parse → extract → IR build → query. Token budgets enforced in tests
- **Requirements:** T1 end-to-end, T2 (focus_on up/full/down), T3 (find_by_text), T4 (find_by_style), D1 ancestor chain, D6 layoutOnly, D2/D11 stretch
- **Delivers:** `src/core/analyzer.ts`, `src/ir/build.ts`, `src/ir/queries.ts`, impls replacing Phase 2 stubs
- **Dependencies:** Phase 2 + Phase 3b
- **Avoids:** R4, 5.2, 5.4, 6.1–6.3, 7.2, A1 no dump-everything default

### Phase 5 — Hardening & Fixture Gates

- **Goal:** Integration tests against fixture Next.js projects. All "looks done but isn't" (15 items) pass. Tested on Windows + pnpm monorepo + shadcn-style project
- **Requirements:** Validation, not features
- **Delivers:** `tests/fixtures/` with 3+ Next.js project shapes, integration tests spawning the binary, Windows CI, p95 perf measurement to inform cache decision
- **Dependencies:** Phase 4

### Phase Ordering Rationale

- Phase 1 before 2: IR + renderers unit-testable without MCP wiring — de-risks output format
- Phase 2 before 3: stdout discipline, schema design, error taxonomy hard to retrofit
- Phase 3a before 3b: Next.js adapter consumes module resolver + extractors; split makes routing standalone with own fixture gates
- Phase 4 after 3a+3b: Analyzer needs complete adapter
- Phase 5 non-optional: `mapRouteToEntry` edge cases at MEDIUM confidence

## Confidence Assessment

| Area         | Confidence                                        | Notes                                                                        |
| ------------ | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| Stack        | HIGH                                              | Versions verified vs npm registry 2026-04-20; Node 20 LTS through April 2027 |
| Features     | MEDIUM-HIGH                                       | T1–T16 grounded in direct comparables                                        |
| Architecture | HIGH patterns & contract; MEDIUM App Router edges | 5-method adapter validated against Next.js + RN prototype                    |
| Pitfalls     | HIGH                                              | Every pitfall cross-referenced to official docs / community issues           |

**Overall:** HIGH. Working prototype, clear architecture with one well-defined contract boundary, locked stack, pitfall catalog matching community-reported issues. Only genuinely unknown surface is Next.js App Router routing edges — scoped to Phase 3b.

## Sources

### Primary (HIGH)

- @modelcontextprotocol/sdk@1.29.0 npm metadata
- MCP TypeScript SDK server docs — `McpServer.registerTool`
- Next.js App Router docs — project structure, parallel/intercepting routes, `use client`, `generateMetadata`
- Babel traverse ESM interop #13855
- Node.js Release Schedule — Node 20 LTS window
- Existing prototype `E:\ui-to-hierarch\generate-component-hierarchy.ts`

### Secondary (MEDIUM-HIGH)

- Vercel next-devtools-mcp, Serena, Aider repomap, ast-grep-mcp
- Checksum output-format experiments — Markdown token efficiency
- Glama / CodeRabbit / RavChat — MCP token-bloat anti-patterns

### In-repo

- `.planning/PROJECT.md` — v1 scope
- `.planning/research/{STACK,FEATURES,ARCHITECTURE,PITFALLS}.md`
