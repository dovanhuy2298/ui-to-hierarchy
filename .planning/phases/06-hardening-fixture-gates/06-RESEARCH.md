# Phase 6: Hardening & Fixture Gates — Research

**Researched:** 2026-05-05
**Domain:** End-to-end MCP integration testing, hand-crafted Next.js fixtures, child_process perf timing, manual UAT runbook
**Confidence:** HIGH (codebase patterns + CONTEXT.md decisions are tightly constrained; only fixture authoring + perf script idioms required external lookup)

## Summary

Phase 6 is HOW-only — every architectural decision is locked in `06-CONTEXT.md` (D-01..D-15) and every requirement is locked in `06-SPEC.md` (R1..R7). The role of this research is to give the planner concrete, copy-pasteable patterns for the four mechanical pieces that aren't already nailed down by prior phases: (1) per-fixture spawn lifecycle in Vitest 4, (2) hand-crafted Next.js App Router fixture shapes for the three target scenarios (shadcn barrels, nested-routes, pnpm-monorepo), (3) cold-start perf timing via `child_process.spawn` + `node:perf_hooks`, and (4) the UAT evidence template for `06-UAT.md` + `06-PERF.md`.

The phase is **net-zero new runtime deps** — every mechanism reuses what is already in `package.json` (vitest 4, MCP SDK 1.29, tsx, tsup) and three Node built-ins (`node:os`, `node:child_process`, `node:perf_hooks`).

**Primary recommendation:** Mirror `test/mcp/smoke.spawn.test.ts` for the integration suite shape, add three top-level `describe` blocks (one per fixture) each with its own `beforeAll`/`afterAll` spawning a fresh `dist/cli.js`, and reuse `EnvelopeSchema.parse(...)` from `src/ir/envelope.ts` as the single shape gate. The planner's only meaningful authoring work is the fixture file content — everything else is a near-mechanical port.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ARCH-04 | Integration test suite with fixture Next.js projects (shadcn-style barrel re-exports, nested layouts, route groups, parallel slots, pnpm monorepo workspace, Windows path separators); MCP Inspector + one real client (Claude Code) end-to-end verified | Stack + Architecture sections cover spawn lifecycle, fixture shapes, path-gate regex, UAT evidence template; mapped 1:1 to SPEC R1–R7 |
</phase_requirements>

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Integration suite shape:**
- **D-01:** Per-fixture spawn (3 spawns total). One `Client` + `StdioClientTransport` per fixture, reused for the 4 tool invocations against that fixture.
- **D-02:** Single integration test file at `test/integration/mcp-e2e.test.ts`. Three top-level `describe` blocks (one per fixture) × four `it` blocks (one per tool) + one `describe` for the Windows path gate. New `pnpm test:integration` script in `package.json`.
- **D-03:** Schema-validated + targeted invariants for assertions. Per tool response: parse through `EnvelopeSchema`, assert `isError === false`, assert 1–2 fixture-specific invariants per tool, Windows path gate regex (`/^[^\\]*$/`) on every `file` field. **No snapshots in integration suite.** Markdown rendering asserted only as "non-empty string."
- **D-04:** Build dependency = `beforeAll` guard, no auto-build. `existsSync(dist/cli.js)` + mtime check vs `src/cli.ts`. Throws `"Run 'pnpm build' before 'pnpm test:integration'"` if missing/stale.

**pnpm-monorepo fixture shape:**
- **D-05:** tsconfig-paths-only resolution for `@acme/ui` workspace import. `apps/web/tsconfig.json` and `apps/admin/tsconfig.json` each `extends: "../../tsconfig.base.json"`; `tsconfig.base.json` defines `paths: { "@acme/ui": ["packages/ui/src/index.ts"], "@acme/ui/*": ["packages/ui/src/*"] }`. **No fake `node_modules` folder.**
- **D-06:** Real `pnpm-workspace.yaml` (`packages: ['apps/*', 'packages/*']`) + minimal root `package.json` (`{ "name": "monorepo-root", "private": true }`).
- **D-07:** Two apps with shared barrel + leaf shape. `apps/web/app/page.tsx` renders `<Button label="Buy now"/>`. `apps/admin/app/page.tsx` renders `<Button label="Manage users"/>` plus admin-only `<DataTable/>`. Both import from `@acme/ui`. Acceptance: `--root apps/web` resolves to `packages/ui/src/button.tsx` (NOT `index.ts`); `--root apps/web` excludes `DataTable`; `--root apps/admin` includes both with non-overlapping tree.

**Perf cold-start methodology:**
- **D-08:** Spawn `dist/cli.js` per invocation. Perf script at `test/perf/measure.ts` runs 30 cold spawns × 4 tools = 120 child processes against `nested-routes`. Wall-clock from `child_process.spawn` to JSON-RPC response complete.
- **D-09:** `pnpm perf` script writes `06-PERF.md` directly. Overwrites the file with markdown tables (min/p50/p95/max ms columns) per tool + host-info section. Committed `06-PERF.md` IS the baseline.
- **D-10:** Host metadata = OS + Node + CPU model + cores + total RAM. Captured via `process.platform`, `process.arch`, `process.version`, `os.cpus()[0].model`, `os.cpus().length`, `os.totalmem()`. **Hostname and username are NOT recorded.**
- **D-11:** No automated reproducibility test. ±20% sanity check is documented in runbook only.

**UAT evidence + findings taxonomy:**
- **D-12:** Evidence dir `.planning/phases/06-hardening-fixture-gates/uat-evidence/` — committed text-only transcripts (`.md`/`.txt`) for both clients + 1–2 PNG screenshots per client. Path redaction: replace any absolute path containing user's home dir with `<USER_HOME>` before commit.
- **D-13:** Findings table schema: `ID | Severity | Tool | Repro | Defer/Block | Ref`. ID = `F-01`, `F-02`. Severity = `blocker` / `major` / `minor`. Defer/Block = `defer` (default) or `block`.
- **D-14:** `block` flag applies ONLY when the bug falsifies a prior phase's verification. Examples: `isError: true` where Phase 5 unit tests pass; backslash leaks where Phase 1 forward-slash discipline says they cannot. Anything else gets `defer`.
- **D-15:** UAT coverage = full grid. Both Claude Code and MCP Inspector each exercise all four tools against `nested-routes` (8 PASS/FAIL checkboxes total).

### Claude's Discretion

- **Windows path gate scope** — recommended: do BOTH the recursive walk over `file` fields AND a `JSON.stringify(envelope).match(/\\/)` over the entire envelope (catches backslashes in markdown/warnings). Cost is negligible.
- **shadcn-barrels chain depth** — defaults to 2 hops (`@/components/ui` → `@/components/ui/button` → `button.tsx`); may add a 3rd hop for cycle-detection coverage.
- **`_internal` folder content in nested-routes** — at minimum a real `app/(group)/_internal/page.tsx` with `<div>private</div>`. Optional: sibling component file inside `_internal` for stronger negative coverage.
- **Test execution order / vitest projects** — keep `pnpm test` running unit only (faster default) and leave integration as explicit `pnpm test:integration`; OR include integration in `pnpm test`. Planner picks based on Windows spawn timing.
- **Per-test timeout** — Windows spawn 300–500 ms typical; default 5s should suffice but planner may extend to 30s for cold-OS-cache outliers.
- **Unit test for the path gate itself** — planner may add a single negative unit test that constructs a `TreeNode` with backslash `file` and asserts the helper rejects it.

