# Phase 11: Adapter Detection, Selection & Tool Routing — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-18
**Phase:** 11-adapter-detection-selection-tool-routing
**Areas discussed:** selectAdapter return type, --framework flag threading, Next.js detection update, expo/ directory structure

---

## selectAdapter Return Type

| Option | Description | Selected |
|--------|-------------|----------|
| Union: `FrameworkAdapter \| ToolResponse` | Return adapter instance on success, existing `ToolResponse` type on error. Tool handlers check `if ("isError" in result)`. No new wrapper type. | ✓ |
| Discriminated union: `{ ok, adapter } \| { ok, error }` | Explicit wrapper object. Clearer semantics but requires unwrap at every tool. | |
| Throw typed error | Throw on conflict/zero-match. Ruled out — SPEC explicitly says "not throws". | |

**User's choice:** Union `FrameworkAdapter | ToolResponse` — direct, reuses existing type, minimal change to tool handler pattern.

**Follow-up:** Tool handlers use `if ("isError" in adapter) return adapter;` early return inside `withErrorBoundary`. Structured error propagated directly to MCP client.

---

## --framework Flag Threading

| Option | Description | Selected |
|--------|-------------|----------|
| Module-level singleton | `_frameworkOverride` + `setFrameworkOverride()` in `select.ts`. `cli.ts` calls setter after `parseArgs`. `selectAdapter` reads module var as default. | ✓ |
| `process.env` variable | `cli.ts` sets `process.env.UI_HIERARCHY_FRAMEWORK`. Tool handlers/selectAdapter read env. Stringly typed, harder to test. | |
| Pass through tool context | `startServer()` receives framework option; tools read from server context. Clean but requires MCP server init + registration changes. | |

**User's choice:** Module-level singleton — matches existing logging singleton pattern.

**Follow-up (validation):**
| Option | Description | Selected |
|--------|-------------|----------|
| `parseArgs` schema + `process.exit(1)` before server | Validate against `["nextjs", "expo-router"]` allowlist in `cli.ts` before `startServer()`. Log error to stderr + exit code 1. | ✓ |
| Validate inside `selectAdapter` | Server starts; error only on first tool call. Does not match SPEC "exit before spawning server" criterion. | |

---

## Next.js Detection Update

| Option | Description | Selected |
|--------|-------------|----------|
| New `detectNextJs()` alongside `detect()` | Add new export to `detect.ts` returning `{ detected, signals }`. Existing `detect()` unchanged. `selectAdapter` calls `detectNextJs()` + `detectExpoRouter()` in parallel. | ✓ |
| Modify existing `detect()` | Update to also check `package.json` deps. Risk of breaking existing callsite behavior. Requires audit. | |
| Inline in `select.ts` | Implement probe inline, don't touch `detect.ts`. Duplicates logic, harder to test isolate. | |

**User's choice:** New `detectNextJs()` — clean separation, backward compat, testable in isolation.

**Follow-up (partial signals):**
| Option | Description | Selected |
|--------|-------------|----------|
| Include partial signals (detected=false but signals shows what matched) | `signals[]` always lists found paths even on `detected: false`. Aids conflict error message construction. | ✓ |
| Signals only when detected=true | `signals[]` empty on failure. Simpler but loses debug context. | |

---

## expo/ Directory Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal: `ExpoRouterAdapter.ts` + `detect.ts` only | Only 2 files needed for Phase 11. Phase 12 creates `discover.ts`, `route-map.ts`, `segments.ts`. | ✓ |
| Mirror `next/` structure | Create placeholder files for all future modules now. Visual symmetry but adds 0-logic noise. | |

**User's choice:** Minimal — no placeholder files; create only what Phase 11 needs.

**Follow-up (`resolveModule` delegation):**
| Option | Description | Selected |
|--------|-------------|----------|
| Direct import from `src/core/resolver/index.ts` | `import { resolveModule as coreResolveModule }` — legal per island rule (adapters can import core). | ✓ |
| Mirror NextJsAdapter | Check how NextJsAdapter implements it and copy. Consistency over clarity. | |

---

## Claude's Discretion

None — all implementation decisions locked by user.

## Deferred Ideas

None — discussion stayed within phase scope.
