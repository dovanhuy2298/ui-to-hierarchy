# Phase 7: `--init` File Writer — Specification

**Created:** 2026-05-11
**Ambiguity score:** 0.11 (gate: ≤ 0.20)
**Requirements:** 14 locked

## Goal

Users can run `npx ui-hierarchy-mcp --init [--target ...] [--dry-run] [--force]` from a project root and inject a marker-delimited MCP usage-guide block into one or more agent instruction files (`CLAUDE.md`, `AGENTS.md`, `.cursor/rules/ui-hierarchy-mcp.mdc`, `.github/copilot-instructions.md`) — idempotent, atomic, EOL/BOM-preserving, non-interactive, CI-safe — while the bare `npx ui-hierarchy-mcp` invocation continues to start the MCP stdio server with zero regression.

## Background

`src/cli.ts` today contains exactly one behavior: import `startServer()` and run it (`src/cli.ts:6`). There is no `process.argv` parsing, no subcommand router, no file-writer module, and no guide-template asset. The CLI is published as `ui-hierarchy-mcp` (npm v0.1.1, `package.json:2`) with `bin → dist/cli.js` (`package.json:31`); end users invoke it via the MCP stdio config pattern `{ command: "npx", args: ["-y", "ui-hierarchy-mcp"] }`.

The agent-onboarding gap: MCP clients (Claude Code, Codex, Cursor, Copilot) only discover this server's tools after the user manually writes a usage section into the agent's instruction file. Phase 7 closes that gap with a single one-shot command. The marker convention `<!-- ui-hierarchy-mcp:start version=X.Y --> … <!-- ui-hierarchy-mcp:end -->` makes the block re-detectable so future template upgrades replace only the managed region. Hand-edits inside the block are protected via a content fingerprint (skip by default, override with `--force`).

The project ships as ESM-only, Node ≥ 20, with `tsup` bundling `src/cli.ts` → `dist/cli.js`. This phase MUST not pull new runtime deps (uses `node:fs/promises`, `node:path`, `node:crypto` only); the published `npx` tarball footprint must stay flat.

## Requirements

1. **Default `--init` target**: Running `--init` with no `--target` flag injects the guide into `CLAUDE.md` at `process.cwd()`. (INIT-01)
   - Current: `src/cli.ts:6` calls `startServer()` unconditionally; no argv inspection
   - Target: `npx ui-hierarchy-mcp --init` in a project root creates or updates `./CLAUDE.md` with a marker-delimited block, then exits with code 0 without booting the MCP server
   - Acceptance: From an empty temp directory, `node dist/cli.js --init` creates `./CLAUDE.md` containing both marker tags and the guide payload; process exit code is 0; no MCP stdio handshake bytes appear on stdout

2. **CLI mode dispatch**: `--init` takes a discrete code path; absence of `--init` preserves v1.0 behavior byte-for-byte. (INIT-02)
   - Current: CLI always boots `startServer()`; any argv is ignored
   - Target: `process.argv` is inspected; if it contains `--init`, the init pipeline runs and the process exits; otherwise the existing `startServer()` path runs unchanged
   - Acceptance: `node dist/cli.js` (no args) still completes the MCP `initialize` handshake against a stdio client (existing smoke test `test/mcp/smoke.spawn.test.ts` still passes); `node dist/cli.js --init` never calls `startServer()` (verified by absence of any MCP framing on stdout)

3. **Multi-target via `--target`**: User passes `--target` with any subset of `claude,codex,cursor,copilot` (comma-separated). (INIT-03)
   - Current: No target concept exists
   - Target: `--target claude,codex,cursor,copilot` writes to `./CLAUDE.md`, `./AGENTS.md`, `./.cursor/rules/ui-hierarchy-mcp.mdc`, `./.github/copilot-instructions.md` respectively; unknown target tokens exit code 1 with stderr error before any file write
   - Acceptance: Running with all four targets in an empty directory produces all four files at correct paths; running with `--target foo` exits with code 1 and writes nothing