### Deferred Ideas (OUT OF SCOPE)

- GitHub Actions / cloud CI — Windows verification is local + scripted only.
- Real `pnpm install` of fixture packages — never; in-tree hand-crafted fixtures only.
- Hard perf thresholds / perf-based test failures — informational only.
- In-process Analyzer-only perf measurement — rejected for v1 baseline.
- Fixing bugs uncovered by Phase 6 — `block`-flagged only triggers a follow-up phase.
- Cross-call cache / persistent index — ARCH-02 lock; v2.
- Pages Router fixture — v2.
- Additional framework adapters — v2.
- HTTP/SSE transport verification — v1 is stdio-only.
</user_constraints>

## Project Constraints (from CLAUDE.md)

The project's `CLAUDE.md` pins the entire stack. Phase 6 introduces NO new runtime deps and NO new dev deps:

| Constraint | Source | How Phase 6 honors it |
|------------|--------|-----------------------|
| Vitest `^4.3.6` | CLAUDE.md TL;DR + `package.json` (`^4.1.4` installed) | Reuse existing `vitest.config.ts`; integration suite is just additional `test/integration/*.test.ts` files matched by `include: ["test/**/*.test.ts"]` |
| MCP SDK `^1.29.0` | CLAUDE.md + `package.json` | `Client` + `StdioClientTransport` from `@modelcontextprotocol/sdk/client/index.js` and `@modelcontextprotocol/sdk/client/stdio.js` (already used by `smoke.spawn.test.ts`) |
| `tsx ^4.21.0` | CLAUDE.md + dev deps | Run `test/perf/measure.ts` via `tsx`, identical to `dev` script pattern |
| Node ≥20 | `engines.node` in `package.json` | Perf script uses `node:os`, `node:child_process`, `node:perf_hooks` — all stable in Node 20+ |
| ESM-only | `"type": "module"` | All new test files use `.js` import suffixes for relative imports of `src/**` (already established) |
| `tinyglobby ^0.2.16` | CLAUDE.md | NOT required for Phase 6 — fixtures are static dirs, perf script is fixed paths |
| Forward-slash discipline | `src/core/paths.ts` (`toForwardSlash`) | The Windows path gate verifies this at the IR boundary |
| stdout reserved for JSON-RPC | MCP-04 | Verified end-to-end by integration suite (any stdout corruption surfaces as a JSON parse error in the Client) |
| Island rule | Phase 3 D-11 (`adapters/` is an island) | Test code in `test/integration/` may import from `src/ir/` and `src/core/` for types/schemas only — NOT from `src/adapters/next/**` |
| GSD workflow | CLAUDE.md "GSD Workflow Enforcement" | Phase 6 is itself a GSD-managed phase; no bypass required |

## Architectural Responsibility Map

Phase 6 is a verification phase, not a feature phase — capabilities map to the **test tier**, not to runtime tiers. The relevant axis is "what verifies what":

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tool contract (4 tools × 3 fixtures) | Tier 2 (spawned binary integration test) | Tier 3 (real-client UAT) | Tier 2 = automated regression; Tier 3 = human-in-the-loop UX/transport sanity |
| Forward-slash path discipline | Tier 2 (regex gate inside integration suite) | Tier 1 (existing unit tests in `src/core/paths.test.ts`) | External observable assertion at the wire; unit test guards the implementation |
| Envelope shape stability | Tier 2 (`EnvelopeSchema.parse`) | Tier 1 (Phase 1/5 schema unit tests) | Phase 6 verifies that the *spawned binary* still produces a schema-valid envelope; unit tests verify the schema in isolation |
| `--root` resolution on monorepos | Tier 2 fixture (pnpm-monorepo) | Tier 1 (`src/core/resolve-root.ts` unit tests) | Two-app fixture proves resolveRoot doesn't accidentally cross app boundaries |
| Barrel re-export resolution | Tier 2 fixture (shadcn-barrels) | Tier 1 (Phase 3 resolver tests with `shadcn-barrel/` fixture) | Phase 3 already tests barrel chase in isolation; Phase 6 proves it survives end-to-end through the MCP wire |
| App Router routing edges | Tier 2 fixture (nested-routes) | Tier 1 (Phase 4 NextJsAdapter tests) | Phase 4 fixture is light; Phase 6 stresses route groups + parallel slots + dynamic segments + private folders together |
| Cold-start latency baseline | Out-of-band perf script (not a test) | — | Informational; no gate |
| Real-client UX (Claude Code, MCP Inspector) | Tier 3 (manual UAT) | — | Cannot be automated in v1; documented in `06-UAT.md` |

## Standard Stack

### Core (already installed — no new deps)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | `^1.29.0` | `Client` + `StdioClientTransport` for the integration suite | [VERIFIED: codebase, `package.json`] Already used by `test/mcp/smoke.spawn.test.ts`; SDK 1.29 ships the `Client` + `StdioClientTransport` API as documented in [MCP TypeScript SDK docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) |
| `vitest` | `^4.1.4` | Test runner for integration suite | [VERIFIED: codebase] Existing `vitest.config.ts` includes `test/**/*.test.ts` — picks up `test/integration/*.test.ts` automatically |
| `tsx` | `^4.21.0` | Runs `test/perf/measure.ts` directly | [VERIFIED: codebase] Already used by `dev` script |
| `zod` | `^4.1.4` | `EnvelopeSchema.parse()` shape gate | [VERIFIED: `src/ir/envelope.ts`] Phase 1 lock |
| Node built-ins (`node:child_process`, `node:os`, `node:perf_hooks`, `node:fs`, `node:path`, `node:url`) | Node ≥20 | Perf script timing, host metadata, fixture path resolution | [VERIFIED: Node 20 LTS] Stable APIs; `perf_hooks.performance.now()` is the canonical high-resolution monotonic clock |

### Supporting (already installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@modelcontextprotocol/inspector` | `^0.21.2` | Manual UAT session capture | [VERIFIED: dev deps] UAT runbook invokes `npx @modelcontextprotocol/inspector node dist/cli.js`; transcripts and screenshots committed to `uat-evidence/` |
| `tsup` | `^8.5.1` | Builds `dist/cli.js` consumed by integration suite | [VERIFIED: `tsup.config.ts`] Banner adds shebang; `external` excludes runtime deps. No tsup config changes needed for Phase 6 |

### Alternatives Considered

| Instead of | Could Use | Why Not (per CONTEXT.md) |
|------------|-----------|--------------------------|
| `EnvelopeSchema.parse` | Inline shape assertions | D-03 explicitly picks schema validation as the single shape gate |
| `child_process.spawn` for perf | In-process `Analyzer` calls | D-08 explicitly rejects in-process measurement (mismeasures user-perceived latency) |
| Vitest snapshots in integration | `toMatchFileSnapshot` | D-03 explicitly forbids snapshots in the integration suite — too brittle to fixture line-number tweaks |
| Vitest `projects` config | Single config + path-filtered scripts | Existing vitest config already supports `pnpm test:smoke` via path argument; the same pattern works for `test:integration` |

