# Milestones — ui-to-hierarchyMCP

> Historical index of shipped milestones. Each entry summarizes what shipped, key decisions, and links to its archived ROADMAP + REQUIREMENTS.

## v1.1 — Agent Onboarding & v1.0 Polish

**Shipped:** 2026-05-12
**Phases:** 7–8 (9 plans)
**Source delta:** 45 files changed, +2,818 / −80 lines
**Test results:** 353/353 vitest cases / 44 files / 0 fail; build clean (`dist/cli.js` 101.20 KB)
**Released:** `ui-hierarchy-mcp` v0.2.0 on npm

**Delivered:** A one-line `npx ui-hierarchy-mcp --init` onboarding path that injects MCP usage guidance into agent instruction files across four targets (Claude, Codex, Cursor, Copilot), plus three v1.0 polish closures so markdown reaches parity with JSON and resolved component nodes carry their true source line.

### Key Accomplishments

1. **`--init` CLI subcommand, four targets, idempotent re-runs** — `npx ui-hierarchy-mcp --init` writes a marker-delimited guide block into `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/ui-hierarchy-mcp.mdc`, `.github/copilot-instructions.md`. Atomic temp-file + `rename()` with `EXDEV` fallback; CRLF/BOM preserved; SHA-256 fingerprint guards hand-edits; `--force` overrides; `--dry-run` previews per-target action; stderr-only output preserves MCP stdio invariant.
2. **MCP server path zero-regression** — `npx ui-hierarchy-mcp` (no flag) still boots the stdio server exactly as in v1.0; `src/init/*` imports nothing from `src/core/`, `src/ir/`, `src/renderers/`, or `src/mcp/`.
3. **POLISH-01: markdown envelope warnings surfaced** — `renderMarkdown` now prefixes output with `<!-- warning: {msg} -->` lines + blank separator when `envelope.warnings` is non-empty, reaching JSON parity without changing the envelope schema or any existing snapshot.
4. **POLISH-02: markdown integration coverage** — integration suite exercises `format: "markdown"` against `phase-05/micro` and `kitchen-sink` fixtures, asserting tree glyphs, `@` file:line separator, and the Windows-backslash guard. Shared `_helpers.ts` extracts the MCP spawn lifecycle.
5. **POLISH-03: true declaration line on resolved components** — `parseFile` populates `ParseResult.declLines` in the existing single parse pass (zero extra cost); `ResolveResult.local` carries the true `loc.start.line`; `Analyzer` writes it to `TreeNode.line`, replacing the v1.0 `line: 1` placeholder. Regression fixture verifies a component declared past line 1 reports its true line.
6. **Code review and security audit closed** — Phase 7 + Phase 8 each ran full review-fix cycles (WR-01..04, IN-01..04, CR-01) and security re-verification; 18 threat checks green; full suite 353/353.

### Key Decisions

- `--init` non-interactive by default; only `--force` overrides hand-edit guard (CI-safe).
- Single template + per-target format wrapper (no per-agent tailoring) — research consensus showed ≥90% overlap.
- Build-time `__INIT_MARKER_VERSION__` constant via `tsup` define (mirrors `__TOOL_VERSION__`); `runInit` only invoked through `dist/cli.js`.
- `ParseResult.declLines` populated in-pass — zero extra parse cost; cache identity preserved.
- HTML-comment warning prefix in markdown (`<!-- warning: ... -->`) — invisible when rendered, recoverable, no schema change.

### Issues Deferred to v1.2

- F-01: live Claude Code transcript export still reconstructed from stdio-equivalent capture.
- Two orphan exports in `src/mcp/errors.ts` (`notImplemented`, `invalidInput`) — Phase 2 stubs superseded by Phase 5.
- Auto-detect installed agents (scan filesystem for `.cursor/`, `.github/`, etc. to auto-populate `--target`).
- `--global` flag for `~/.claude/CLAUDE.md`.
- Hash-based upgrade detection across the `version=X.Y` marker tag.
- Cosmetic: redundant `base.warnings ?? []` fallback in tool handlers; `typeof` guard around `__INIT_MARKER_VERSION__` for direct `tsx`/`vitest` invocation safety.

### Archives

- [v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md) — full phase details
- [v1.1-REQUIREMENTS.md](milestones/v1.1-REQUIREMENTS.md) — 17/17 traceability (14 INIT + 3 POLISH)
- [v1.1-MILESTONE-AUDIT.md](milestones/v1.1-MILESTONE-AUDIT.md) — pre-close audit (blocker resolved 2026-05-12 — Phase 8 VERIFICATION.md exists)
- Git tag: `v1.1`

---

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
