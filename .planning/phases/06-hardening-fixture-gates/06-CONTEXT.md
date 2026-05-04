# Phase 6: Hardening & Fixture Gates - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove v1 of `ui-to-hierarch` is correct on three realistic Next.js project shapes (shadcn-style barrels, nested layouts/route groups/parallel slots, pnpm monorepo), passes a Windows-local test gate with forward-slash path normalization, and is end-to-end verified by both a scripted MCP client integration test (4 tools × 3 fixtures) and a manual real-client UAT (Claude Code + MCP Inspector). Records p95 parse+query latency as an informational baseline for the v2 cache decision. WHAT is locked by `06-SPEC.md` (7 requirements). This phase is HOW-only. Bug-fixing, GitHub Actions / cloud CI, real `pnpm install`, and perf gates are explicitly out of scope.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**7 requirements are locked.** See `06-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `06-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- Three hand-crafted fixtures under `test/fixtures/phase-06/` (shadcn-barrels, nested-routes, pnpm-monorepo) — no `pnpm install` of real packages required
- Scripted MCP client integration test exercising 4 tools × 3 fixtures
- Windows path normalization gate inside the integration suite
- Manual UAT checklist (`06-UAT.md`) covering Claude Code + MCP Inspector against the nested-routes fixture
- Perf measurement script + `06-PERF.md` baseline (informational only, no threshold)
- Local Windows test runbook documented in `06-UAT.md` or a separate runbook section
- Documenting bugs found into a Findings section of `06-UAT.md` and/or new GitHub issues

**Out of scope (from SPEC.md):**
- Fixing bugs uncovered by phase 6 (document and defer; critical-path bugs flagged loudly but not fixed in-phase)
- GitHub Actions / cloud CI — Windows verification is local + scripted only; no `.github/workflows/` is added
- Real `pnpm install` in fixtures — fixtures are hand-crafted, deterministic, offline
- Cloning third-party real repos as fixtures — all fixtures hand-crafted in-tree
- Hard perf thresholds / perf-based test failures
- Cache implementation — explicitly deferred to v2
- HTTP/SSE transport verification — v1 is stdio-only
- Additional framework adapters (React Native, Vue, Svelte) — v2

</spec_lock>

<decisions>
## Implementation Decisions

### Integration suite shape

- **D-01:** **Per-fixture spawn strategy.** The integration suite spawns the built `dist/cli.js` once per fixture (3 spawns total) and reuses one `Client` + `StdioClientTransport` for the 4 tool invocations against that fixture. Trade-off: faster than spawn-per-call (12 spawns), but state is still isolated *between* fixtures so a hidden cross-fixture leak cannot mask itself. ARCH-02's "no cross-call cache" lock applies *within* a process; per-fixture spawn does not weaken the per-call cache assertion (R5 already covers that via the existing Phase 5 unit test, separate from integration).
- **D-02:** **Single integration test file** at `test/integration/mcp-e2e.test.ts` (matches SPEC R4 target path verbatim). Three top-level `describe` blocks (one per fixture) × four `it` blocks (one per tool) + one `describe` for the Windows path gate that re-traverses every captured response. New `pnpm test:integration` script in `package.json` runs only `test/integration/`. Unit and integration suites stay separately addressable (integration is opt-in / pre-publish, not part of `pnpm test` by default if the planner judges spawn time on Windows is heavy enough — this is a planner judgment).
- **D-03:** **Schema-validated + targeted invariants** for assertions. For each tool response: (a) parse through `EnvelopeSchema` (Phase 1 lock) — fails loudly on shape drift, (b) assert `isError === false`, (c) assert 1–2 fixture-specific invariants per tool (e.g., for shadcn fixture: `get_full_hierarchy("/")` must return at least one node whose `file` ends with `components/ui/button.tsx`, NOT `components/ui/index.ts`), (d) Windows path gate regex (`/^[^\\]*$/`) on every `file` field discovered by recursive walk of the parsed envelope. **No snapshots in the integration suite** — keeps tests resilient to fixture line-number tweaks; snapshot-style coverage already lives in Phase 5 unit tests. Markdown rendering is asserted only as "non-empty string" — content correctness is Phase 5's contract, not Phase 6's.
- **D-04:** **Build dependency = `beforeAll` guard, no auto-build.** The integration test's `beforeAll` mirrors `test/mcp/smoke.spawn.test.ts`: `existsSync(dist/cli.js)` + `statSync` mtime check vs `src/cli.ts`. Throws with `"Run 'pnpm build' before 'pnpm test:integration'"` if missing or stale. Script `test:integration` in `package.json` does NOT auto-run `pnpm build` (keeps dev iteration tight). CI / clean-clone reproducibility is documented in the runbook section of `06-UAT.md` as `pnpm install && pnpm build && pnpm test:integration`.

