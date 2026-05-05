---
phase: 2
slug: mcp-transport-shell
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-21
approved: 2026-05-05
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

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Test File | Status |
|---------|------|------|-------------|-----------|-------------------|-----------|--------|
| 02-02-01 | errors.ts | 1 | MCP-03 | unit | `pnpm test test/mcp/server.test.ts` | `test/mcp/server.test.ts` (isError:true assertions across 4 tool handlers) | ✅ green |
| 02-02-02 | log.ts | 1 | MCP-04 | smoke + lint | `pnpm run test:smoke` & `pnpm lint` | `test/mcp/smoke.spawn.test.ts` (stderr JSON lines, stdout JSON-RPC integrity) + biome `noConsole:error` | ✅ green |
| 02-03-01 | tools/get-full-hierarchy.ts | 1 | MCP-02 | unit | `pnpm test test/mcp/server.test.ts` | `test/mcp/server.test.ts` (route regex schema rejection) | ✅ green |
| 02-03-02 | tools/focus-on.ts | 1 | MCP-02 | unit | `pnpm test test/mcp/server.test.ts` | `test/mcp/server.test.ts` (PascalCase regex + scope enum schema rejection) | ✅ green |
| 02-03-03 | tools/find-by-text.ts | 1 | MCP-02 | unit | `pnpm test test/mcp/server.test.ts` | `test/mcp/server.test.ts` (query field schema validation) | ✅ green |
| 02-03-04 | tools/find-by-style.ts | 1 | MCP-02 | unit | `pnpm test test/mcp/server.test.ts` | `test/mcp/server.test.ts` (class_or_prop field schema validation) | ✅ green |
| 02-04-01 | server.ts wiring | 1 | MCP-01, MCP-02, MCP-03 | unit | `pnpm test test/mcp/server.test.ts` | `test/mcp/server.test.ts` (createTestPair InMemoryTransport, 4 tools registered, isError contract) | ✅ green |
| 02-05-01 | cli.ts integration | 1 | MCP-01 | smoke | `pnpm run test:smoke` | `test/mcp/smoke.spawn.test.ts` (StdioClientTransport spawns dist/cli.js, enumerates 4 tools) | ✅ green |
| 02-05-02 | biome.json noConsole | 1 | MCP-04 | lint | `pnpm lint` | biome.json overrides for `src/mcp/**` + `src/cli.ts` (`noConsole: error`) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Sampling continuity:** No 3 consecutive tasks lack automated verify — every task above maps to either `pnpm test`, `pnpm run test:smoke`, or `pnpm lint`. ✅

**Test inventory totals:**
- `test/mcp/server.test.ts` — 16 Tier 1 in-process tests (MCP-01/02/03)
- `test/mcp/smoke.spawn.test.ts` — 5 Tier 2 spawned-binary tests (MCP-01/04)
- Full suite: 78/78 passing as of 2026-05-05

---

## Wave 0 Requirements

- [x] `test/mcp/server.test.ts` — Tier 1 in-process InMemoryTransport tests for MCP-01, MCP-02, MCP-03
- [x] `test/mcp/smoke.spawn.test.ts` — Tier 2 spawned binary smoke for MCP-01, MCP-04 (stdout JSON-RPC, stderr structured logs)
- [x] `package.json` `test:smoke` script: `"test:smoke": "vitest run test/mcp/smoke.spawn.test.ts"`
- [x] `biome.json` noConsole override block for `src/mcp/**` and `src/cli.ts`
- [x] `package.json` devDep: `@modelcontextprotocol/inspector@^0.21.2`
- [x] `declare const __TOOL_VERSION__: string;` global declaration present in `src/global.d.ts`

*Wave 0 complete — all stubs created and filled prior to task execution. Verified 2026-05-05.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Status |
|----------|-------------|------------|-------------------|--------|
| Claude Code connects and lists all four tools | MCP-01 (SC-5) | Requires live MCP client session | Add `{ command: 'node', args: ['dist/cli.js'] }` to Claude Code MCP config, run `/mcp`, verify all four tool names appear | ✅ CLOSED 2026-05-05 by Phase 6 UAT — evidence at `.planning/phases/06-hardening-fixture-gates/uat-evidence/claude-code-transcript.md` |
| MCP Inspector enumerates all four tools with typed schemas | MCP-01 (SC-1) | Requires live MCP Inspector UI | `npx @modelcontextprotocol/inspector node dist/cli.js`, connect, verify schemas | ✅ CLOSED 2026-05-05 by Phase 6 UAT — evidence at `.planning/phases/06-hardening-fixture-gates/uat-evidence/inspector-transcript.md` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-05

**Approval rationale:** Phase 2 is fully complete (02-VERIFICATION.md status=passed, 5/5 must-haves verified). All four requirements (MCP-01..MCP-04) map to executed automated tests: 16 Tier 1 unit tests + 5 Tier 2 smoke tests + biome `noConsole:error` lint gate. Behavioral spot-checks (pnpm test 78/78, pnpm run test:smoke 5/5, pnpm lint 0 issues, pnpm typecheck 0 errors, dist/cli.js shebang correct, 0 console.* matches in src/mcp/**) confirmed in 02-VERIFICATION.md. Manual-only items (SC-1 + SC-5) closed by Phase 6 UAT 8/8 PASS with operator-attested evidence.