**Installation:** None required. Phase 6 adds NO new runtime deps and NO new dev deps.

**Version verification:**
- `@modelcontextprotocol/sdk@1.29.0` — [VERIFIED: codebase pinned in `package.json`]
- `vitest@4.1.4` — [VERIFIED: codebase pinned]; CLAUDE.md TL;DR notes `^4.3.6` as recommended floor; both share the same `Client`/`spawn` API surface used here
- All other versions match CLAUDE.md TL;DR table

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                  Phase 6: Hardening & Fixture Gates              │
└──────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────┐
  │  test/fixtures/phase-06/                                     │
  │  ├── shadcn-barrels/        (R1: barrel chain resolution)    │
  │  ├── nested-routes/         (R2: layouts + groups + slots)   │
  │  └── pnpm-monorepo/         (R3: two apps + shared package)  │
  └──────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                │                               │
                ▼                               ▼
  ┌─────────────────────────────┐   ┌──────────────────────────┐
  │ test/integration/           │   │ test/perf/measure.ts     │
  │ mcp-e2e.test.ts             │   │ (D-08: 30 × 4 = 120      │
  │  (R4: 4 tools × 3 fixtures) │   │  cold spawns of dist/cli)│
  │  (R5: path-gate regex)      │   │                          │
  └─────────────────────────────┘   └──────────────────────────┘
                │                               │
                │ pnpm test:integration         │ pnpm perf
                │                               │
                ▼                               ▼
  ┌─────────────────────────────┐   ┌──────────────────────────┐
  │ Spawn dist/cli.js (3×)      │   │ Spawn dist/cli.js (120×) │
  │ via StdioClientTransport    │   │ via raw child_process    │
  │ → 4 tool calls per spawn    │   │ → measure wall-clock     │
  │ → EnvelopeSchema.parse      │   │   per call               │
  │ → Windows path gate regex   │   │ → write 06-PERF.md       │
  └─────────────────────────────┘   └──────────────────────────┘
                │                               │
                ▼                               ▼
              PASS/FAIL                    06-PERF.md
                                          (baseline only)

  ┌──────────────────────────────────────────────────────────────┐
  │  Manual UAT (R6)                                             │
  │  ├── MCP Inspector → 4 tools × nested-routes                 │
  │  └── Claude Code   → 4 tools × nested-routes                 │
  │  → 06-UAT.md (PASS grid + Findings table)                    │
  │  → uat-evidence/ (transcripts + screenshots)                 │
  └──────────────────────────────────────────────────────────────┘
```

Data flow:
1. **Build phase** (out-of-band): `pnpm build` → `dist/cli.js` (verified by `beforeAll` guard, NOT auto-run).
2. **Integration suite** (automated): per-fixture spawn → 4 tool calls → schema parse + invariants → path gate → assert.
3. **Perf script** (out-of-band): cold spawn × 30 × 4 tools → median/p50/p95/max → overwrite `06-PERF.md`.
4. **Manual UAT** (human): Inspector + Claude Code → fill `06-UAT.md` checklist + commit evidence.

### Recommended Project Structure

```
test/
├── fixtures/
│   └── phase-06/
│       ├── shadcn-barrels/
│       │   ├── tsconfig.json                  # paths: { "@/*": ["./*"] }
│       │   ├── next.config.js                 # minimal, just for adapter detect
│       │   └── app/
│       │       ├── layout.tsx                 # root layout
│       │       ├── page.tsx                   # imports { Button, Card } from "@/components/ui"
│       │       └── components/ui/
│       │           ├── index.ts               # barrel: re-exports Button, Card
│       │           ├── button.tsx             # leaf
│       │           └── card.tsx               # leaf
│       ├── nested-routes/
│       │   ├── tsconfig.json
│       │   ├── next.config.js
│       │   └── app/
│       │       ├── layout.tsx                 # root
│       │       ├── (group)/
│       │       │   ├── layout.tsx             # group layout (no URL segment)
│       │       │   ├── _internal/page.tsx     # private — must be EXCLUDED
│       │       │   └── dashboard/
│       │       │       ├── layout.tsx
│       │       │       ├── loading.tsx        # sibling
│       │       │       ├── error.tsx          # sibling
│       │       │       ├── not-found.tsx      # sibling
│       │       │       └── [id]/
│       │       │           ├── @sidebar/page.tsx   # parallel slot
│       │       │           ├── @main/page.tsx      # parallel slot
│       │       │           └── page.tsx
│       └── pnpm-monorepo/
│           ├── pnpm-workspace.yaml            # packages: ['apps/*', 'packages/*']
│           ├── package.json                   # { "name": "monorepo-root", "private": true }
│           ├── tsconfig.base.json             # paths: @acme/ui + @acme/ui/*
│           ├── apps/
│           │   ├── web/
│           │   │   ├── tsconfig.json          # extends ../../tsconfig.base.json
│           │   │   ├── next.config.js
│           │   │   ├── package.json           # minimal
│           │   │   └── app/
│           │   │       ├── layout.tsx
│           │   │       └── page.tsx           # imports { Button } from "@acme/ui"
│           │   └── admin/
│           │       ├── tsconfig.json          # extends ../../tsconfig.base.json
│           │       ├── next.config.js
│           │       ├── package.json
│           │       └── app/
│           │           ├── layout.tsx
│           │           └── page.tsx           # imports { Button, DataTable } from "@acme/ui"
│           └── packages/
│               └── ui/
│                   ├── package.json           # { "name": "@acme/ui", "main": "./src/index.ts" }
│                   └── src/
│                       ├── index.ts           # barrel: export Button, DataTable
│                       ├── button.tsx
│                       └── datatable.tsx
├── integration/
│   └── mcp-e2e.test.ts                        # R4 + R5
└── perf/
    └── measure.ts                             # R7
```

`.planning/phases/06-hardening-fixture-gates/`:
```
06-SPEC.md
06-CONTEXT.md
06-RESEARCH.md            (this file)
06-PLAN-*.md              (planner output)
06-VALIDATION.md          (planner output, derived from § Validation Architecture below)
06-UAT.md                 (R6 + R5 runbook + Findings table)
06-PERF.md                (R7 — written by perf script)
uat-evidence/             (R6 — committed transcripts + screenshots)
```

### Pattern 1: Per-fixture spawn lifecycle (D-01, D-02, D-04)

**What:** Each `describe` block owns its own `Client` + `StdioClientTransport` + spawned `dist/cli.js`. The 4 tool calls inside a fixture share the spawn; cross-fixture state cannot leak.

**When to use:** The integration suite — three identical blocks, one per fixture.

**Example:** [CITED: pattern from `test/mcp/smoke.spawn.test.ts`]

```typescript
// test/integration/mcp-e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, statSync } from "node:fs";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { EnvelopeSchema } from "../../src/ir/envelope.js";
import type { TreeNode } from "../../src/ir/schema.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const distCli = resolve(__dirname, "../../dist/cli.js");
const fixturesRoot = resolve(__dirname, "../fixtures/phase-06");

