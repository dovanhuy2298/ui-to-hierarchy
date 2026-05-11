# Project Research Summary — v1.1

**Project:** ui-to-hierarchyMCP — v1.1 Agent Onboarding & v1.0 Polish
**Domain:** MCP stdio server CLI — agent instruction file injection + output surface hardening
**Researched:** 2026-05-11
**Confidence:** HIGH

## Executive Summary

v1.1 is a well-scoped milestone with two independent work tracks. The first track adds a new `--init` CLI subcommand that injects a usage guide into agent instruction files (`CLAUDE.md`, `AGENTS.md`, `.cursor/rules/*.mdc`, `.github/copilot-instructions.md`). The second track closes three v1.0 polish items: surfacing envelope warnings in the markdown renderer, adding markdown-format integration test coverage, and replacing the `line: 1` placeholder for resolved component nodes with the true declaration line.

Recommended approach: a strict two-phase execution. Phase 1 builds the `--init` file-writer infrastructure (the riskiest surface — first time the package mutates files on a user's machine), and Phase 2 handles the three polish items that require no file I/O changes. The `--init` codepath lives in a `src/init/` island with zero imports from `src/mcp/`, `src/core/`, or `src/adapters/`. **Zero new npm runtime dependencies are required**: `node:util.parseArgs` covers CLI arg parsing, plain string/regex covers marker-block manipulation, and a one-line tsup `loader: { '.md': 'text' }` config handles template embedding.

Primary risks (all CRITICAL): CRLF/BOM corruption of marker detection (Windows block doubling), greedy regex eating multiple blocks, and non-atomic writes corrupting files on crash. Plus the MCP-vs-CLI mode gate in `cli.ts` — `--init` output must never reach stdout when the binary is launched as a stdio MCP server.

## Key Findings

### Recommended Stack (v1.1 additions — all zero-dep)

| Pick | Purpose | Why |
| --- | --- | --- |
| `node:util.parseArgs` | CLI arg parsing for `--init` / `--target` / `--dry-run` | Built-in Node 20 stable. Handles two-mode dispatch without a framework. CSV split for `--target` is one line userland. |
| Plain string + regex | Marker-block detect & splice | 8 LOC, no `remark`/`unified` (~800 kB), uses `String.indexOf(START)` + `indexOf(END, after)` not spanning regex. |
| `tsup loader: { '.md': 'text' }` | Build-time template inlining | Author templates as natural `.md` files in `src/init/templates/`; esbuild inlines them as string constants. One config line. No runtime `fs.readFile` path fragility across dev/build/npx. |

**Do NOT add:** `mri` (unmaintained 2021), `cac`/`commander`/`yargs` (overkill), `remark`/`unified`, `fs-extra`.

**Agent file format facts (verified):**
- `CLAUDE.md` + `AGENTS.md`: plain markdown, no frontmatter, append-or-replace via marker tags
- `.cursor/rules/ui-hierarchy-mcp.mdc`: flat `.mdc` file, YAML frontmatter (`description`, `alwaysApply: true`, `globs`)
- `.github/copilot-instructions.md`: plain markdown, no frontmatter for the repo-level file

`AGENTS.md` is now an open standard (Linux Foundation directed fund) adopted by Codex, Cursor, Gemini CLI, Windsurf, Copilot.

### Expected Features

**Table stakes (P1 for v1.1):**
- TS-01 Marker-delimited block injection (`<!-- ui-hierarchy-mcp:start/end -->`)
- TS-02 Idempotent re-run (detect existing markers, replace block only)
- TS-03 Default target = CLAUDE.md (create if missing; append/replace if existing)
- TS-04 Injected guide: when-to-call rules for all 4 tools
- TS-05 Injected guide: MCP registration snippet
- TS-06 Injected guide: one example call per tool
- TS-07 `--target` flag (claude, codex, cursor, copilot) — multi-client
- TS-08 Stdout summary of what was written per target
- TS-09 Non-interactive by default (script/CI safe)
- D-01 `--dry-run` flag — same codepath minus final write; doubles as CI testing mechanism

**Should have (near-free, include in v1.1):**
- D-04 `projectRoot` hint baked into example calls (resolves cwd at init time)
- True `line` for resolved component nodes (replaces `line: 1` placeholder in `Analyzer.ts:304`)
- Markdown `envelope.warnings` surfaced (parity with JSON renderer)
- Markdown integration test coverage (current suite is JSON-only)

**Defer to v1.2+:**
- D-02 Auto-detect installed agents (filesystem scan)
- D-03 Versioned block with hash-based upgrade detection
- `--global` flag for `~/.claude/CLAUDE.md`
- Watch mode / auto-update

**Anti-features (skip):** Interactive wizard, backup files, per-target tailored content, auto-registering MCP server in `.mcp.json`.

### Architecture Approach

`src/init/` is a self-contained island: imports only `node:` built-ins and its own siblings. Dynamic `import("./init/index.js")` in `cli.ts` keeps Babel, MCP SDK, and zod out of the init startup path.

**New/modified components:**
1. `src/cli.ts` (modified) — argv dispatch gate; `--init` exits before `startServer()` runs; all `--init` output to `stderr`
2. `src/init/index.ts` (new) — `runInit({ targets, cwd })` orchestrator
3. `src/init/targets.ts` (new) — `TARGET_MAP` record; per-target differences (path, heading, frontmatter) are data, not logic
4. `src/init/mutator.ts` (new) — `readSplice()` with atomic write, CRLF/BOM normalization, non-greedy marker splice, permission classification
5. `src/init/template.ts` (new) — `GUIDE_CONTENT` (or tsup-inlined `.md`)
6. `src/renderers/markdown.ts` (modified) — rename `_envelope` → `envelope`, prepend HTML comment warnings block; JSON path untouched
7. `src/adapters/types.ts` (modified) — add `line: number` to `ResolveResult` local variant
8. `src/core/resolver/index.ts` + `barrel.ts` (modified) — populate `line` from declaration traverse

### Critical Pitfalls

1. **CRLF/BOM breaks marker detection — block doubles on Windows (CRITICAL).** Normalize after readFile: detect dominant EOL, strip BOM, process on LF, restore EOL on write. Write a CRLF fixture test asserting idempotency.
2. **Greedy regex eats multiple marker blocks (CRITICAL).** Use `String.indexOf` not spanning regex. Refuse on corrupt block.
3. **Non-atomic writes corrupt user files on crash (CRITICAL).** Temp file in `dirname(targetPath)` (same FS) → `rename()`. On `EXDEV`, fall back to `copyFile` + `unlink`. Never `os.tmpdir()`.
4. **`--init` output on stdout corrupts MCP JSON-RPC stream (CRITICAL).** Parse `process.argv` at very top of `cli.ts`. `--init` mode: all human output to stderr, never call `startServer()`. Integration test: spawn binary with `--init --dry-run`, assert stdout contains no JSON-RPC envelope.
5. **Markdown warning fix accidentally affects JSON renderer.** Additive to `renderMarkdown` only. Add `JSON.parse(text).warnings instanceof Array` assertion to CI.

**Additional:** Trailing newline drift (normalize to one `\n`); `.cursor/rules/` may not exist (`mkdir recursive`); `AGENTS.md` monorepo subdir wrong scope (warn on git root mismatch); markdown integration snapshots — assert `not.toContain('\\')` for Windows.

## Implications for Roadmap

### Phase 1: `--init` File Writer Infrastructure

Owns 12 file-mutation pitfalls. Fully independent of Polish. Build first.

**Delivers:** `--init` (CLAUDE.md default), `--target` multi-file, `--dry-run`, idempotent marker splice, atomic writes, CRLF/BOM normalization, permission error classification, git-root warning, per-target success summary.

**Build order within Phase 1:**
1. Atomic write utility
2. EOL detection + BOM stripping
3. Block splicing with non-greedy split-based parsing
4. Trailing-newline normalization
5. Permission error classification
6. CLI mode gate in `cli.ts`
7. Target handlers: CLAUDE.md, AGENTS.md, `.cursor/rules/`, `.github/copilot-instructions.md`
8. Pre-flight project detection + no-target UX
9. `--dry-run` throughout

### Phase 2: v1.0 Polish (3 items)

Three independent items, can parallelize internally:
- **Step A:** `ResolveResult` type change → resolver `line` population → `Analyzer.ts:304` → unit test updates
- **Step B:** `renderMarkdown` warnings block → `with-warnings` IR fixture → snapshot test
- **Step C** (depends on A + B): markdown integration assertions + backslash guard in `mcp-e2e.test.ts`

**Phase ordering rationale:** Phase 1 mode gate is precondition for integration tests that spawn binary; TypeScript type change first in Phase 2 surfaces blast radius immediately.

## Open Questions for Product Decision

| # | Question | Recommendation | Confidence |
|---|---------|---------------|------------|
| OQ-1 | Block versioning scheme day-one or v1.2? | Ship `<!-- version: 1.1 -->` in v1.1 | HIGH |
| OQ-2 | Hand-edit detection behavior | Warn and skip; `--force` to override | MEDIUM |
| OQ-3 | Single template or per-target content? | Single template + formatting wrapper | HIGH |
| OQ-4 | `--dry-run` day-one? | Day-one in Phase 1 | HIGH |
| OQ-5 | Cursor `.mdc` format stability? | Accept risk; monitor changelog | MEDIUM |

## Sources

### Primary (HIGH)
- Node.js v20 `util.parseArgs` official docs
- esbuild text loader docs
- OpenAI Codex AGENTS.md official guide (developers.openai.com)
- GitHub Docs `.github/copilot-instructions.md`
- Cursor official docs `.cursor/rules/*.mdc`
- npm/write-file-atomic README
- Node.js Issue #19077 (EXDEV)
- Claude Code Issues #25476, #42119 (EXDEV MSIX)
- Ansible blockinfile Issues #85283, #45848 (CRLF + greedy regex)
- `src/core/Analyzer.ts:304` (`line: 1` placeholder)
- `src/renderers/markdown.ts` (`_envelope` ignored)
- `src/cli.ts` (3-line entry confirmed)
- jcodemunch-mcp AGENT_HOOKS.md (reference implementation)

### Secondary (MEDIUM)
- Cursor Forum MDC flat-file format
- AGENTS.md open standard (agents.md)
- shadcn CLI v4 `--dry-run` precedent

---

**Ready for roadmap:** Yes. 2 phases. Both phases have full implementation guidance — no further research needed.
