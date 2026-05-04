# Phase 6: Hardening & Fixture Gates - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-04
**Phase:** 06-hardening-fixture-gates
**Areas discussed:** Integration suite shape, pnpm-monorepo offline shape, Perf cold-start methodology, UAT evidence + findings taxonomy

---

## Gray-area selection (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| Integration suite shape | Single shared spawn vs per-fixture vs per-call | ✓ |
| pnpm-monorepo offline shape | tsconfig paths only / fake node_modules / hybrid | ✓ |
| Perf cold-start methodology | Spawn per invocation vs in-process Analyzer | ✓ |
| UAT evidence + findings taxonomy | Storage location + Findings schema | ✓ |

---

## Integration suite shape

### Spawn strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Per-fixture spawn (Recommended) | 1 process per fixture, all 4 tool calls per fixture share one client (3 spawns total) | ✓ |
| Single shared spawn | 1 process for all 12 calls — fastest, but cross-fixture leaks could hide | |
| Per-call spawn (12 process) | Strictest — but Windows ~300–500 ms per spawn = ≥5s overhead | |
| You decide | Planner picks based on measured Windows spawn time | |

**User's choice:** Per-fixture spawn

### File layout

| Option | Description | Selected |
|--------|-------------|----------|
| `test/integration/mcp-e2e.test.ts` (Recommended) | Single file matching SPEC R4 path; 3 describes × 4 its + path-gate describe; new `pnpm test:integration` script | ✓ |
| `test/integration/{shadcn,nested,monorepo}.test.ts` (3 files) | Split per fixture | |
| Pin into `test/mcp/` | Mix unit + integration in same folder | |

**User's choice:** Single file `test/integration/mcp-e2e.test.ts`

### Assertion shape

| Option | Description | Selected |
|--------|-------------|----------|
| Schema-validated + targeted invariants (Recommended) | EnvelopeSchema.parse + isError===false + 1–2 fixture invariants + path-gate regex; no snapshots | ✓ |
| Snapshot per response | toMatchFileSnapshot for every (fixture, tool); high churn | |
| Hybrid: 1 snapshot baseline tool + schema for the rest | | |
| You decide | | |

**User's choice:** Schema-validated + targeted invariants

### Build dependency

| Option | Description | Selected |
|--------|-------------|----------|
| beforeAll guard + manual build (Recommended) | existsSync + mtime check; throws "Run pnpm build first" — matches smoke test pattern | ✓ |
| Auto-run `pnpm build && vitest` | Simpler for clean clone; slower dev loop | |
| vitest `globalSetup` triggers tsup if stale | Tighter but adds config layer | |

**User's choice:** beforeAll guard + manual build

---

## pnpm-monorepo offline shape

### Workspace resolution shape

| Option | Description | Selected |
|--------|-------------|----------|
| tsconfig paths only (Recommended) | `paths: { '@acme/ui': ['packages/ui/src/index.ts'], '@acme/ui/*': ['packages/ui/src/*'] }`; no node_modules | ✓ |
| Fake node_modules (real folder copies) | Realistic but duplicates source; resolve target points wrong place | |
| Hybrid: tsconfig paths + stub node_modules/@acme/ui/package.json | Adds priority test edge case | |
| You decide | | |

**User's choice:** tsconfig paths only

### Two-app differentiation

| Option | Description | Selected |
|--------|-------------|----------|
| Different page sets, shared `<Button/>` (Recommended) | web has Button only; admin has Button + DataTable; non-overlapping tree provable | ✓ |
| Identical apps (only names differ) | Cannot prove isolation | |
| Web deep (3-layout chain), admin shallow | Overlaps with nested-routes fixture | |

**User's choice:** Different page sets, shared `<Button/>`

### Workspace config files

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — minimal but present (Recommended) | 3-line pnpm-workspace.yaml + minimal root package.json | ✓ |
| Not needed | Skip them | |
| Only root tsconfig.base.json | Skip yaml + root package.json | |

**User's choice:** Yes — minimal but present

### packages/ui shape

| Option | Description | Selected |
|--------|-------------|----------|
| Barrel + leaf files (Recommended) | index.ts re-exports button.tsx + datatable.tsx; verifies barrel-chase to leaf | ✓ |
| Only barrel | Cannot exercise barrel-chase | |
| Only leaf, no barrel | Doesn't combine monorepo + barrel | |

**User's choice:** Barrel + leaf files

---

## Perf cold-start methodology

### Cold mode

| Option | Description | Selected |
|--------|-------------|----------|
| Spawn dist/cli.js per invocation (Recommended) | 30 × 4 = 120 spawns; measures end-to-end MCP RTT | ✓ |
| In-process Analyzer per call | Faster, low noise — but doesn't measure stdio handshake | |
| Hybrid: 1 spawn + 30 calls per tool | Violates "cold" intent (OS file cache + V8 cache warm) | |
| You decide | | |

