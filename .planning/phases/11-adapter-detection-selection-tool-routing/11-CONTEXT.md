# Phase 11: Adapter Detection, Selection & Tool Routing — Context

**Gathered:** 2026-05-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the adapter selection layer: `selectAdapter(projectRoot, override?)` that auto-detects the right `FrameworkAdapter` via parallel probes, returns named-path errors on conflict/zero-match, and wires all 4 MCP tool handlers through it — removing all direct `NextJsAdapter` imports from tool code. Ships `ExpoRouterAdapter` stub (all 8 methods, empty returns) and `detectExpoRouter` two-signal probe. Adds `--framework nextjs|expo-router` CLI flag with module-singleton threading. Creates `monorepo-mixed` fixture for integration verification.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**7 requirements are locked.** See `11-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `11-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- `src/adapters/expo/ExpoRouterAdapter.ts` — stub implementing all 8 FrameworkAdapter methods with empty/stub returns
- `src/adapters/expo/detect.ts` — two-signal Expo Router detection (`expo-router` in deps + `_layout.tsx` config file)
- `src/adapters/select.ts` — `selectAdapter(root, override?)` orchestrating parallel probes + conflict/zero-match errors
- `src/mcp/tools/*.ts` refactor — remove direct `NextJsAdapter` imports; route through `selectAdapter`; propagate `isError` responses
- `src/cli.ts` + `src/init/argv.ts` — add `--framework` flag to `parseArgs` schema, forward to `selectAdapter`, document in `--help`
- `test/fixtures/monorepo-mixed/` — minimal fixture with one Next.js and one Expo Router workspace
- Integration test for monorepo fixture (`test/integration/` or `test/adapters/select.test.ts`)
- Opportunistic cleanup: `base.warnings ?? []` fallback in 4 tool handlers (noted in STATE.md carry-forward)

**Out of scope (from SPEC.md):**
- Actual Expo Router parsing/routing logic — deferred to Phase 12; ExpoRouterAdapter stub returns empty results
- `ExpoRouterAdapter.detect()` calling the new `detectExpoRouter` — Phase 12 wires the real detection
- Per-request `framework` override in tool input schema — CLI-level flag only; no per-call override in tool arguments
- `--platform` CLI flag — INTEG-05/Phase 14; only the mechanism ships in that phase
- Additional adapter types (Vue, Svelte, Pages Router) — still deferred from v1.0
- Changing the monorepo-mixed fixture to exercise actual Expo parsing — fixture only needs minimal structure to trigger detection signals

</spec_lock>

<decisions>
## Implementation Decisions

### selectAdapter Return Type
- **D-01:** `selectAdapter` return type is `Promise<FrameworkAdapter | ToolResponse>` — union of the adapter instance (success) and the existing `ToolResponse` type from `src/mcp/errors.ts` (error). No new wrapper type introduced.
- **D-02:** Tool handlers check `if ("isError" in adapter) return adapter;` as an early return after `await selectAdapter(root)`. The existing `withErrorBoundary` wrapper remains in place to catch unexpected throws; this early return handles the structured error case.

### --framework Flag Threading
- **D-03:** Module-level singleton in `src/adapters/select.ts`: `_frameworkOverride` variable + `setFrameworkOverride(v: string)` export. `cli.ts` calls `setFrameworkOverride(args.framework)` after `parseArgs`. `selectAdapter(root, override = _frameworkOverride)` defaults to the singleton value.
- **D-04:** Invalid `--framework` values are validated in `cli.ts` before `startServer()` — check against `["nextjs", "expo-router"]` allowlist, log error to stderr, `process.exit(1)`. Server never starts for invalid values. (SPEC acceptance: exit code 1 + error before spawning server.)

### Next.js Detection Update
- **D-05:** Add new `detectNextJs(absRoot): Promise<{ detected: boolean; signals: string[] }>` export to `src/adapters/next/detect.ts` alongside the existing `detect()` function. `detect()` is unchanged (backward compat). `detectNextJs` uses two-signal pattern: `next` in `package.json` `dependencies` OR `devDependencies` AND any `next.config.*` file.
- **D-06:** `signals[]` always includes matched paths even when `detected: false` (partial match). Enables clear debug output in conflict error messages (e.g., `{ detected: false, signals: ["next.config.ts"] }` when config exists but no `next` in deps).

### expo/ Directory Structure
- **D-07:** Phase 11 creates only 2 files in `src/adapters/expo/`: `ExpoRouterAdapter.ts` (stub with all 8 methods) and `detect.ts` (`detectExpoRouter`). No placeholder `discover.ts`/`route-map.ts`/`segments.ts` — those are Phase 12's work.
- **D-08:** `ExpoRouterAdapter.resolveModule` delegates via direct import: `import { resolveModule as coreResolveModule } from "../../core/resolver/index.js"` (island rule permits adapters → core direction; only core → adapters is forbidden).

