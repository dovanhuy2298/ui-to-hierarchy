# STATE — ui-to-hierarch MCP

**Last updated:** 2026-04-20 (initialization)

## Project Reference

- **Core value:** When an AI agent can't confidently act on a screenshot or vague UI description, call this MCP for a precise file/component map — edit the right component, not guess.
- **Current focus:** v1 — Next.js App Router parser as stdio MCP server
- **Mode:** yolo
- **Granularity:** standard

## Current Position

- **Milestone:** v1
- **Phase:** (not started) — next up: Phase 1: Scaffolding & IR Foundation
- **Plan:** —
- **Status:** Roadmap created; awaiting `/gsd-plan-phase 1`
- **Progress:** `[░░░░░░] 0/6 phases complete`

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases complete | 0/6 |
| Requirements validated | 0/24 |
| Requirements deferred to v2 | 0 |

## Accumulated Context

### Decisions

Captured in PROJECT.md Key Decisions table. Highlights:
- Multi-framework adapter architecture, only NextJsAdapter in v1
- Query-only tools (no structural edits)
- Parse-on-demand, no cache in v1
- Markdown (default) + JSON output; no XML
- App Router only (Pages Router = v2)
- Ship as stdio MCP via npm / `npx`

### Open Todos

- None — all v1 requirements are frozen and mapped to phases

### Blockers

- None

### Research Flags (from research/SUMMARY.md)

- **Phase 3:** Babel ESM interop, HOC unwrap, barrel chase algorithms — may warrant `/gsd-research-phase`
- **Phase 4:** Parallel routes, intercepting routes, slot contract are under-documented — may warrant `/gsd-research-phase`

## Session Continuity

- Next command: `/gsd-plan-phase 1`
- Prototype reference: `E:\ui-to-hierarch\generate-component-hierarchy.ts` (~60% of v1 logic; port, don't wrap)
- Research artifacts: `.planning/research/{SUMMARY,STACK,FEATURES,ARCHITECTURE,PITFALLS}.md`