### pnpm-monorepo fixture shape

- **D-05:** **tsconfig-paths-only resolution** for the `@acme/ui` workspace import. `apps/web/tsconfig.json` and `apps/admin/tsconfig.json` each `extends: "../../tsconfig.base.json"`; `tsconfig.base.json` defines `paths: { "@acme/ui": ["packages/ui/src/index.ts"], "@acme/ui/*": ["packages/ui/src/*"] }`. **No fake `node_modules` folder.** Rationale: SPEC R3 acceptance only requires resolution to land on `packages/ui/src/*` files (deeper than the barrel) — tsconfig paths is sufficient and avoids Windows symlink/file-copy ambiguity. The resolver's existing `get-tsconfig` integration handles `extends` already (Phase 3 lock); this fixture verifies that path on a real two-level extends chain.
- **D-06:** **Real `pnpm-workspace.yaml` + minimal root `package.json`.** Commit a 3-line `pnpm-workspace.yaml` (`packages: ['apps/*', 'packages/*']`) and a root `package.json` (`{ "name": "monorepo-root", "private": true }`). Rationale: this both reflects how a real pnpm monorepo is shaped *and* gives `resolveRoot` (ARCH-03) a concrete `package.json` marker to prove root resolution behaves correctly when `--root apps/web` is invoked. Skipping these would weaken the fixture's signal.
- **D-07:** **Two apps with shared barrel + leaf shape.** `apps/web/app/page.tsx` renders `<Button label="Buy now"/>`. `apps/admin/app/page.tsx` renders `<Button label="Manage users"/>` plus an admin-only `<DataTable/>`. Both import from `@acme/ui`. `packages/ui/src/index.ts` re-exports `Button` (from `button.tsx`) and `DataTable` (from `datatable.tsx`) — barrel + per-component leaf files. Acceptance proven by: (a) `--root apps/web` returns `Button` resolved to `packages/ui/src/button.tsx` (NOT `index.ts`); (b) `--root apps/web` does NOT include `DataTable` anywhere; (c) `--root apps/admin` includes both and produces a non-overlapping tree.

### Perf cold-start methodology

