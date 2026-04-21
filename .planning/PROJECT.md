# ui-to-hierarchyMCP

## What This Is

An MCP (Model Context Protocol) server that parses a frontend codebase and returns its UI component hierarchy as structured output (markdown tree + JSON) so AI coding agents can ground image/description-based UI edits in exact file/component locations. V1 targets Next.js App Router; the internal architecture is pluggable so additional framework parsers (React Native, Vue, Svelte) can be added without rewriting the core.

## Core Value

When an AI agent cannot confidently act on a screenshot or vague description ("make the card next to the avatar wider"), it can call this MCP to get a precise, structured map of the live component tree — with file:line, layout hints, text content, and conditional branches — so the agent edits the right component in the right file instead of guessing.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Parse Next.js App Router projects (TypeScript/TSX) into a component hierarchy via AST (Babel)
- [ ] Expose MCP tool `get_full_hierarchy(route)` returning layout chain → page → subtree
- [ ] Expose MCP tool `focus_on(component)` with up/full/down scopes (ancestors → target → subtree)
- [ ] Expose MCP tool `find_by_text(query)` returning matching nodes with file:line
- [ ] Expose MCP tool `find_by_style(className_or_prop)` returning matching nodes with file:line
- [ ] Return output in both markdown tree (default, LLM-friendly) and JSON (structured) formats
- [ ] Capture layout-relevant signals from Tailwind classNames, CSS Modules references, inline `style` props, and styled-components template literals (best-effort)
- [ ] Preserve text content, prop values, and conditional render branches (ternary / `&&`) in the tree
- [ ] Emit file:line for every node so the agent can jump directly to the source
- [ ] Handle App Router specifics: nested `layout.tsx`, `page.tsx`, `"use client"` boundary, dynamic `[slug]` routes, `loading.tsx` / `error.tsx` / `not-found.tsx`
- [ ] Parse on-demand (re-parse from AST each query — no cache in v1)
- [ ] Ship as an npm package that runs as a stdio MCP server (`npx`-able)
- [ ] Pluggable parser architecture so non-Next.js parsers can be added later

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

| Decision                                                | Rationale                                                                              | Outcome   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------- |
| Multi-framework architecture, Next.js parser only in v1 | User wants future-proof pluggability without paying the cost now                       | — Pending |
| Query-only in v1 (no structural edits)                  | Keep scope tight; agents already have `Edit` tools — MCP's job is to _inform_ edits    | — Pending |
| Parse on-demand (no cache in v1)                        | Simpler to build, correctness guaranteed; caching can come once perf shows it's needed | — Pending |
| Both markdown and JSON output                           | Markdown for LLM comprehension, JSON for programmatic traversal                        | — Pending |
| Next.js App Router only in v1                           | Pages Router is legacy; focus buys deeper quality                                      | — Pending |
| MCP bring-your-own-vision                               | Agents already have multimodal; MCP stays a focused code-analysis server               | — Pending |
| Ship as npm package (stdio MCP)                         | Standard MCP distribution; `npx` zero-install UX for clients                           | — Pending |

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

_Last updated: 2026-04-20 after initialization_
