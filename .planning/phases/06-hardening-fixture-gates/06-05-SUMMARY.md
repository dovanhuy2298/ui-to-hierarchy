---
phase: 06-hardening-fixture-gates
plan: 05
subsystem: test-infrastructure
tags: [perf, mcp-cold-spawn, baseline, R7]
requires:
  - 06-02 (nested-routes fixture)
  - dist/cli.js (built before run)
provides:
  - test/perf/measure.ts (cold-spawn perf script)
  - pnpm perf script
  - .planning/phases/06-hardening-fixture-gates/06-PERF.md (initial baseline)
affects:
  - package.json scripts
tech-stack:
  added: []
  patterns:
    - "Cold-spawn perf measurement (RESEARCH.md Pattern 2)"
    - "Hand-rolled nearest-rank percentile (single-call-site exception)"
key-files:
  created:
    - test/perf/measure.ts
    - .planning/phases/06-hardening-fixture-gates/06-PERF.md
  modified:
    - package.json
decisions:
  - "Followed D-08: end-to-end wall-clock from pre-transport-construct through callTool resolution; close cost excluded"
  - "Followed D-10: host metadata limited to platform/arch/Node/CPU/RAM; hostname/userInfo never read"
  - "Followed D-11: no automated reproducibility check; ±20% manual sanity only"
metrics:
  completed: 2026-05-05
  tasks: 2
  duration_minutes: 8
covers_spec_ids: [R7]
requirements: [ARCH-04]
---

# Phase 6 Plan 05: Cold-Spawn Perf Baseline Summary

Implemented an MCP cold-spawn perf measurement script that runs each of the four tools 30 times against the nested-routes fixture and writes an initial p95 baseline to `06-PERF.md`. Per SPEC R7 the script is informational only — no threshold, no test failure.

## What was built

- **`test/perf/measure.ts`** — Node/tsx script that spawns `dist/cli.js` per invocation via `StdioClientTransport`, performs the full MCP handshake plus a `callTool`, and brackets the lifecycle in `performance.now()` per D-08. Iterates 4 tools × 30 samples = 120 cold spawns sequentially. Computes min/p50/p95/max via a hand-rolled nearest-rank percentile helper (RESEARCH.md "Don't Hand-Roll" exception — single call site, avoids new dep).
- **`pnpm perf` script** — `tsx test/perf/measure.ts`, added alongside the existing `test:integration` entry; no dependency changes.
- **`06-PERF.md` baseline** — Generated on developer's primary machine (Windows 11, Node v24.13.0, i5-12500H × 16, 15.7 GB RAM). All four tools p95 land in the 470–570 ms range against the nested-routes fixture, dominated by Node spawn + MCP handshake cost (~400 ms floor visible in min column across all four tools).

## Privacy posture (T-06-07 mitigation)

Per D-10, host metadata emission is restricted to `process.platform`, `process.arch`, `process.version`, `os.cpus()[0].model`, `os.cpus().length`, and `os.totalmem()`. The script never invokes `os.hostname()` or `os.userInfo()`. The acceptance grep enforces this and was run during commit verification.

## Generated baseline (excerpt)

```
| Tool               | min   | p50   | p95   | max   |
| ------------------ | ----- | ----- | ----- | ----- |
| get_full_hierarchy | 399.5 | 430.8 | 568.3 | 590.8 |
| focus_on           | 412.5 | 434.5 | 501.1 | 561.0 |
| find_by_text       | 414.9 | 441.6 | 518.7 | 543.3 |
| find_by_style      | 420.0 | 435.2 | 472.7 | 597.2 |
```

Numbers are wall-clock milliseconds end-to-end, not server-side parse time. The ~400 ms floor reflects fixed cost per cold spawn (Node startup + MCP handshake) — exactly the data the v2 cache decision needs.

## Tasks executed

| Task | Name                                       | Commit  | Files                                                          |
| ---- | ------------------------------------------ | ------- | -------------------------------------------------------------- |
| 1    | Author test/perf/measure.ts                | 30a4e70 | test/perf/measure.ts                                           |
| 2    | Add perf script + run + commit baseline    | 706fee8 | package.json, .planning/phases/06-hardening-fixture-gates/06-PERF.md |

## Verification performed

- Acceptance grep checks (Task 1 inline node script) — passed: ≥2 `performance.now`, ≥1 `StdioClientTransport`, ≥1 `06-PERF.md`, ≥1 `nested-routes`, no `os.hostname`/`userInfo`, no `src/adapters` import, `const N = 30` exact, all 4 tool names present.
- Acceptance grep checks (Task 2 inline node script) — passed: `scripts.perf === "tsx test/perf/measure.ts"`, all required scripts intact (`dev`, `build`, `test`, `test:watch`, `test:smoke`, `test:integration`, `lint`, `typecheck`, `perf`), `06-PERF.md` exists with `## Host`, all 4 tool names, no privacy leaks.
- `pnpm build` — clean, `dist/cli.js` regenerated.
- `pnpm perf` — completed in ~2 minutes, 120 successful cold spawns, no `isError:true` returns. Wave 1 wire-up confirmed working end-to-end.

## Deviations from Plan

None — plan executed exactly as written. The optional Finding-seed fallback in Task 2 (stub-with-Finding-link if perf execution blocks) was not needed; all four tools returned successfully.

One environmental note: the worktree base did not have `node_modules/` populated, so `pnpm install` was run before `pnpm build`. This is expected for a fresh worktree and does not affect any committed artifact.

## TDD Gate Compliance

Plan is `type: execute` (not `type: tdd`); no RED/GREEN gate applies. Per-task `tdd="false"` flags honored.

## Self-Check: PASSED

- FOUND: `test/perf/measure.ts` (commit 30a4e70)
- FOUND: `.planning/phases/06-hardening-fixture-gates/06-PERF.md` (commit 706fee8)
- FOUND: `package.json` modification (commit 706fee8)
- FOUND: commit `30a4e70` in `git log --oneline`
- FOUND: commit `706fee8` in `git log --oneline`
- VERIFIED: no privacy leaks in `06-PERF.md` (grep `Hostname|hostname|Username|username|userInfo` returns 0)
- VERIFIED: all 4 tool rows present in `06-PERF.md`
