# Phase 4: Next.js App Router Adapter — Research

**Researched:** 2026-04-29
**Domain:** Next.js App Router routing semantics + Babel directive detection + filesystem walk
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**RouteMatch shape & location**
- **D-01:** `RouteMatch` lives in `src/adapters/types.ts` (alongside `ComponentDefinition`, `ResolveResult`). Phase 5's `toIR()` imports from the shared adapter types module — keeps the import surface flat.
- **D-02:** Shape is the four-field flat record:
  ```ts
  interface RouteMatch {
    matched: boolean;
    entries: string[];                       // forward-slash absolute, root-down layout chain incl. siblings
    params: Record<string, string | string[]>; // dynamic segment values
    slots: Record<string, string[]>;         // parallel-route entries keyed by slot name (e.g. "modal")
  }
  ```
  - `entries` is `string[]` (not tagged objects). Role (layout/page/loading/...) is recoverable from filename.
  - Sibling special files (`template.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `default.tsx`) are inlined into `entries` at their segment position.
  - `slots` keys are dynamic strings (folder name minus `@`), not a fixed enum.
- **D-03:** No-match return shape: `{ matched: false, entries: [], params: {}, slots: {} }`. D-12 no-throw applies. Caller checks `matched` flag. Includes "route doesn't match any page" AND "app/ directory missing".
- **D-04:** `FrameworkAdapter.mapRouteToEntry` signature changes from `(absRoot, route) => string[] | Promise<string[]>` to `(absRoot, route) => RouteMatch | Promise<RouteMatch>`. Method count stays 5.

**Filesystem walk**
- **D-05:** Use `tinyglobby` for both `discoverEntries` and the walk inside `mapRouteToEntry`.
- **D-06:** Discovery glob: `app/**/{page,layout,template,loading,error,not-found,default}.{tsx,jsx,ts,js}` with `ignore: ['**/_*/**', '**/node_modules/**']`. Run twice if needed (root variants `app/` and `src/app/`) — first hit wins.
- **D-07:** All four adapter methods return `Promise<T>` (use the `Promise<T> | T` union the interface already permits).
- **D-08:** Forward-slash normalization at the boundary — every path that leaves `discoverEntries` / `mapRouteToEntry` passes through `toForwardSlash`.
- **D-09:** Private folder exclusion (`_*`) is enforced by glob `ignore` pattern — single source of truth.

**Runtime detection (NEXT-04)**
- **D-10:** Computed inside `buildComponentDefinition` (in `src/adapters/next/NextJsAdapter.ts`). Reads `parsed.ast.program.directives[0]` and matches `"use client"` / `"use server"`. Per-file value shared by every `ComponentDefinition` from that file.
- **D-11:** `ParseResult` shape in `src/adapters/types.ts` is **not** modified — runtime is Next-specific and lives in the Next adapter.
- **D-12:** Default when no directive present: `"server"`. Files with `"use server"` directive also map to `"server"` (server-actions modules).
- **D-13:** Field-count test in `test/adapters/types.test.ts` bumps from `=== 12` to `=== 13` keys.

**Fixture layout**
- **D-14:** Hybrid: one kitchen-sink fixture at `test/fixtures/next-app-router/` covering all four conventions; focused micro-fixtures for `detect` under `test/fixtures/next-detect-*/`.
- **D-15:** Fixtures are real on-disk files (not generated programmatically).
- **D-16:** Fixture `runtime` coverage: at least one file with `"use client"` as line 1, one with `"use server"`, one with no directive, one with leading comments + directive. All under the kitchen-sink fixture.

### Claude's Discretion

- **Intercepting-route segment math algorithm** — exact iteration shape (recursive vs. table-driven) left to planner.
- **Route matching strategy** — building a route trie once per `mapRouteToEntry` call vs. scan-and-match per call.
- **`detect()` filesystem probing order** — try `next.config.{js,mjs,cjs,ts}` in any order; existence of any one + `app/` (or `src/app/`) is sufficient.
- **Warning channel usage** — `mapRouteToEntry` does not receive `ParseContext`; diagnostics for malformed route strings either silently return `matched:false` or surface via planner-chosen mechanism.

### Deferred Ideas (OUT OF SCOPE)

- Cross-call route trie cache (ARCH-02 forbids).
- Route discovery tool `get_route_map()` (v2).
- Pages Router support (v2).
- MDX `.mdx` route handling.
- Server-component-passed-as-children deep analysis (PITFALLS §3.3 v1 limitation).
- `metadata` / `generateMetadata` / `dynamic` / `revalidate` named exports.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NEXT-01 | Directory-based layout chain reconstruction (walk `app/` upward, collecting `layout.tsx` + per-segment siblings `template`, `loading`, `error`, `not-found`, `default`) | §"Layout chain semantics" + tinyglobby discovery glob (D-06) |
| NEXT-02 | Route conventions: groups `(name)` (layout-only, no URL segment), parallel `@slot` (sidecar slots map), intercepting `(.)`, `(..)`, `(...)`, `(..)(..)` (segment math), private `_name` (excluded) | §"Route conventions reference table" + Next.js docs verbatim quotes |
| NEXT-03 | Dynamic segment matching `[slug]` (string), `[...rest]` (string[]), `[[...opt]]` (optional string[]) — populate `params` | §"Dynamic segment matching rules" |
| NEXT-04 | First non-comment directive `"use client"` / `"use server"` → `runtime: "server"\|"client"` on every `ComponentDefinition` from that file | §"Directive detection via Babel AST" |
| R5 (detect) | `next.config.{js,mjs,cjs,ts}` exists AND `app/` or `src/app/` exists → true; else false | §"detect() heuristic" |
| R6 (discoverEntries) | Lex-sorted forward-slash absolute paths to all special files under `app/` (or `src/app/`); excludes `_private`; includes `(group)` and `@slot` contents | §"Glob patterns + sort" |
</phase_requirements>

## Summary

Phase 4 converts three stub adapter methods (`detect`, `discoverEntries`, `mapRouteToEntry`) into real Next.js App Router implementations and adds a 12th `runtime` field to `ComponentDefinition`. The work is overwhelmingly **filesystem semantics**, not parser work — Phase 3's parser primitives (`parseFile`, `discoverComponents`, `walkRenderFlow`, `collectStyleSignals`) need zero changes. The Babel AST already exposes `ast.program.directives` for the `"use client"` / `"use server"` detection (NEXT-04), so D-10's "one-liner directive read" is literally that.

The hard parts are all in the routing logic: (a) intercepting routes `(..)photo` are based on **route segments, not filesystem hierarchy** — `@slot` folders must be skipped when computing the "two levels up"; (b) parallel routes `@slot` are siblings whose `page.tsx` becomes a value in `RouteMatch.slots` and whose `layout.tsx` does NOT participate in `entries` (slots have their own layout chain); (c) optional catch-all `[[...opt]]` matches both the parent path AND nested paths, with `params` either an array or an empty array; (d) sibling special files (`template`, `loading`, `error`, `not-found`, `default`) inline into `entries` at their segment's position, not as a sidecar.

Everything ships with `tinyglobby` (already a dep) + `node:fs/promises` + `node:path`. No new runtime deps. Tests use real on-disk fixtures (D-14, D-15) following the existing `test/fixtures/parser/` precedent.

**Primary recommendation:** Build a single in-memory **segment tree** per `mapRouteToEntry` call from a one-shot `tinyglobby` enumeration; do route matching by walking the URL segments against the tree, with explicit handling of group/parallel/intercepting at each step. This avoids both the trie-cache forbiddenness (ARCH-02) and the per-call repeated globbing.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Project root detection (`detect`) | Filesystem (Node) | — | Only filesystem probes; no parsing |
| Special-file enumeration (`discoverEntries`) | Filesystem (Node) | — | Pure glob + sort + private-folder exclusion |
| Route → entry resolution (`mapRouteToEntry`) | Filesystem (Node) | — | Directory walk + segment math; no AST needed |
| Runtime boundary detection (`runtime`) | Adapter (Next) | Parser core (passive) | Reads `ast.program.directives` already produced by `parseFile`; Next-specific so stays in the adapter island |
| `RouteMatch` type | Adapter types (shared) | — | Phase 5's `toIR()` consumes it; lives in `src/adapters/types.ts` (D-01) |
| Phase 5 IR translation | — | — | Out of scope (consumes Phase 4 output, doesn't participate in production) |

## Standard Stack

### Core (already installed — no new deps)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `tinyglobby` | `^0.2.16` `[VERIFIED: npm view tinyglobby version → 0.2.16]` | File globbing for `discoverEntries` + route walk | Already in project deps (D-05); native async API matches D-07 |
| `@babel/types` | `^7.29.0` `[VERIFIED: package.json]` | `t.isDirectiveLiteral` type guards on `ast.program.directives[0].value` | Already in deps; the `Directive`/`DirectiveLiteral` AST shape is part of Babel's spec `[CITED: github.com/babel/babel/blob/main/packages/babel-parser/ast/spec.md]` |
| `node:fs/promises` | (built-in, Node 20) | `fs.access` / `fs.readdir` for `detect()` probing | Zero-dep; matches D-12 no-throw style with try/catch |
| `node:path` | (built-in) | `path.dirname`, `path.posix.join` | Already used by `src/core/paths.ts` |

### Verification — `ast.program.directives` is the right Babel field

`[CITED: github.com/babel/babel/blob/main/packages/babel-parser/ast/spec.md]`

```typescript
interface Program <: Node {
  type: "Program";
  interpreter: InterpreterDirective | null;
  sourceType: "script" | "module";
  body: [ Statement | ImportDeclaration | ExportDeclaration ];
  directives: [ Directive ];   // ← what we read
}

interface Directive <: Node {
  type: "Directive";
  value: DirectiveLiteral;
}

interface DirectiveLiteral <: StringLiteral {
  type: "DirectiveLiteral";
}
```

Babel parses the leading `"use client"` / `"use server"` string literal into `ast.program.directives[0].value.value === "use client"`. **Crucially**, this happens automatically — Babel separates leading directive prologues from the regular `body` statement list, exactly mirroring the ES spec for `"use strict"`. No comment-stripping needed: comments before the directive are stored as `leadingComments` on the directive node and do NOT block the directive from being recognized as a directive (this is the same rule that makes `// hi\n"use strict"` work in script mode).

### No new dependencies needed

The CONTEXT explicitly notes "no new runtime deps anticipated (filesystem walk via `node:fs/promises` and existing `tinyglobby` are sufficient)" — this research confirms that.

## Architecture Patterns

### System Architecture Diagram

```
                       Phase 5 toIR / Analyzer (out of scope)
                                  │ awaits
                                  ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │                       NextJsAdapter                              │
   │                                                                  │
   │   detect(absRoot)         discoverEntries(absRoot)               │
   │       │                          │                               │
   │       │ fs.access                │ tinyglobby                    │
   │       │ next.config.*            │ app/**/{page,...}.{tsx,...}   │
   │       │ + app/|src/app/          │ ignore: _*/, node_modules/    │
   │       ▼                          ▼                               │
   │   boolean                 string[] (lex-sorted, fwd-slash)       │
   │                                                                  │
   │   mapRouteToEntry(absRoot, route)  ─────────► RouteMatch         │
   │       │                                                          │
   │       │ 1. resolve appRoot (app/ or src/app/)                    │
   │       │ 2. tinyglobby enumerate special files (one-shot)         │
   │       │ 3. build segment tree (collapse groups, label slots,     │
   │       │      record dynamic markers, expand interceptors)        │
   │       │ 4. tokenize URL → match segments against tree            │
   │       │ 5. collect layout chain root-down with siblings          │
   │       │ 6. collect parallel slot entries from siblings           │
   │       │ 7. extract dynamic params per matched segment            │
   │       ▼                                                          │
   │   RouteMatch { matched, entries, params, slots }                 │
   │                                                                  │
   │   extractComponents(ctx, files, opts)  (Phase 3, unchanged)      │
   │       │                                                          │
   │       │ parseFile → discoverComponents → walkRenderFlow          │
   │       │                                                          │
   │       │ buildComponentDefinition NEW: read                       │
   │       │   ast.program.directives[0]?.value.value                 │
   │       │   → runtime: "server"|"client"                           │
   │       ▼                                                          │
   │   ComponentDefinition[] (12 fields, includes runtime)            │
   └──────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │ ParseContext (warnings buffer)
   ┌──────────────────────────────────────────────────────────────────┐
   │              src/core/  (parser primitives — unchanged)          │
   │   parseFile · discoverComponents · walkRenderFlow                │
   │   collectStyleSignals · resolveModule · toForwardSlash           │
   └──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| File | Responsibility |
|------|----------------|
| `src/adapters/types.ts` | Add `RouteMatch` interface; bump `ComponentDefinition` to 12 fields with `runtime: "server" \| "client"` |
| `src/adapters/FrameworkAdapter.ts` | Change `mapRouteToEntry` return type from `Promise<string[]> \| string[]` to `Promise<RouteMatch> \| RouteMatch` |
| `src/adapters/next/NextJsAdapter.ts` | Replace 3 throwing stubs; add directive read inside `buildComponentDefinition` |
| `src/adapters/next/detect.ts` *(new)* | Probes `next.config.*` + `app/`/`src/app/`; pure async function |
| `src/adapters/next/discover.ts` *(new)* | `tinyglobby` enumeration + lex sort + forward-slash normalize |
| `src/adapters/next/route-map.ts` *(new)* | Build segment tree from glob hits; export `matchRoute(tree, urlSegments)` returning `RouteMatch` |
| `src/adapters/next/segments.ts` *(new)* | Pure helpers: `classifySegment(folder)` returns `{ kind, label }` for static / dynamic / catch-all / optional-catch-all / group / parallel / intercepting / private |
| `test/fixtures/next-app-router/**` *(new)* | Kitchen-sink fixture (D-14) — real files, no programmatic generation |
| `test/fixtures/next-detect-*/**` *(new)* | 4 micro-fixtures: with `app/`, with `src/app/`, Pages-only, no Next config |
| `test/adapters/next/route-map.test.ts` *(new)* | Routing math (groups, parallel, intercepting, dynamic) |
| `test/adapters/next/detect.test.ts` *(new)* | 4 detect variants |
| `test/adapters/next/discover.test.ts` *(new)* | Enumeration + private-folder exclusion + lex sort |
| `test/adapters/next/runtime.test.ts` *(new)* | Directive detection across 4 fixture variants |
| `test/adapters/types.test.ts` *(modified)* | Bump field-count to 13 entries; add `runtime` to literal |
| `test/adapters/next/NextJsAdapter.test.ts` *(modified)* | Drop the "throws not implemented in Phase 3" assertion; replace with positive assertions |

### Pattern 1: Segment-tree route matching (Claude's discretion territory)

**What:** Build an in-memory tree once per `mapRouteToEntry` call from one `tinyglobby` enumeration. Each tree node represents a directory under `app/` and carries: the segment classification (static name, dynamic, catch-all, group, parallel, intercepting), pointers to children, and a flat record of "special files at this level" (page, layout, template, loading, error, not-found, default).

**When to use:** Always — beats per-segment globbing on the hot path while staying within ARCH-02 (no cross-call cache; the tree is GC'd when `mapRouteToEntry` returns).

**Example (sketch):**

```typescript
// segments.ts
type SegmentKind =
  | { kind: "static"; name: string }
  | { kind: "dynamic"; param: string }                  // [slug]
  | { kind: "catch-all"; param: string }                // [...rest]
  | { kind: "optional-catch-all"; param: string }       // [[...opt]]
  | { kind: "group"; label: string }                    // (marketing)
  | { kind: "parallel"; slot: string }                  // @modal
  | { kind: "intercepting"; level: 0|1|2|"root"; targetSegment: string } // (.)photo, (..)x, (..)(..)x, (...)x
  | { kind: "private"; name: string };                  // _internal — excluded by glob anyway

export function classifySegment(folder: string): SegmentKind { /* regex-driven */ }
```

```typescript
// route-map.ts
interface SegmentNode {
  segment: SegmentKind;
  children: Map<string, SegmentNode>;     // keyed by raw folder name
  files: {
    page?: string; layout?: string; template?: string;
    loading?: string; error?: string; notFound?: string; default?: string;
  };
  parallelSiblings: Map<string, SegmentNode>;  // @slot subtrees keyed by slot name
}

export async function matchRoute(absAppRoot: string, route: string): Promise<RouteMatch> {
  const files = await tinyglobby.glob(/* see D-06 */);
  const tree = buildTree(files, absAppRoot);
  return walk(tree, splitRoute(route));
}
```

The walk descends segment-by-segment; on each step:
- Static → child must exist by exact folder-name match
- `(group)` → transparent: descend into the group child but don't consume a URL segment; group's `layout.tsx` joins `entries`
- `@slot` → not consumed during normal descent; collected as `parallelSiblings` of the parent and recursed for the same URL tail
- `[slug]` / `[...rest]` / `[[...opt]]` → match URL token(s), record into `params`

### Pattern 2: Directive detection (NEXT-04, D-10)

**What:** One-line addition to `buildComponentDefinition` (already exists in NextJsAdapter.ts:103).

**Example:**

```typescript
// inside buildComponentDefinition, after `const renderFlow = walkRenderFlow(...)`
const firstDirective = ast.program.directives[0]?.value.value;
const runtime: "server" | "client" =
  firstDirective === "use client" ? "client" : "server";
// (D-12: "use server" and absence both map to "server")

return {
  // ...existing 11 fields...
  runtime,
};
```

**Subtleties verified:**
- Babel's parser separates leading directive prologues from `body` automatically `[CITED: babel ast/spec.md]`. So leading comments **before** the directive are attached to the directive node and do NOT prevent recognition.
- Single quotes vs double quotes: both produce `DirectiveLiteral` with `value` equal to the unquoted string. No need to inspect the source slice.
- Trailing semicolon: irrelevant to AST shape.
- Shebang (`#!/usr/bin/env node`): irrelevant to App Router files (only CLI scripts have shebangs); Babel strips it before parsing anyway when `interpreter` is set.
- "First non-comment statement" rule: enforced by Babel itself — a directive that appears AFTER a non-string-literal statement is parsed as a regular `ExpressionStatement` with a `StringLiteral` expression and does NOT show up in `directives`. So just reading `directives[0]` is exactly correct semantics.

### Pattern 3: Detect heuristic (R5)

**What:** Pure async existence checks. No content reads.

```typescript
// detect.ts
import { access } from "node:fs/promises";
import { join } from "node:path";

const NEXT_CONFIGS = ["next.config.js", "next.config.mjs", "next.config.cjs", "next.config.ts"];

export async function detect(absRoot: string): Promise<boolean> {
  // Has any next.config.*?
  let hasConfig = false;
  for (const name of NEXT_CONFIGS) {
    if (await exists(join(absRoot, name))) { hasConfig = true; break; }
  }
  if (!hasConfig) return false;

  // Has app/ or src/app/?
  if (await exists(join(absRoot, "app"))) return true;
  if (await exists(join(absRoot, "src", "app"))) return true;
  return false;
}

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}
```

D-12 no-throw applies; permission errors collapse to `false`.

### Anti-Patterns to Avoid

- **Walking up directory-by-directory in `mapRouteToEntry`** (1 fs.readdir per segment): naive but slow on deep trees, and you have to re-stat every special-file candidate at every level. One up-front `tinyglobby` enumeration is strictly better.
- **Using `path.join` (OS-native)** for the URL → folder mapping: keep URL/segment math in `path.posix.*` so Windows tests don't drift.
- **Inferring "use client" from comment text or source-slice regex**: the AST already separates directives from body. Reading the source for this is redundant and breaks on `'use client';` vs `"use client"` quoting variants.
- **Adding a `runtime` field to `ParseResult`**: D-11 forbids — `ParseResult` is core/parser, framework-agnostic. Keep `runtime` Next-specific in the adapter.
- **Throwing on malformed routes** (`"hello"` without leading `/`, empty string): D-12 — return `{ matched: false, entries: [], params: {}, slots: {} }`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File globbing | Recursive `fs.readdir` walker | `tinyglobby` (already in deps) | Handles ignore patterns, dotfile rules, normalizes separators on Windows |
| Path normalization | `.replace(/\\/g, '/')` ad-hoc | `toForwardSlash` from `src/core/paths.ts` | Already battle-tested by Phase 1+3; double-pass handles both `path.sep` AND literal backslashes (POSIX-test-safe) |
| Directive AST extraction | Source-slice regex on the leading `"use client"` text | `ast.program.directives[0]?.value.value` | Babel already does this per the JS spec; comment skipping, quote handling, semicolon are free |
| URL segment splitting | `route.split("/")` raw | `route.split("/").filter(Boolean)` (and reject if `!route.startsWith("/")`) | Naive split leaves an empty leading "" that breaks tree walks |
| Lexicographic sort with locale surprises | `arr.sort()` (default uses host locale on some Node builds — actually fine in Node, but spell it) | `arr.sort((a,b) => a < b ? -1 : a > b ? 1 : 0)` | Explicit code-point order matches what the SPEC R6 acceptance test expects |

**Key insight:** Three of the four "hard" parts (globbing, paths, directive extraction) are already solved by upstream tools / existing Phase 1-3 code. The only genuinely new code is the **route conventions logic** (groups/parallel/intercepting/dynamic) — and that's a finite-state matcher driven by a small set of regex classifiers.

## Route Conventions Reference Table

All quotes are verbatim from official Next.js docs `[CITED: docs/01-app/03-api-reference/03-file-conventions/*]`.

| Convention | Folder shape | URL effect | `RouteMatch` placement | Notes |
|------------|-------------|-----------|------------------------|-------|
| **Static segment** | `dashboard/` | `/dashboard` | layout chain → `entries` | Standard |
| **Dynamic segment** | `[slug]/` | matches one URL token; `params.slug = "x"` | `entries` + `params: { slug: string }` | |
| **Catch-all** | `[...rest]/` | matches one or more tokens; `params.rest = ["a","b"]` | `entries` + `params: { rest: string[] }` | Greedy; must be last |
| **Optional catch-all** | `[[...opt]]/` | matches **zero** or more tokens — also matches the parent path | `entries` + `params: { opt: string[] }` (empty array when zero matches) | "matches both `/maybe` and `/maybe/x`" — SPEC R3 |
| **Route group** | `(marketing)/` | **No URL contribution.** `(marketing)/about/page.tsx` → `/about` | The group's `layout.tsx` IS in `entries`; the folder name is NOT a segment | "should not be included in the route's URL path" |
| **Parallel route** | `@modal/` | **No URL contribution.** Slot rendered alongside `children`. | `slots["modal"]: string[]` (entry list for the matching subtree) | "slots are not route segments and do not affect the URL structure" |
| **Intercepting same-level** | `(.)photo/` | Intercepts the **sibling** `photo` segment | Intercept becomes the matched entry when navigating from same level | Segment-relative, NOT FS-relative |
| **Intercepting one up** | `(..)x/` | Intercepts segment `x` from the **parent** route segment level | | |
| **Intercepting two up** | `(..)(..)x/` | Intercepts segment `x` two route-segment levels up | "(..) is based on route segments, not the file-system, and does not consider @slot folders in Parallel Routes" |
| **Intercepting from root** | `(...)x/` | Intercepts `x` from the `app/` root | | |
| **Private folder** | `_internal/` | Opted out of routing entirely | Excluded everywhere by glob `ignore: ['**/_*/**']` (D-09) | "opting the folder and all its subfolders out of routing" |

**Critical:** the `(..)` count is route-segment-relative, NOT filesystem-relative. When walking up from `app/feed/(.)photo/[id]/page.tsx`:
- `(.)` means **one segment back in the route tree** = sibling of `feed`.
- Route groups don't count. `@slot` folders don't count.
- This is why "segment math" appears in PITFALLS §3.2 and SPEC criterion 2.

For v1, the practical scope of intercepting tests is "resolves to the correct sibling/ancestor segment" (SPEC criterion 2). The fixture `app/feed/(.)photo/[id]/page.tsx` must resolve `(.)photo` → the segment `photo` at the same route-level as `feed` (i.e. `app/photo/`). [VERIFIED via SPEC R2 acceptance.]

## Layout Chain Semantics (NEXT-01)

`[CITED: docs/01-app/03-api-reference/03-file-conventions/{layout,page,loading,error,not-found,template,default}.mdx]`

For URL `/dashboard/settings` and a fixture with layouts at `app/`, `app/dashboard/`, `app/dashboard/settings/`, the `entries` array is **root-down**:

```
[
  app/layout.tsx,                              // root layout (segment: -)
  app/loading.tsx,                              // sibling of root layout if present
  app/error.tsx,                                // sibling
  app/dashboard/layout.tsx,                    // segment: dashboard
  app/dashboard/loading.tsx,                   // sibling if present
  app/dashboard/settings/layout.tsx,           // segment: settings
  app/dashboard/settings/page.tsx,             // terminal page
  app/dashboard/settings/template.tsx,         // sibling if present
  app/dashboard/settings/error.tsx,            // sibling if present
  app/dashboard/settings/not-found.tsx         // sibling if present
]
```

**Order rule (recommended):** for each segment level, emit special files in this order: `layout`, `template`, `loading`, `error`, `not-found`, `default`, then `page` (only at the terminal segment). `page` is last at its level because it represents the "rendered content" while siblings represent boundary UI. This is internal-consistency only — SPEC R1 just says "root-down" and "including … siblings"; nothing more specific.

**`default.tsx`:** only relevant for parallel-route slots (it's the fallback when a slot isn't matched on a given navigation). Include it in `entries` if present at any segment, but its semantic meaning is parallel-route-only — Phase 5 may downgrade it for non-slot pages.

## Dynamic Segment Matching Rules (NEXT-03)

| Pattern | URL `/foo/X` matches → `params` | URL `/foo/X/Y/Z` matches → `params` | Empty match `/foo` |
|---------|--------------------------------|-------------------------------------|--------------------|
| `[slug]` | `{ slug: "X" }` | does not match | does not match |
| `[...rest]` | `{ rest: ["X"] }` | `{ rest: ["X","Y","Z"] }` | does not match (catch-all needs ≥1) |
| `[[...opt]]` | `{ opt: ["X"] }` | `{ opt: ["X","Y","Z"] }` | matches with `{ opt: [] }` |

**SPEC R3 acceptance text** locks the wire shape:
- `[slug]` → `string`
- `[...rest]` → `string[]`
- `[[...opt]]` unmatched: "or absent key" — both shapes pass; pick `params: { opt: [] }` for consistency (no-key surprises Phase 5 IR).

**Param name extraction** is just stripping the brackets and (for catch-all) the leading `...`:
```typescript
function extractParam(folderName: string): { name: string; kind: "single" | "catch-all" | "optional-catch-all" } | null {
  if (/^\[\[\.\.\.([^\]]+)\]\]$/.test(folderName)) return { name: RegExp.$1, kind: "optional-catch-all" };
  if (/^\[\.\.\.([^\]]+)\]$/.test(folderName))     return { name: RegExp.$1, kind: "catch-all" };
  if (/^\[([^\]]+)\]$/.test(folderName))           return { name: RegExp.$1, kind: "single" };
  return null;
}
```

## Common Pitfalls

### Pitfall 1: Comments before `"use client"` block detection
**What goes wrong:** Naive implementations regex the source for `^\s*("use client"|'use client')` and miss `// banner\n"use client"`.
**Why it happens:** Source-slice approaches don't model JavaScript's directive prologue rule.
**How to avoid:** Use `ast.program.directives[0]?.value.value`. Babel applies the spec rule for you.
**Warning signs:** Test cases with leading comments fail but bare-directive cases pass.

### Pitfall 2: `@slot` folders interfering with intercepting segment math
**What goes wrong:** Counting `(..)` levels by walking the filesystem upward and stopping at parents misses that route segments — not folders — are the unit. `@slot` and `(group)` folders are skipped during the count.
**Why it happens:** Mixing filesystem-relative and route-relative thinking.
**How to avoid:** When an intercepting folder appears, climb the route-segment chain (skipping group + parallel ancestors) by the indicated count, then resolve the named segment as a child of that ancestor.
**Warning signs:** Intercepting fixtures pass for simple cases but fail when `@modal` or `(group)` is in the chain.

### Pitfall 3: Optional catch-all matching empty path silently dropped
**What goes wrong:** Walker descends into `[[...opt]]` only when there are remaining URL tokens; the parent path `/maybe` doesn't match because nothing iterated.
**Why it happens:** Standard "consume one, recurse" loop never enters the empty branch.
**How to avoid:** Special-case optional catch-all: when at the end of the URL, also check whether the current folder has an `[[...opt]]` child with a `page.tsx`; if so, that's also a match with `params: { opt: [] }`.
**Warning signs:** SPEC R3 fixture `/maybe` test fails while `/maybe/x` passes.

### Pitfall 4: Lexicographic sort drift on Windows
**What goes wrong:** `Array.sort()` without a comparator uses `Intl` rules in some environments and groups `@modal` differently from `(modal)` on Windows vs Linux.
**Why it happens:** Default sort is locale-aware in some specs, code-point in others.
**How to avoid:** Pass an explicit `(a,b) => a < b ? -1 : a > b ? 1 : 0` comparator to `discoverEntries` output.
**Warning signs:** CI passes locally but fails on Windows runner (or vice versa).

### Pitfall 5: `tinyglobby` returning Windows backslashes
**What goes wrong:** Forgetting to `toForwardSlash()` glob results.
**Why it happens:** `tinyglobby` may return native separators depending on options.
**How to avoid:** `toForwardSlash()` every path before it leaves the adapter (D-08).
**Warning signs:** Snapshot tests show `\\` paths.

### Pitfall 6: Re-running global glob inside the route walker
**What goes wrong:** Calling `tinyglobby.glob(...)` repeatedly per route segment slow.
**Why it happens:** Treating the walker as recursive directory listings.
**How to avoid:** One enumeration up front, build the segment tree, walk the tree (in-memory).
**Warning signs:** `mapRouteToEntry` ms grows linearly with depth.

### Pitfall 7: Parsing `route.ts` API handlers as components
**What goes wrong:** Including `route.ts` in `discoverEntries` glob produces a phantom "component" for an API handler.
**Why it happens:** D-06 glob already excludes it (the special-file enum is `{page,layout,template,loading,error,not-found,default}` — `route` is NOT in the list).
**How to avoid:** Keep the explicit allow-list in the glob; never broaden to `**/*.{tsx,jsx,ts,js}`.

### Pitfall 8: Adding `runtime` to the wrong layer
**What goes wrong:** Putting `runtime` on `ParseResult` or `RenderNode` to "make it available everywhere".
**Why it happens:** Tempting because the directive lives in the AST; framework-agnostic surface seems natural.
**How to avoid:** D-11 — `runtime` is a Next.js concept; add ONLY to `ComponentDefinition` (12th field). Other adapters may have different runtime models.

## Code Examples

### Tinyglobby usage for `discoverEntries` (verified)

```typescript
// discover.ts
import { glob } from "tinyglobby";
import { join } from "node:path";
import { access } from "node:fs/promises";
import { toForwardSlash } from "../../core/paths.js";

const SPECIAL = "{page,layout,template,loading,error,not-found,default}";
const EXTS = "{tsx,jsx,ts,js}";

export async function resolveAppRoot(absRoot: string): Promise<string | null> {
  for (const candidate of [join(absRoot, "app"), join(absRoot, "src", "app")]) {
    try { await access(candidate); return candidate; } catch { /* nope */ }
  }
  return null;
}

export async function discoverEntries(absRoot: string): Promise<string[]> {
  const appRoot = await resolveAppRoot(absRoot);
  if (!appRoot) return [];
  const matches = await glob([`**/${SPECIAL}.${EXTS}`], {
    cwd: appRoot,
    absolute: true,
    ignore: ["**/_*/**", "**/node_modules/**"],
    dot: false,
  });
  return matches
    .map(toForwardSlash)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
```

### Directive read inside `buildComponentDefinition` (verified by Babel spec)

```typescript
// In NextJsAdapter.ts buildComponentDefinition(...)
const dir = ast.program.directives[0]?.value.value;
const runtime: "server" | "client" = dir === "use client" ? "client" : "server";
// "use server" + missing → "server" per D-12
```

### RouteMatch type definition (D-02)

```typescript
// src/adapters/types.ts (added alongside ResolveResult)
export interface RouteMatch {
  matched: boolean;
  entries: string[];                              // forward-slash absolute, root-down
  params: Record<string, string | string[]>;
  slots: Record<string, string[]>;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pages Router (`pages/_app.js`, `pages/_document.js`, file-based routes that are URL segments) | App Router (`app/layout.tsx`, file conventions, RSC, parallel/intercepting) | Next.js 13.4 (May 2023) stable | App Router is now Next.js's primary recommendation; v1 of this MCP targets App Router only |
| `getStaticProps` / `getServerSideProps` for data | Async server components + `fetch()` cache | Next.js 13+ | Out of scope for v1 (we don't run code) |
| Hand-rolled tsconfig path resolvers | `get-tsconfig` | Phase 3 already adopted | — |
| `"use client"` propagation manual | React directive prologue, AST `program.directives` | React 18 + Next 13 | Phase 4 reads via Babel's spec-compliant directive parsing |

**Deprecated/outdated:**
- Pages Router: still supported by Next, but explicitly v2 for this project (REQUIREMENTS).
- `pages/_app.js`, `pages/_error.js`, `pages/404.js` → replaced by `app/layout.tsx`, `app/error.tsx`, `app/not-found.tsx` respectively.

## Runtime State Inventory

Not applicable — Phase 4 is greenfield code addition (replacing throwing stubs with real implementations + adding one type field). No existing data, services, OS-registered state, secrets, or build artifacts carry stale references.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Project runtime | ✓ | 24.13.0 (LTS-class) `[VERIFIED: node --version]` | — |
| `tinyglobby` | Filesystem walks | ✓ | 0.2.16 `[VERIFIED: package.json + npm view]` | — |
| `@babel/parser` / `@babel/types` | AST + directives | ✓ | 7.29.x `[VERIFIED: package.json]` | — |
| `get-tsconfig` | Already used by resolver | ✓ | 4.14.0 `[VERIFIED]` | — |
| `vitest` | Test runner | ✓ | 4.1.4 `[VERIFIED: package.json]` | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest@^4.1.4` |
| Config file | `vitest.config.ts` (existing) |
| Quick run command | `pnpm vitest run test/adapters/next` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R5 (detect) | 4 detect variants | unit | `pnpm vitest run test/adapters/next/detect.test.ts` | ❌ Wave 0 |
| R6 (discoverEntries) | Lex-sorted, private-folder excluded, includes groups + slots | unit | `pnpm vitest run test/adapters/next/discover.test.ts` | ❌ Wave 0 |
| NEXT-01 | `/dashboard/settings` → root-down chain w/ siblings | unit | `pnpm vitest run test/adapters/next/route-map.test.ts -t "layout chain"` | ❌ Wave 0 |
| NEXT-02 | groups, parallel, intercepting, private | unit | `pnpm vitest run test/adapters/next/route-map.test.ts -t "conventions"` | ❌ Wave 0 |
| NEXT-03 | dynamic, catch-all, optional catch-all params | unit | `pnpm vitest run test/adapters/next/route-map.test.ts -t "params"` | ❌ Wave 0 |
| NEXT-04 | runtime: "use client" / "use server" / none / commented | integration | `pnpm vitest run test/adapters/next/runtime.test.ts` | ❌ Wave 0 |
| R8 amendment | 12-field `ComponentDefinition` includes `runtime` | unit | `pnpm vitest run test/adapters/types.test.ts` | ✓ EXISTS — modify (12 → 13 keys) |
| ARCH-01 invariant | 5-method interface preserved | unit | `pnpm vitest run test/adapters/FrameworkAdapter.test.ts` | ✓ EXISTS — should still pass |
| Island invariant | core/ir/renderers don't import adapters | unit | `pnpm vitest run test/architecture/island.test.ts` | ✓ EXISTS — should still pass |
| Phase 3 regression | extractComponents, resolveModule unchanged | unit | `pnpm vitest run test/adapters/next/NextJsAdapter.kitchen-sink.test.ts` | ✓ EXISTS — should still pass |

### Sampling Rate

- **Per task commit:** `pnpm vitest run test/adapters/next` (~ms)
- **Per wave merge:** `pnpm test` (full suite)
- **Phase gate:** Full suite green + `pnpm typecheck` + `pnpm lint`

### Wave 0 Gaps

- [ ] `test/fixtures/next-app-router/**` — kitchen-sink fixture per D-14 (real on-disk files matching SPEC acceptance examples verbatim)
- [ ] `test/fixtures/next-detect-with-app/**` — `next.config.mjs` + `app/`
- [ ] `test/fixtures/next-detect-with-src-app/**` — `next.config.mjs` + `src/app/`
- [ ] `test/fixtures/next-detect-pages-only/**` — `next.config.js` only, no `app/`
- [ ] `test/fixtures/next-detect-no-config/**` — `app/` but no `next.config.*`
- [ ] `test/adapters/next/detect.test.ts` — covers R5
- [ ] `test/adapters/next/discover.test.ts` — covers R6
- [ ] `test/adapters/next/route-map.test.ts` — covers NEXT-01..03
- [ ] `test/adapters/next/runtime.test.ts` — covers NEXT-04
- [ ] Modify `test/adapters/types.test.ts` — bump 12 → 13 keys; add `runtime: "server"` to literal
- [ ] Modify `test/adapters/next/NextJsAdapter.test.ts` — drop "throws not implemented in Phase 3" assertion line 26-29

**No framework install needed** — vitest already configured.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A — static analysis tool, no auth |
| V3 Session Management | no | N/A |
| V4 Access Control | no | N/A — runs locally with user's own filesystem privileges |
| V5 Input Validation | partial | Route string in `mapRouteToEntry` — validate `route.startsWith("/")`, otherwise return `matched: false`. Already enforced by zod at MCP boundary (Phase 2 tool schemas) for tool-level inputs |
| V6 Cryptography | no | N/A |
| V12 File Handling | yes | Path traversal in `mapRouteToEntry` route string: an attacker-controlled route like `/../etc/passwd` could in principle escape `app/`. Mitigation: route segment classifier rejects any segment containing `/` or `\` or starting with `.` (these are not legal Next.js folder names anyway). Glob `cwd: appRoot` already constrains enumeration to `app/`. |

### Known Threat Patterns for Next.js App Router static analysis

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Symlinked `app/` pointing outside project root | Tampering / Information Disclosure | We do not call `fs.realpath` (PITFALL 4.3 already documented); glob honors symlinks but stays under `cwd: appRoot` |
| Path traversal via route input (`/../../etc`) | Tampering | Route segments classified by regex (`[^/\\]+`); `.` and `..` segments collapse to `matched: false` |
| Reading `node_modules/` accidentally | Information Disclosure / DoS | Glob `ignore: ['**/node_modules/**']` mandatory; Phase 3 also enforces "no node_modules parsing" rule |
| Malicious `next.config.ts` content | Code Execution | `detect()` only `fs.access`s the file — we never `import()` or read it |
| Malformed route input crashes server | Availability (DoS) | D-12 no-throw rule; route validation returns `matched: false` instead of throwing |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `tinyglobby` returns paths with backslashes on Windows when `absolute: true` | Pitfall 5 / Code Examples | Low — D-08 mandates `toForwardSlash()` regardless |
| A2 | Layout chain emit order at each segment is `layout, template, loading, error, not-found, default, page` | Layout Chain Semantics | Medium — SPEC R1 only locks "root-down" + "including … siblings"; an alternative ordering may need to be confirmed during plan-checking. Phase 5's IR translator may impose a different convention. |
| A3 | `default.tsx` participates in `entries` for non-parallel-route segments too | Layout Chain Semantics | Low — including it is harmless; Phase 5 can downgrade. Worst case: emit only when a `@slot` ancestor exists. |
| A4 | Optional catch-all `[[...opt]]` empty match returns `params: { opt: [] }` (not absent key) | Dynamic Segment Matching | Low — SPEC R3 says "or absent key"; either passes the locked test, but consistency favors empty array. |
| A5 | Babel parses `'use client';` (single quotes + semi) into `directives[0].value.value === "use client"` identically to double-quoted form | Pattern 2 (directive detection) | Very low — Babel ESTree spec confirms `DirectiveLiteral` is a `StringLiteral` subtype; quoting is normalized away. Cited from babel ast/spec.md but worth a one-line vitest case to lock. |

**Recommendation for planner:** flag A2 (sibling emit order) as a question in the discuss-phase if not already settled. The 04-CONTEXT.md says "inlined into `entries` at their segment position" but doesn't lock the within-segment ordering.

## Open Questions (RESOLVED)

1. **Within-segment ordering of special files** (A2 above)
   - What we know: SPEC R1 locks "root-down" across segments; CONTEXT D-02 locks "inlined at segment position".
   - What's unclear: the order among `layout`/`template`/`loading`/`error`/`not-found`/`default`/`page` at the same segment.
   - Recommendation: Adopt the order proposed in §"Layout Chain Semantics" (`layout, template, loading, error, not-found, default, page`) as the default; let plan-check confirm.
   - **RESOLVED:** Implemented in plan 04-03 Task 2 via `SPECIAL_ORDER = ["layout", "template", "loading", "error", "notFound", "default"]` with `page` emitted last at the terminal segment.

2. **`default.tsx` semantics for non-parallel pages**
   - What we know: Next docs scope `default.tsx` to parallel-route fallbacks.
   - What's unclear: Whether including `default.tsx` in `entries` for a non-slot route is semantically correct (no-op?) or actively wrong.
   - Recommendation: Include if present; document Phase 5 may filter it.
   - **RESOLVED:** `default.tsx` is included in `entries` if present at any segment; Phase 5 renderer may filter for non-parallel pages. Consistent with R1 acceptance enumeration (siblings inlined at segment position).

3. **Diagnostic channel for malformed route strings**
   - What we know: CONTEXT marks this as Claude's discretion; `mapRouteToEntry` does not receive `ParseContext`.
   - What's unclear: Whether to silently return `matched: false` (current direction) or surface via a different mechanism the planner picks.
   - Recommendation: Silent `matched: false`; Phase 5's tool layer adds user-facing diagnostics where it has access to ctx. This matches D-12 (no-throw) and the existing Phase 3 pattern.
   - **RESOLVED:** Silent `{ matched: false, entries: [], params: {}, slots: {} }` per D-12 no-throw discipline. No logging in v1; Phase 5's tool layer owns user-facing diagnostics.

## Project Constraints (from CLAUDE.md)

- **TypeScript + `@babel/parser` / `@babel/traverse` / `@babel/types`** — already installed; no new AST tooling.
- **Node.js `>=20`** — already enforced by `package.json` engines field.
- **ESM-only** (`"type": "module"`) — every new file uses `.js` import suffixes (e.g. `from "./segments.js"`) to match existing pattern.
- **`tinyglobby`** is the blessed glob library; do NOT introduce `fast-glob` / `glob` / `globby`.
- **`get-tsconfig`** is the blessed tsconfig reader (already used by Phase 3); not directly needed for Phase 4 but never replace with `tsconfig-paths`.
- **`tsup` build, `vitest` test, `tsx` dev** — existing toolchain; no changes.
- **NO `@modelcontextprotocol/sdk` pre-1.0** — irrelevant here (Phase 4 doesn't touch MCP layer).
- **`fs-extra` not allowed** — use `node:fs/promises`.
- **Defensive Babel ESM interop** (`(traverse as any).default ?? traverse`) — does not apply here; Phase 4 uses `@babel/types` directly which has clean named exports.
- **stdio MCP / `process.stderr` for diagnostics** — Phase 4 doesn't write diagnostics directly; warnings go to `ParseContext.warnings`.
- **Forward-slash paths everywhere** — enforced by `toForwardSlash` (D-08).

## Sources

### Primary (HIGH confidence)
- Context7 `/vercel/next.js` — App Router file conventions, intercepting routes, route groups, parallel routes, dynamic routes, `use client` directive
  - `[CITED: docs/01-app/03-api-reference/03-file-conventions/intercepting-routes.mdx]`
  - `[CITED: docs/01-app/03-api-reference/03-file-conventions/route-groups.mdx]`
  - `[CITED: docs/01-app/03-api-reference/03-file-conventions/parallel-routes.mdx]`
  - `[CITED: docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.mdx]`
  - `[CITED: docs/01-app/03-api-reference/01-directives/use-client.mdx]`
  - `[CITED: docs/01-app/01-getting-started/02-project-structure.mdx]` — private folders, intercepting / parallel overview
- Context7 `/babel/babel` — `Program` / `Directive` / `DirectiveLiteral` AST shape
  - `[CITED: github.com/babel/babel/blob/main/packages/babel-parser/ast/spec.md]`
- Existing repo files (HIGH — read directly):
  - `E:\ui-to-hierarch\src\adapters\types.ts` — current 11-field shape
  - `E:\ui-to-hierarch\src\adapters\FrameworkAdapter.ts` — locked 5-method contract
  - `E:\ui-to-hierarch\src\adapters\next\NextJsAdapter.ts` — `buildComponentDefinition` callsite for D-10
  - `E:\ui-to-hierarch\src\core\paths.ts` — `toForwardSlash` (D-08)
  - `E:\ui-to-hierarch\src\core\parser\index.ts` — confirms `parsed.ast` is `t.File` with `program.directives` populated
  - `E:\ui-to-hierarch\.planning\research\PITFALLS.md` §3.1–3.4 — pre-existing failure-mode catalog
  - `E:\ui-to-hierarch\.planning\phases\04-next-js-app-router-adapter\04-SPEC.md` — locked requirements
  - `E:\ui-to-hierarch\.planning\phases\04-next-js-app-router-adapter\04-CONTEXT.md` — D-01..D-16
- Verified via tools (HIGH):
  - `npm view tinyglobby version` → 0.2.16
  - `npm view get-tsconfig version` → 4.14.0
  - `node --version` → 24.13.0

### Secondary (MEDIUM confidence)
- None — all critical claims verified via Context7 or repo files.

### Tertiary (LOW confidence)
- A2/A3 (within-segment file ordering, `default.tsx` for non-parallel routes) — flagged in Assumptions Log; recommend confirmation during planning.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all deps already present and version-verified
- Architecture: HIGH — segment-tree pattern is straightforward; no novel research needed
- Routing semantics (NEXT-01/02/03): HIGH — verbatim Next.js docs cited for every convention
- Directive detection (NEXT-04): HIGH — verified against Babel AST spec
- Pitfalls: HIGH — extends existing PITFALLS.md §3.1–3.4 with phase-specific additions
- Within-segment file ordering (A2): MEDIUM — proposed default not in any cited source

**Research date:** 2026-04-29
**Valid until:** 2026-06-29 (60 days; Next.js App Router conventions are stable since 13.4 / May 2023)