- **D-08:** **Spawn `dist/cli.js` per invocation.** Perf script at `test/perf/measure.ts` runs 30 cold spawns × 4 tools = 120 child processes against the `nested-routes` fixture. Each spawn measures end-to-end wall-clock from `child_process.spawn` to JSON-RPC response complete (matches user-perceived latency, including stdio handshake). In-process Analyzer-only measurement was rejected because it would mismeasure what the SPEC's "informs v2 cache decision" goal actually cares about (the latency a real MCP client experiences). Slow runs (estimated 1–3 minutes total wall-clock on Windows) are acceptable — perf script is opt-in, not part of CI or `pnpm test`.
- **D-09:** **`pnpm perf` script writes `06-PERF.md` directly.** New `package.json` script: `"perf": "tsx test/perf/measure.ts"`. The script overwrites `.planning/phases/06-hardening-fixture-gates/06-PERF.md` with a markdown table per tool (min / p50 / p95 / max ms columns) plus a host-info section. The committed `06-PERF.md` IS the baseline; re-baselining = re-run + re-commit. No CI gating, no auto-fail on drift.
- **D-10:** **Host metadata = OS + Node + CPU model + cores + total RAM.** Captured via `process.platform`, `process.arch`, `process.version`, `os.cpus()[0].model`, `os.cpus().length`, `os.totalmem()`. **Hostname and username are NOT recorded** (privacy / repo cleanliness). Format: bullet list under a `## Host` heading at the top of `06-PERF.md`.
- **D-11:** **No automated reproducibility test.** SPEC R7 acceptance ("re-running yields p95 within ±20%") is documented in the perf section of the runbook as a manual sanity check, not an enforced test. Avoids flake risk for an informational artifact.

### UAT evidence + findings taxonomy

- **D-12:** **Evidence directory:** `.planning/phases/06-hardening-fixture-gates/uat-evidence/` — committed text-only transcripts (`.md` / `.txt`) for both Claude Code and MCP Inspector sessions, plus 1–2 PNG screenshots per client (avoid bloat; commit only the most informative shot). Path redaction rule: replace any absolute path containing the user's home directory with `<USER_HOME>` before commit. SPEC R6 acceptance ("at least one attached log/screenshot per client") is satisfied by the per-client transcript file alone; screenshots are bonus.
- **D-13:** **Findings table schema:** markdown table in a `## Findings` section of `06-UAT.md` with columns `ID | Severity | Tool | Repro | Defer/Block | Ref`. ID = `F-01`, `F-02`, … (sequential). Severity = `blocker` / `major` / `minor`. Tool = the affected tool name (or `transport` / `stdio`). Repro = ≤1-line minimal repro. Defer/Block = `defer` (default per SPEC) or `block`. Ref = link to a GitHub issue if filed, else `TBD`. Grep-able; counts directly into milestone close-out.
- **D-14:** **`block` flag applies ONLY when the bug falsifies a prior phase's verification.** Concrete examples: a tool returns `isError: true` on a fixture where Phase 5 unit tests pass (falsifies Phase 5 R8 no-throw); backslash leaks in `file` field where Phase 1 forward-slash discipline says it cannot (falsifies Phase 1 D-07). Anything else — including newly-discovered UX papercuts, slow but-correct paths, or deeper resolution gaps not covered by prior phase acceptance — gets `defer`. This keeps SPEC's "Out of scope: Fixing bugs uncovered by phase 6" honest while still giving the user a tripwire for genuine regressions.
- **D-15:** **UAT coverage = full grid.** Both Claude Code and MCP Inspector each exercise all four tools against the `nested-routes` fixture (8 PASS/FAIL checkboxes total). Matches SPEC R6 acceptance verbatim. The `06-UAT.md` template lays out the 2×4 grid as a checklist; transcripts demonstrate each checked box.

### Claude's Discretion

