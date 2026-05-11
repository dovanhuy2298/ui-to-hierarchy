---
status: complete
phase: 07-init-file-writer
source:
  - 07-01-SUMMARY.md
  - 07-02-SUMMARY.md
  - 07-03-SUMMARY.md
  - 07-04-SUMMARY.md
  - 07-05-SUMMARY.md
started: 2026-05-11T00:00:00Z
updated: 2026-05-11T15:32:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: From a clean shell, build the project (pnpm build), then in a freshly-created empty directory run `node <repo>/dist/cli.js --init`. The CLI boots without errors, creates CLAUDE.md, prints `[init] create CLAUDE.md` on stderr, prints nothing on stdout, and exits 0.
result: pass
evidence: pnpm build → 93ms success. Fresh dir, `node dist/cli.js --init` → exit 0, stderr `[init] create CLAUDE.md`, stdout empty, CLAUDE.md present.

### 2. Default init creates CLAUDE.md
expected: In an empty dir, `node dist/cli.js --init` creates a single `CLAUDE.md` file containing the `<!-- ui-hierarchy-mcp:start ... -->` / `<!-- ui-hierarchy-mcp:end -->` marker block with the rendered guide between them. Exit 0. Stderr shows one `[init] create CLAUDE.md` line.
result: pass

### 3. Idempotency on re-run
expected: Running `--init` a second time leaves CLAUDE.md byte-identical (same SHA-256). Stderr shows `[init] noop CLAUDE.md`. Exit 0.
result: pass
evidence: SHA-256 unchanged; stderr `[init] noop CLAUDE.md`; exit 0.

### 4. All four targets
expected: `--init --target claude,codex,cursor,copilot` in an empty dir creates four files at canonical paths; cursor file starts with YAML frontmatter; four stderr `[init] create` lines; exit 0.
result: pass
evidence: Created CLAUDE.md, AGENTS.md, .cursor/rules/ui-hierarchy-mcp.mdc, .github/copilot-instructions.md. Cursor file starts with `---\ndescription:...\nalwaysApply: true\nglobs:...\n---`. Four `[init] create` lines on stderr. Exit 0.

### 5. Invalid target rejected
expected: `--init --target foo` exits 1, stderr mentions `foo` and lists valid target ids, writes no files.
result: pass
evidence: Exit 1. Stderr: `[init] error Unknown --target token(s): foo. Valid targets: claude, codex, cursor, copilot.` No files written.

### 6. Dry-run writes nothing
expected: `--init --dry-run --target claude,codex` in an empty dir prints two `[init] would create ...` stderr lines, leaves the directory empty, exits 0.
result: pass
evidence: Two `[init] would create` lines, 0 files in dir, exit 0.

### 7. Hand-edit guard + --force
expected: After `--init`, manually edit the body. Re-run → `[init] skip (hand-edit) CLAUDE.md`, file unchanged, exit 1. `--force` overwrites (`[init] update`, exit 0). Subsequent plain `--init` returns to `[init] noop`.
result: pass
evidence: After edit, plain re-run: exit 1, stderr `[init] skip (hand-edit) CLAUDE.md`, edited content preserved. `--force`: exit 0, stderr `[init] update CLAUDE.md`, "HACKED" replaced. Plain re-run: exit 0, stderr `[init] noop CLAUDE.md`.

### 8. MCP server regression (no args)
expected: Running with no args still starts the v1.0 MCP stdio server.
result: pass
evidence: `npx vitest run test/mcp/smoke.spawn.test.ts` — 5/5 passed in 993ms.

### 9. --help / --version
expected: Both print to stderr, stdout empty, exit 0.
result: pass
evidence: `--help` exit 0, usage text on stderr, stdout 0 bytes. `--version` exit 0, stderr `0.1.1`, stdout 0 bytes.

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