// Build-staleness guard (D-04)
function assertFreshBuild() {
  if (!existsSync(distCli)) {
    throw new Error(
      `dist/cli.js not found at ${distCli}. Run 'pnpm build' before 'pnpm test:integration'.`,
    );
  }
  const distMtime = statSync(distCli).mtimeMs;
  const srcMtime = statSync(resolve(__dirname, "../../src/cli.ts")).mtimeMs;
  if (srcMtime > distMtime) {
    throw new Error(
      `dist/cli.js is older than src/cli.ts. Run 'pnpm build' before 'pnpm test:integration'.`,
    );
  }
}

function makeFixtureSuite(label: string, fixturePath: string, invariants: FixtureInvariants) {
  describe(label, () => {
    let client: Client;
    let transport: StdioClientTransport;
    const allEnvelopes: unknown[] = []; // captured for the path-gate describe block

    beforeAll(async () => {
      assertFreshBuild();
      transport = new StdioClientTransport({
        command: "node",
        args: [distCli],
        stderr: "pipe",
      });
      client = new Client({ name: "phase-06-integration", version: "0.0.0" });
      await client.connect(transport);
    }, 30_000); // 30s for cold-OS-cache outliers (CONTEXT.md discretion)

    afterAll(async () => {
      await client.close();
      await transport.close();
    }, 10_000);

    for (const tool of ["get_full_hierarchy", "focus_on", "find_by_text", "find_by_style"] as const) {
      it(`${tool} returns a schema-valid, isError:false envelope`, async () => {
        const args = invariants.argsFor(tool, fixturePath);
        const result = await client.callTool({ name: tool, arguments: args });
        expect(result.isError, `${tool} returned isError:true`).toBeFalsy();
        // Locate the envelope in result.content; depends on Phase 5 wire-up shape.
        const envelopeJson = invariants.extractEnvelope(result);
        const envelope = EnvelopeSchema.parse(envelopeJson);
        allEnvelopes.push(envelope);
        invariants.assert(tool, envelope);
      });
    }

    it("Windows path gate: every file field is forward-slash only", () => {
      for (const env of allEnvelopes) {
        walkTreeNodes((env as { tree: TreeNode }).tree, (node) => {
          expect(node.file, `backslash leak in ${node.file}`).toMatch(/^[^\\]*$/);
        });
        // Defense in depth (CONTEXT.md discretion):
        const stringified = JSON.stringify(env);
        expect(
          stringified.match(/\\\\/),
          "envelope contains backslash outside file fields (markdown / warnings?)",
        ).toBeNull();
      }
    });
  });
}

// Tiny TreeNode walker — single helper, not src code (CONTEXT.md "Established Patterns")
function walkTreeNodes(node: TreeNode, fn: (n: TreeNode) => void): void {
  fn(node);
  if ("children" in node && Array.isArray(node.children)) {
    for (const c of node.children) walkTreeNodes(c, fn);
  }
  if (node.kind === "branch") {
    if (node.thenBranch) walkTreeNodes(node.thenBranch, fn);
    if (node.elseBranch) walkTreeNodes(node.elseBranch, fn);
  }
  if (node.kind === "list") walkTreeNodes(node.item, fn);
}

makeFixtureSuite("shadcn-barrels", resolve(fixturesRoot, "shadcn-barrels"), shadcnInvariants);
makeFixtureSuite("nested-routes", resolve(fixturesRoot, "nested-routes"), nestedInvariants);
makeFixtureSuite("pnpm-monorepo/apps/web", resolve(fixturesRoot, "pnpm-monorepo/apps/web"), monorepoWebInvariants);
makeFixtureSuite("pnpm-monorepo/apps/admin", resolve(fixturesRoot, "pnpm-monorepo/apps/admin"), monorepoAdminInvariants);
```

> Source: `test/mcp/smoke.spawn.test.ts` (existing); MCP SDK [Client docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md). `[VERIFIED: codebase]`

> **Note for planner:** SPEC R4 says "spawns the built dist/cli.js once per fixture" — three fixtures. CONTEXT.md D-07 acceptance requires `--root apps/web` AND `--root apps/admin` against the *same* monorepo fixture, but those can share one spawn since `--root` is a per-call argument, not a server-startup argument. The example above splits them into two `makeFixtureSuite` calls for clarity; the planner may choose to combine them into a single `pnpm-monorepo` suite with 8 tool calls instead of 4 if spawn cost is a concern. Either is SPEC-compliant.

### Pattern 2: Cold-start perf measurement (D-08, D-09, D-10)

**What:** Spawn `node dist/cli.js` 30× for each of 4 tools, time each spawn from creation to JSON-RPC `tools/call` response, write min/p50/p95/max table.

**When to use:** `test/perf/measure.ts` invoked by `pnpm perf`. NOT part of CI / `pnpm test`.

**Example:** [CITED: `node:perf_hooks` docs, MCP SDK Client]

```typescript
// test/perf/measure.ts
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as os from "node:os";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const distCli = resolve(__dirname, "../../dist/cli.js");
const fixture = resolve(__dirname, "../fixtures/phase-06/nested-routes");

const TOOLS = [
  { name: "get_full_hierarchy", arguments: { route: "/dashboard/123", projectRoot: fixture } },
  { name: "focus_on", arguments: { component: "Dashboard", scope: "full", projectRoot: fixture } },
  { name: "find_by_text", arguments: { query: "Hello", projectRoot: fixture } },
  { name: "find_by_style", arguments: { class_or_prop: "flex", projectRoot: fixture } },
] as const;

const N = 30;

async function measureOnce(tool: (typeof TOOLS)[number]): Promise<number> {
  const t0 = performance.now();
  const transport = new StdioClientTransport({ command: "node", args: [distCli], stderr: "pipe" });
  const client = new Client({ name: "perf", version: "0.0.0" });
  await client.connect(transport);
  await client.callTool(tool);
  const elapsed = performance.now() - t0;
  await client.close();
  await transport.close();
  return elapsed;
}

function pct(sorted: number[], p: number): number {
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[i] ?? 0;
}

