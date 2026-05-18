# Phase 11: Adapter Detection, Selection & Tool Routing - Research

**Researched:** 2026-05-18
**Domain:** TypeScript adapter pattern, MCP tool routing, CLI flag parsing, test fixtures
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `selectAdapter` return type is `Promise<FrameworkAdapter | ToolResponse>` — union of adapter instance (success) and existing `ToolResponse` type from `src/mcp/errors.ts` (error). No new wrapper type.
- **D-02:** Tool handlers check `if ("isError" in adapter) return adapter;` as early return after `await selectAdapter(root)`. `withErrorBoundary` wrapper stays in place.
- **D-03:** Module-level singleton in `src/adapters/select.ts`: `_frameworkOverride` variable + `setFrameworkOverride(v: string)` export. `cli.ts` calls `setFrameworkOverride(args.framework)` after `parseArgs`. `selectAdapter(root, override = _frameworkOverride)` defaults to the singleton.
- **D-04:** Invalid `--framework` values validated in `cli.ts` before `startServer()` — allowlist `["nextjs", "expo-router"]`, log error to stderr, `process.exit(1)`.
- **D-05:** Add new `detectNextJs(absRoot): Promise<{ detected: boolean; signals: string[] }>` export to `src/adapters/next/detect.ts` alongside existing `detect()` (unchanged for backward compat). Two signals: `next` in `package.json` deps OR devDeps AND any `next.config.*` file.
- **D-06:** `signals[]` always includes matched paths even when `detected: false` (partial match). Enables clear debug output in conflict error messages.
- **D-07:** Phase 11 creates only 2 files in `src/adapters/expo/`: `ExpoRouterAdapter.ts` (stub with all 8 methods) and `detect.ts`. No placeholder `discover.ts`/`route-map.ts`/`segments.ts`.
- **D-08:** `ExpoRouterAdapter.resolveModule` delegates via direct import from `../../core/resolver/index.js` (island rule permits adapters → core direction).
- **D-09:** Remove redundant `base.warnings ?? []` fallback in 4 tool handlers during refactor (opportunistic; does not block).

### Claude's Discretion

None — all decisions are locked.

### Deferred Ideas (OUT OF SCOPE)

- Actual Expo Router parsing/routing logic — deferred to Phase 12
- `ExpoRouterAdapter.detect()` calling `detectExpoRouter` — Phase 12 wires it
- Per-request `framework` override in tool input schema — CLI-level only
- `--platform` CLI flag — Phase 14
- Additional adapter types (Vue, Svelte, Pages Router)
- Changing monorepo-mixed fixture to exercise actual Expo parsing
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADAPT-03 | `selectAdapter(projectRoot)` auto-detects framework via two-signal pattern per adapter; detection parallel; exactly one true | detectNextJs + detectExpoRouter pattern verified from detect.ts; Promise.all concurrency |
| ADAPT-04 | selectAdapter returns `{isError: true}` with named signal paths on conflict or zero-match | ToolResponse shape verified from errors.ts; error text format locked in CONTEXT |
| ADAPT-05 | `--framework nextjs\|expo-router` CLI flag overrides auto-detect; skips two-signal probe | INIT_OPTION_SCHEMA pattern verified; parseArgs strict mode pattern clear |
| ADAPT-06 | All 4 MCP tool handlers route through selectAdapter; no direct NextJsAdapter import | All 4 handlers verified — identical pattern, mechanical refactor |
| INTEG-04 | Monorepo fixture (Next.js in apps/web/, Expo Router in apps/mobile/) verifies selectAdapter picks right adapter | Fixture structure clear; integration test pattern from barrel.test.ts |
</phase_requirements>

---

## Summary

Phase 11 builds the adapter selection layer on top of the FrameworkAdapter interface locked in Phase 10. The codebase is in a clean state (371 tests green) with all 4 tool handlers hardcoding `new Analyzer({ root, adapter: NextJsAdapter })` — a mechanical refactor into `await selectAdapter(root)`.

The key technical work is: (1) two new detection functions with symmetric `{ detected: boolean; signals: string[] }` return shape, (2) `selectAdapter` orchestrating both probes via `Promise.all`, (3) `ExpoRouterAdapter` stub satisfying the 8-method `FrameworkAdapter` interface at compile time, (4) `--framework` CLI flag via the existing `INIT_OPTION_SCHEMA` pattern, and (5) fixture updates and new integration test.

**Critical fixture gap discovered:** Both `test/fixtures/expo-basic/` and `test/fixtures/next-app-router/` lack root-level `package.json` files. The SPEC acceptance criteria for `selectAdapter("expo-basic/")` and `selectAdapter("next-app-router/")` require the two-signal package.json probe to succeed. Wave 0 must add `package.json` to these fixtures before detection tests can pass.

