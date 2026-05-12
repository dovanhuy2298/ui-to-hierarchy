# ui-to-hierarchyMCP

## What This Is

An MCP (Model Context Protocol) server that parses a frontend codebase and returns its UI component hierarchy as structured output (markdown tree + JSON) so AI coding agents can ground image/description-based UI edits in exact file/component locations. V1 targets Next.js App Router; the internal architecture is pluggable so additional framework parsers (React Native, Vue, Svelte) can be added without rewriting the core.

## Core Value

When an AI agent cannot confidently act on a screenshot or vague description ("make the card next to the avatar wider"), it can call this MCP to get a precise, structured map of the live component tree — with file:line, layout hints, text content, and conditional branches — so the agent edits the right component in the right file instead of guessing.

## Current State

**Shipped:** v1.1 — 2026-05-12 (built on v1.0 — 2026-05-05)
**Released:** [`ui-hierarchy-mcp`](https://www.npmjs.com/package/ui-hierarchy-mcp) v0.2.0 on npm
**Codebase:** ~5,400 LOC TypeScript, 44 test files, 353/353 vitest cases green
**Stack:** Node ≥20, ESM, `@modelcontextprotocol/sdk@^1.29`, `@babel/parser@^7.29`, `zod@^4.1`, `tsup`, `vitest@^4.3`

## Next Milestone

_None scoped yet — run `/gsd-new-milestone` to define v1.2._

## Requirements

### Validated (v1.0 — 24/24 satisfied)

- ✓ Ship as npm package that runs as a stdio MCP server (`npx`-able) — v1.0 (MCP-01)
- ✓ Expose 4 MCP tools with typed zod schemas — v1.0 (MCP-02, TOOL-01..04)
- ✓ Tool handlers return `{ content, isError: true }` on failure — v1.0 (MCP-03)
- ✓ stdout reserved for JSON-RPC; diagnostics to stderr as JSON lines — v1.0 (MCP-04)
- ✓ Parse Next.js App Router projects (TypeScript/TSX) into a component hierarchy via Babel AST — v1.0 (PARSE-01..04)
- ✓ `get_full_hierarchy(route)` returning layout chain → page → subtree — v1.0 (TOOL-01)
- ✓ `focus_on(component, scope)` with up/full/down scopes — v1.0 (TOOL-02)
- ✓ `find_by_text(query)` returning matching nodes with file:line — v1.0 (TOOL-03, fuzzy via Levenshtein ≤2)
- ✓ `find_by_style(className_or_prop)` returning matching nodes with file:line — v1.0 (TOOL-04)
- ✓ Markdown tree (default, LLM-friendly) + JSON (structured) — v1.0 (OUT-01)
- ✓ Tailwind className / CSS Modules / inline style / styled-components signals — v1.0 (OUT-02, OUT-03)
- ✓ Conditional render branches preserved (`?:`, `&&`, `||`, `??`, `!`/`!!`, `.map`) — v1.0 (OUT-04)
- ✓ file:line on every node — v1.0 (OUT-01)
- ✓ App Router: nested layouts, route groups, parallel slots, intercepting routes, dynamic params, `"use client"`/`"use server"` runtime directives, `loading`/`error`/`not-found` siblings — v1.0 (NEXT-01..04)
- ✓ Parse on-demand — fresh `Analyzer` per call, no cross-call cache — v1.0 (ARCH-02)
- ✓ Pluggable parser architecture (`FrameworkAdapter` 5-method interface, `adapters/` island) — v1.0 (ARCH-01)
- ✓ Project root resolution: arg > env > cwd — v1.0 (ARCH-03)
- ✓ Integration suite (3+ fixture Next.js projects) + Windows path gate + MCP Inspector + Claude Code UAT + perf note — v1.0 (ARCH-04)

### Validated (v1.1 — 17/17 satisfied)

- ✓ `npx ui-hierarchy-mcp --init` writes a marker-delimited usage guide into `CLAUDE.md` by default — v1.1 (INIT-01)
- ✓ `--init` exits cleanly without booting the MCP server; absence preserves v1.0 stdio server behavior — v1.1 (INIT-02)
- ✓ `--target claude,codex,cursor,copilot` opts into `AGENTS.md`, `.cursor/rules/ui-hierarchy-mcp.mdc`, `.github/copilot-instructions.md` — v1.1 (INIT-03)
- ✓ Idempotent re-runs via marker block (`<!-- ui-hierarchy-mcp:start version=X.Y --> ... :end -->`) — v1.1 (INIT-04)
- ✓ Auto-creates missing files and parent directories — v1.1 (INIT-05)
- ✓ Appends to existing file with separating blank line; preserves prior bytes — v1.1 (INIT-06)
- ✓ Hand-edit detection via SHA-256 fingerprint; `--force` overrides — v1.1 (INIT-07)
- ✓ Atomic temp-file + `rename()` with `EXDEV` fallback — v1.1 (INIT-08)
- ✓ Preserves CRLF/LF + BOM on Windows files — v1.1 (INIT-09)
- ✓ `--dry-run` previews per-target action without writing — v1.1 (INIT-10)
- ✓ Per-target summary lines to stderr; exit code 0/1 — v1.1 (INIT-11)
- ✓ Guide content covers all 4 tools, registration snippet, examples, `projectRoot` hint — v1.1 (INIT-12)
- ✓ Non-interactive by default (CI-safe) — v1.1 (INIT-13)
- ✓ `.cursor/rules/ui-hierarchy-mcp.mdc` includes YAML frontmatter above the marker block — v1.1 (INIT-14)
- ✓ Markdown renderer surfaces `envelope.warnings` as HTML-comment prefix — v1.1 (POLISH-01)
- ✓ Integration suite exercises `format: "markdown"` against 2 fixtures with glyph + backslash guards — v1.1 (POLISH-02)
- ✓ Resolved component nodes carry true `loc.start.line` via `ParseResult.declLines` → `ResolveResult.local.line` — v1.1 (POLISH-03)

### Active

(None — next milestone requirements pending. Run `/gsd-new-milestone` to scope v1.2.)

### Out of Scope

- Vision / screenshot ingestion — agents bring their own vision; MCP is code-only
- Structural edit tools (`move_component`, `wrap_with`) — query-only in v1
- Watch-mode / live indexing / caching — parse on-demand is enough for v1
- Pages Router — App Router only in v1
- React Native / Vue / Svelte parsers — architecture supports them, v1 does not ship them
- HTTP transport — stdio only in v1
- Running or rendering the app — MCP is static-analysis only

## Context

- A working prototype exists at `generate-component-hierarchy.ts` in the repo root. It is a Bun + `@babel/parser` + `@babel/traverse` script that targets React Native / Expo (`apps/mobile/src`, `_layout.tsx` entry). It supports `--focus`, `--scope up|full|down`, `--layoutOnly`, and path aliases. This prototype is the reference for parser semantics and output shape — the MCP will port/generalize its logic, not wrap the script as-is.
- Target consumers are agentic coding clients that speak MCP over stdio (Claude Code, Cursor, Continue, and any future MCP-compatible client).
- The core problem being solved is that agents fail in three specific ways when given a screenshot or fuzzy description: (1) picking the wrong file/component, (2) editing the right element but breaking a parent or sibling by not understanding the tree, (3) misreading layout/nesting/conditional render from a static image.

## Constraints

- **Tech stack**: TypeScript + `@babel/parser` / `@babel/traverse` for AST — matches prototype and Next.js ecosystem
- **Runtime**: Node.js (distributed via npm `npx`); prototype ran on Bun, but Node is the lowest-friction target for MCP clients
- **Protocol**: MCP stdio transport, using the official `@modelcontextprotocol/sdk`
- **Performance**: Parse on-demand must stay usable on medium Next.js repos (no hard SLA in v1, but cache is explicitly deferred)
- **Static analysis only**: no runtime execution of user code, no DOM, no rendering

## Key Decisions

| Decision                                                                                                  | Rationale                                                                              | Outcome                                                                               |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Multi-framework architecture, NextJsAdapter only in v1                                                    | Future-proof pluggability without paying the cost now                                  | ✓ Good — `core/`/`ir/` island stayed pristine; FrameworkAdapter has exactly 5 methods |
| Query-only in v1 (no structural edits)                                                                    | Keep scope tight; agents already have `Edit` tools                                     | ✓ Good — tight scope, fast ship                                                       |
| Parse on-demand (no cache in v1)                                                                          | Simpler, correctness guaranteed; cache when perf demands                               | ✓ Good — fresh `Analyzer` per call (ARCH-02) verified by mutation test                |
| Both markdown and JSON output                                                                             | Markdown for LLM comprehension, JSON for programmatic traversal                        | ✓ Good — both surfaces exercised in UAT                                               |
| Next.js App Router only in v1                                                                             | Pages Router is legacy; focus buys deeper quality                                      | ✓ Good                                                                                |
| MCP bring-your-own-vision                                                                                 | Agents already have multimodal; MCP stays code-only                                    | ✓ Good                                                                                |
| Ship as npm package (stdio MCP)                                                                           | Standard MCP distribution; `npx` zero-install UX                                       | ✓ Good — published as `ui-hierarchy-mcp` v0.1.0                                       |
| `traverse.default ?? traverse` interop shim                                                               | Babel ESM/CJS interop is a known footgun                                               | ✓ Good — covered by unit test that fails loudly on regression                         |
| Per-tool inline `format` param (not shared in `tools/common.ts`)                                          | Preserves wire-protocol self-description; default `markdown` preserves backward compat | ✓ Good (decided 06-08)                                                                |
| TreeNode `attributes` literal-string-only in v1                                                           | Keeps `Array<{name, value}>` shape simple at the wire boundary                         | ✓ Good (decided 06-10)                                                                |
| `findByText` returns matched component/element node when an attribute matches (not a synthetic text node) | file:line points at the JSX site that carries the prop                                 | ✓ Good (decided 06-10)                                                                |
| Resolved component nodes use `line: 1` placeholder                                                        | ResolveResult exposes only absolutePath; true line lookup deferred                     | ✓ Resolved in v1.1 — `ParseResult.declLines` populated in-pass; `ResolveResult.local.line` carries true `loc.start.line` (POLISH-03) |
| `--init` non-interactive by default; only `--force` overrides hand-edit guard                              | CI-safe; no TTY prompts                                                                | ✓ Good (v1.1 INIT-13) — also drove marker-block + SHA-256 fingerprint design          |
| Single `--init` template + per-target format wrapper (no per-agent tailoring)                              | Research showed ≥90% content overlap across Claude/Codex/Cursor/Copilot                | ✓ Good (v1.1) — kept guide content maintainable                                       |
| HTML-comment prefix (`<!-- warning: ... -->`) for markdown envelope warnings                              | Invisible when rendered, recoverable by parsers; no envelope schema change             | ✓ Good (v1.1 POLISH-01)                                                               |
| `ParseResult.declLines` populated in the existing single parse pass                                       | Zero extra parse cost; cache identity preserved                                        | ✓ Good (v1.1 POLISH-03)                                                               |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-05-12 — after v1.1 milestone shipped_
