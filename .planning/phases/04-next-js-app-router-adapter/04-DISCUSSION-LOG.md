# Phase 4: Next.js App Router Adapter — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-29
**Phase:** 04-next-js-app-router-adapter
**Areas discussed:** RouteMatch shape, Filesystem walk, Runtime detection, Fixture layout

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| RouteMatch shape | Shape & file location of `RouteMatch` | ✓ |
| Filesystem walk | tinyglobby vs node:fs/promises vs hybrid | ✓ |
| Runtime detection | Where to compute `"use client"` / `"use server"` | ✓ |
| Fixture layout | Test fixture organization strategy | ✓ |

---

## RouteMatch shape

### Q1: Entry shape inside `RouteMatch.entries`

| Option | Description | Selected |
|--------|-------------|----------|
| String paths (Recommended) | `entries: string[]` forward-slash absolute, root-down | ✓ |
| Tagged entries | `entries: { path, role, segment }[]` | |
| Grouped by segment | `entries: { segment, layout?, page?, siblings: {...} }[]` | |

**User's choice:** String paths.
**Notes:** Role recoverable from filename; Phase 5 re-parses files anyway, so duplicating role inline buys nothing.

### Q2: Slots shape and types file location

| Option | Description | Selected |
|--------|-------------|----------|
| Dynamic Record + types.ts (Recommended) | `slots: Record<string, string[]>` in `src/adapters/types.ts` | ✓ |
| Dynamic Record + next/types.ts | Same shape but Next-specific module | |
| Nested RouteMatch slots | `slots: Record<string, RouteMatch>` | |

**User's choice:** Dynamic Record + `src/adapters/types.ts`.
**Notes:** Phase 5 toIR() imports from shared module. Slot keys are user-authored folder names (no fixed enum).

### Q3: No-match shape

| Option | Description | Selected |
|--------|-------------|----------|
| `matched:false` + empty (Recommended) | `{ matched: false, entries: [], params: {}, slots: {} }` | ✓ |
| Discriminated union | `\| { matched: true, ... } \| { matched: false, reason, tried }` | |
| Throw + warning hybrid | Push to ctx.warnings + return matched:false | |

**User's choice:** `matched:false` + empty fields.
**Notes:** D-12 no-throw applies. Matches SPEC literal: "failures surface via return shapes (RouteMatch.matched: false, empty entries array)".

---

## Filesystem walk

### Q4: Enumeration tool

| Option | Description | Selected |
|--------|-------------|----------|
| tinyglobby (Recommended) | Glob with `ignore: ['**/_*/**']`; ~5 LoC | ✓ |
| node:fs/promises readdir | Hand-rolled recursion; ~30 LoC | |
| Hybrid | tinyglobby for discoverEntries, readdir for mapRouteToEntry | |

**User's choice:** tinyglobby for both methods.
**Notes:** Already in stack. Single `ignore` pattern enforces private folder skip in one place.

### Q5: Sync vs async

| Option | Description | Selected |
|--------|-------------|----------|
| Async (Recommended) | All methods return `Promise<T>`; matches FrameworkAdapter interface union | ✓ |
| Sync (fs.readdirSync) | Forces readdir (tinyglobby is async-only); blocks event loop | |

**User's choice:** Async.

---

## Runtime detection

### Q6: Where to compute `"use client"` / `"use server"`

| Option | Description | Selected |
|--------|-------------|----------|
| In buildComponentDefinition (Recommended) | Read `ast.program.directives` in NextJsAdapter.ts | ✓ |
| Add to ParseResult | Modify ParseResult shape in core/ to carry directive | |
| Pre-parse string scan | Regex on source string before parse | |

**User's choice:** In buildComponentDefinition.
**Notes:** Keeps `runtime` as a Next-specific concept; ParseResult / parser core stays framework-agnostic. Respects island rule.

### Q7: Default when no directive present

| Option | Description | Selected |
|--------|-------------|----------|
| `'server'` (Recommended) | Matches SPEC R4 acceptance criteria | ✓ |
| `'unknown'` extra union member | `'server' \| 'client' \| 'unknown'` | |

**User's choice:** `'server'`.
**Notes:** Files with `"use server"` directive also map to `'server'` (server-actions, still server runtime).

---

## Fixture layout

### Q8: Fixture organization

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid (Recommended) | 1 kitchen-sink fixture + focused micro-fixtures for detect | ✓ |
| Many small focused | One fixture per requirement | |
| One mega-fixture | Single fixture covers all | |

**User's choice:** Hybrid.
**Notes:** Kitchen-sink covers SPEC acceptance examples literally; detect needs 4 distinct project shapes → focused micros.

### Q9: Fixture location & generation

| Option | Description | Selected |
|--------|-------------|----------|
| `test/fixtures/next-app-router/` (Recommended) | Real on-disk files, mirrors Phase 3 precedent | ✓ |
| Generate programmatically | mkdtemp + write per test | |

**User's choice:** `test/fixtures/next-app-router/`.

---

## Closing question

### Q10: Continue or write context

| Option | Description | Selected |
|--------|-------------|----------|
| I'm ready for context | Write CONTEXT.md; remaining details (intercepting math, matching algorithm) for planner | ✓ |
| Explore more gray areas | Discuss intercepting math, matching algorithm, detect edge cases | |

**User's choice:** Ready for context.

---

## Claude's Discretion

- Intercepting-route segment-math algorithm (recursive vs table-driven)
- Route matching strategy (route-trie-once-per-call vs scan-and-match)
- `detect()` filesystem probing order across `next.config.{js,mjs,cjs,ts}` variants
- Diagnostic surfacing for malformed route strings (mapRouteToEntry has no ctx)

## Deferred Ideas

- Cross-call route trie cache (ARCH-02 forbids in v1)
- `get_route_map()` tool (v2)
- Pages Router support (v2)
- MDX `.mdx` route handling (out per FEATURES N7)
- Server-component-passed-as-children deep analysis (v1 limitation per PITFALLS §3.3)
- `metadata` / `generateMetadata` / `dynamic` / `revalidate` named exports (silently dropped per PITFALLS §3.4)
