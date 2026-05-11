# Milestone v1.1 Requirements — ui-to-hierarchyMCP

**Milestone:** v1.1 Agent Onboarding & v1.0 Polish
**Defined:** 2026-05-11

---

## v1.1 Requirements

### INIT — `--init` CLI subcommand

- [ ] **INIT-01**: User can run `npx @hudyv2298/ui-hierarchy-mcp --init` from a project root and have a usage guide injected into `CLAUDE.md` (default target when no `--target` flag is passed).
- [ ] **INIT-02**: The CLI exits cleanly without booting the MCP server when `--init` is present in `process.argv`; conversely, when `--init` is absent, the MCP stdio server starts exactly as in v1.0 (no regression).
- [ ] **INIT-03**: User can pass `--target claude,codex,cursor,copilot` (comma-separated, any subset) to write to additional agent files: `AGENTS.md` (codex), `.cursor/rules/ui-hierarchy-mcp.mdc` (cursor), `.github/copilot-instructions.md` (copilot).
- [ ] **INIT-04**: For each target, `--init` is idempotent: re-running with the same template content produces no changes; re-running after a template upgrade replaces only the marker-delimited block. Marker format: `<!-- ui-hierarchy-mcp:start version=X.Y -->` ... `<!-- ui-hierarchy-mcp:end -->`.
- [ ] **INIT-05**: When the target file does not exist, `--init` creates it (and any missing parent directory such as `.cursor/rules/` or `.github/`).
- [ ] **INIT-06**: When the target file exists but contains no marker block, `--init` appends the block to the file separated by a single blank line; existing content above is preserved byte-for-byte (minus normalized trailing newline).
- [ ] **INIT-07**: When the target file already contains a marker block with content that does NOT match the originally-injected template (hand-edit detected via content fingerprint), `--init` warns and skips that target; user must pass `--force` to overwrite.
- [ ] **INIT-08**: `--init` writes files atomically: temp file in same directory → `rename()`; falls back to `copyFile` + `unlink` on `EXDEV`. A crash mid-write never leaves the target file in a corrupt state.
- [ ] **INIT-09**: `--init` preserves the target file's existing EOL convention (LF vs CRLF) and strips/preserves any leading BOM as found, so Windows-CRLF CLAUDE.md files do not get a duplicate block on re-run.
- [ ] **INIT-10**: `--init --dry-run` runs the full pipeline but writes nothing; stdout summary clearly indicates each target's would-be action (`would create`, `would update`, `would skip (no-op)`, `would skip (hand-edit detected)`).
- [ ] **INIT-11**: `--init` prints a per-target summary line to stderr (NOT stdout — preserves the MCP stdio invariant if the wrong code path is ever entered) in the form `[init] <action> <path>` and exits with code `0` on success, `1` on any target failure.
- [ ] **INIT-12**: The injected guide content includes: (a) when-to-call rules for each of the 4 tools (`get_full_hierarchy`, `focus_on`, `find_by_text`, `find_by_style`), (b) MCP registration snippet (`npx -y @hudyv2298/ui-hierarchy-mcp` stdio config), (c) one example invocation per tool with realistic args, (d) `projectRoot` hint resolved from `process.cwd()` at init time.
- [ ] **INIT-13**: `--init` is non-interactive by default (CI-safe): no prompts, no TTY checks; only `--force` overrides the hand-edit guard.
- [ ] **INIT-14**: `.cursor/rules/ui-hierarchy-mcp.mdc` is written with the Cursor-expected YAML frontmatter (`description`, `alwaysApply: true`, `globs: ["**/*.tsx", "**/*.jsx"]`); the marker block lives below the frontmatter so re-injection does not corrupt frontmatter.

### POLISH — v1.0 polish items

- [ ] **POLISH-01**: Markdown renderer surfaces `envelope.warnings` (currently the JSON renderer emits them but markdown drops them); warnings appear as an HTML-comment-prefixed block at the top of the rendered tree, ordered before the tree itself.
- [ ] **POLISH-02**: Integration suite exercises `format: "markdown"` end-to-end for at least 2 fixture projects, asserting tree glyphs, ` @ ` file:line separator, and `not.toContain('\\')` (Windows backslash guard); current suite only exercises `format: "json"`.
- [ ] **POLISH-03**: `ResolveResult` (local kind) carries a true `line` number sourced from the declaration's Babel `loc.start.line`; `Analyzer.ts` propagates it to `TreeNode.line` for resolved component nodes, replacing the `line: 1` placeholder.

---

## Future Requirements (deferred to v1.2+)

- Auto-detect installed agents — scan filesystem for `.cursor/`, `.github/`, etc. and auto-populate `--target` (D-02 from research)
- `--global` flag for `~/.claude/CLAUDE.md` (note: `projectRoot` value is per-project, so global install needs different content)
- Hash-based upgrade detection across versions (currently only the `version=X.Y` tag is shipped; v1.2 can use it to drive auto-upgrade prompts)
- Watch mode / auto-update on package upgrade
- Live Claude Code transcript export (close F-01 defer from v1.0)
- Cleanup orphan exports in `src/mcp/errors.ts`

## Out of Scope (v1.1)

- **Interactive wizard / TUI** — non-interactive by design (CI-safe)
- **Backup files (`CLAUDE.md.bak`)** — atomic write + marker-block idempotency makes backups unnecessary; users have git
- **Per-target tailored content** — research consensus: 90%+ identical across agents; single template + format wrapper only
- **Auto-registering the MCP server in `.mcp.json` / `mcp_servers.json`** — too many client variants; the injected guide tells users how to register manually
- **Adding new MCP tools or changing existing tool signatures** — v1.1 does not modify the MCP protocol surface
- **Caching / watch mode** — still deferred from v1.0 (parse-on-demand stays)
- **Pages Router / RN / Vue / Svelte parsers** — still deferred from v1.0

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INIT-01 | Phase 7 | Pending |
| INIT-02 | Phase 7 | Pending |
| INIT-03 | Phase 7 | Pending |
| INIT-04 | Phase 7 | Pending |
| INIT-05 | Phase 7 | Pending |
| INIT-06 | Phase 7 | Pending |
| INIT-07 | Phase 7 | Pending |
| INIT-08 | Phase 7 | Pending |
| INIT-09 | Phase 7 | Pending |
| INIT-10 | Phase 7 | Pending |
| INIT-11 | Phase 7 | Pending |
| INIT-12 | Phase 7 | Pending |
| INIT-13 | Phase 7 | Pending |
| INIT-14 | Phase 7 | Pending |
| POLISH-01 | Phase 8 | Pending |
| POLISH-02 | Phase 8 | Pending |
| POLISH-03 | Phase 8 | Pending |

**Coverage:** 17/17 requirements mapped

---

_Last updated: 2026-05-11_