**User's choice:** Spawn dist/cli.js per invocation

### Host metadata

| Option | Description | Selected |
|--------|-------------|----------|
| OS + Node + CPU model + cores (Recommended) | platform / version / cpus()[0].model / cpus().length / totalmem(); no hostname or username | ✓ |
| Minimum: OS + Node only | Insufficient for interpreting baseline | |
| Maximum: + arch + hostname + PNPM_VERSION + git sha | Privacy + churn concerns | |

**User's choice:** OS + Node + CPU model + cores

### Perf wire

| Option | Description | Selected |
|--------|-------------|----------|
| `pnpm perf` → 06-PERF.md commit (Recommended) | tsx test/perf/measure.ts; overwrites committed baseline | ✓ |
| `pnpm perf` → stdout only | Manual copy-paste required | |
| Auto-write + git status check (drift detection) | Over-engineered for v1 | |

**User's choice:** `pnpm perf` → 06-PERF.md commit

### Reproducibility test

| Option | Description | Selected |
|--------|-------------|----------|
| No — README note only (Recommended) | Note "±20% is normal"; no auto-test | ✓ |
| Auto-run twice, fail if drift > 20% | Flake risk for low-value gate | |
| Run twice, log warn but don't fail | Sanity check without block | |

**User's choice:** No — README note only

---

## UAT evidence + findings taxonomy

### Evidence storage

| Option | Description | Selected |
|--------|-------------|----------|
| `.planning/phases/06-.../uat-evidence/` — text-only commit (Recommended) | Folder with text transcripts + 1–2 PNG screenshots per client; redact local paths | ✓ |
| Transcripts text only, no screenshots | Minimal repo footprint | |
| External link (Notion/Drive) | Not versioned, anti-pattern for planning-driven repo | |
| Embed inline in 06-UAT.md | Mixes concerns | |

**User's choice:** `.planning/phases/06-.../uat-evidence/` — text-only commit

### Findings schema

| Option | Description | Selected |
|--------|-------------|----------|
| Table: ID \| Severity \| Tool \| Repro \| Defer/Block \| Ref (Recommended) | Markdown table; grep-able; counts directly | ✓ |
| Free-form prose per finding | Hard to audit | |
| JSON block | Over-engineered for v1 | |

**User's choice:** Table schema

### "Critical-path" definition

| Option | Description | Selected |
|--------|-------------|----------|
| Falsifies prior phase verification (Recommended) | Block iff bug breaks a Phase 1–5 acceptance; everything else defers | ✓ |
| Severity = blocker (subjective) | Scope-creep risk | |
| Stdout corruption or no-throw breach only | Too narrow | |
| You decide | | |

**User's choice:** Falsifies prior phase verification

### UAT coverage grid

| Option | Description | Selected |
|--------|-------------|----------|
| All 4 tools on both clients (Recommended) | 8-cell grid; matches SPEC R6 verbatim | ✓ |
| Inspector all, Claude Code spot-check 1 tool | Violates SPEC R6 | |
| Hybrid: Inspector all 4, Claude Code 2 widest | Violates SPEC R6 | |

**User's choice:** All 4 tools on both clients

---

## Closing question

| Option | Description | Selected |
|--------|-------------|----------|
| I'm ready for context | Write CONTEXT.md with locked decisions | ✓ |
| Explore more gray areas | Path gate scope, shadcn chain depth, _internal exclusion proof, scripts wiring, CI defer note | |

**User's choice:** I'm ready for context

---

## Claude's Discretion

- Windows path gate scope (recommendation: recursive walk on `file` fields PLUS full-envelope `JSON.stringify` regex)
- shadcn-barrels chain depth (default 2 hops)
- `_internal` folder content in nested-routes (at minimum a real `page.tsx`)
- Whether `pnpm test` runs both unit + integration or stays unit-only with separate `test:integration` (planner picks based on Windows spawn timing)
- Per-test timeout in integration suite (default 5s, may extend to 30s)
- Optional negative unit test for the Windows path gate helper itself

## Deferred Ideas

- GitHub Actions / cloud CI (SPEC defer; revisit post-v1)
- Real `pnpm install` of fixture packages (never; deterministic in-tree fixtures only)
- Hard perf thresholds (v2 cache decision input)
- In-process Analyzer-only perf measurement (v2 attribution analysis)
- Fixing bugs uncovered by Phase 6 (out of scope; only `block`-flagged findings trigger a follow-up phase)
- Cross-call cache / persistent index (ARCH-02 lock; v2 candidate)
- Pages Router fixture (v2)
- Additional framework adapters (RN / Vue / Svelte) — v2