- **Windows path gate scope** — the regex `/^[^\\]*$/` clearly applies to every `file` field on every `TreeNode` recursively. Whether to also stringify the entire envelope and grep for backslashes (catching e.g. backslashes embedded in markdown content or warning strings) is the planner's call. Recommendation: do both — the cost is a single extra `JSON.stringify(envelope).match(/\\/)` per response, the upside is catching renderer bugs.
- **shadcn-barrels chain depth** — fixture defaults to 2 hops (`@/components/ui` → `@/components/ui/button` → `button.tsx`) which matches a real shadcn install. Planner may add a 3rd hop if cycle-detection coverage seems thin.
- **`_internal` folder content in nested-routes** — at minimum a real `app/(group)/_internal/page.tsx` with a `<div>private</div>` body so the negative assertion ("`_internal` is not present in the union tree") has something to exclude. Planner picks whether to add a sibling component file inside `_internal` for stronger negative coverage.
- **Test execution order / `vitest` projects** — whether to keep `pnpm test` running both unit + integration (slower default), or to leave integration as an explicit `pnpm test:integration` only (faster default; integration runs in CI proxy via runbook). Planner picks based on Windows spawn timing measured during plan-phase.
- **Per-test timeout** — Windows MCP spawn typically takes 300–500 ms; default test timeout (5s) should be enough but planner may extend per-test timeout to 30s for the integration suite to absorb cold-OS-cache outliers, especially if `pnpm test:integration` is intended to be runnable on a fresh boot.
- **Unit test for the Windows path gate itself** — planner may add a single negative unit test that constructs a `TreeNode` with a backslash `file` and asserts the gate's helper rejects it; ensures the gate is more than coincidentally green.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 6 requirements (locked)
- `.planning/phases/06-hardening-fixture-gates/06-SPEC.md` — Locked requirements (R1–R7) + boundaries + acceptance criteria. Read first.
- `.planning/REQUIREMENTS.md` §Architecture — ARCH-04 (the sole v1 requirement mapped to Phase 6).
- `.planning/PROJECT.md` — Non-negotiables (stdio, static-only, parse-on-demand, no-cache v1, npm `npx` distribution, Node ≥20).
- `.planning/ROADMAP.md` §Phase 6 — Goal + 4 success criteria.

### Existing test/MCP scaffolding (consume unchanged)
- `test/mcp/smoke.spawn.test.ts` — Reference pattern for `StdioClientTransport` + `Client` + spawned `dist/cli.js`. Phase 6's integration suite extends this pattern (per-fixture spawn instead of single shared spawn).
- `package.json` — `test:smoke` precedent; new `test:integration` and `perf` scripts go alongside without renaming existing ones.
- `tsup.config.ts` (and `dist/cli.js` it produces) — The published artifact under test. Integration suite must spawn `dist/cli.js`, not `src/cli.ts`.
- `vitest.config.*` — Existing vitest config; integration tests use the same runner. Reuse before adding a second config.

### Phase 1–5 contracts (must not regress)
- `src/ir/envelope.ts` — `EnvelopeSchema.parse(...)` is the integration suite's shape gate.
- `src/ir/schema.ts` — `TreeNode` 9-kind discriminated union; integration suite walks this recursively for the path gate.
- `src/core/paths.ts` — `toForwardSlash` is the existing forward-slash discipline. The Windows path gate proves it (does not replace it).
- `src/core/resolve-root.ts` — `resolveRoot(args.projectRoot)`; the pnpm-monorepo fixture proves this works against a real root `package.json` + `pnpm-workspace.yaml`.
- `src/core/Analyzer.ts` (Phase 5) — The orchestrator under test end-to-end.
- `src/adapters/next/NextJsAdapter.ts` (Phase 4) — Adapter under test for App Router shapes (nested layouts, route groups, parallel slots).
- `src/mcp/tools/{get-full-hierarchy,focus-on,find-by-text,find-by-style}.ts` (Phase 2 schemas + Phase 5 bodies) — All four exercised end-to-end.
- `src/mcp/errors.ts` — `withErrorBoundary` / `ToolResponse` shape; integration suite asserts `isError: false`.

### Prior phase decisions (carry forward)
- `.planning/phases/05-ir-queries-tool-wire-up/05-CONTEXT.md` — D-12 (style sidecar key), D-16/17 (kitchen-sink + micro-fixture pattern, real on-disk fixtures), D-19/20 (test layout precedent), D-21 (snapshot strategy — file vs inline). Phase 6 follows the same fixture-as-real-dirs convention.
- `.planning/phases/04-next-js-app-router-adapter/04-CONTEXT.md` — D-08 (forward-slash on every `file`), D-12 (no-throw extends to MCP boundary).
- `.planning/phases/03-parser-core-ast-resolution-extractors/03-CONTEXT.md` — D-02 (per-call astCache), D-11 (island rule), D-12 (no-throw).
- `.planning/phases/02-mcp-transport-shell/02-CONTEXT.md` — MCP-04 stdout/stderr discipline (the UAT must verify no stdout corruption on real clients).
- `.planning/phases/01-scaffolding-ir-foundation/01-CONTEXT.md` — Forward-slash convention; `dist/cli.js` shebang; markdown / JSON snapshot patterns.