**Primary recommendation:** Follow the exact patterns in `src/adapters/next/detect.ts` and `src/mcp/errors.ts` — the codebase is already structured to make this phase nearly mechanical.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Framework detection | Adapter layer (`src/adapters/`) | — | Detection logic is adapter-specific; keeps core/ clean per island rule |
| Adapter selection | Adapter layer (`src/adapters/select.ts`) | — | Selection orchestrates adapters; cannot be in core/ (island violation) |
| Tool routing | MCP tool handlers (`src/mcp/tools/`) | Adapter layer | Handlers call selectAdapter; adapter layer provides the result |
| CLI flag parsing | CLI (`src/cli.ts` + `src/init/argv.ts`) | — | Server-level concern; parsed at spawn, not per-call |
| Module singleton | Adapter layer (`src/adapters/select.ts`) | CLI entry point | Singleton lives next to selectAdapter; CLI sets it at startup |
| ExpoRouterAdapter stub | Adapter layer (`src/adapters/expo/`) | — | Implements FrameworkAdapter; island rule permits adapters → core |
| Test fixture updates | Test fixtures (`test/fixtures/`) | — | Fixture data must match detection signal expectations |

---

## Standard Stack

### Core (all already in project — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:fs/promises` | built-in | `access()` / `readFile()` for detection probes | Already used in `detect.ts`; no-throw pattern established |
| `node:path` | built-in | `join()` for constructing probe paths | Already used everywhere |
| `node:util` | built-in | `parseArgs()` for CLI flag parsing | Already used in `src/init/argv.ts` |
| `@babel/types` | `^7.29.0` | Type guards in ExpoRouterAdapter | Already in project |
| `zod` | `^4.1.4` | Tool input schemas (unchanged) | Already in project |

### No New Dependencies Required

This phase introduces no new npm dependencies. All required capabilities exist in the current dependency set.

**Installation:** None required. [VERIFIED: codebase inspection — all imports resolve to existing packages]

---

## Package Legitimacy Audit

> No new packages installed in this phase. Audit not applicable.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
CLI startup (src/cli.ts)
    |
    | parseArgs() → framework flag present?
    |       |
    |       YES → validate against ["nextjs","expo-router"]
    |       |     invalid → stderr + process.exit(1)
    |       |     valid → setFrameworkOverride(value)
    |       NO → _frameworkOverride stays undefined
    |
    v
startServer() → MCP tool call arrives
    |
    v
Tool handler (e.g. get-full-hierarchy.ts)
    |
    | const root = resolveRoot(args.projectRoot)
    | const adapter = await selectAdapter(root)
    |
    | if ("isError" in adapter) return adapter  ← early return
    |
    v
Analyzer({ root, adapter })
    |
    v
[existing pipeline unchanged]


selectAdapter(root, override = _frameworkOverride)
    |
    | override present? → instantiate directly, skip probes
    |       "nextjs"      → return NextJsAdapter
    |       "expo-router" → return new ExpoRouterAdapter()
    |
    | no override → run probes concurrently
    |
    v
Promise.all([detectNextJs(root), detectExpoRouter(root)])
    |
    | both true  → conflict error (names both signal paths)
    | both false → zero-match error ("Use --framework")
    | nextjs only → return NextJsAdapter
    | expo only   → return new ExpoRouterAdapter()
```

### Recommended Project Structure

```
src/adapters/
├── FrameworkAdapter.ts      # unchanged (8-method interface)
├── types.ts                 # unchanged
├── select.ts                # NEW — selectAdapter + setFrameworkOverride
├── next/
│   ├── NextJsAdapter.ts     # unchanged
│   ├── detect.ts            # ADD detectNextJs() export; keep detect() unchanged
│   ├── discover.ts          # unchanged
│   ├── route-map.ts         # unchanged
│   └── segments.ts          # unchanged
└── expo/
    ├── ExpoRouterAdapter.ts # NEW — stub implementing all 8 FrameworkAdapter methods
    └── detect.ts            # NEW — detectExpoRouter() two-signal probe

test/fixtures/
├── expo-basic/
│   └── package.json         # ADD — {dependencies: {"expo-router": "*"}}  ← Wave 0 gap
├── next-app-router/
│   └── package.json         # ADD — {dependencies: {"next": "*"}}          ← Wave 0 gap
└── monorepo-mixed/          # NEW fixture
    ├── apps/
    │   ├── web/
    │   │   ├── package.json         # {dependencies: {"next": "*"}}
    │   │   ├── next.config.ts       # export default {}
    │   │   └── app/
    │   │       └── page.tsx         # export default function Page() {}
    │   └── mobile/
    │       ├── package.json         # {dependencies: {"expo-router": "*"}}
    │       └── app/
    │           └── _layout.tsx      # import { Slot } from "expo-router"; ...
    └── package.json                 # root (optional — workspace root)

