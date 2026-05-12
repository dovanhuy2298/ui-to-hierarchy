# Roadmap — ui-to-hierarchyMCP

## Milestones

- ✅ **v1.0 Next.js App Router Parser** — Phases 1–6, 37 plans (shipped 2026-05-05) — see [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- 🔄 **v1.1 Agent Onboarding & v1.0 Polish** — Phases 7–8 (active)

## Phases

<details>
<summary>✅ v1.0 Next.js App Router Parser (Phases 1–6) — SHIPPED 2026-05-05</summary>

- [x] Phase 1: Scaffolding & IR Foundation (5/5 plans) — completed 2026-04-20
- [x] Phase 2: MCP Transport Shell (5/5 plans) — completed 2026-04-21
- [x] Phase 3: Parser Core (6/6 plans) — completed 2026-04-29
- [x] Phase 4: Next.js App Router Adapter (4/4 plans) — completed 2026-04-29
- [x] Phase 5: IR Queries & Tool Wire-up (5/5 plans) — completed 2026-04-29
- [x] Phase 6: Hardening & Fixture Gates (10/10 plans) — completed 2026-05-05

Full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

### v1.1 Agent Onboarding & v1.0 Polish

- [ ] **Phase 7: `--init` File Writer** — Users can run `npx ui-hierarchy-mcp --init` to inject a usage guide into agent instruction files
- [ ] **Phase 8: v1.0 Polish** — Markdown warnings surface, markdown integration tests pass, resolved component nodes carry true line numbers

## Phase Details

### Phase 7: `--init` File Writer

**Goal**: Users can inject MCP usage guidance into agent instruction files via a single `--init` command — idempotent, atomic, CRLF/BOM-safe, CI-usable
**Depends on**: Phase 6 (v1.0 — complete)
**Requirements**: INIT-01, INIT-02, INIT-03, INIT-04, INIT-05, INIT-06, INIT-07, INIT-08, INIT-09, INIT-10, INIT-11, INIT-12, INIT-13, INIT-14
**Success Criteria** (what must be TRUE):

1. User runs `npx ui-hierarchy-mcp --init` in a project root and finds a usage guide block (with all 4 tool descriptions, a registration snippet, and example calls) injected into `CLAUDE.md`; running the same command again produces no file changes
2. User passes `--target claude,codex,cursor,copilot` and finds the guide injected into all four target files; `.cursor/rules/ui-hierarchy-mcp.mdc` contains valid YAML frontmatter above the marker block; missing parent directories are created automatically
3. User runs `--init --dry-run` and sees a per-target summary (`would create`, `would update`, `would skip (no-op)`, `would skip (hand-edit detected)`) printed to stderr with no files written
4. User manually edits the injected block, re-runs `--init`, and sees a warning that the target was skipped; passing `--force` overwrites it
5. `npx ui-hierarchy-mcp` (no `--init`) starts the MCP stdio server exactly as in v1.0 with no regression; stdout contains no `[init]` output
**Plans:** 5 plans

Plans:
- [x] 07-01-PLAN.md — Foundation: build-time version constant, target registry, argv parser (INIT-03, INIT-13)
- [x] 07-02-PLAN.md — Pure utilities: marker scan/replace/append, SHA-256 fingerprint, EOL/BOM (INIT-04, INIT-06, INIT-07, INIT-09, INIT-13)
- [x] 07-03-PLAN.md — Guide template + atomic writer with EXDEV fallback (INIT-08, INIT-12, INIT-13)
- [x] 07-04-PLAN.md — runInit orchestrator + integration tests (INIT-01, INIT-04, INIT-05, INIT-07, INIT-09, INIT-10, INIT-11, INIT-13, INIT-14)
- [x] 07-05-PLAN.md — cli.ts dispatch fork + smoke checkpoint (INIT-01, INIT-02, INIT-03, INIT-11)

### Phase 8: v1.0 Polish

**Goal**: Markdown output reaches parity with JSON on warnings, integration tests cover the markdown format end-to-end, and resolved component nodes report true declaration line numbers
**Depends on**: Phase 7
**Requirements**: POLISH-01, POLISH-02, POLISH-03
**Success Criteria** (what must be TRUE):

1. Calling any MCP tool with `format: "markdown"` when the analyzer produces warnings returns those warnings as an HTML-comment block at the top of the markdown output — not silently dropped as in v1.0
2. The integration suite covers at least 2 fixture projects with `format: "markdown"`, asserting tree glyphs, `@` file:line separators, and absence of Windows backslashes in any path
3. Resolved component nodes in any tool response carry the actual source declaration line (not `line: 1`), verifiable by inspecting a known fixture with a component declared past line 1
**Plans:** 4 plans

Plans:
- [x] 08-01-PLAN.md — POLISH-01: renderMarkdown surfaces envelope.warnings as HTML-comment prefix
- [x] 08-02-PLAN.md — POLISH-03 part A: parseFile populates ParseResult.declLines map in existing parse pass
- [x] 08-03-PLAN.md — POLISH-03 part B: ResolveResult.local carries true line; Analyzer writes result.line; regression fixture
- [x] 08-04-PLAN.md — POLISH-02: integration suite exercises format:markdown against phase-05/micro + kitchen-sink

## Progress

| Phase                          | Milestone | Plans Complete | Status      | Completed  |
| ------------------------------ | --------- | -------------- | ----------- | ---------- |
| 1. Scaffolding & IR Foundation | v1.0      | 5/5            | Complete    | 2026-04-20 |
| 2. MCP Transport Shell         | v1.0      | 5/5            | Complete    | 2026-04-21 |
| 3. Parser Core                 | v1.0      | 6/6            | Complete    | 2026-04-29 |
| 4. Next.js App Router Adapter  | v1.0      | 4/4            | Complete    | 2026-04-29 |
| 5. IR Queries & Tool Wire-up   | v1.0      | 5/5            | Complete    | 2026-04-29 |
| 6. Hardening & Fixture Gates   | v1.0      | 10/10          | Complete    | 2026-05-05 |
| 7. `--init` File Writer        | v1.1      | 0/?            | Not started | -          |
| 8. v1.0 Polish                 | v1.1      | 0/?            | Not started | -          |
