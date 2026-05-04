# Phase 6: Hardening & Fixture Gates — Specification

**Created:** 2026-05-04
**Ambiguity score:** 0.17 (gate: ≤ 0.20)
**Requirements:** 7 locked

## Goal

v1 of `ui-to-hierarch` is provably correct on three realistic Next.js project shapes (shadcn-style barrels, nested layouts/route groups/parallel slots, pnpm monorepo), passes a Windows-local test gate with forward-slash path normalization, and is end-to-end verified by both a scripted MCP client test and a manual real-client (Claude Code + MCP Inspector) UAT — with measured p95 parse+query latency recorded as a perf note.

## Background

Phases 1–5 have produced: IR types + renderers (P1), MCP stdio shell with all four tool schemas (P2), parser core with Babel + alias/barrel resolution + style/render-flow extractors (P3), Next.js App Router adapter (P4 pending), and the `Analyzer` wiring all four tools end-to-end (P5).

Today's test surface only contains:
- One simple `test/fixtures/next-app-router/` (single layout + page).
- Four `test/fixtures/next-detect-*` fixtures used to exercise project detection.
- Phase-05-specific fixtures under `test/fixtures/phase-05/`.
- A single smoke spawn test (`test/mcp/smoke.spawn.test.ts`) reachable via `pnpm test:smoke`.

