---
phase: 6
slug: hardening-fixture-gates
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-05
approved: 2026-05-05
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> **Retroactive close-out:** Phase 06 executed and verified (06-VERIFICATION.md status=passed, 4/4 must-haves) before this gate was formalized. This document maps the as-built test inventory to ARCH-04 and the per-plan requirement set so the Nyquist gate can close.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `vitest.config.ts` (extends `testTimeout: 30_000` for `test/integration/`) |
| **Quick run command** | `pnpm test:integration` |
| **Full suite command** | `pnpm build && pnpm test && pnpm test:integration && pnpm test:smoke` |
| **Measured runtime** | `pnpm test:integration` → 1 file, 20 tests, 2.50s on win32 / Node v24.13.0 (per 06-VERIFICATION.md) |

**Pre-flight (REQUIRED):** `pnpm build` must produce `dist/cli.js`. The integration suite's `beforeAll` guard (`test/integration/mcp-e2e.test.ts:25-38`) throws `"Run 'pnpm build' before 'pnpm test:integration'"` if `dist/cli.js` is missing or older than `src/cli.ts` (D-04).

---

## Sampling Rate

- **After every task commit:** Run `pnpm test:integration` (whole integration suite — measured 2.50s on Windows).
- **After every plan wave:** Run `pnpm test && pnpm test:integration && pnpm test:smoke` (full project test surface).
- **Before `/gsd-verify-work`:** Full suite green + `06-UAT.md` PASS grid filled (8/8) + `06-PERF.md` populated + `uat-evidence/` non-empty.
- **Max feedback latency:** ~3 seconds (integration alone, measured).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01 | 06-01-PLAN | 0 | R1 (fixture) | T-06-01 | shadcn-style barrel chain fixture present (page → `@/components/ui` index → leaf `.tsx`) | infra | `node -e "process.exit(require('node:fs').existsSync('test/fixtures/phase-06/shadcn-barrels/tsconfig.json')?0:1)"` | ✅ | ✅ green |
| 06-02 | 06-02-PLAN | 0 | R2 (fixture) | T-06-02 | nested-routes fixture: route group + private folder + parallel slot + dynamic `[id]` + loading/error/not-found | infra | `node -e "process.exit(require('node:fs').existsSync('test/fixtures/phase-06/nested-routes/tsconfig.json')?0:1)"` | ✅ | ✅ green |
| 06-03 | 06-03-PLAN | 0 | R3 (fixture) | T-06-03 | pnpm-monorepo fixture: two apps + `packages/ui`, two-level `tsconfig` extends, `@acme/ui` aliases | infra | `node -e "process.exit(require('node:fs').existsSync('test/fixtures/phase-06/pnpm-monorepo/pnpm-workspace.yaml')?0:1)"` | ✅ | ✅ green |
| 06-04-a | 06-04-PLAN | 1 | R1 + ARCH-04 | T-06-04 | shadcn-barrels: `Button.file` resolves to `components/ui/button.tsx`, NOT `components/ui/index.ts` | integration | `pnpm test:integration -t "shadcn-barrels"` | ✅ | ✅ green |
| 06-04-b | 06-04-PLAN | 1 | R2 + ARCH-04 | T-06-04 | nested-routes: `@sidebar` slot reachable from `/dashboard/123`; `_internal` private folder excluded | integration | `pnpm test:integration -t "nested-routes"` | ✅ | ✅ green |
| 06-04-c | 06-04-PLAN | 1 | R3 + ARCH-04 + D-07 | T-06-04 | pnpm-monorepo apps/web ↔ apps/admin produce non-overlapping trees; `@acme/ui` resolves to leaf | integration | `pnpm test:integration -t "pnpm-monorepo"` | ✅ | ✅ green |
| 06-04-d | 06-04-PLAN | 1 | R4 (envelope schema) | T-06-04, T-06-08 | every `result.content[0].text` parses as JSON envelope and validates against `EnvelopeSchema`; `isError:false` on 16/16 tool calls | integration | `pnpm test:integration` | ✅ | ✅ green |
| 06-04-e | 06-04-PLAN | 1 | R5 (Windows path gate) | T-06-05 | per-`TreeNode.file` regex `/^[^\\]*$/` plus envelope-wide `JSON.stringify(env).match(/\\\\/)` defense-in-depth; 4/4 gate tests pass on win32 | integration | `pnpm test:integration -t "Windows path gate"` | ✅ | ✅ green |
| 06-05 | 06-05-PLAN | 2 | R7 (perf) | T-06-07 | `06-PERF.md` exists with min/p50/p95/max for all 4 tools + host metadata; cold-spawn methodology | out-of-band script | `pnpm perf` | ✅ | ✅ green |
| 06-06 | 06-06-PLAN | 2 | R6 (UAT template) | T-06-09 | `06-UAT.md` template with PASS grid + Findings table (D-13) + runbook | infra | `node -e "process.exit(require('node:fs').existsSync('.planning/phases/06-hardening-fixture-gates/06-UAT.md')?0:1)"` | ✅ | ✅ green |
| 06-07 | 06-07-PLAN | 3 | R6 (UAT execution) | T-06-10 | 8/8 PASS grid + Inspector + Claude Code transcripts + `envelopes.json` | manual UAT | manual (`pnpm build && npx @modelcontextprotocol/inspector node dist/cli.js` + Claude Code session) | ✅ | ✅ green |
| 06-08 | 06-08-PLAN | gap | D-15, R4 (format symmetry) | — | all 4 tools accept `format: markdown\|json` (gap closure: 12 prior JSON.parse failures eliminated) | integration | `pnpm test:integration` (passes only because format-symmetric envelopes parse successfully) | ✅ | ✅ green |
| 06-09 | 06-09-PLAN | gap | ARCH-04 (resolveModule wiring) | — | resolved component `file:line` reaches envelope (post-pass tree walker over import-binding map) | integration + snapshot | `pnpm test:integration -t "shadcn-barrels"` (Button leaf-resolution assertion) + `pnpm test test/core/__snapshots__/analyzer-dashboard-settings.md` | ✅ | ✅ green |
| 06-10 | 06-10-PLAN | gap | R4 (TreeNode.attributes) | — | optional `attributes` field on `TreeNode` (component/element); literal-string JSX props reach envelope; `findByText` matches attribute values | integration + unit | `pnpm test:integration` + `pnpm test src/ir` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Sampling continuity check:** No 3 consecutive tasks lack an automated verify. Tasks 06-04-a..06-04-e + 06-05 + 06-08..06-10 are all automated. The single manual gate (06-07) is the explicitly allowed Wave 3 UAT per SPEC R6, immediately preceded by automated 06-05/06-06 and followed by automated 06-08..06-10 gap-closures.