4. **Idempotent re-run + version-keyed replacement**: Marker format `<!-- ui-hierarchy-mcp:start version=X.Y --> … <!-- ui-hierarchy-mcp:end -->` where `X.Y` is the `major.minor` of the package `version` field at build time. (INIT-04)
   - Current: No marker concept; no template versioning
   - Target: When `--init` runs and an existing marker block has the same `version=X.Y` AND a matching content fingerprint, the file is left byte-for-byte unchanged. When the marker block exists but `X.Y` differs from the current build's `X.Y`, the block region is replaced in place; bytes outside the markers are preserved
   - Acceptance: Two consecutive `--init` runs produce identical file bytes on run 2 (verified by SHA-256 equality); a fixture with a `version=0.0` marker block is replaced when the build version is `0.1`, with surrounding content unchanged byte-for-byte

5. **Auto-create missing files and directories**: Target paths and any missing parents are created. (INIT-05)
   - Current: No file creation logic
   - Target: For each enabled target, missing parent directories (e.g. `.cursor/rules/`, `.github/`) are created with `recursive: true`; the target file is created with the guide block as its only content (no leading blank line)
   - Acceptance: Running with `--target cursor,copilot` in an empty directory creates `.cursor/rules/ui-hierarchy-mcp.mdc` and `.github/copilot-instructions.md`, both readable and well-formed

6. **Append to existing file without marker**: When the target file exists but contains no marker block, the guide block is appended after exactly one blank line. (INIT-06)
   - Current: No append logic
   - Target: Pre-existing content is preserved byte-for-byte except for normalization of the final newline; a single blank line separates the original tail from the inserted `<!-- ui-hierarchy-mcp:start … -->` marker
   - Acceptance: Given a fixture `CLAUDE.md` ending in `# Notes\n`, after `--init` the file equals `# Notes\n\n<!-- ui-hierarchy-mcp:start version=X.Y -->\n…\n<!-- ui-hierarchy-mcp:end -->\n`; the original prefix bytes are unchanged

7. **Hand-edit guard via content fingerprint**: A marker block whose body bytes don't match the originally-injected SHA-256 (recorded inline as `<!-- ui-hierarchy-mcp:fingerprint=… -->` inside the block) is treated as user-edited; that target is skipped with a stderr warning unless `--force` is passed. (INIT-07)
   - Current: No fingerprint, no overwrite protection
   - Target: On re-run, the body bytes between markers are hashed and compared to the embedded fingerprint comment; mismatch ⇒ stderr `[init] skip <path> (hand-edit detected; use --force to overwrite)` + non-zero per-target outcome; `--force` overwrites and rewrites a fresh fingerprint
   - Acceptance: A fixture with a tampered body byte triggers the skip path on plain `--init` (file bytes unchanged; exit code 1); the same fixture with `--force` is rewritten and the new fingerprint validates on a subsequent plain `--init`

8. **Atomic writes**: All file mutations go through `tmpfile + rename` (with `copyFile + unlink` fallback on `EXDEV`). (INIT-08)
   - Current: No write path exists
   - Target: Each target write is staged to a sibling `<target>.tmp-<pid>-<rand>` then `fs.rename`d into place; on `EXDEV` the code falls back to `copyFile` + `unlink(tmp)`; on any error before rename the temp file is removed
   - Acceptance: A unit test injecting a write failure between tmp-write and rename leaves the original target file unchanged and the tmp file removed; no orphaned `.tmp-*` files remain after any test in the suite

9. **EOL + BOM preservation**: Detect and preserve the target file's existing line ending (LF vs CRLF) and leading UTF-8 BOM (if present). (INIT-09)
   - Current: No EOL/BOM handling
   - Target: When reading an existing target, detect EOL from the first newline found and BOM from the first 3 bytes; emit the new content using that EOL convention and re-emit the BOM if originally present; for new files use LF and no BOM
   - Acceptance: A CRLF+BOM fixture re-run twice produces byte-identical output on run 2 (no duplicate block, no LF/CRLF mixing); a plain LF fixture remains pure LF after init

10. **`--dry-run` summary, no writes**: Full pipeline executes but no bytes are written; per-target intended action is printed to stderr. (INIT-10)
    - Current: No dry-run mode
    - Target: `--init --dry-run` runs read/diff/fingerprint logic for every target and prints one of `would create`, `would update`, `would skip (no-op)`, `would skip (hand-edit detected)` per target to stderr; no `open()` with write flags is invoked
    - Acceptance: Running `--init --dry-run --target claude,codex` in an empty dir prints two `would create` lines to stderr, exits code 0, and leaves the directory empty (verified by `fs.readdir`)

