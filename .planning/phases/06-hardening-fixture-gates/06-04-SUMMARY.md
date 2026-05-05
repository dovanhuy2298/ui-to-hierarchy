---
phase: 06-hardening-fixture-gates
plan: 04
subsystem: testing/integration
tags: [mcp, integration-test, regression-gate, phase-06]
requires:
  - test/fixtures/phase-06/shadcn-barrels (Wave 0 / 06-01)
  - test/fixtures/phase-06/nested-routes (Wave 0 / 06-02)
  - test/fixtures/phase-06/pnpm-monorepo (Wave 0 / 06-03)
  - dist/cli.js (Phase 5 build artifact)
  - src/ir/envelope.ts EnvelopeSchema
  - src/ir/schema.ts TreeNode 9-kind union
provides:
  - test/integration/mcp-e2e.test.ts (R1-R5 regression gate)
  - pnpm test:integration script entry
affects:
  - package.json (single-line script addition)
tech-stack:
  added: []
  patterns:
    - per-fixture spawn lifecycle (StdioClientTransport, beforeAll/afterAll)
    - EnvelopeSchema.parse over tool content[0].text JSON
    - exhaustive 9-kind TreeNode walker with branch/list recursion
    - build-staleness mtime guard (no auto-build per D-04)
    - Windows path forward-slash gate (per-node + envelope-wide defense in depth)
    - fixture-invariants strategy object (argsFor + assert per ToolName)
key-files:
  created:
    - test/integration/mcp-e2e.test.ts
  modified:
    - package.json
decisions:
  - 4 fixture suites x 4 tools = 16 invocations (vs SPEC R4 minimum 12); split monorepo per D-07
  - get_full_hierarchy invoked with format:"json" so EnvelopeSchema.parse can run (Pitfall 4)
  - test:integration script does NOT chain pnpm build (D-04); guard enforced inside test
  - pnpm test (default vitest run) WILL pick up integration tests; documented downside accepted
metrics:
  duration_minutes: ~15
  completed: 2026-05-05
---

# Phase 06 Plan 04: MCP integration suite + test:integration script

End-to-end MCP regression gate authored as a single Vitest file
(`test/integration/mcp-e2e.test.ts`) that spawns the built `dist/cli.js`
once per fixture, exercises all 4 MCP tools per spawn, parses every
response through `EnvelopeSchema`, asserts fixture-specific invariants
(R1 barrel-resolution, R2 route-segment privacy, R3 cross-package
resolution, D-07 monorepo non-overlap), and finally enforces the R5
Windows forward-slash path gate over every captured envelope.

## What changed

### Task 1 — `test/integration/mcp-e2e.test.ts` (commit `21f414e`)

300-line Vitest module. Structure (top-to-bottom):

1. Imports: vitest primitives, `node:fs` (`existsSync`, `statSync`),
   `StdioClientTransport`, `Client`, `EnvelopeSchema`/`Envelope`,
   `TreeNode`. No imports under `src/adapters/**` (D-11 island rule).
2. Constants: `distCli`, `srcCli`, `fixturesRoot` resolved from
   `import.meta.url`.
3. `assertFreshBuild()` — D-04 build-staleness guard. Throws when
   `dist/cli.js` is missing or older than `src/cli.ts`.
4. `walkTreeNodes(node, fn)` — exhaustive over the 9-kind TreeNode
   union: `children` for component/element/fragment, `thenBranch`/
   `elseBranch` for `branch`, `item` for `list`. text/slot/error/spread
   are leaves.
5. `collectByName(tree, name)` — returns all `kind:"component"` nodes
   matching name; used by R1 / D-07 invariants.
6. `extractEnvelope(result)` — reads `content[0].text` and `JSON.parse`s
   it (Pitfall 4 — markdown text would not parse).
7. `FixtureInvariants` interface (argsFor + assert).
8. Four invariants objects:
   - **shadcnInvariants** — `get_full_hierarchy` asserts every Button's
     `file` matches `/components\/ui\/button\.tsx$/` and never
     `index.ts`. Other tools envelope-parses.
   - **nestedInvariants** — `get_full_hierarchy({route:"/dashboard/123"})`
     asserts no `private-internal-marker` text leaks (negative) and at
     least one `slot{name:"sidebar"}` OR file path containing
     `@sidebar` (positive). `find_by_text("Sidebar slot")` envelope
     parses.
   - **monorepoWebInvariants** (`apps/web`) — Button resolves to
     `/packages\/ui\/src\/button\.tsx$/`; D-07 negatives: no
     `DataTable` component AND `JSON.stringify(envelope).includes("Manage users") === false`.
   - **monorepoAdminInvariants** (`apps/admin`) — at least one Button
     AND one DataTable; envelope contains "Manage users"; envelope does
     NOT contain "Buy now".