---

## Wave 0 Requirements (retroactively VERIFIED)

- [x] `test/integration/mcp-e2e.test.ts` — covers R1, R2, R3, R4, R5 (single file per D-02). 301 lines, 20 tests, 2.50s.
- [x] `test/perf/measure.ts` — covers R7 (perf script).
- [x] `test/fixtures/phase-06/shadcn-barrels/` — fixture tree (`app/`, `next.config.js`, `tsconfig.json`, `components/ui/{index.ts, button.tsx, card.tsx}`).
- [x] `test/fixtures/phase-06/nested-routes/` — fixture tree (root layout, route group, parallel `@sidebar` slot, dynamic `[id]`, private `_internal/` folder).
- [x] `test/fixtures/phase-06/pnpm-monorepo/` — fixture tree (`pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`, two apps + shared `packages/ui`).
- [x] `package.json` script: `"test:integration": "vitest run test/integration"`.
- [x] `package.json` script: `"perf": "tsx test/perf/measure.ts"`.
- [x] `.planning/phases/06-hardening-fixture-gates/06-UAT.md` template (PASS grid + Findings table per D-13 + runbook section).
- [x] `.planning/phases/06-hardening-fixture-gates/06-PERF.md` populated (4 tools × 30 samples each, p50/p95/min/max, host metadata).
- [x] `.planning/phases/06-hardening-fixture-gates/uat-evidence/` directory with `inspector-transcript.md`, `claude-code-transcript.md`, `envelopes.json`.
- [x] `vitest.config.ts` `testTimeout: 30_000` override for `test/integration/`.
- [x] Path-gate enforced inline within `mcp-e2e.test.ts` (no separate helper unit test needed; gate runs once per fixture).

*Framework install: none — Vitest already installed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions / Evidence |
|----------|-------------|------------|------------------------------|
| MCP Inspector walks each of the 4 tools without stdout corruption against `nested-routes` fixture | R6 | Inspector is a real GUI client; no scripted equivalent in v1 | Runbook in `06-UAT.md`: `pnpm build && npx @modelcontextprotocol/inspector node dist/cli.js`. Evidence: `uat-evidence/inspector-transcript.md`. **Status: PASS** (4/4 in 06-UAT grid). |
| Claude Code session calls each of the 4 tools end-to-end against `nested-routes` fixture | R6 | Real-client coverage of stdio + tool routing under a production AI agent | Runbook in `06-UAT.md`: configure Claude Code MCP entry pointing at `node dist/cli.js`, prompt agent to invoke each tool. Evidence: `uat-evidence/claude-code-transcript.md`, `uat-evidence/envelopes.json`. **Status: PASS** (4/4 in 06-UAT grid; F-01 defer-flagged on transcript-capture methodology, not a behavioral gap). |
| Perf reproducibility (±20% sanity check) | R7 (D-11) | Informational only; no enforced test (avoids flake) | Runbook step in `06-UAT.md`: re-run `pnpm perf` once, eyeball that p95 is within ±20% of committed baseline. **Status: PASS** (operator-attested in 06-UAT). |
| Stdout cleanliness probe (defense-in-depth per RESEARCH.md open Q3) | R6 | Cannot be expressed as a vitest assertion against a live client | Runbook step: `node dist/cli.js < /dev/null` (Unix) or `node dist/cli.js < NUL` (Windows) and confirm zero stdout bytes. **Status: PASS** (re-verified in 06-VERIFICATION.md → 0 bytes). |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or fall under the explicitly allowed Wave 3 manual UAT gate (06-07)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (06-07 is the only manual gate, sandwiched between automated 06-06 and 06-08)
- [x] Wave 0 covers all MISSING references (3 fixtures + integration test + perf script + UAT template + scripts)
- [x] No watch-mode flags (`vitest run` everywhere)
- [x] Feedback latency < 30s (measured: 2.50s for `pnpm test:integration`)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-05 — retroactive close-out backed by 06-VERIFICATION.md (status=passed, 4/4 must-haves), 06-UAT.md (8/8 PASS), 06-SECURITY.md (18 threats closed), 06-PERF.md (p95 recorded), `pnpm test:integration` 20/20 in 2.50s.