11. **Stderr-only summary + exit code**: Per-target `[init] <action> <path>` line goes to stderr; exit code is 0 iff every enabled target succeeded (or no-op'd), 1 if any target failed (including hand-edit skips without `--force`). (INIT-11)
    - Current: No init summary; stdout is reserved for MCP framing
    - Target: All init progress/result output is written via `process.stderr.write`; `process.stdout` receives zero bytes on any `--init` invocation
    - Acceptance: Capturing stdout/stderr separately, `node dist/cli.js --init …` yields `stdout.length === 0` and stderr containing one `[init] <action> <path>` line per target; exit code reflects success/failure as specified

12. **Guide payload contract**: The injected block contains, in order: (a) one-line description of each of the 4 tools (`get_full_hierarchy`, `focus_on`, `find_by_text`, `find_by_style`) with when-to-call rules; (b) MCP registration JSON snippet (`{ command: "npx", args: ["-y", "ui-hierarchy-mcp"] }`); (c) one example invocation per tool with realistic args; (d) a `projectRoot` hint computed as `process.cwd()` at init time. (INIT-12)
    - Current: No template, no guide asset
    - Target: A built-in template (bundled into `dist/cli.js`) emits all four sections in the order above; `projectRoot` is substituted with the absolute path of `process.cwd()` as a literal string
    - Acceptance: A fixture inspection asserts the emitted block contains the literal tool names, the JSON snippet substring `"npx", "-y", "ui-hierarchy-mcp"`, exactly 4 example-invocation code fences, and the cwd path literal

13. **Non-interactive by default**: No prompts, no TTY checks, no stdin reads — `--force` is the only override knob. (INIT-13)
    - Current: N/A (no init pipeline)
    - Target: The init code path never calls `readline`, never references `process.stdin.isTTY` or `process.stdout.isTTY`; all decision branches are driven by argv flags only
    - Acceptance: Running `--init` with `stdin` redirected from `/dev/null` (or `NUL` on Windows) completes normally; a grep over the init module finds zero references to `stdin`, `readline`, or `isTTY`

14. **Cursor frontmatter contract**: `.cursor/rules/ui-hierarchy-mcp.mdc` is written with valid YAML frontmatter (`description`, `alwaysApply: true`, `globs: ["**/*.tsx", "**/*.jsx"]`) ABOVE the marker block. (INIT-14)
    - Current: No cursor target logic
    - Target: When the `cursor` target writes, the file structure is `---\n<yaml>\n---\n\n<!-- ui-hierarchy-mcp:start … -->\n…\n<!-- ui-hierarchy-mcp:end -->\n`; on re-run only bytes inside the marker block are replaced — the frontmatter and its trailing blank line are preserved byte-for-byte
    - Acceptance: A YAML parser successfully loads the frontmatter and finds the three required keys with the specified values; after a re-run, the frontmatter bytes are identical to the previous run's frontmatter bytes (SHA-256 equality on the prefix)

## Boundaries

**In scope:**
- New CLI entry-mode dispatch in `src/cli.ts` — argv parsing for `--init`, `--target`, `--dry-run`, `--force`, plus `--help`/`--version` standard flags
- New `src/init/` module: target registry, marker scanner, fingerprint hasher, atomic writer, EOL/BOM detector, dry-run reporter
- Built-in guide template (bundled, not loaded from disk at runtime)
- Marker version derived from `package.json` `version` field (`major.minor`) at build time
- Unit tests + integration tests covering all 14 requirements (per existing `test/` conventions)

**Out of scope:**
- `--uninstall` / block-removal subcommand — deferred to v1.2 (re-running with old version handles upgrade paths; users can manually delete blocks)
- Auto-detection of which agent files exist in the project — user explicitly chooses targets; no scanning heuristic
- Custom user templates (`--template <path>`) — only the built-in template ships in v1.1
- Interactive prompts of any kind — INIT-13 mandates non-interactive; `--force` is the sole override
- Updating REQUIREMENTS.md, README, or marker version on a `--patch` package release — only `major.minor` bumps drive re-injection
- MCP server runtime changes — `startServer()` and tool implementations are untouched by this phase
- Phase 8 polish items (POLISH-01/02/03 — markdown warnings, integration tests, true line numbers)

## Constraints

- **Zero new runtime dependencies.** Use only `node:fs/promises`, `node:path`, `node:os`, `node:crypto`. The published tarball footprint must not grow with extra npm packages.
- **ESM only, Node ≥ 20.** Matches existing `package.json` `engines`. Use top-level imports; no `require()`.
- **Stdout invariant.** No `--init` code path may write to `process.stdout`. This preserves the MCP stdio contract even if argv parsing is bypassed or misrouted.
- **Atomic on Windows.** `fs.rename` across drives raises `EXDEV` on Windows when the temp file lands on a different volume; the fallback `copyFile + unlink` path is mandatory.
- **CRLF on Windows fixtures.** Tests must include at least one CRLF+BOM fixture per write-path requirement; LF-only assumptions are forbidden.
- **Build-time version injection.** The marker `version=X.Y` value must be substituted at build time (e.g. via `tsup` `define` or generated `version.ts`) — not read from `package.json` at runtime (which is not packaged into the bundle's expected resolution path).

## Acceptance Criteria

- [ ] `node dist/cli.js --init` in an empty temp dir creates `./CLAUDE.md` with both marker tags and guide payload; exit code 0; stdout empty
- [ ] `node dist/cli.js` (no args) still completes the MCP `initialize` handshake (existing `test/mcp/smoke.spawn.test.ts` passes)
- [ ] `--target claude,codex,cursor,copilot` produces all four files at correct paths in a single run
- [ ] `--target foo` exits code 1 with stderr error and writes zero files
- [ ] Two consecutive `--init` runs produce SHA-256-identical bytes on run 2 for every target
- [ ] A marker block with `version=0.0` is replaced when the current build is `0.1`; bytes outside the block are byte-for-byte preserved
- [ ] Missing parent directories (`.cursor/rules/`, `.github/`) are auto-created
- [ ] A pre-existing target with no marker block has the guide appended after exactly one blank line; original prefix bytes unchanged
- [ ] A hand-edited block (fingerprint mismatch) triggers stderr warning + non-zero exit on plain `--init`; `--force` overwrites and revalidates
- [ ] An atomic-write failure injected between tmp-write and rename leaves the original file untouched and removes the tmp file
- [ ] A CRLF+BOM fixture, re-run twice, produces byte-identical output on run 2 (no LF leakage, no duplicate block)
- [ ] `--init --dry-run` prints `would …` lines to stderr and writes zero bytes (verified by `fs.readdir` after the run)
- [ ] All `--init` runs produce `stdout.length === 0`
- [ ] Init module source contains zero references to `stdin`, `readline`, or `isTTY`
- [ ] Emitted cursor file's YAML frontmatter parses with `description`, `alwaysApply: true`, `globs: ["**/*.tsx", "**/*.jsx"]`; frontmatter bytes preserved on re-run

## Ambiguity Report

| Dimension          | Score | Min   | Status | Notes                                                                 |
|--------------------|-------|-------|--------|-----------------------------------------------------------------------|
| Goal Clarity       | 0.90  | 0.75  | ✓      | One-sentence goal with 4 targets + 3 flags + zero-regression clause   |
| Boundary Clarity   | 0.95  | 0.70  | ✓      | Explicit out-of-scope: uninstall, autodetect, custom template, prompts |
| Constraint Clarity | 0.82  | 0.65  | ✓      | Zero new deps, Node 20+, stdout invariant, EXDEV fallback, CRLF rule  |
| Acceptance Criteria| 0.85  | 0.70  | ✓      | 15 pass/fail checkboxes, all byte-level or exit-code verifiable        |
| **Ambiguity**      | 0.11  | ≤0.20 | ✓      | Gate passed                                                           |

## Interview Log

| Round | Perspective     | Question summary                                                  | Decision locked                                                                  |
|-------|-----------------|-------------------------------------------------------------------|----------------------------------------------------------------------------------|
| 0     | (Pre-interview) | Initial assessment from ROADMAP + REQUIREMENTS                    | INIT-01..14 already falsifiable; ambiguity 0.17 — only boundary closure needed   |
| 1     | Boundary Keeper | Marker `version=X.Y` source?                                       | Derived from `package.json` `major.minor` at build time                          |
| 1     | Boundary Keeper | Out-of-scope items for Phase 7?                                    | Uninstall, agent-file autodetect, custom templates, interactive prompts — all OUT |

---

*Phase: 07-init-file-writer*
*Spec created: 2026-05-11*
*Next step: /gsd-discuss-phase 7 — implementation decisions (argv parser choice, template asset bundling, fingerprint comment placement, EOL/BOM detection algorithm)*