async function main() {
  const results: Record<string, number[]> = {};
  for (const tool of TOOLS) {
    const samples: number[] = [];
    for (let i = 0; i < N; i++) samples.push(await measureOnce(tool));
    samples.sort((a, b) => a - b);
    results[tool.name] = samples;
  }

  const lines: string[] = [];
  lines.push("# Phase 6 Performance Baseline");
  lines.push("");
  lines.push("**Generated:** " + new Date().toISOString());
  lines.push("**Methodology:** cold spawn of `dist/cli.js` per invocation, 30 samples per tool, end-to-end wall-clock from spawn to JSON-RPC response.");
  lines.push("");
  lines.push("## Host");
  lines.push(`- Platform: ${process.platform} (${process.arch})`);
  lines.push(`- Node: ${process.version}`);
  lines.push(`- CPU: ${os.cpus()[0]?.model ?? "unknown"} × ${os.cpus().length}`);
  lines.push(`- RAM: ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB`);
  lines.push("");
  lines.push("## Latency (ms)");
  lines.push("");
  lines.push("| Tool | min | p50 | p95 | max |");
  lines.push("|------|-----|-----|-----|-----|");
  for (const [name, samples] of Object.entries(results)) {
    const min = samples[0]!.toFixed(1);
    const p50 = pct(samples, 50).toFixed(1);
    const p95 = pct(samples, 95).toFixed(1);
    const max = samples[samples.length - 1]!.toFixed(1);
    lines.push(`| ${name} | ${min} | ${p50} | ${p95} | ${max} |`);
  }
  lines.push("");
  lines.push("> Reproducibility: re-running on the same machine should yield p95 within ±20% (manual sanity check, not enforced).");

  const out = resolve(__dirname, "../../.planning/phases/06-hardening-fixture-gates/06-PERF.md");
  writeFileSync(out, lines.join("\n") + "\n", "utf8");
  console.log(`Wrote ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

> Source: [Node.js `perf_hooks` docs](https://nodejs.org/api/perf_hooks.html), MCP SDK Client. `[VERIFIED: Node 20 LTS docs]`

> **Note:** `perf_hooks.performance.now()` is wall-clock-relative monotonic, immune to NTP jumps — correct for measuring user-perceived latency.

### Pattern 3: Fixture invariants object (D-03)

**What:** Each fixture has its own invariants module describing tool args + per-tool assertions. Keeps `mcp-e2e.test.ts` shape uniform across fixtures.

**Example sketch:**

```typescript
// test/integration/invariants/shadcn-barrels.ts
export const shadcnInvariants: FixtureInvariants = {
  argsFor: (tool, root) => {
    if (tool === "get_full_hierarchy") return { route: "/", projectRoot: root };
    if (tool === "focus_on") return { component: "Button", scope: "full", projectRoot: root };
    if (tool === "find_by_text") return { query: "Click me", projectRoot: root };
    return { class_or_prop: "flex", projectRoot: root };
  },
  extractEnvelope: (toolResponse) => { /* parse JSON from result.content[0].text */ },
  assert: (tool, envelope) => {
    if (tool === "get_full_hierarchy") {
      // R1 acceptance: barrel chase resolves to leaf, NOT index.ts
      const buttonNodes = collectByName(envelope.tree, "Button");
      expect(buttonNodes.length).toBeGreaterThan(0);
      for (const n of buttonNodes) {
        expect(n.file, "barrel leak").not.toMatch(/components\/ui\/index\.ts$/);
        expect(n.file).toMatch(/components\/ui\/button\.tsx$/);
      }
    }
    // ...other tool-specific invariants
  },
};
```

### Anti-Patterns to Avoid

- **Snapshots in the integration suite** — D-03 explicitly forbids; rationale: fixture line-numbers change for incidental reasons; snapshot brittleness undermines the gate's signal. Phase 5 already has snapshot coverage.
- **Auto-running `pnpm build` in `pnpm test:integration`** — D-04: keeps dev iteration tight; build staleness becomes a thrown `beforeAll` error, not a silent re-build.
- **Importing `src/adapters/next/**` from test code** — Phase 3 D-11 island rule. Tests in `test/integration/` may only import from `src/ir/` and `src/core/` for types/schemas.
- **Real `pnpm install` of fixture packages** — D-05 explicitly rejects. The `@acme/ui` import resolves via tsconfig paths only; no `node_modules` directory should appear under `test/fixtures/phase-06/**`.
- **Hand-rolling envelope shape assertions** — D-03: use `EnvelopeSchema.parse()`. One line, fails loudly on drift.
- **Recording hostname/username in `06-PERF.md`** — D-10 explicit privacy carve-out.
- **Committing absolute paths in `uat-evidence/`** — D-12: redact user home dir as `<USER_HOME>` before commit.
- **Treating SPEC R6 "PASS for all four tools" as auto-fixable** — D-14: bugs go to Findings table with `defer`; only `block` (= falsifies prior phase verification) gates phase completion.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Envelope shape validation | Hand-written `if (env.schemaVersion === "1" && …)` | `EnvelopeSchema.parse(env)` | Already exists; drift across all 24 fields would otherwise need updating in two places |
| MCP stdio handshake | Raw `child_process.spawn` + JSON-RPC framing | `Client` + `StdioClientTransport` from `@modelcontextprotocol/sdk` | SDK handles framing, init handshake, content extraction; `smoke.spawn.test.ts` is the precedent |
| Percentile math | Custom sort+index logic | A 6-line helper (`pct(sorted, p)`) IS the solution — hand-rolling here is correct because we have N=30 samples and `--save-dev`-ing `simple-statistics` would violate "no new deps" | (Exception: hand-roll IS correct here) |
| TSX fixture parsing | Test-side parser to validate fixtures parse | The integration suite IS the validation — if the fixture is malformed, the spawned binary surfaces an `error` node and the per-tool invariant fails loudly | |
| Spawn timing helper | Custom `Date.now()` + retry logic | `performance.now()` from `node:perf_hooks` | Monotonic; NTP-immune; sub-ms resolution |
| UAT evidence redaction | Auto-redaction script | Manual redaction at commit time | One-shot exercise; tooling cost > value for ≤ 4 transcripts |

**Key insight:** The `EnvelopeSchema` + `walkTreeNodes` + the MCP SDK `Client` together do 95% of the work. Phase 6's authoring is mostly fixture content + glue.

## Common Pitfalls

### Pitfall 1: Stale `dist/cli.js` masking real failures

- **What goes wrong:** Developer changes `src/Analyzer.ts`, runs `pnpm test:integration`, sees green — but tests passed against the previous build.
- **Why it happens:** No auto-build (D-04); easy to forget `pnpm build` between iterations.
- **How to avoid:** The mtime check in `assertFreshBuild()` (Pattern 1 above) throws when `src/cli.ts` is newer than `dist/cli.js`. Document this in the runbook section of `06-UAT.md`.
- **Warning signs:** Tests pass after a code change without rebuilding.
- **Note:** mtime check covers `src/cli.ts` only; if a developer touches `src/core/Analyzer.ts` without touching `src/cli.ts`, mtime check still catches because tsup re-bundles all entry-reachable files (`dist/cli.js` mtime updates on every build). This is sufficient.

### Pitfall 2: Backslash leaks in non-`file` envelope fields

- **What goes wrong:** Path gate regex on `node.file` is green, but markdown rendering or warning text contains `C:\path\to\thing` — agents on Windows then receive corrupt paths in the human-readable output.
- **Why it happens:** Phase 1 D-07 forward-slash discipline applies at the IR boundary; renderers might re-introduce native paths if they format error messages by interpolating raw paths.
- **How to avoid:** CONTEXT.md discretion item — do BOTH the recursive `file` check AND `JSON.stringify(envelope).match(/\\\\/)`. The stringify catches everything.
- **Warning signs:** path-gate test fails on Windows but passes on POSIX.

### Pitfall 3: pnpm-monorepo cross-app contamination

- **What goes wrong:** `--root apps/web` returns nodes from `apps/admin` because `resolveRoot` walks up to the monorepo root and discovers both apps.
- **Why it happens:** `resolveRoot` (Phase 1 ARCH-03) takes a `--root` argument verbatim — but a buggy `discoverEntries` in NextJsAdapter could glob `**/app/**/page.tsx` from too high a base.
- **How to avoid:** D-07 acceptance directly asserts non-overlap. Invariant: for `apps/web`, `find_by_text("Manage users")` (admin's button label) MUST return zero matches. Symmetric: for `apps/admin`, find a marker that exists only in `web`.
- **Warning signs:** `pnpm-monorepo/apps/web` invariants pass but trees contain admin paths.

### Pitfall 4: `EnvelopeSchema.parse` location mismatch

- **What goes wrong:** The MCP SDK `client.callTool()` returns `{ content: [{ type: "text", text: "..." }] }` — the envelope JSON is inside `result.content[0].text`, not `result` itself. Naive code calls `EnvelopeSchema.parse(result)` and gets a confusing failure.
- **Why it happens:** Phase 5 already established the convention (see `smoke.spawn.test.ts` line 99 onward); planner must thread it correctly into the integration suite.
- **How to avoid:** Use a small `extractEnvelope(toolResponse)` helper. Likely shape:
  ```typescript
  function extractEnvelope(r: { content: Array<{ type: string; text?: string }> }) {
    const text = r.content.find((c) => c.type === "text")?.text;
    if (!text) throw new Error("no text content in tool response");
    return JSON.parse(text);
  }
  ```
- **Warning signs:** All 12 tool calls fail with `EnvelopeSchema` parse errors mentioning `expected object, got array`.
- **Confirm with Phase 5:** Planner should grep `src/mcp/tools/*.ts` for the actual content-shape Phase 5 emits before authoring `extractEnvelope`. `[ASSUMED]` — Phase 5 likely emits JSON via `{ type: "text", text: JSON.stringify(envelope) }` based on standard MCP convention, but verify.

### Pitfall 5: Vitest test timeout shorter than Windows cold spawn

- **What goes wrong:** Default vitest test timeout is 5s; a cold-OS-cache `node dist/cli.js` spawn on Windows can take 1–2s; combined with the 4 tool calls, the whole `describe` block blows past 5s.
- **Why it happens:** `beforeAll` already has its own timeout, but per-`it` calls inherit the default.
- **How to avoid:** Per-test timeout 30s on the integration suite (CONTEXT.md discretion). Either set `testTimeout: 30_000` in `vitest.config.ts` for `test/integration/` only, or pass the timeout as a third arg to each `it(...)`.
- **Warning signs:** Sporadic fails on first cold-boot run; pass on warm run.

### Pitfall 6: Inspector/Claude Code stdout corruption invisible until UAT

- **What goes wrong:** A library banner or `console.log` slips into a server-side path; integration suite catches it (SDK throws on parse failure) but only AFTER the regression has shipped a build.
- **Why it happens:** Phase 2 MCP-04 already mandates `no-console` lint + smoke test, but Phase 6 is the last gate before publish.
- **How to avoid:** UAT runbook must include "before connecting Claude Code, run `node dist/cli.js < /dev/null` (POSIX) or equivalent on Windows and confirm zero stdout output before any client connects." Document in the runbook.
- **Warning signs:** Inspector reports `-32700 parse error` on connect.

## Code Examples

Verified patterns from official sources:

### Building the SDK Client + transport (current SDK 1.29 idiom)

```typescript
// Source: test/mcp/smoke.spawn.test.ts (existing codebase, MCP SDK 1.29)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: [distCli],
  stderr: "pipe",      // collect stderr separately
});
const client = new Client({ name: "phase-06-integration", version: "0.0.0" });
await client.connect(transport);   // spawns + handshakes

// Then:
const result = await client.callTool({
  name: "get_full_hierarchy",
  arguments: { route: "/", projectRoot: "/abs/path/to/fixture" },
});
expect(result.isError).toBeFalsy();

// Cleanup:
await client.close();
await transport.close();
```

> Note: SDK 1.29 deprecated `setRequestHandler`-style server code in favor of `registerTool`, but the **client** API (`Client.connect`, `Client.callTool`, `Client.close`) is unchanged from 1.x and matches the pattern already in `smoke.spawn.test.ts`. `[VERIFIED: codebase + npm registry]`

### Fixture: shadcn barrel chain (R1 minimum-viable shape)

```tsx
// test/fixtures/phase-06/shadcn-barrels/app/page.tsx
import { Button, Card } from "@/components/ui";

export default function Home() {
  return (
    <Card>
      <Button>Click me</Button>
    </Card>
  );
}
```

```typescript
// test/fixtures/phase-06/shadcn-barrels/app/components/ui/index.ts
export { Button } from "./button";
export { Card } from "./card";
```

```tsx
// test/fixtures/phase-06/shadcn-barrels/app/components/ui/button.tsx
export function Button({ children }: { children: React.ReactNode }) {
  return <button className="flex items-center">{children}</button>;
}
```

```json
// test/fixtures/phase-06/shadcn-barrels/tsconfig.json
{
  "compilerOptions": {
    "jsx": "preserve",
    "module": "esnext",
    "moduleResolution": "bundler",
    "target": "es2022",
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] }
  }
}
```

> Source: pattern lifted from existing `test/fixtures/parser/resolver/shadcn-barrel/` (Phase 3 fixture); extended with Next.js `app/` shape. `[VERIFIED: codebase]`

### Fixture: pnpm-monorepo extends-chain (D-05 + D-06)

```yaml
# test/fixtures/phase-06/pnpm-monorepo/pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

```json
// test/fixtures/phase-06/pnpm-monorepo/package.json
{ "name": "monorepo-root", "private": true }
```

```json
// test/fixtures/phase-06/pnpm-monorepo/tsconfig.base.json
{
  "compilerOptions": {
    "jsx": "preserve",
    "module": "esnext",
    "moduleResolution": "bundler",
    "target": "es2022",
    "baseUrl": ".",
    "paths": {
      "@acme/ui": ["packages/ui/src/index.ts"],
      "@acme/ui/*": ["packages/ui/src/*"]
    }
  }
}
```

```json
// test/fixtures/phase-06/pnpm-monorepo/apps/web/tsconfig.json
{ "extends": "../../tsconfig.base.json" }
```

> Source: pattern lifted from existing `test/fixtures/parser/resolver/extends-chain/` (Phase 3); extended to a real two-app monorepo. `get-tsconfig` handles two-level `extends` chains transparently per [`get-tsconfig` README](https://github.com/privatenumber/get-tsconfig#features). `[VERIFIED: codebase + Phase 3 contract]`

### Fixture: nested-routes minimum shape (R2)

```tsx
// test/fixtures/phase-06/nested-routes/app/(group)/dashboard/[id]/page.tsx
export default function Page({ params }: { params: { id: string } }) {
  return <main>Dashboard {params.id}</main>;
}
```

```tsx
// test/fixtures/phase-06/nested-routes/app/(group)/dashboard/[id]/@sidebar/page.tsx
export default function Sidebar() {
  return <aside className="flex flex-col">Sidebar</aside>;
}
```

```tsx
// test/fixtures/phase-06/nested-routes/app/(group)/_internal/page.tsx
export default function PrivateScratch() {
  return <div>private</div>;  // MUST NOT appear in the union tree
}
```

> Source: route conventions from [Next.js Route Groups](https://nextjs.org/docs/app/building-your-application/routing/route-groups) and [Parallel Routes](https://nextjs.org/docs/app/building-your-application/routing/parallel-routes); existing `test/fixtures/next-app-router/` for layout/page shapes. `[CITED: Next.js docs]`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MCP SDK pre-1.0 (`Server` + `setRequestHandler`) | SDK 1.x (`McpServer` + `registerTool`) — **server-side only** | mid-2025 | Phase 2 already migrated. Phase 6 only consumes Client API which is unchanged |
| Vitest 1.x snapshots | Vitest 4 with `toMatchFileSnapshot` / `toMatchInlineSnapshot` | 2025 | Phase 5 uses these; Phase 6 deliberately does NOT (D-03) |
| Manual JSON-RPC framing for spawned servers | `StdioClientTransport` from MCP SDK | 2024 | Phase 6 adopts via `smoke.spawn.test.ts` precedent |
| `tsconfig-paths` runtime hook | `get-tsconfig` static resolver | 2024 | Phase 3 already uses `get-tsconfig`; Phase 6 fixtures rely on this for monorepo extends-chain |
| In-process Analyzer perf measurement | Cold-spawn end-to-end measurement (D-08) | this phase | More accurately reflects user-perceived latency for the v2 cache decision |

**Deprecated/outdated:**
- `Server` class from `@modelcontextprotocol/sdk/server/index.js` — superseded by `McpServer`. Server-side concern only; not relevant to Phase 6 (we're a client of the spawned binary).
- Snapshot-driven integration tests for tree output — superseded by schema parse + targeted invariants per D-03.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 5 emits the envelope JSON as `{ type: "text", text: JSON.stringify(envelope) }` inside `result.content` | Pitfall 4 | Low — this is the standard MCP convention and `smoke.spawn.test.ts` line 117–119 already asserts `Array.isArray(result.content) && result.content.length > 0`. Planner should grep `src/mcp/tools/*.ts` to confirm the exact wrapper shape and adjust the `extractEnvelope` helper accordingly. |
| A2 | `tsup` rebuilds `dist/cli.js` mtime on every build, so a single `dist/cli.js` mtime check covers source changes anywhere in the entry-reachable graph | Pitfall 1 | Low — `tsup` with `clean: true` always re-emits; verified in `tsup.config.ts`. |
| A3 | Vitest 4.1 supports the same per-test timeout signature as 4.3 (`it(name, fn, timeoutMs)`) | Pitfall 5 | Low — this signature has been stable since vitest 0.x; CLAUDE.md TL;DR pins 4.3.6 but installed is 4.1.4, both share the API. |
| A4 | Inspector's `npx @modelcontextprotocol/inspector node dist/cli.js` invocation captures session transcripts in a file the user can paste into `uat-evidence/` | UAT runbook | Medium — Inspector's transcript-export UX may require a manual copy-paste from its UI, OR it may have a built-in export. Planner / UAT runbook author should verify against [Inspector README](https://github.com/modelcontextprotocol/inspector) at UAT time. If the only available path is screenshot + manual transcript copy, that still satisfies SPEC R6 ("at least one attached log/screenshot per client"). |
| A5 | `apps/web/package.json` and `apps/admin/package.json` (with `"name": "@acme/web"` etc.) are not strictly required for the fixture to work — `pnpm-workspace.yaml` + tsconfig paths suffice | Project Structure | Low — but recommended to add minimal `package.json` files for realism (`{ "name": "@acme/web", "private": true }`) since they cost nothing and `resolveRoot` may use them as marker files. |

## Open Questions

1. **Does `pnpm test` run integration by default, or is it explicit-only?**
   - What we know: D-02 leaves this as planner judgment.
   - What's unclear: Windows spawn timing on the target hardware; if 3 spawns add 5–10s, including in `pnpm test` slows every run.
   - Recommendation: Default to **explicit-only** (`pnpm test:integration`). Document in runbook that pre-publish workflow is `pnpm test && pnpm test:integration && pnpm test:smoke`. Re-evaluate if Windows spawn turns out to be < 1s/spawn.

2. **Should the path-gate test be a separate `describe` or inline per-fixture?**
   - What we know: D-02 says "one `describe` for the Windows path gate that re-traverses every captured response."
   - What's unclear: Whether captured envelopes survive across `describe` blocks in vitest (they do, via module-scope state, but it's fragile).
   - Recommendation: Inline per-fixture as shown in Pattern 1's example (`it("Windows path gate: …")` at the end of each `makeFixtureSuite`). Simpler, no cross-describe state, identical coverage.

3. **Where does `06-PERF.md` get its initial commit?**
   - What we know: D-09 — perf script writes the file directly.
   - What's unclear: First-time generation requires running `pnpm perf` on the target machine; this is by definition non-deterministic per machine.
   - Recommendation: Phase 6 plan should include a "run `pnpm perf` once on developer's primary Windows machine" task; commit the result. Document re-baselining ritual in `06-UAT.md` runbook.

4. **Is there a way to detect stdout corruption in `06-UAT.md` automatically?**
   - What we know: SPEC R6 includes "asserts stdout cleanliness (no JSON-RPC corruption) by inspecting the client's transcript."
   - What's unclear: The UAT operator may not visually distinguish a clean transcript from a corrupt one if Claude Code silently retries.
   - Recommendation: UAT runbook step "before clicking 'Connect' in Inspector, run `node dist/cli.js < NUL` (Windows) / `node dist/cli.js < /dev/null` (POSIX) and confirm zero stdout bytes before EOF." This is a positive smoke test for stdout discipline that costs nothing.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All scripts + tests | ✓ (assumed) | ≥20 | None — hard requirement per `engines.node` |
| pnpm | `pnpm test:integration`, `pnpm perf` | ✓ (assumed) | any recent | npm/yarn equivalents work; runbook should mention |
| `dist/cli.js` (built artifact) | Integration suite + perf script | ✗ at clean clone | — | `pnpm build` step in runbook |
| `@modelcontextprotocol/inspector` | UAT (R6) | ✓ | `^0.21.2` (dev dep) | None — required for SPEC R6 |
| Claude Code (real client) | UAT (R6) | ✗/✓ depending on user machine | — | If absent, escalate — SPEC R6 requires Claude Code specifically |
| MCP-compatible client besides Inspector | UAT (R6) | ✓ if Claude Code present | — | — |
| `node:os`, `node:child_process`, `node:perf_hooks`, `node:fs`, `node:path`, `node:url` | Perf script | ✓ (built-in Node ≥20) | — | — |

**Missing dependencies with no fallback:** None — Phase 6 introduces zero new deps.
**Missing dependencies with fallback:** `dist/cli.js` (resolved by `pnpm build`).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.4` (CLAUDE.md recommends `^4.3.6`; both share the API surface used here) |
| Config file | `vitest.config.ts` (existing — reuse as-is; optionally extend `testTimeout` for `test/integration/`) |
| Quick run command | `pnpm test test/integration/mcp-e2e.test.ts` (single integration file; ~3–5 spawns × ~1s each = ~5–15s on Windows) |
| Full suite command | `pnpm test:integration` (alias for the above) |
| Pre-flight | `pnpm build` (REQUIRED — `beforeAll` guard throws if `dist/cli.js` is missing or stale) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R1 | shadcn-barrels fixture exercised end-to-end; barrel chain resolves to leaf | integration | `pnpm test test/integration/mcp-e2e.test.ts -t "shadcn-barrels"` | ❌ Wave 0 |
| R2 | nested-routes fixture exercises layouts + groups + parallel slots + dynamic segment + private folder exclusion | integration | `pnpm test test/integration/mcp-e2e.test.ts -t "nested-routes"` | ❌ Wave 0 |
| R3 | pnpm-monorepo fixture: `--root apps/web` and `--root apps/admin` produce non-overlapping trees; `@acme/ui` resolves to leaf | integration | `pnpm test test/integration/mcp-e2e.test.ts -t "pnpm-monorepo"` | ❌ Wave 0 |
| R4 | 4 tools × 3 fixtures = 12 invocations all return `isError:false`; envelope schema-valid | integration | `pnpm test:integration` | ❌ Wave 0 |
| R5 | every `file` field forward-slash only; full envelope contains no `\\` | integration (regex assertion inside R4 suite) | `pnpm test:integration` | ❌ Wave 0 |
| R6 | Both Claude Code and MCP Inspector PASS for all 4 tools on `nested-routes`; Findings table populated | manual UAT | none (manual) — operator runs `npx @modelcontextprotocol/inspector node dist/cli.js` and the configured Claude Code MCP entry | ❌ Wave 0 (`06-UAT.md` template) |
| R7 | `06-PERF.md` exists with min/p50/p95/max for all 4 tools + host metadata | out-of-band script | `pnpm perf` (writes `06-PERF.md` directly) | ❌ Wave 0 (`test/perf/measure.ts`) |

Optional unit-test from CONTEXT.md discretion:

| (Discretion) | Path-gate helper rejects backslash `file` | unit | `pnpm test test/integration/path-gate.test.ts` (or wherever helper lives) | ❌ Wave 0 if planner adopts |

### Sampling Rate

- **Per task commit:** `pnpm test:integration` (whole integration suite — ~10–20s on Windows; tolerable).
- **Per wave merge:** `pnpm test && pnpm test:integration && pnpm test:smoke` (full project test surface).
- **Phase gate:** Full suite green + `06-UAT.md` filled with PASS grid + `06-PERF.md` populated + `uat-evidence/` non-empty.
- **Pre-publish:** Same as phase gate, plus `pnpm perf` re-run if hardware changed (manual; runbook).

### Wave 0 Gaps

- [ ] `test/integration/mcp-e2e.test.ts` — covers R1, R2, R3, R4, R5
- [ ] `test/perf/measure.ts` — covers R7
- [ ] `test/fixtures/phase-06/shadcn-barrels/` (`app/page.tsx`, `app/layout.tsx`, `app/components/ui/{index.ts, button.tsx, card.tsx}`, `tsconfig.json`, `next.config.js`)
- [ ] `test/fixtures/phase-06/nested-routes/` (root `layout.tsx`, `(group)/layout.tsx`, `(group)/_internal/page.tsx`, `(group)/dashboard/{layout,loading,error,not-found}.tsx`, `(group)/dashboard/[id]/{page,@sidebar/page,@main/page}.tsx`, `tsconfig.json`, `next.config.js`)
- [ ] `test/fixtures/phase-06/pnpm-monorepo/` (`pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`, `apps/web/{tsconfig.json, package.json, next.config.js, app/layout.tsx, app/page.tsx}`, `apps/admin/{…}`, `packages/ui/{package.json, src/{index.ts, button.tsx, datatable.tsx}}`)
- [ ] `package.json` script: `"test:integration": "vitest run test/integration"`
- [ ] `package.json` script: `"perf": "tsx test/perf/measure.ts"`
- [ ] `.planning/phases/06-hardening-fixture-gates/06-UAT.md` template (PASS grid + Findings table + runbook section)
- [ ] `.planning/phases/06-hardening-fixture-gates/06-PERF.md` (generated by `pnpm perf` after Wave 0)
- [ ] `.planning/phases/06-hardening-fixture-gates/uat-evidence/` directory (created during UAT, not Wave 0)
- [ ] (Optional) `vitest.config.ts` `testTimeout: 30_000` override for `test/integration/`
- [ ] (Optional) Path-gate helper unit test

*(Framework install: none — Vitest already installed.)*

## Sources

### Primary (HIGH confidence)
- `test/mcp/smoke.spawn.test.ts` — reference pattern for spawn lifecycle, stderr piping, build-staleness guard. `[VERIFIED: codebase]`
- `src/ir/envelope.ts`, `src/ir/schema.ts` — `EnvelopeSchema` and `TreeNode` shape used by the path gate. `[VERIFIED: codebase]`
- `package.json`, `tsup.config.ts`, `vitest.config.ts` — installed versions and config. `[VERIFIED: codebase]`
- `.planning/phases/06-hardening-fixture-gates/06-SPEC.md` — locked R1–R7. `[VERIFIED: codebase]`
- `.planning/phases/06-hardening-fixture-gates/06-CONTEXT.md` — locked D-01..D-15. `[VERIFIED: codebase]`
- `.planning/research/PITFALLS.md` §3.1–§3.4 — App Router fixture authoring constraints. `[VERIFIED: codebase]`
- [Node.js `perf_hooks` docs](https://nodejs.org/api/perf_hooks.html) — `performance.now()` semantics. `[CITED]`
- [Node.js `os` module docs](https://nodejs.org/api/os.html) — `cpus()`, `totalmem()` for D-10 host metadata. `[CITED]`

### Secondary (MEDIUM confidence)
- [MCP TypeScript SDK Client docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) — `Client`, `StdioClientTransport`, `callTool` API confirmed unchanged in 1.29. `[CITED]`
- [Next.js Parallel Routes docs](https://nextjs.org/docs/app/building-your-application/routing/parallel-routes) — `@slot` convention. `[CITED]`
- [Next.js Route Groups docs](https://nextjs.org/docs/app/building-your-application/routing/route-groups) — `(group)` convention. `[CITED]`
- [`get-tsconfig` README](https://github.com/privatenumber/get-tsconfig#features) — multi-level `extends` chain support. `[CITED]`
- [`@modelcontextprotocol/inspector` README](https://github.com/modelcontextprotocol/inspector) — invocation pattern for UAT. `[CITED]`

### Tertiary (LOW confidence — flagged in Assumptions Log)
- A1: Phase 5 envelope-in-content packaging convention — verify by grepping `src/mcp/tools/*.ts` before authoring `extractEnvelope`.
- A4: Inspector transcript-export UX — verify at UAT time.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library is already installed, every version is pinned in CLAUDE.md TL;DR.
- Architecture: HIGH — D-01..D-15 lock all 15 architectural choices; this research only translates them into concrete code shapes.
- Fixture shapes: HIGH — patterns reused from existing Phase 3/4/5 fixtures; only the *combination* (App Router + monorepo + barrel) is new.
- Pitfalls: HIGH — Pitfall 1, 2, 3, 5 are codebase-grounded; Pitfall 4 has one assumption (A1) flagged.
- Perf script: MEDIUM-HIGH — `perf_hooks` and `child_process` are stable; the timing methodology faithfully implements D-08.
- UAT runbook: MEDIUM — Inspector UX (A4) is the one unverified piece; risk is low because SPEC R6 accepts log OR screenshot.

**Research date:** 2026-05-05
**Valid until:** 2026-06-05 (30 days; stack is stable, only currency-sensitive item is MCP SDK which last shipped 2026-03-30)