What does NOT exist yet:
- A shadcn-style barrel re-export fixture (deep `index.ts` chain hitting the resolver's barrel-chase).
- A fixture combining nested layouts + route groups + parallel slots in one tree.
- A pnpm monorepo fixture (multiple apps, `workspace:*` imports, root `tsconfig` extends).
- Any `.github/workflows/` directory — there is no CI of any kind.
- Any `test/perf/` directory or recorded latency baseline.
- A scripted MCP-client integration test that drives all four tools through stdio against a real fixture.
- A `06-UAT.md` checklist for the manual Claude Code + MCP Inspector session.

ARCH-04 is the sole v1 requirement that maps to this phase. Phase 6 is the last gate before v1 is shippable.

## Requirements

1. **Fixture: shadcn-style barrel project**: A hand-crafted fixture exercising deep barrel re-export resolution.
   - Current: No fixture re-exports through `index.ts` chains beyond what Phase 3 unit-tests cover in isolation.
   - Target: `test/fixtures/phase-06/shadcn-barrels/` — minimal Next.js App Router app where `app/page.tsx` imports `Button`/`Card` via `@/components/ui` (barrel) which re-exports from per-component files; cycle-safe; matches the shape of a real shadcn install (no `node_modules` needed).
   - Acceptance: `get_full_hierarchy("/")` returns nodes whose `file:line` resolves to the leaf component files (e.g. `components/ui/button.tsx`), not the barrel; `find_by_text` and `find_by_style` traverse through the barrel correctly.

2. **Fixture: nested layouts + route groups + parallel slots**: A hand-crafted fixture covering the App Router shapes Phase 4 promises.
   - Current: Existing `next-app-router` fixture has one layout + one page; no route groups, no parallel slots, no intercepting routes, no dynamic segments combined.
   - Target: `test/fixtures/phase-06/nested-routes/` — at least: nested `app/(group)/dashboard/[id]/@sidebar/page.tsx` + `@main/page.tsx` + group + non-group siblings, with `loading.tsx`, `error.tsx`, `not-found.tsx` siblings on at least one segment, and one private `_internal` folder that must be excluded.
   - Acceptance: `get_full_hierarchy("/dashboard/123")` returns the correct layout chain (root → group layout → dashboard layout), labels `@sidebar`/`@main` as named slots, includes `[id]` resolved param in metadata, and excludes the `_internal` folder.

3. **Fixture: pnpm monorepo**: A hand-crafted fixture covering monorepo resolution paths.
   - Current: No monorepo fixture exists. Project-root resolution (ARCH-03) is only tested against single-package shapes.
   - Target: `test/fixtures/phase-06/pnpm-monorepo/` containing `pnpm-workspace.yaml`, `apps/web/`, `apps/admin/`, and `packages/ui/` — with `apps/web/app/page.tsx` importing from `@acme/ui` (workspace protocol), `apps/web/tsconfig.json` extending a root `tsconfig.base.json` that defines `@/*` paths, and `apps/admin` as a second Next.js app sharing the same `packages/ui`.
   - Acceptance: Running each tool with `--root apps/web` returns nodes from `apps/web` only (not `apps/admin`); imports of `@acme/ui` resolve to `packages/ui/src/*` files (not the workspace package's barrel `index.ts` if a deeper file is the true source); root tsconfig `extends` is followed; running with `--root apps/admin` produces a different, non-overlapping tree.

4. **Scripted MCP client integration test**: A test that drives all four tools end-to-end through stdio.
   - Current: `test/mcp/smoke.spawn.test.ts` spawns the server but does not exercise tools against fixtures.
   - Target: `test/integration/mcp-e2e.test.ts` — uses `@modelcontextprotocol/sdk` Client with `StdioClientTransport`, spawns the built `dist/cli.js` once per fixture, and sequentially invokes `get_full_hierarchy`, `focus_on`, `find_by_text`, `find_by_style` against each of the three fixtures above; asserts non-error responses and stable shape (snapshot or schema-validated).
   - Acceptance: `pnpm test:integration` passes on a clean clone after `pnpm build`; suite contains 12 tool invocations (4 tools × 3 fixtures) all returning `isError: false`.

5. **Windows path normalization gate**: A test that fails if any returned `file` path contains a backslash.
   - Current: Forward-slash normalization is asserted ad-hoc in some unit tests; no global gate.
   - Target: Within the integration suite, every `file` field across every tool response across every fixture is asserted to match `/^[^\\]*$/`.
   - Acceptance: Test fails loudly with the offending tool/path if any backslash leaks; passes when invoked on Windows (`win32`) and POSIX hosts.

6. **Manual real-client UAT (Claude Code + MCP Inspector)**: A documented UAT session that exercises the published binary with a real client.
   - Current: No UAT artifact for phase 6 exists; no record of either tool being driven by a real client end-to-end.
   - Target: `06-UAT.md` checklist — for both MCP Inspector and Claude Code, walk through each of the four tools against the `nested-routes` fixture, attach session log/screenshot, and record results (PASS/FAIL + notes). The UAT also asserts stdout cleanliness (no JSON-RPC corruption) by inspecting the client's transcript.
   - Acceptance: `06-UAT.md` is filled in with PASS for all four tools on both clients, with at least one attached log/screenshot per client; bugs found are documented in a "Findings" section but NOT required to be fixed in this phase (deferred per scope decision).

7. **Perf note (p95 parse+query latency)**: Measured baseline recorded for v2 cache-decision input.
   - Current: No latency measurement exists.
   - Target: `test/perf/measure.ts` — runs all four tools 30 times against the `nested-routes` fixture (cold-start each invocation, no warm cache), records min/p50/p95/max wall-clock; emits `06-PERF.md` with a table per tool and the host info (OS, Node version, CPU). Not gated — a slow run does not fail the suite.
   - Acceptance: `06-PERF.md` exists with all four tools' p95 numbers and host metadata; the script is reproducible (re-running on the same machine yields p95 within ±20%).

## Boundaries

**In scope:**
- Three hand-crafted fixtures under `test/fixtures/phase-06/` (shadcn barrels, nested routes, pnpm monorepo) — no `pnpm install` of real packages required.
- Scripted MCP client integration test exercising 4 tools × 3 fixtures.
- Windows path normalization gate inside the integration suite.
- Manual UAT checklist (`06-UAT.md`) covering Claude Code + MCP Inspector against the nested-routes fixture.
- Perf measurement script + `06-PERF.md` baseline (informational only, no threshold).
- Local Windows test runbook (how to run `pnpm test` + `pnpm test:integration` on Windows; documented in `06-UAT.md` or a separate runbook section).
- Documenting bugs found into a Findings section of `06-UAT.md` and/or new GitHub issues.

**Out of scope:**
- **Fixing bugs uncovered by phase 6** — by explicit decision, hardening only documents and defers fixes. Critical fixes may be lifted to a follow-up phase if blocking, but are NOT part of phase 6's success criteria.
- **GitHub Actions / cloud CI** — explicitly deferred. Windows verification is local + scripted only; no `.github/workflows/` is added in this phase.
- **Real `pnpm install` in fixtures** — fixtures are hand-crafted to be deterministic and offline.
- **Cloning third-party real repos as fixtures** — rejected for reproducibility; all fixtures are hand-crafted in-tree.
- **Hard perf thresholds / perf-based test failures** — perf is measured and recorded; no budget is enforced (revisit in v2 cache decision).
- **Cache implementation** — explicitly deferred to v2; phase 6 only measures the pre-cache baseline.
- **HTTP/SSE transport verification** — v1 is stdio-only; out of scope.
- **Additional framework adapters (React Native, Vue, Svelte)** — v2.

## Constraints

- All fixtures must be deterministic and run offline (no network, no real `pnpm install`).
- All `file` fields in tool responses must use forward slashes regardless of host OS — enforced by the Windows path gate (R5).
- Integration test must spawn the built `dist/cli.js` (not `src/cli.ts`) — verifies the published artifact, including shebang and bundle behavior.
- Perf script must run cold (fresh process per invocation) — Phase 5 ARCH-02 forbids cross-call caching, so a warm-process measurement would mismeasure.
- UAT bugs are recorded but not fixed in-phase (per scope decision); critical-path bugs that would falsify earlier phase verifications must still be flagged loudly.

## Acceptance Criteria

- [ ] `test/fixtures/phase-06/shadcn-barrels/` exists and is exercised by the integration suite.
- [ ] `test/fixtures/phase-06/nested-routes/` exists with route groups, parallel slots (`@sidebar`/`@main`), dynamic segment, and a private `_internal` folder.
- [ ] `test/fixtures/phase-06/pnpm-monorepo/` exists with two apps, a shared `packages/ui`, root `tsconfig.base.json`, and `pnpm-workspace.yaml`.
- [ ] `pnpm test:integration` passes on a clean clone, exercising 4 tools × 3 fixtures = 12 invocations, all returning `isError: false`.
- [ ] No `file` field in any integration response contains a backslash (asserted by a regex check inside the suite).
- [ ] `06-UAT.md` records PASS for all four tools on both Claude Code and MCP Inspector, with at least one attached log/screenshot per client.
- [ ] `06-PERF.md` records p95 parse+query latency for all four tools against `nested-routes`, with host metadata.
- [ ] No `.github/workflows/` is introduced (CI deferred).
- [ ] Bugs uncovered in UAT are listed in `06-UAT.md` Findings section; none are required to be fixed for phase completion.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                                |
|--------------------|-------|------|--------|----------------------------------------------------------------------|
| Goal Clarity       | 0.85  | 0.75 | ✓      | Three fixtures + scripted + manual + perf — all named.               |
| Boundary Clarity   | 0.85  | 0.70 | ✓      | Bug-fixing, CI, real install, perf gate explicitly out of scope.     |
| Constraint Clarity | 0.80  | 0.65 | ✓      | Offline fixtures, forward-slash gate, dist/cli.js, cold perf locked. |
| Acceptance Criteria| 0.82  | 0.70 | ✓      | 9 pass/fail checkboxes, all falsifiable.                             |
| **Ambiguity**      | 0.17  | ≤0.20| ✓      | Gate passed in 2 rounds.                                             |

## Interview Log

| Round | Perspective     | Question summary                                       | Decision locked                                                              |
|-------|-----------------|--------------------------------------------------------|------------------------------------------------------------------------------|
| 1     | Researcher      | Bug found in fixtures — fix or defer?                  | Document only, defer fix (phase 6 is a gate, not a fix-it)                   |
| 1     | Boundary Keeper | What CI level is required? (no workflows exist today)  | Local Windows + script only; no GitHub Actions in this phase                 |
| 1     | Failure Analyst | How is real-client verification measured?              | Both: scripted MCP client test (regression) + manual UAT (UX, real client)   |
| 2     | Simplifier      | How realistic should fixtures be?                      | Hand-crafted minimal, offline (recommended) — deterministic, no `pnpm install`|
| 2     | Boundary Keeper | Should perf have a hard gate?                          | Measure + record only; no threshold (recommended) — informs v2 cache decision |
| 2     | Researcher      | What pnpm monorepo scenarios to cover?                 | All three: workspace:* import, root tsconfig extends, multi-app              |

---

*Phase: 06-hardening-fixture-gates*
*Spec created: 2026-05-04*
*Next step: /gsd-discuss-phase 6 — implementation decisions (test runner config, fixture file shapes, perf script details)*
