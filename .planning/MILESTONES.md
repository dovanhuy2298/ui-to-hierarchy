# Milestones — ui-to-hierarchyMCP

> Historical index of shipped milestones. Each entry summarizes what shipped, key decisions, and links to its archived ROADMAP + REQUIREMENTS.

## v1.0 — Next.js App Router Parser

**Shipped:** 2026-05-05
**Phases:** 1–6 (37 plans, ~85 tasks)
**Source LOC:** ~4,890 TypeScript
**Test results:** 256 unit + 20 integration + 8/8 UAT, all green
**Released:** [`ui-hierarchy-mcp`](https://www.npmjs.com/package/ui-hierarchy-mcp) v0.1.0 on npm

**Delivered:** An MCP server (stdio, distributed via `npx`) that parses Next.js App Router projects into a structured UI component hierarchy and exposes it through four query tools so AI coding agents can ground image/description-based UI edits in exact file/component locations.

### Key Accomplishments

1. **Four MCP tools, all wired end-to-end** — `get_full_hierarchy`, `focus_on`, `find_by_text`, `find_by_style` — each returning markdown (default) or JSON, with file:line on every node.
2. **Pluggable framework architecture** — `FrameworkAdapter` interface (exactly 5 methods) with strict `adapters/` island; v1 ships `NextJsAdapter` only, but core/ir/renderers are framework-agnostic.
3. **Full Next.js App Router coverage** — layout chains, route groups `(group)`, parallel `@slot`, intercepting `(.)/(..)/(...)` routes, dynamic `[slug]/[...rest]/[[...opt]]`, server/client runtime directives.
4. **Production-grade hardening** — Babel `errorRecovery` so syntax errors become `TreeNode { kind: "error" }` (no silent skips); barrel re-export chase with cycle guard; tsconfig path aliases via `get-tsconfig`; HOC unwrap (`memo`, `forwardRef`, `observer`, `with*`, `*HOC`); Windows path discipline (forward-slash everywhere).
5. **Real-client verified** — operator UAT 8/8 PASS via MCP Inspector + Claude Code; 18 security threats modeled and closed; integration suite spawns the published binary against 4 fixture projects (shadcn-barrels, nested-routes, pnpm-monorepo apps/web + apps/admin).
6. **Published to npm and usable today** — `npx -y ui-hierarchy-mcp` works from any MCP client config.

### Key Decisions

- Multi-framework architecture, NextJsAdapter only in v1 (✓ Good — island stayed pristine)
- Query-only tools, no structural edits (✓ Good — tight scope, fast ship)
- Parse-on-demand, no cache in v1 (✓ Good — ARCH-02 mutation-test verified)
- Markdown (default) + JSON output (✓ Good — both surfaces used in UAT)
- App Router only, Pages Router → v2 (✓ Good)
- Ship as stdio MCP via `npx` (✓ Good — published v0.1.0)

### Issues Deferred to v1.1

- **F-01**: Claude Code transcript reconstructed from stdio-equivalent capture (methodology footnote, not contract gap)
- Markdown renderer drops `envelope.warnings` (markdown UAT 8/8 PASS as-is)
- Integration test exercises only `format: "json"` (markdown surface relies on operator UAT)
- Two orphan exports in `src/mcp/errors.ts` (Phase 2 stubs superseded by Phase 5)
- Resolved component nodes use `line: 1` placeholder (file pointer alone satisfies acceptance)

### Archives

- [v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md) — full phase details
- [v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md) — 24/24 traceability
- [v1.0-MILESTONE-AUDIT.md](milestones/v1.0-MILESTONE-AUDIT.md) — pre-close audit (gaps closed 2026-05-05)
- Git tag: `v1.0`

---

_Next milestone: TBD — run `/gsd-new-milestone` to start._
