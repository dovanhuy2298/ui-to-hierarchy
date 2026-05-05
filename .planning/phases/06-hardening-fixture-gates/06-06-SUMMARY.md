---
phase: 06-hardening-fixture-gates
plan: 06
subsystem: planning-artifacts
tags: [uat, template, manual, spec-r6]
requires: [04]
provides: ["06-UAT.md template", "PASS grid scaffold", "Findings table schema (D-13)", "Local Windows runbook"]
affects: ["Wave 4 operator (consumes this template via /gsd-uat)"]
tech-stack:
  added: []
  patterns: ["Empty-template-then-fill (operator workflow)"]
key-files:
  created:
    - .planning/phases/06-hardening-fixture-gates/06-UAT.md
  modified: []
decisions:
  - "Mode = manual (NOT automated like Phase 5) — Phase 6 UAT is human-driven per SPEC R6"
  - "Single empty Findings row (F-01) — operator adds more as needed; no pre-filled data"
  - "Runbook ordering follows test pyramid: unit -> integration -> smoke -> perf -> stdout probe -> manual UAT"
metrics:
  duration: ~5min
  completed: 2026-05-05
---

# Phase 6 Plan 06: UAT Template Summary

Authored `.planning/phases/06-hardening-fixture-gates/06-UAT.md` — an empty-template runbook that the Wave 4 operator will fill in by hand to produce SPEC R6 evidence (Claude Code × MCP Inspector × 4 tools against `nested-routes`).

## What Was Built

A single planning artifact (no code) — `06-UAT.md` — containing:

- **Frontmatter**: `status: pending`, `mode: manual`, blank `started`/`updated` (mirrors Phase 5 shape but flips mode).
- **Preamble**: 2-line statement of scope (SPEC R6, 2×4 grid per D-15, D-13/D-14 references).
- **Runbook (Local Windows)**: 11 numbered steps in pyramid order — `pnpm install` → `pnpm build` → `pnpm test` → `pnpm test:integration` → `pnpm test:smoke` → `pnpm perf` → stdout cleanliness probe (`node dist/cli.js < NUL`) → MCP Inspector exercise (4 tools, exact arg shapes given) → Claude Code exercise (`.mcp.json` shape given) → D-12 path redaction (`<USER_HOME>`) → fill PASS Grid + Findings.
- **PASS Grid (D-15)**: 4 tool rows × 2 client columns = 8 empty `[ ]` checkboxes.
- **Findings (D-13)**: Inline severity legend + D-14 block-flag policy (falsifies-prior-phase rule with two concrete examples — `isError:true` on R8 contract, backslash violating D-07). Empty header row + one empty `F-01` data row.
- **Evidence**: Bullet list pointing at `uat-evidence/inspector-transcript.md`, `uat-evidence/claude-code-transcript.md`, optional PNG screenshots, and the redaction reminder.
- **Sign-off**: 5-item checklist gating status flip to `complete`.

## Acceptance Criteria — All Pass

| Criterion | Status |
|-----------|--------|
| File exists at `.planning/phases/06-hardening-fixture-gates/06-UAT.md` | PASS |
| Frontmatter `status: pending` + `mode: manual` | PASS |
| Sections present: Runbook, PASS Grid, Findings, Evidence, Sign-off | PASS |
| 8 empty PASS-Grid checkboxes (4 tools × 2 clients) | PASS (verified 13 `[ ]` total — 8 grid + 5 sign-off) |
| Findings header schema `ID \| Severity \| Tool \| Repro \| Defer/Block \| Ref` | PASS |
| Single empty Findings row `F-01` (no pre-filled data) | PASS |
| Mentions `nested-routes` (D-15 fixture target) | PASS |
| Mentions `@modelcontextprotocol/inspector` | PASS |
| Mentions `node dist/cli.js < NUL` (Open Q4 stdout probe) | PASS |
| Mentions `<USER_HOME>` (D-12 redaction) | PASS |
| D-14 block-flag policy explanation present (uses word "falsifies") | PASS |
| Mentions `pnpm test:integration` and `pnpm perf` in runbook | PASS |

Automated verifier from plan executed and printed `ok`.

## Deviations from Plan

None — plan executed exactly as written. The plan's task description was prescriptive enough that the only judgement calls were minor wording (preamble phrasing, evidence bullet flow); no rules triggered.

## Threat Surface

T-06-08 (info-disclosure via leaked home paths) is mitigated as planned: D-12 redaction rule appears in runbook step 10 AND in the Sign-off checklist. No new threat surface introduced.

## Commit

- `fe776b0` — `docs(06-06): author 06-UAT.md template (PASS grid + Findings schema + runbook)`

## Self-Check: PASSED

- File exists: `.planning/phases/06-hardening-fixture-gates/06-UAT.md` — FOUND
- Commit `fe776b0` — FOUND
- Automated verifier from `<verify><automated>` block — `ok`
