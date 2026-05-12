---
slug: update-readme-v1-1
date: 2026-05-12
status: in-progress
---

# Update README for v1.1 milestone

Reflect v1.1 (Phases 7–8) changes in `README.md`:

1. **`--init` agent onboarding** (Phase 7): add usage section with targets (claude/codex/cursor/copilot), `--target`, `--dry-run`, `--force` flags, idempotency note.
2. **Markdown warnings surface** (POLISH-01): note that `format: "markdown"` now emits warnings as an HTML-comment prefix.
3. **True declaration line numbers** (POLISH-03): note that resolved component nodes report actual source line, not `line: 1`.
4. Bump status from "v1.0" framing to mention v1.1 polish landed.

## Tasks

- [ ] Add `## Onboard your agent (`--init`)` section under `## Use with an MCP client`
- [ ] Update Status section to mention v1.1
- [ ] Lightly note polish improvements in a "What's new in v1.1" or fold into Status
- [ ] Commit
