# Phase 11: Adapter Detection, Selection & Tool Routing — Specification

**Created:** 2026-05-18
**Ambiguity score:** 0.164 (gate: ≤ 0.20)
**Requirements:** 7 locked

## Goal

An agent calling any of the 4 MCP tools against a project root gets routed to the right `FrameworkAdapter` automatically via `selectAdapter(projectRoot)`, with named-path errors on conflict/zero-match and a `--framework` CLI escape hatch; all 4 tool handlers are refactored to use `selectAdapter` instead of importing `NextJsAdapter` directly.

## Background

Phase 10 completed: `FrameworkAdapter` widened to 8 methods; `Analyzer.ts` de-Next-ified; `NextJsAdapter` fully migrated. Current gap: all 4 MCP tool handlers (`get_full_hierarchy`, `focus_on`, `find_by_text`, `find_by_style`) still hardcode `import { NextJsAdapter }` at line 7 of each file and instantiate `new Analyzer({ root, adapter: NextJsAdapter })` directly. No `selectAdapter` function exists. No Expo detection logic exists beyond what Next.js's `detect.ts` already has. The test suite is at 371 tests green. A `monorepo-mixed` fixture does not exist.

This phase builds the adapter selection layer that allows MCP tools to work with any registered adapter without changing tool code — future adapters (Phase 12's ExpoRouterAdapter) plug in without touching tool handlers.

## Requirements

1. **ExpoRouterAdapter stub**: An `ExpoRouterAdapter` class exists that implements all 8 `FrameworkAdapter` methods and returns empty/stub results — actual parsing logic is deferred to Phase 12.
   - Current: No `src/adapters/expo/` directory or `ExpoRouterAdapter` class exists
   - Target: `src/adapters/expo/ExpoRouterAdapter.ts` exports an `ExpoRouterAdapter` that implements `FrameworkAdapter`; `discoverEntries` returns `[]`; `extractComponents` returns `[]`; `mapRouteToEntry` returns `{ matched: false }`; `classifyEntry` returns `"other"`; `enumerateRoutes` returns `[]`; `slotMarker` returns `false`; `resolveModule` delegates to `coreResolveModule`
   - Acceptance: `ExpoRouterAdapter` satisfies the TypeScript `FrameworkAdapter` interface (no compile errors); existing FrameworkAdapter locking test stays green with 8 methods

2. **Expo detection probe**: `src/adapters/expo/detect.ts` exports a `detectExpoRouter(absRoot)` function that detects Expo Router projects using a two-signal pattern.
   - Current: No Expo detection logic exists; only `src/adapters/next/detect.ts` exists
   - Target: `detectExpoRouter(absRoot)` returns `{ detected: boolean; signals: string[] }` where `detected` is true only when BOTH signals are found: (1) `expo-router` key in `dependencies` OR `devDependencies` of `package.json`; (2) `app/_layout.tsx` OR `src/app/_layout.tsx` exists. `signals` contains the matched file/dep paths.
   - Acceptance: `detectExpoRouter` returns `{ detected: true }` for `expo-basic` fixture; returns `{ detected: false }` for `next-app-router` fixture; returns `{ detected: false }` when only one signal matches (e.g., `_layout.tsx` present but `expo-router` not in deps)

3. **Adapter selection**: `src/adapters/select.ts` exports a `selectAdapter(projectRoot, frameworkOverride?)` function that runs both detection probes in parallel and returns exactly one `FrameworkAdapter`.
   - Current: No `select.ts` or selection logic exists
   - Target: `selectAdapter` runs Next.js and Expo Router probes concurrently; if exactly one probe returns `detected: true`, returns the corresponding adapter instance; if `frameworkOverride` is `"nextjs"` or `"expo-router"`, skips probes and returns the specified adapter; conflict and zero-match cases throw/return structured errors (see requirement 4)
   - Acceptance: `selectAdapter("expo-basic/")` returns an `ExpoRouterAdapter` instance; `selectAdapter("next-app-router/")` returns a `NextJsAdapter` instance; `selectAdapter` with `frameworkOverride: "expo-router"` returns `ExpoRouterAdapter` regardless of probe results

4. **Conflict and zero-match errors**: When detection is ambiguous, `selectAdapter` returns an MCP-compatible error (not throws) with specific named signal paths.
   - Current: No conflict or zero-match error handling exists
   - Target: When both probes detect true (conflict), `selectAdapter` returns `{ isError: true, content: [{ type: "text", text: "..." }] }` where the text names both matched signal paths (e.g., "Detected Next.js (next.config.ts) AND Expo Router (apps/mobile/app/_layout.tsx). Use --framework to disambiguate."); when zero probes detect, error suggests `--framework nextjs|expo-router`
   - Acceptance: Calling `selectAdapter` on a monorepo-mixed root (apps/web/=Next.js, apps/mobile/=Expo Router) returns `{ isError: true }` with text naming both matched paths; calling on an unknown project root (no framework signals) returns `{ isError: true }` containing "Use --framework"

5. **Tool handler refactor**: All 4 MCP tool handlers route through `selectAdapter` instead of importing `NextJsAdapter` directly.
   - Current: `get-full-hierarchy.ts`, `focus-on.ts`, `find-by-text.ts`, `find-by-style.ts` each contain `import { NextJsAdapter } from "../../adapters/next/NextJsAdapter.js"` and `new Analyzer({ root, adapter: NextJsAdapter })`
   - Target: Each tool calls `selectAdapter(root)` and passes the result to `Analyzer`; if `selectAdapter` returns `{ isError: true }`, the tool returns that error object immediately; no `import { NextJsAdapter }` remains in `src/mcp/tools/*`
   - Acceptance: `grep -r "NextJsAdapter" src/mcp/tools/` returns zero results; all existing Next.js E2E/snapshot tests continue to pass without modification

6. **CLI `--framework` flag**: `--framework nextjs|expo-router` flag is parsed at CLI startup, forwarded to `selectAdapter`, and documented in `--help`.
   - Current: No `--framework` flag in `INIT_OPTION_SCHEMA` or `cli.ts` routing logic
   - Target: `parseArgs` schema includes `framework: { type: "string" }` accepting `"nextjs"` or `"expo-router"`; flag value is passed to `selectAdapter` as `frameworkOverride`; `--help` output documents the flag with example values; invalid values produce an error before MCP server starts
   - Acceptance: `npx ui-hierarchy-mcp --framework expo-router --help` prints `--framework` in help text; running with `--framework nextjs` against an Expo project root returns Next.js adapter results (not auto-detect); running with `--framework invalid` exits with code 1 and an error message before spawning server

7. **Monorepo-mixed fixture and integration test**: A fixture with Next.js in `apps/web/` and Expo Router in `apps/mobile/` verifies that `selectAdapter` picks the correct adapter per `projectRoot` argument.
   - Current: No `test/fixtures/monorepo-mixed/` fixture exists; the only monorepo fixture (`phase-06/pnpm-monorepo`) has two Next.js workspaces
   - Target: `test/fixtures/monorepo-mixed/` contains `apps/web/` (Next.js: `next.config.ts` + `next` in deps + `app/page.tsx`) and `apps/mobile/` (Expo Router: `expo-router` in deps + `app/_layout.tsx`); an integration test calls `selectAdapter` with each workspace root and asserts the correct adapter type
   - Acceptance: `selectAdapter("monorepo-mixed/apps/web")` returns `NextJsAdapter`; `selectAdapter("monorepo-mixed/apps/mobile")` returns `ExpoRouterAdapter`; the integration test passes in CI

## Boundaries

**In scope:**
- `src/adapters/expo/ExpoRouterAdapter.ts` — stub implementing all 8 FrameworkAdapter methods with empty/stub returns
- `src/adapters/expo/detect.ts` — two-signal Expo Router detection (`expo-router` in deps + `_layout.tsx` config file)
- `src/adapters/select.ts` — `selectAdapter(root, override?)` orchestrating parallel probes + conflict/zero-match errors
- `src/mcp/tools/*.ts` refactor — remove direct `NextJsAdapter` imports; route through `selectAdapter`; propagate `isError` responses
- `src/cli.ts` + `src/init/argv.ts` — add `--framework` flag to `parseArgs` schema, forward to `selectAdapter`, document in `--help`
- `test/fixtures/monorepo-mixed/` — minimal fixture with one Next.js and one Expo Router workspace
- Integration test for monorepo fixture (`test/integration/` or `test/adapters/select.test.ts`)
- Opportunistic cleanup: `base.warnings ?? []` fallback in 4 tool handlers (noted in STATE.md carry-forward)

**Out of scope:**
- Actual Expo Router parsing/routing logic — deferred to Phase 12; ExpoRouterAdapter stub returns empty results
- `ExpoRouterAdapter.detect()` calling the new `detectExpoRouter` — Phase 12 wires the real detection
- Per-request `framework` override in tool input schema — CLI-level flag only; no per-call override in tool arguments
- `--platform` CLI flag — INTEG-05/Phase 14; only the mechanism ships in that phase
- Additional adapter types (Vue, Svelte, Pages Router) — still deferred from v1.0
- Changing the monorepo-mixed fixture to exercise actual Expo parsing — fixture only needs minimal structure to trigger detection signals

## Constraints

- Detection must check both `dependencies` AND `devDependencies` in `package.json` for the deps-key signal — `expo-router` in either constitutes a match
- The ExpoRouterAdapter stub must implement all 8 FrameworkAdapter methods (TypeScript compile-time check enforced by locking test)
- `selectAdapter` must run both probes concurrently (e.g., `Promise.all`) — sequential detection would penalize Next.js projects unnecessarily
- No remaining `import { NextJsAdapter }` in `src/mcp/tools/*` after the refactor — enforced by acceptance criterion grep check
- All 371 existing tests must stay green after refactor — no snapshot changes permitted for Next.js fixtures
- `--framework` flag is a server-level flag (set at spawn time); it is NOT a per-tool-call argument

## Acceptance Criteria

- [ ] `ExpoRouterAdapter` implements `FrameworkAdapter` with no TypeScript compile errors; FrameworkAdapter locking test stays green (8 methods)
- [ ] `detectExpoRouter("test/fixtures/expo-basic/")` returns `{ detected: true }` with non-empty `signals`
- [ ] `detectExpoRouter("test/fixtures/next-app-router/")` returns `{ detected: false }`
- [ ] `detectExpoRouter` returns `{ detected: false }` when only one of the two signals matches
- [ ] `selectAdapter("test/fixtures/expo-basic/")` returns an `ExpoRouterAdapter` instance
- [ ] `selectAdapter("test/fixtures/next-app-router/")` returns a `NextJsAdapter` instance
- [ ] `selectAdapter` on a monorepo-mixed root returns `{ isError: true }` with text naming both matched signal paths
- [ ] `selectAdapter` on an unknown-framework root returns `{ isError: true }` with text containing "Use --framework"
- [ ] `selectAdapter("path", "expo-router")` returns `ExpoRouterAdapter` regardless of probe results (override)
- [ ] `grep -r "NextJsAdapter" src/mcp/tools/` returns zero results
- [ ] All existing Next.js E2E snapshot tests pass without modification
- [ ] `npx ui-hierarchy-mcp --help` shows `--framework` with valid values `nextjs|expo-router`
- [ ] `npx ui-hierarchy-mcp --framework invalid` exits with code 1 and error message before spawning server
- [ ] `selectAdapter("monorepo-mixed/apps/web")` returns `NextJsAdapter` in integration test
- [ ] `selectAdapter("monorepo-mixed/apps/mobile")` returns `ExpoRouterAdapter` in integration test
- [ ] Full vitest suite stays green (≥371/371 tests)

## Ambiguity Report

| Dimension           | Score | Min  | Status | Notes                                                        |
|---------------------|-------|------|--------|--------------------------------------------------------------|
| Goal Clarity        | 0.90  | 0.75 | ✓      | 5 roadmap success criteria + codebase scouting grounded goal |
| Boundary Clarity    | 0.82  | 0.70 | ✓      | Expo stub boundary locked (empty tree, Phase 12 fills)       |
| Constraint Clarity  | 0.78  | 0.65 | ✓      | deps scope (deps+devDeps) locked; --framework CLI-only locked |
| Acceptance Criteria | 0.80  | 0.70 | ✓      | 16 pass/fail checkboxes                                      |
| **Ambiguity**       | 0.164 | ≤0.20| ✓      |                                                              |

## Interview Log

| Round | Perspective | Question summary                                              | Decision locked                                                                   |
|-------|-------------|---------------------------------------------------------------|-----------------------------------------------------------------------------------|
| 1     | Researcher  | Does "expo-router in deps" mean dependencies only or both?   | Both `dependencies` AND `devDependencies` — safer, catches all setups             |
| 1     | Researcher  | Does Phase 11 create ExpoRouterAdapter stub, and what does it return? | Yes — stub with all 8 methods returning empty/stub results; Phase 12 fills logic |
| 1     | Researcher  | Does `--framework` need per-MCP-request forwarding or CLI only? | CLI only — parsed at spawn, forwarded to `selectAdapter`; MCP clients use `args` config |

---

*Phase: 11-adapter-detection-selection-tool-routing*
*Spec created: 2026-05-18*
*Next step: /gsd:discuss-phase 11 — implementation decisions (file structure, error format, test strategy)*