### Opportunistic Cleanup (carry-forward from STATE.md)
- **D-09:** Remove redundant `base.warnings ?? []` fallback in 4 tool handlers during the tool handler refactor (was noted in STATE.md carry-forward). Opportunistic — does not block if complex.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Spec
- `.planning/phases/11-adapter-detection-selection-tool-routing/11-SPEC.md` — Locked requirements, boundaries, 16 acceptance criteria, grep-verifiable checks. MUST read before planning.

### Core Files to Create
- `src/adapters/expo/ExpoRouterAdapter.ts` — new; implement all 8 FrameworkAdapter methods with stub returns
- `src/adapters/expo/detect.ts` — new; `detectExpoRouter(absRoot)` two-signal probe
- `src/adapters/select.ts` — new; `selectAdapter` + `setFrameworkOverride` singleton

### Core Files to Modify
- `src/adapters/next/detect.ts` — add `detectNextJs()` export; leave existing `detect()` unchanged
- `src/mcp/tools/get-full-hierarchy.ts` — remove NextJsAdapter import; route through selectAdapter
- `src/mcp/tools/focus-on.ts` — same
- `src/mcp/tools/find-by-text.ts` — same
- `src/mcp/tools/find-by-style.ts` — same
- `src/cli.ts` — add `--framework` flag validation + `setFrameworkOverride` call
- `src/init/argv.ts` — add `framework` to parseArgs schema

### Architecture Rules
- `test/architecture/island.test.ts` — island rule: `src/core/` cannot import `src/adapters/`. `src/adapters/` CAN import `src/core/`. Verify `ExpoRouterAdapter.resolveModule` import direction is legal.
- `src/adapters/FrameworkAdapter.ts` — 8-method interface locked by Phase 10 SPEC. `ExpoRouterAdapter` must satisfy it at compile time.
- `src/mcp/errors.ts` — `ToolResponse` type and `withErrorBoundary` — tool handler pattern to follow.

### Existing Detection Reference
- `src/adapters/next/detect.ts` — current Next.js detection (next.config.* + app/ dir) — keep `detect()` unchanged; model `detectNextJs()` on its structure.

### Test Fixtures
- `test/fixtures/expo-basic/` — existing Phase 9 fixture; `detectExpoRouter` must return `{ detected: true }` against it
- `test/fixtures/next-app-router/` — existing Next.js fixture; `detectExpoRouter` must return `{ detected: false }` against it
- `test/fixtures/monorepo-mixed/` — new fixture for Phase 11; `apps/web/` = Next.js, `apps/mobile/` = Expo Router

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/mcp/errors.ts` — `ToolResponse` type + `withErrorBoundary` — `selectAdapter` returns `ToolResponse` on error; tool handlers already wrapped by `withErrorBoundary`
- `src/adapters/next/detect.ts` — `detect()` function — model `detectNextJs()` on same structure; add as sibling export
- `src/core/resolver/index.ts` — `resolveModule()` — `ExpoRouterAdapter.resolveModule` delegates here directly (aliased as `coreResolveModule`)
- `test/core/resolver/barrel.test.ts` — `ctxFor()` helper + `resolveModule()` call pattern — monorepo fixture integration test should follow same pattern

### Established Patterns
- Tool handler pattern: `const root = resolveRoot(input.projectRoot); const adapter = new Analyzer(...)` — refactor: replace `new NextJsAdapter()` with `await selectAdapter(root)` + isError check
- `withErrorBoundary` wraps every tool handler — early return `if ("isError" in adapter) return adapter` sits inside the boundary, not around it
- Module singleton: logging already uses a module-level `log` function set at startup — `setFrameworkOverride` follows same pattern

### Integration Points
- `src/mcp/tools/get-full-hierarchy.ts:7` — `import { NextJsAdapter }` to remove; `src/mcp/tools/focus-on.ts:7`, `find-by-text.ts:7`, `find-by-style.ts:7` — same
- `src/cli.ts` — after `parseArgs`, before `startServer()` — insert framework validation + `setFrameworkOverride` call
- `test/adapters/FrameworkAdapter.test.ts` — locking test at 8 methods; `ExpoRouterAdapter` must pass compile-time check without touching this test's assertion count

</code_context>

<specifics>
## Specific Ideas

- `detectNextJs` signals format matches `detectExpoRouter` exactly: `{ detected: boolean; signals: string[] }` — symmetric shape allows `selectAdapter` to process both results uniformly.
- Conflict error text format: "Detected Next.js ([signal1]) AND Expo Router ([signal2]). Use --framework to disambiguate." — signals from both probes named in message.
- Zero-match error text: "No framework detected at [root]. Use --framework nextjs|expo-router to specify." — includes `--framework` hint.
- `selectAdapter` with valid override skips both probes entirely — instantiates adapter directly without any fs I/O.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 11-adapter-detection-selection-tool-routing*
*Context gathered: 2026-05-18*