test/adapters/
└── select.test.ts           # NEW — unit + integration tests for selectAdapter
```

### Pattern 1: Detection Function Shape (Symmetric)

Both detection functions follow the exact same return shape to allow uniform processing in `selectAdapter`.

```typescript
// Source: src/adapters/next/detect.ts (existing) + D-05/D-06 decisions

// detectNextJs — new export alongside existing detect()
export async function detectNextJs(
  absRoot: string
): Promise<{ detected: boolean; signals: string[] }> {
  const signals: string[] = [];

  // Signal 1: next in package.json dependencies or devDependencies
  try {
    const pkgPath = join(absRoot, "package.json");
    const raw = await readFile(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const deps = { ...(pkg.dependencies as Record<string, unknown> | undefined), ...(pkg.devDependencies as Record<string, unknown> | undefined) };
    if ("next" in deps) {
      signals.push("package.json#next");
    }
  } catch {
    // missing or malformed package.json — no signal
  }

  // Signal 2: any next.config.*
  const NEXT_CONFIGS = ["next.config.js", "next.config.mjs", "next.config.cjs", "next.config.ts"];
  for (const name of NEXT_CONFIGS) {
    const p = join(absRoot, name);
    if (await exists(p)) {
      signals.push(name);
      break;
    }
  }

  return {
    detected: signals.length === 2, // BOTH signals required
    signals,
  };
}

// detectExpoRouter — same shape
export async function detectExpoRouter(
  absRoot: string
): Promise<{ detected: boolean; signals: string[] }> {
  const signals: string[] = [];

  // Signal 1: expo-router in package.json dependencies or devDependencies
  try {
    const pkgPath = join(absRoot, "package.json");
    const raw = await readFile(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const deps = { ...(pkg.dependencies as Record<string, unknown> | undefined), ...(pkg.devDependencies as Record<string, unknown> | undefined) };
    if ("expo-router" in deps) {
      signals.push("package.json#expo-router");
    }
  } catch {
    // missing or malformed — no signal
  }

  // Signal 2: app/_layout.tsx or src/app/_layout.tsx
  for (const candidate of ["app/_layout.tsx", "src/app/_layout.tsx"]) {
    const p = join(absRoot, candidate);
    if (await exists(p)) {
      signals.push(candidate);
      break;
    }
  }

  return {
    detected: signals.length === 2,
    signals,
  };
}
```

[VERIFIED: codebase inspection — `detect()` in `src/adapters/next/detect.ts` uses same `exists()` helper pattern; D-05/D-06 locked in CONTEXT.md]

### Pattern 2: selectAdapter with Module Singleton

```typescript
// Source: D-03 decision + ToolResponse shape from src/mcp/errors.ts

import type { FrameworkAdapter } from "./FrameworkAdapter.js";
import type { ToolResponse } from "../mcp/errors.js";
import { NextJsAdapter } from "./next/NextJsAdapter.js";
import { ExpoRouterAdapter } from "./expo/ExpoRouterAdapter.js";
import { detectNextJs } from "./next/detect.js";
import { detectExpoRouter } from "./expo/detect.js";

// Module singleton (D-03) — set by cli.ts at startup
let _frameworkOverride: string | undefined;

export function setFrameworkOverride(v: string): void {
  _frameworkOverride = v;
}

export async function selectAdapter(
  projectRoot: string,
  override: string | undefined = _frameworkOverride,
): Promise<FrameworkAdapter | ToolResponse> {
  // Override path — skip probes entirely (D-03)
  if (override === "nextjs") return NextJsAdapter;
  if (override === "expo-router") return new ExpoRouterAdapter();

  // Parallel probes (ADAPT-03 constraint)
  const [nextResult, expoResult] = await Promise.all([
    detectNextJs(projectRoot),
    detectExpoRouter(projectRoot),
  ]);

  if (nextResult.detected && expoResult.detected) {
    // Conflict — name both signal paths (ADAPT-04)
    return {
      isError: true,
      content: [{
        type: "text",
        text: `Detected Next.js (${nextResult.signals.join(", ")}) AND Expo Router (${expoResult.signals.join(", ")}). Use --framework to disambiguate.`,
      }],
    };
  }

  if (!nextResult.detected && !expoResult.detected) {
    // Zero-match
    return {
      isError: true,
      content: [{
        type: "text",
        text: `No framework detected at ${projectRoot}. Use --framework nextjs|expo-router to specify.`,
      }],
    };
  }

  if (nextResult.detected) return NextJsAdapter;
  return new ExpoRouterAdapter();
}
```

[VERIFIED: codebase inspection — `ToolResponse` shape from `src/mcp/errors.ts`; `CallToolResult` from MCP SDK; D-01/D-03 locked]

### Pattern 3: Tool Handler Refactor (Identical for All 4)

```typescript
// BEFORE (current pattern in all 4 handlers):
import { NextJsAdapter } from "../../adapters/next/NextJsAdapter.js";
// ...
const analyzer = new Analyzer({ root, adapter: NextJsAdapter });

// AFTER (D-01, D-02):
import { selectAdapter } from "../../adapters/select.js";
// ...
const adapter = await selectAdapter(root);
if ("isError" in adapter) return adapter;  // early return inside withErrorBoundary
const analyzer = new Analyzer({ root, adapter });
```

[VERIFIED: codebase inspection — all 4 handlers have identical pattern; `withErrorBoundary` already wraps the body]

### Pattern 4: CLI Flag Addition

```typescript
// src/init/argv.ts — INIT_OPTION_SCHEMA addition:
export const INIT_OPTION_SCHEMA = {
  // ...existing fields...
  framework: { type: "string" as const },  // ADD
};

// src/cli.ts — after meta.init check, before startServer():
// In the `else` branch (server mode):
const frameworkVal = meta.framework as string | undefined;
if (frameworkVal !== undefined) {
  const VALID_FRAMEWORKS = ["nextjs", "expo-router"] as const;
  if (!(VALID_FRAMEWORKS as readonly string[]).includes(frameworkVal)) {
    process.stderr.write(
      `[framework] error: unknown value "${frameworkVal}". Valid values: nextjs, expo-router\n`
    );
    process.exit(1);
  }
  setFrameworkOverride(frameworkVal);
}
startServer().catch(/* existing handler */);
```

[VERIFIED: codebase inspection — `INIT_OPTION_SCHEMA` in `src/init/argv.ts`; `meta.init` dispatch pattern in `cli.ts`]

### Pattern 5: ExpoRouterAdapter Stub Shape

```typescript
// Source: FrameworkAdapter.ts interface (8 methods locked by Phase 10)
import type { FrameworkAdapter } from "../FrameworkAdapter.js";
import type { ComponentDefinition, ParseContext, ResolveResult, RouteMatch } from "../types.js";
import { resolveModule as coreResolveModule } from "../../core/resolver/index.js";

export class ExpoRouterAdapter implements FrameworkAdapter {
  async detect(absRoot: string): Promise<boolean> {
    // Phase 12 wires detectExpoRouter here; stub returns false
    return false;
  }

  async discoverEntries(_absRoot: string): Promise<string[]> {
    return [];
  }

  resolveModule(
    ctx: ParseContext,
    fromFile: string,
    specifier: string,
    importedName: string,
  ): ResolveResult {
    // D-08: delegate to core resolver directly
    return coreResolveModule(ctx, fromFile, specifier, importedName);
  }

  extractComponents(
    _ctx: ParseContext,
    _entryFiles: string[],
    _opts?: { fullClasses?: boolean },
  ): ComponentDefinition[] {
    return [];
  }

  async mapRouteToEntry(_absRoot: string, _route: string): Promise<RouteMatch> {
    return { matched: false };
  }

  classifyEntry(_absPath: string): "page" | "layout" | "special" | "other" {
    return "other";
  }

  async enumerateRoutes(_absRoot: string): Promise<string[]> {
    return [];
  }

  slotMarker(name: string, importSource: string): boolean {
    // Expo Router uses <Slot> from "expo-router" — Phase 12 fills real logic
    return name === "Slot" && importSource === "expo-router";
  }
}
```

[VERIFIED: codebase inspection — `FrameworkAdapter` interface 8 methods; `NextJsAdapter` shape as reference; D-07/D-08 locked; `resolveModule as coreResolveModule` import pattern from `NextJsAdapter.ts` line 37]

### Anti-Patterns to Avoid

- **Calling `detectNextJs` from `selectAdapter` sequentially:** Must use `Promise.all` — constraint is explicit in SPEC. Sequential detection penalizes Next.js projects unnecessarily.
- **Throwing in `selectAdapter` on conflict/zero-match:** Must return `{ isError: true, content: [...] }` — this is D-01 (return ToolResponse, not throw). `withErrorBoundary` handles throws from unexpected errors separately.
- **Adding `--framework` validation inside `parseInitArgs`:** The `--framework` flag is a server-mode flag, not an init-mode flag. Validation should be in the server-mode `else` branch of `cli.ts`, not in `parseInitArgs`. Mixing them would incorrectly reject `--framework` when `--init` is used.
- **Creating ExpoRouterAdapter as an object literal:** The interface requires a `class` because `selectAdapter` needs `return new ExpoRouterAdapter()` — NextJsAdapter is an object literal, ExpoRouterAdapter must be a class (or could be object literal, but class makes `instanceof` checks possible for tests).
- **Leaving `base.warnings ?? []` in handlers:** The `??` is redundant because `buildEnvelope` always returns `warnings: []` — safe to remove during refactor (D-09, opportunistic).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File existence check | Custom try/catch wrapper | Existing `exists()` helper in `detect.ts` | Already battle-tested with ENOENT handling |
| JSON parsing of package.json | Custom parser | `JSON.parse(await readFile(...))` with try/catch | Simple, zero-dep; same pattern works everywhere |
| Concurrent probe execution | Manual promise chaining | `Promise.all([detectNextJs, detectExpoRouter])` | Built-in; captures both results even on error |
| CLI arg validation | Custom string matcher | `parseArgs` strict mode + manual allowlist check | Pattern already proven in `parseInitArgs` for `--target` |
| ToolResponse error shape | New error class | Existing `{ isError: true, content: [...] }` literal | Direct `ToolResponse` compatible shape per D-01 |

**Key insight:** Every pattern needed already exists in the codebase. This phase is integration work, not invention.

---

## Common Pitfalls

### Pitfall 1: Fixture Missing package.json — detectExpoRouter Returns false on expo-basic

**What goes wrong:** `detectExpoRouter("test/fixtures/expo-basic/")` returns `{ detected: false }` because `expo-basic` has no root-level `package.json`. Signal 1 (expo-router in deps) cannot be found. The SPEC acceptance criterion `selectAdapter("expo-basic/")` returns `ExpoRouterAdapter` will fail.

**Why it happens:** Phase 9 (INTEG-01) created `expo-basic` fixture with only `app/`, `node_modules/`, `tsconfig.json`. No `package.json` was needed at the time because no package.json-reading detection existed.

**How to avoid:** Wave 0 task must add `package.json` to `expo-basic` and `next-app-router` fixtures before implementing detection:
- `test/fixtures/expo-basic/package.json` → `{"name": "expo-basic", "dependencies": {"expo-router": "*"}}`
- `test/fixtures/next-app-router/package.json` → `{"name": "next-app-router", "dependencies": {"next": "*"}}`

**Warning signs:** `detectExpoRouter` unit test returns `{ detected: false }` for `expo-basic` even though `_layout.tsx` exists.

### Pitfall 2: `--framework` Flag Rejected in Server Mode Due to Strict parseArgs

**What goes wrong:** Adding `framework` to `INIT_OPTION_SCHEMA` but forgetting that `parseInitArgs` uses `strict: true`. If `--framework` is present on argv when `--init` is NOT present, the loose pre-parse (`strict: false`) in `cli.ts` will handle it correctly — but `parseInitArgs` is only called when `meta.init` is true, so this is not actually a problem. However, if `--framework` is omitted from `INIT_OPTION_SCHEMA`, the loose pre-parse will miss it entirely and `meta.framework` will be undefined.

**Why it happens:** The `INIT_OPTION_SCHEMA` is shared between the loose pre-parse (always runs) and the strict init validation (only runs when `--init`). `--framework` must be in the schema for the loose pre-parse to capture it.

**How to avoid:** Add `framework: { type: "string" as const }` to `INIT_OPTION_SCHEMA` in `src/init/argv.ts`. The init-mode validation in `parseInitArgs` will see the field but ignore it (not an init concern). Validation of the framework value happens only in the server-mode `else` branch of `cli.ts`.

**Warning signs:** `meta.framework` is always `undefined` even when `--framework nextjs` is passed.

### Pitfall 3: Island Rule Violation — selectAdapter Importing from core/ (Wrong Direction)

**What goes wrong:** If `src/adapters/select.ts` imports from `src/core/` directly (e.g., tries to import `resolveRoot`), it is still legal per the island rule (adapters → core is allowed). The actual violation risk is in the other direction: if anyone in `src/core/` tries to import from `src/adapters/select.ts`.

**Why it happens:** `selectAdapter` returns a `FrameworkAdapter` instance. Future developers might be tempted to call `selectAdapter` from `Analyzer.ts` (in `src/core/`), which would violate the island rule.

**How to avoid:** `selectAdapter` must only be called from `src/mcp/tools/*.ts` — the tool handler layer. Never from `src/core/`. The island test in `test/architecture/island.test.ts` enforces this at test time.

**Warning signs:** `test/architecture/island.test.ts` fails with a violation in `src/core/Analyzer.ts` or similar.

### Pitfall 4: Conflict Error Doesn't Name Signal Paths When signals[] Is Empty

**What goes wrong:** If the conflict path is triggered but `signals[]` is empty (e.g., due to a bug in detection), the error message reads "Detected Next.js () AND Expo Router ()." — unhelpful.

**Why it happens:** D-06 requires `signals` to always include matched paths, but a bug could produce `detected: true` with empty signals if the two-signal check logic is wrong.

**How to avoid:** Unit test the conflict case explicitly with a monorepo-mixed fixture where both probes return populated signals. Assert the error text contains actual file paths.

**Warning signs:** Error message contains empty parentheses `()` in the conflict text.

### Pitfall 5: `ExpoRouterAdapter` as Object Literal Breaks instanceof Check in Tests

**What goes wrong:** If `ExpoRouterAdapter` is implemented as an object literal (like `NextJsAdapter`), then `adapter instanceof ExpoRouterAdapter` fails in tests. SPEC acceptance criterion "returns an `ExpoRouterAdapter` instance" requires identity check.

**Why it happens:** `NextJsAdapter` is a `const` object literal. That pattern works for Next.js but makes identity checking harder for Expo.

**How to avoid:** Implement `ExpoRouterAdapter` as a `class`. The `FrameworkAdapter` interface works equally well with classes. The FrameworkAdapter locking test checks structural shape, not implementation form.

**Warning signs:** `expect(adapter).toBeInstanceOf(ExpoRouterAdapter)` throws `TypeError: Right-hand side of 'instanceof' is not callable`.

---

## Code Examples

### Verified Pattern: Two-Signal Detection with Partial Match Tracking

```typescript
// Source: D-05, D-06 decisions + existing detect.ts pattern
// signals[] accumulates as we find matches (not reset on failure)
async function detectNextJs(absRoot: string): Promise<{ detected: boolean; signals: string[] }> {
  const signals: string[] = [];

  // Signal 1 — package.json deps check
  // try/catch: missing or malformed package.json gracefully skips
  try {
    const raw = await readFile(join(absRoot, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
    if ("next" in { ...pkg.dependencies, ...pkg.devDependencies }) {
      signals.push("package.json#next");
    }
  } catch { /* no-op */ }

  // Signal 2 — config file probe (short-circuit on first match)
  for (const name of ["next.config.js", "next.config.mjs", "next.config.cjs", "next.config.ts"]) {
    if (await exists(join(absRoot, name))) {
      signals.push(name);
      break;
    }
  }

  return { detected: signals.length === 2, signals };
}
```

### Verified Pattern: isError Early Return Inside withErrorBoundary

```typescript
// Source: D-02 decision + withErrorBoundary from src/mcp/errors.ts
export async function handler(args: z.infer<typeof inputSchema>): Promise<ToolResponse> {
  return withErrorBoundary(name, async () => {
    const root = resolveRoot(args.projectRoot);
    const adapter = await selectAdapter(root);         // returns FrameworkAdapter | ToolResponse
    if ("isError" in adapter) return adapter;           // D-02 early return
    const analyzer = new Analyzer({ root, adapter });
    const { tree, warnings } = await analyzer.getFullHierarchy({ route: args.route });
    const base = buildEnvelope(tree, { resolvedRootOverride: root });
    const envelope = { ...base, warnings: [...base.warnings, ...warnings] }; // D-09: remove ?? []
    const text = args.format === "json"
      ? JSON.stringify(renderJson(tree, envelope), null, 2)
      : renderMarkdown(tree, envelope);
    return { content: [{ type: "text" as const, text }] };
  });
}
```

### Verified Pattern: Integration Test (Based on barrel.test.ts ctxFor pattern)

```typescript
// Source: test/core/resolver/barrel.test.ts (ctxFor pattern)
import path from "node:path";
import { describe, expect, it } from "vitest";
import { selectAdapter } from "../../../src/adapters/select.js";
import { NextJsAdapter } from "../../../src/adapters/next/NextJsAdapter.js";
import { ExpoRouterAdapter } from "../../../src/adapters/expo/ExpoRouterAdapter.js";

