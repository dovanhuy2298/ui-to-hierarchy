---
phase: 2
slug: mcp-transport-shell
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.4 |
| **Config file** | `vitest.config.ts` (`test.include: ["test/**/*.test.ts"]`) |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test && pnpm lint && pnpm typecheck` |
| **Smoke run command** | `pnpm run test:smoke` (requires prior `pnpm build`) |
| **Estimated runtime** | ~5 seconds (unit), ~15 seconds (smoke) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test && pnpm lint && pnpm typecheck`
- **Before `/gsd-verify-work`:** Full suite + `pnpm run test:smoke` must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-??-01 | errors.ts | 1 | MCP-03 | unit | `pnpm test` | ❌ W0 | ⬜ pending |
| 02-??-02 | log.ts | 1 | MCP-04 | unit | `pnpm test` | ❌ W0 | ⬜ pending |
| 02-??-03 | tools/\*.ts schemas | 1 | MCP-02 | unit | `pnpm test` | ❌ W0 | ⬜ pending |
| 02-??-04 | server.ts wiring | 1 | MCP-01, MCP-02, MCP-03 | unit | `pnpm test` | ❌ W0 | ⬜ pending |
| 02-??-05 | cli.ts integration | 1 | MCP-01 | smoke | `pnpm run test:smoke` | ❌ W0 | ⬜ pending |
| 02-??-06 | biome.json noConsole | 1 | MCP-04 | lint | `pnpm lint` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/mcp/server.test.ts` — Tier 1 in-process InMemoryTransport tests for MCP-01, MCP-02, MCP-03
- [ ] `test/mcp/smoke.spawn.test.ts` — Tier 2 spawned binary smoke for MCP-01, MCP-04 (stdout JSON-RPC, stderr structured logs)
- [ ] `package.json` `test:smoke` script: `"test:smoke": "vitest run test/mcp/smoke.spawn.test.ts"`
- [ ] `biome.json` noConsole override block for `src/mcp/**` and `src/cli.ts`
- [ ] `package.json` devDep: `@modelcontextprotocol/inspector@^0.21.2`
- [ ] Verify `declare const __TOOL_VERSION__: string;` global declaration exists from Phase 1; add if missing

*Wave 0 must create all missing test stubs before task execution begins.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Claude Code connects and lists all four tools | MCP-01 (SC-5) | Requires live MCP client session | Add `{ command: 'node', args: ['dist/cli.js'] }` to Claude Code MCP config, run `/mcp`, verify all four tool names appear |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