9. `makeFixtureSuite(label, fixturePath, invariants)` factory.
   `beforeAll` (30 s timeout) calls `assertFreshBuild`, builds
   `StdioClientTransport({command:"node",args:[distCli],stderr:"pipe"})`,
   pipes stderr into a buffer for diagnostics, connects a
   `Client({name:"phase-06-integration",version:"0.0.0"})`. `afterAll`
   closes both client and transport. Emits 4 `it(toolName,...)` blocks
   that run `client.callTool`, assert `isError` falsy, parse the
   envelope, push it into a closure-scoped `allEnvelopes[]`, and
   delegate to `invariants.assert`. A trailing `it("Windows path
   gate...")` walks every captured envelope: per-node
   `/^[^\\]*$/` regex AND envelope-wide
   `JSON.stringify(env).match(/\\\\/) === null` (R5 + CONTEXT
   defense-in-depth).
10. Four `makeFixtureSuite` invocations: `shadcn-barrels`,
    `nested-routes`, `pnpm-monorepo (--root apps/web)`,
    `pnpm-monorepo (--root apps/admin)`.

Acceptance grep gates (all OK):

| Pattern | Required | Actual |
|---|---|---|
| `EnvelopeSchema.parse` | ≥1 | 1 |
| `isError` | ≥1 | 4 |
| `walkTreeNodes` | ≥2 | 9 |
| `StdioClientTransport` | ≥1 | 3 |
| `assertFreshBuild` | ≥2 | 2 |
| `makeFixtureSuite` | ≥4 | 5 |
| `format:"json"` occurrences | ≥3 | 4 |
| snapshots / adapter imports / auto-build | 0 | 0 |

### Task 2 — `package.json` (commit `c0eaba8`)

Single addition to `scripts`:

```json
"test:integration": "vitest run test/integration"
```

No other fields touched. Per D-04 the script does NOT chain
`pnpm build`. Per CONTEXT discretion the default `pnpm test` glob will
pick up integration tests too — same precondition as `pnpm test:smoke`.

## Deviations from Plan

None — plan executed exactly as written.

The plan's Task 2 instructed running `pnpm build && pnpm test:integration`
end-to-end after the package.json edit. Per the orchestrator's
parallel-execution objective ("Fixtures will NOT exist in your worktree.
... do NOT run the test suite in your worktree"), this end-to-end run
was explicitly skipped in this worktree. Wave 2 / Wave 3 will exercise
the gate against the merged tree where all fixtures exist together.

## Findings Seed

None recorded — end-to-end execution intentionally deferred per
parallel-execution objective; any failures will surface to the Wave 3/4
UAT plan once the wave's worktrees are merged.

## Threat Model Coverage

| Threat ID | Disposition | Mitigation realized |
|---|---|---|
| T-06-04 (stale dist masking) | mitigate | `assertFreshBuild` mtime check in every `beforeAll` |
| T-06-05 (backslash leak on Windows) | mitigate | Per-node `/^[^\\]*$/` + envelope-wide `JSON.stringify(env).match(/\\\\/) === null` |
| T-06-06 (island-rule violation) | mitigate | Author-time discipline; grep gate confirms no `src/adapters` imports |

No new threat surface introduced (test infrastructure only).

## Self-Check

Verified:

- `test/integration/mcp-e2e.test.ts` exists in worktree
  (`E:/ui-to-hierarch/.claude/worktrees/agent-ab890c4f9d8879274/test/integration/mcp-e2e.test.ts`).
- `package.json scripts['test:integration'] === "vitest run test/integration"` (verified by node -e).
- All grep gates pass (table above).
- `npx tsc --noEmit` produces no errors in the new file (the only TS
  error printed — `test/fixtures/phase-05/micro/parse-error/app/page.tsx`
  — is a pre-existing intentional malformed fixture, unrelated to this
  plan and out-of-scope per Phase 06 SPEC).
- Commits exist:
  - `21f414e` test(06-04): add per-fixture MCP integration suite (R1-R5 gate)
  - `c0eaba8` chore(06-04): add pnpm test:integration script

## Self-Check: PASSED

## Commits

| Hash | Message |
|---|---|
| `21f414e` | test(06-04): add per-fixture MCP integration suite (R1-R5 gate) |
| `c0eaba8` | chore(06-04): add pnpm test:integration script |
