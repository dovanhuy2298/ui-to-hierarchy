# ui-to-hierarchyMCP

## What This Is

An MCP (Model Context Protocol) server that parses a frontend codebase and returns its UI component hierarchy as structured output (markdown tree + JSON) so AI coding agents can ground image/description-based UI edits in exact file/component locations. V1 targets Next.js App Router; the internal architecture is pluggable so additional framework parsers (React Native, Vue, Svelte) can be added without rewriting the core.

## Core Value

When an AI agent cannot confidently act on a screenshot or vague description ("make the card next to the avatar wider"), it can call this MCP to get a precise, structured map of the live component tree — with file:line, layout hints, text content, and conditional branches — so the agent edits the right component in the right file instead of guessing.

## Current State

**Shipped:** v1.0 — 2026-05-05
**Released:** [`@hudyv2298/ui-hierarchy-mcp`](https://www.npmjs.com/package/@hudyv2298/ui-hierarchy-mcp) v0.1.0 on npm
**Codebase:** ~4,890 LOC TypeScript, 35 test files, 256 unit + 20 integration + 8/8 UAT all green
**Stack:** Node ≥20, ESM, `@modelcontextprotocol/sdk@^1.29`, `@babel/parser@^7.29`, `zod@^4.1`, `tsup`, `vitest@^4.3`

## Current Milestone: v1.1 Agent Onboarding & v1.0 Polish

**Goal:** Help AI coding agents auto-discover this MCP and learn its tools via an `--init` CLI that injects usage guidance into agent instruction files, and close remaining v1.0 polish items on the output surfaces.

**Target features:**
- `--init` CLI command — inject MCP usage guide into agent instruction files. Default (no flag) writes to `CLAUDE.md`. Optional `--target claude,codex,cursor,copilot` opts into additional targets (`AGENTS.md`, `.cursor/rules/*.mdc`, `.github/copilot-instructions.md`). Idempotent re-runs via marker tags (`<!-- ui-hierarchy-mcp:start --> ... <!-- ui-hierarchy-mcp:end -->`)
- Surface envelope warnings on markdown renderer (currently dropped — JSON-only)
- Markdown surface integration test coverage (currently JSON-only)
- True `line` for resolved component nodes (replace `line: 1` placeholder)

## Requirements

### Validated (v1.0 — all 24/24 satisfied)

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

### Active

(None — next milestone requirements pending. Run `/gsd-new-milestone` to scope.)

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

| Decision | Rationale | Outcome |
| --- | --- | --- |
| Multi-framework architecture, NextJsAdapter only in v1 | Future-proof pluggability without paying the cost now | ✓ Good — `core/`/`ir/` island stayed pristine; FrameworkAdapter has exactly 5 methods |
| Query-only in v1 (no structural edits) | Keep scope tight; agents already have `Edit` tools | ✓ Good — tight scope, fast ship |
| Parse on-demand (no cache in v1) | Simpler, correctness guaranteed; cache when perf demands | ✓ Good — fresh `Analyzer` per call (ARCH-02) verified by mutation test |
| Both markdown and JSON output | Markdown for LLM comprehension, JSON for programmatic traversal | ✓ Good — both surfaces exercised in UAT |
| Next.js App Router only in v1 | Pages Router is legacy; focus buys deeper quality | ✓ Good |
| MCP bring-your-own-vision | Agents already have multimodal; MCP stays code-only | ✓ Good |
| Ship as npm package (stdio MCP) | Standard MCP distribution; `npx` zero-install UX | ✓ Good — published as `@hudyv2298/ui-hierarchy-mcp` v0.1.0 |
| `traverse.default ?? traverse` interop shim | Babel ESM/CJS interop is a known footgun | ✓ Good — covered by unit test that fails loudly on regression |
| Per-tool inline `format` param (not shared in `tools/common.ts`) | Preserves wire-protocol self-description; default `markdown` preserves backward compat | ✓ Good (decided 06-08) |
| TreeNode `attributes` literal-string-only in v1 | Keeps `Array<{name, value}>` shape simple at the wire boundary | ✓ Good (decided 06-10) |
| `findByText` returns matched component/element node when an attribute matches (not a synthetic text node) | file:line points at the JSX site that carries the prop | ✓ Good (decided 06-10) |
| Resolved component nodes use `line: 1` placeholder | ResolveResult exposes only absolutePath; true line lookup deferred | ⚠️ Revisit in v1.1 — file pointer alone satisfies v1 acceptance |

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

_Last updated: 2026-05-11 — v1.1 milestone started_