const fx = (name: string) => path.resolve(`test/fixtures/${name}`);

describe("selectAdapter integration", () => {
  it("returns NextJsAdapter for next-app-router fixture", async () => {
    const result = await selectAdapter(fx("next-app-router"));
    expect(result).toBe(NextJsAdapter);
  });

  it("returns ExpoRouterAdapter for expo-basic fixture", async () => {
    const result = await selectAdapter(fx("expo-basic"));
    expect(result).toBeInstanceOf(ExpoRouterAdapter);
  });

  it("returns isError for monorepo-mixed root (conflict)", async () => {
    const result = await selectAdapter(fx("monorepo-mixed"));
    expect(result).toMatchObject({ isError: true });
    expect((result as any).content[0].text).toContain("Use --framework");
  });

  it("returns NextJsAdapter for monorepo-mixed/apps/web", async () => {
    const result = await selectAdapter(fx("monorepo-mixed/apps/web"));
    expect(result).toBe(NextJsAdapter);
  });

  it("returns ExpoRouterAdapter for monorepo-mixed/apps/mobile", async () => {
    const result = await selectAdapter(fx("monorepo-mixed/apps/mobile"));
    expect(result).toBeInstanceOf(ExpoRouterAdapter);
  });

  it("override skips probes — expo-router override on next project", async () => {
    const result = await selectAdapter(fx("next-app-router"), "expo-router");
    expect(result).toBeInstanceOf(ExpoRouterAdapter);
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All tools hardcode NextJsAdapter | selectAdapter auto-routes | Phase 11 | Future adapters plug in without touching tool code |
| detect() returns boolean | detectNextJs() returns `{ detected, signals }` | Phase 11 | Enables named-path error messages; backward compat via keeping `detect()` |
| No `--framework` flag | `--framework nextjs\|expo-router` at CLI startup | Phase 11 | CI/monorepo disambiguation without per-call protocol change |

**No deprecated/outdated items in this phase's scope.**

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `test/fixtures/expo-basic/` and `test/fixtures/next-app-router/` lack root `package.json` — verified by directory listing | Pitfall 1 | If package.json somehow exists but wasn't found, no risk — detection would pass sooner |
| A2 | `ExpoRouterAdapter` must be a `class` (not object literal) for `instanceof` checks in tests | Pattern 5 | If tests use structural checks instead of instanceof, object literal would work |
| A3 | The monorepo-mixed root (parent of apps/) should trigger a conflict error (both next and expo-router signals at the mono-root level won't be present) — so the monorepo-mixed root-level selectAdapter call is actually a zero-match, not a conflict | Code Examples | If fixture has cross-workspace package.json at root with both deps, behavior changes |

**Note on A3:** The SPEC says "calling `selectAdapter` on a monorepo-mixed root returns `{ isError: true }`" — this is correct either as zero-match or conflict. The error text differs but both are `isError: true`. The integration test from CONTEXT maps to specific workspace paths, so the root call should be zero-match (no framework detected at monorepo root level). The fixture design should NOT put `next` and `expo-router` both in a root `package.json`.

---

## Open Questions (RESOLVED)

1. RESOLVED: **Does the monorepo-mixed root need to trigger zero-match or conflict?**
   - What we know: SPEC R4 says "calling `selectAdapter` on a monorepo-mixed root returns `{ isError: true }` with text naming both matched paths" — this implies conflict, not zero-match
   - What's unclear: For the root to be a conflict, both next.js AND expo-router signals must be detected at the root level. But a well-designed monorepo fixture wouldn't have `next.config.ts` at the root — it would only be in `apps/web/`
   - Recommendation: Design the `monorepo-mixed` fixture to NOT have next.config.ts or _layout.tsx at root level. The root will be zero-match. The SPEC acceptance criterion only says `isError: true` — both zero-match and conflict satisfy that. The integration test should test `apps/web/` and `apps/mobile/` individually (which passes INTEG-04).

2. RESOLVED: **Should `next-detect-with-app` and `next-detect-with-src-app` fixtures also get package.json?**
   - What we know: These fixtures are used only by `detect.ts` unit tests which call the OLD `detect()` function (no package.json check). They don't affect Phase 11.
   - Recommendation: Leave them alone. Only `expo-basic` and `next-app-router` need package.json additions for Phase 11.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | >=20 (project constraint) | — |
| vitest | Test runner | ✓ | ^4.3.6 | — |
| TypeScript | Build | ✓ | ^5.20.1 | — |
| `node:fs/promises` | Detection probes | ✓ | built-in | — |

**Missing dependencies with no fallback:** None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.3.6 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `rtk vitest run test/adapters/` |
| Full suite command | `rtk vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADAPT-03 | `detectExpoRouter(expo-basic)` returns true | unit | `rtk vitest run test/adapters/select.test.ts` | ❌ Wave 0 |
| ADAPT-03 | `detectExpoRouter(next-app-router)` returns false | unit | `rtk vitest run test/adapters/select.test.ts` | ❌ Wave 0 |
| ADAPT-03 | `detectNextJs(next-app-router)` returns true | unit | `rtk vitest run test/adapters/select.test.ts` | ❌ Wave 0 |
| ADAPT-03 | `selectAdapter` runs both probes concurrently | unit | `rtk vitest run test/adapters/select.test.ts` | ❌ Wave 0 |
| ADAPT-04 | Conflict case returns `{ isError: true }` with both signal paths | integration | `rtk vitest run test/adapters/select.test.ts` | ❌ Wave 0 |
| ADAPT-04 | Zero-match returns `{ isError: true }` with --framework hint | unit | `rtk vitest run test/adapters/select.test.ts` | ❌ Wave 0 |
| ADAPT-05 | `--framework expo-router` override returns ExpoRouterAdapter regardless | unit | `rtk vitest run test/adapters/select.test.ts` | ❌ Wave 0 |
| ADAPT-05 | Invalid `--framework` value exits with code 1 | manual/e2e | CLI spawn test | ❌ Wave 0 |
| ADAPT-06 | No `NextJsAdapter` import in `src/mcp/tools/*` | grep check | `grep -r "NextJsAdapter" src/mcp/tools/` | — |
| ADAPT-06 | All 371 existing tests still pass | regression | `rtk vitest run` | ✅ existing |
| INTEG-04 | `selectAdapter(monorepo-mixed/apps/web)` returns NextJsAdapter | integration | `rtk vitest run test/adapters/select.test.ts` | ❌ Wave 0 |
| INTEG-04 | `selectAdapter(monorepo-mixed/apps/mobile)` returns ExpoRouterAdapter | integration | `rtk vitest run test/adapters/select.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `rtk vitest run test/adapters/`
- **Per wave merge:** `rtk vitest run`
- **Phase gate:** Full suite green (≥371+new tests) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `test/adapters/select.test.ts` — covers ADAPT-03, ADAPT-04, ADAPT-05, INTEG-04
- [ ] `test/fixtures/expo-basic/package.json` — Wave 0 fixture update (no package.json exists; detection will fail without it)
- [ ] `test/fixtures/next-app-router/package.json` — Wave 0 fixture update
- [ ] `test/fixtures/monorepo-mixed/` directory structure — entire new fixture

---

## Security Domain

> This phase does not introduce authentication, session management, cryptography, or user input beyond CLI flags. The `--framework` flag is validated against a strict allowlist before the server starts (D-04), preventing injection. No ASVS categories apply to this phase beyond:

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes (--framework flag) | Allowlist check in cli.ts before startServer() — D-04 |
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V6 Cryptography | no | — |

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| `--framework` argv injection | Tampering | Allowlist `["nextjs", "expo-router"]` + process.exit(1) before server start (D-04) |
| Malformed `package.json` in project root | Tampering/DoS | try/catch around JSON.parse — no signal emitted, probe returns false |

---

## Sources

### Primary (HIGH confidence)

- `src/adapters/next/detect.ts` [VERIFIED: codebase inspection] — existing `exists()` helper + `detect()` pattern; exact model for `detectNextJs()`
- `src/mcp/errors.ts` [VERIFIED: codebase inspection] — `ToolResponse` type = `CallToolResult`; `withErrorBoundary` shape; `{ isError: true, content: [...] }` structure
- `src/mcp/tools/get-full-hierarchy.ts` [VERIFIED: codebase inspection] — exact lines to refactor; `import { NextJsAdapter }` at line 7; `new Analyzer({ root, adapter: NextJsAdapter })` at line 38
- `src/init/argv.ts` [VERIFIED: codebase inspection] — `INIT_OPTION_SCHEMA` shape; `{ type: "string" as const }` pattern for string flags
- `src/cli.ts` [VERIFIED: codebase inspection] — dispatch pattern: `if (meta.init)` / `else { startServer() }`; strict: false pre-parse
- `src/adapters/FrameworkAdapter.ts` [VERIFIED: codebase inspection] — 8-method interface; all method signatures
- `src/adapters/next/NextJsAdapter.ts` [VERIFIED: codebase inspection] — `resolveModule as coreResolveModule` import pattern; object literal shape
- `test/adapters/FrameworkAdapter.test.ts` [VERIFIED: codebase inspection] — 8-method locking test; must stay green
- `test/architecture/island.test.ts` [VERIFIED: codebase inspection] — island rule enforcement; adapters → core OK, core → adapters blocked
- `test/fixtures/expo-basic/` [VERIFIED: codebase inspection — directory listing] — NO root package.json; only `app/`, `node_modules/expo-router/`, `tsconfig.json`
- `test/fixtures/next-app-router/` [VERIFIED: codebase inspection — directory listing] — NO root package.json; only `app/`, `next.config.mjs`

### Secondary (MEDIUM confidence)

- `test/core/resolver/barrel.test.ts` [VERIFIED: codebase inspection] — `ctxFor()` helper pattern for integration tests; shows `path.resolve()` + fixture path style

### Tertiary (LOW confidence)

- None required — all findings are directly verified from codebase.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; existing packages confirmed
- Architecture: HIGH — all patterns verified from existing codebase; decisions locked in CONTEXT.md
- Pitfalls: HIGH — Pitfall 1 (missing package.json) confirmed by directory listing; others derived from locked decisions and codebase patterns

**Research date:** 2026-05-18
**Valid until:** 2026-06-18 (stable domain — TypeScript/Node.js; no external service dependencies)
