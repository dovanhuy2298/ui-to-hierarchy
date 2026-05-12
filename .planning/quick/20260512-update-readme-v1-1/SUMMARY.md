---
slug: update-readme-v1-1
date: 2026-05-12
status: complete
---

# Summary — Update README for v1.1

## Changes

- `README.md` Status section: added v1.1 note (--init, markdown warnings, true line numbers).
- `README.md` new section `## Onboard your agent (\`--init\`)` between MCP Inspector and Tools, covering:
  - Default usage (writes `CLAUDE.md`, idempotent)
  - Target table (claude/codex/cursor/copilot → file paths)
  - Multi-target example
  - `--dry-run` and `--force` flags
  - CI-safety note

## Out of scope

- No Tools table changes — tool surface unchanged in v1.1.
- No version bump in README (handled by `package.json` / npm publish, not docs).