### Research notes (still authoritative)
- `.planning/research/PITFALLS.md` §3.1–§3.4 — App Router routing semantics, `"use client"` propagation, default-export-only, route.ts exclusion. Apply when authoring the nested-routes fixture.
- `.planning/research/STACK.md` — Pinned versions and "no new runtime deps" constraint. Phase 6 adds NO runtime deps; perf script uses only `node:os`, `node:child_process`, `node:perf_hooks`.

### External docs (consult when authoring)
- [`@modelcontextprotocol/sdk` — Client / StdioClientTransport](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) — already in dev deps; Phase 6 only consumes existing API.
- [`@modelcontextprotocol/inspector` README](https://github.com/modelcontextprotocol/inspector) — UAT runbook references invocation `npx @modelcontextprotocol/inspector node dist/cli.js`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`test/mcp/smoke.spawn.test.ts`** — Single shared `Client` + `StdioClientTransport` pattern; stderr-piping; existence/build-staleness check in `beforeAll`. Phase 6's integration suite copies the spawn primitives (the `transport.stderr?.on('data', …)` plumbing, the `existsSync(dist/cli.js)` guard) and adapts to per-fixture spawn.
- **`EnvelopeSchema` (`src/ir/envelope.ts`)** — The shape gate; one `EnvelopeSchema.parse(response.content[0])` (or wherever the JSON envelope is carried) replaces ad-hoc shape assertions.
- **`TreeNode` walker pattern** — Phase 5 already needs to recurse `TreeNode` children for query primitives. The path gate's recursive `walk(node, fn)` lives in the integration test file (utility, not new src code) — single ~10-LOC helper.
- **`resolveRoot` (`src/core/resolve-root.ts`)** — Already accepts `--root` CLI arg; the pnpm-monorepo integration test proves it works on a real two-app monorepo by passing `apps/web` and `apps/admin` separately.
- **`toForwardSlash` (`src/core/paths.ts`)** — The discipline being verified. Path gate tests its observable effect.
- **`tsup.config.ts` shebang banner** — `dist/cli.js` is already executable post-build; the integration suite's `node dist/cli.js` invocation aligns with `tsup`'s output.

### Established Patterns

- **Real on-disk fixtures, never generated** — Phase 3, 4, 5 precedent. Phase 6 extends with `test/fixtures/phase-06/{shadcn-barrels,nested-routes,pnpm-monorepo}/`.
- **Tier 2 spawned-binary tests** (Phase 2) — `dist/cli.js` over stdio. Phase 6's integration suite is the maximal Tier 2 — every tool, every fixture.
- **Forward-slash discipline at IR boundary** (Phase 1 D-07, Phase 4 D-08) — Phase 6 verifies it externally rather than asserting it inline like the unit tests do.
- **Per-call lifecycle** (Phase 5 ARCH-02) — Each integration tool call = a fresh `Analyzer` server-side. Per-fixture spawn keeps the OS-level lifecycle clean across fixtures too.
- **No-throw envelope contract** (D-12) — The integration suite asserts `isError: false`; user-data errors must surface as warnings on the envelope, not as MCP errors.

### Integration Points

- **Integration suite → built CLI** — `child_process` via `StdioClientTransport`; spawns `node dist/cli.js`. No source-import path from tests to `src/`.
- **Integration suite → fixtures** — `--root` arg path resolution; the suite passes absolute paths (Windows-safe) to the fixture's `app/` root.
- **Integration suite → `EnvelopeSchema`** — Test file imports `EnvelopeSchema` from `src/ir/envelope.ts` (TypeScript-only test; no runtime import from src by the spawned process).
- **`06-PERF.md` → `06-SPEC.md` R7 acceptance** — File presence + filled p95 columns is a phase completion gate.
- **`06-UAT.md` → `06-SPEC.md` R6 acceptance** — Filled 2×4 PASS grid + `uat-evidence/` files is a phase completion gate.

### Constraints from existing code

- The integration suite must NOT import anything from `src/adapters/next/**` directly (island rule from Phase 3 D-11). Tests in `test/integration/` may import from `src/ir/` and `src/core/` for type/schema use only.
- All fixture `.tsx` files must be parsed correctly by Phase 3's parser; if a fixture exercises a syntax shape Phase 3 doesn't yet handle, that's a Phase-3 gap surfaced by Phase 6 — record as Finding, do not silently fix in Phase 6 (D-14).
- The `dist/cli.js` artifact is the published artifact; Phase 6 is the last gate before publishing. The integration suite implicitly verifies the bundle (shebang, ESM-only output, externals correctly excluded).
- No `node_modules/` directories should appear inside `test/fixtures/phase-06/**` — fixtures are resolution targets, not installable packages.

</code_context>

<specifics>
## Specific Ideas

- **Per-fixture spawn, single test file, beforeAll guard** — D-01 + D-02 + D-04 form the integration suite's shape; treat them as a single coupled decision.
- **Schema parse + targeted invariants, no snapshots in integration** — D-03; snapshots already cover Phase 5; integration suite tests structure + cross-fixture invariants only.
- **tsconfig-paths-only for `@acme/ui`, no fake `node_modules`** — D-05; the simplest fixture that satisfies SPEC R3 acceptance and avoids Windows-specific symlink/copy edge cases.
- **`--root apps/web` and `--root apps/admin` produce demonstrably non-overlapping trees** — D-07 acceptance is the centerpiece of the monorepo fixture.
- **Path gate = `EnvelopeSchema.parse` + recursive walk over `file` fields + full-envelope `JSON.stringify` regex** — defense in depth; the recursive walk catches `file` field leaks, the stringify catches everything else (warnings, markdown content). Cost is negligible.
- **Spawn-per-invocation perf script** — D-08; correctness over speed; informational baseline that matches user-perceived latency.
- **Findings table is the audit primitive** — D-13; not free-form prose, not JSON; counts directly into milestone close-out.
- **`block` flag = falsifies prior phase verification** — D-14; concrete, narrow, defensible against scope-creep pressure.

</specifics>

<deferred>
## Deferred Ideas

- **GitHub Actions / cloud CI** — explicit SPEC defer; revisit post-v1 once the hand-rolled Windows runbook proves stable.
- **Real `pnpm install` of fixture packages** — never; in-tree hand-crafted fixtures are the deterministic substrate. If a future bug requires real dependency resolution coverage, address with a focused mock or an opt-in slow integration tier — not by installing.
- **Hard perf thresholds / perf-based test failures** — v2 cache decision input; once a budget is defined, add a gating test then.
- **In-process Analyzer-only perf measurement** — rejected for v1 baseline (D-08); may be useful in v2 to attribute latency between transport and parse.
- **Fixing bugs uncovered by Phase 6** — out of scope per SPEC. `block`-flagged findings (D-14) are the only exception and trigger a follow-up phase.
- **Cross-call cache / persistent index** — ARCH-02 lock; v2 candidate, informed by `06-PERF.md` baseline.
- **Pages Router fixture** — v2.
- **Additional framework adapters (RN / Vue / Svelte)** — v2.

### Reviewed Todos (not folded)
None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-hardening-fixture-gates*
*Context gathered: 2026-05-04*
