# Phase 12: ExpoRouterAdapter Routing & RN Primitives — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-18
**Phase:** 12-exporouteradapter-routing-rn-primitives
**Areas discussed:** Tabs.Screen TreeNode representation, Import binding sharing strategy, discoverEntries glob scope, mapRouteToEntry entries ordering

---

## Tabs.Screen in TreeNode

| Option | Description | Selected |
|--------|-------------|----------|
| Child TreeNode (A) | Each `<Tabs.Screen>` is a separate child node with `kind: "component"`. `name` and `options` are string attributes on that node. | ✓ |
| Attributes on `<Tabs>` (B) | Flatten screens into parent node. Fewer nodes but complex naming for array-style attrs. | |
| Child node, options omitted | Child node with `name` string attr, but skip `options` object entirely. | |

**User's choice:** Child TreeNode (A)

**Follow-up — options serialization:**

| Option | Description | Selected |
|--------|-------------|----------|
| JSON.stringify compact | `{name: "options", value: '{"title":"Home"}'}` — machine-readable, consistent with existing attrs pattern | ✓ |
| key:value summary | `{name: "options", value: "title: Home"}` — human-friendly but inconsistent | |
| Only literal string props | Skip object props entirely — "summarized" means omit nested objects | |

**User's choice:** JSON.stringify compact

---

## Import Binding Sharing Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Shared core utility (A) | Extract `collectImportBindings` to `src/core/import-bindings.ts`. Analyzer also refactored to import from there. | ✓ |
| Inline in expo adapter (B) | Re-implement binding collection in `rn-primitives.ts`. ~20 lines duplicate but zero core changes. | |

**User's choice:** Shared core utility (A)

**Follow-up — Analyzer.ts refactor timing:**

| Option | Description | Selected |
|--------|-------------|----------|
| Refactor Analyzer.ts in Phase 12 | Move `collectImportBindings` out, Analyzer imports from utility. Single source of truth. | ✓ |
| Add utility, keep Analyzer internal copy | More cautious — cleanup deferred to Phase 15. | |

**User's choice:** Refactor Analyzer.ts in Phase 12

---

## discoverEntries Glob Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Routing files only (exclude components/) | Explicit ignore: `**/components/**`, `**/hooks/**`, `**/utils/**`, `**/node_modules/**`. Clean entry list. | ✓ |
| All .tsx/.jsx under app/ | Glob everything, let `classifyEntry()` filter. Simpler glob but Analyzer called with HomeScreen.tsx. | |

**User's choice:** Routing files only — exclude known non-routing subdirectories

---

## mapRouteToEntry Entries Ordering

| Option | Description | Selected |
|--------|-------------|----------|
| Full chain: layouts + page (A) | `entries = [_layout.tsx chain..., page.tsx]` root→leaf→page order. Consistent with Next.js pattern. | ✓ |
| Page only (B) | `entries = [page.tsx]`. Layouts discovered separately by Analyzer directory walk. | |

**User's choice:** Full layout chain + page (A), root→leaf→page order

---

## Claude's Discretion

- Exact glob pattern and ignore list for `discoverEntries` — planner determines
- Internal structure of `route-map.ts` (segment tree vs linear path building)
- Whether `ExpoSegment` type variants share a common base interface or are a plain union

## Deferred Ideas

None — discussion stayed within phase scope.
