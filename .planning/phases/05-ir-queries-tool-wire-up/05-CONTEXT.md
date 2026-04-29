# Phase 5: IR Queries & Tool Wire-up — Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire all four MCP tool handlers (`get_full_hierarchy`, `focus_on`, `find_by_text`, `find_by_style`) end-to-end through a new `Analyzer` orchestrator that translates `NextJsAdapter` output (`ComponentDefinition[]` + `RouteMatch`) into the locked IR `TreeNode` shape and emits an `Envelope` to the existing markdown / JSON renderers. Closes TOOL-01..TOOL-04 + ARCH-02. WHAT is locked by SPEC.md (8 requirements). This phase is HOW-only.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**8 requirements are locked.** See `05-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `05-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- `src/core/Analyzer.ts` — orchestrator class (per-call AST cache, route resolution, IR build, query primitives, fragment helper)
- `ComponentDefinition[] + RouteMatch → TreeNode` translation (the missing IR-build layer)
- 4 MCP tool handler bodies (replace `notImplemented`), preserving Phase 2 input schemas
- Query primitives: subtree-by-component-name, ancestor walk, text-node scan with Levenshtein fuzzy, className/style-key scan
- Synthetic `kind:"fragment"` root for multi-match envelopes; `runtime → layoutHint:"client"` annotation
- Per-call AST cache inside Analyzer; assertion test for no cross-call cache
- Vitest unit tests + integration tests covering all 18 acceptance criteria; fixtures under `test/fixtures/phase-05/`

**Out of scope (from SPEC.md):**
- Cross-call cache / persistent index (ARCH-02 — v2)
- Performance SLA for `find_by_*` (Phase 6)
- Pages Router routes (v2)
- MCP tool input schema changes (Phase 2 lock)
- TreeNode 9-kind / Envelope 6-field schema changes (D-10/D-15 lock)
- Other framework adapters (post-v1)
- Client-side fetch / runtime evaluation (PROJECT.md static-only)
- MCP transport changes (stdio only)
- Markdown / JSON renderer changes (renderers untouched)

</spec_lock>

<decisions>
## Implementation Decisions

### Analyzer file layout

- **D-01:** Single-file structure — `src/core/Analyzer.ts` contains the `Analyzer` class, IR-build helpers (`ComponentDefinition[] + RouteMatch → TreeNode`), slot-substitution algorithm, the four query methods (`getFullHierarchy`, `focusOn`, `findByText`, `findByStyle`), `buildFragmentRoot`, and the hand-rolled Levenshtein function. Expected ~600–800 LOC. Co-locating keeps the ARCH-02 grep test (`static\s+\w+\s*[:=]` and module-scope `cache` check) trivially correct over a single file. Tools import a single entry. Splitting deferred until a query primitive grows complex enough to warrant its own module.
- **D-02:** Per-call AST cache reuses the existing `ParseContext.astCache` from Phase 3 (D-02 of Phase 3). The Analyzer constructor builds a fresh `ParseContext` per call (`new Analyzer({ root, adapter })` ⇒ creates one ParseContext, threads it through every `extractComponents` invocation). No second cache layer inside `Analyzer`. The ParseContext is an Analyzer instance field, garbage-collected when the handler returns (ARCH-02).
- **D-03:** Levenshtein lives inline in `Analyzer.ts` as a private function (`function levenshtein(a: string, b: string): number`), ≤30 LOC, hand-rolled (no runtime dep). Tested transitively via `find_by_text` fallback tests. If a second consumer ever needs it, extract then.

### RenderNode → TreeNode translation

- **D-04:** RenderNode `kind:"jsx"` splits on its `isComponent` flag — `true → kind:"component"` (carries `name = tag`); `false → kind:"element"` (carries `tag` lowercase). The `isComponent` flag is already set by `walkRenderFlow` via `/^[A-Z]/` regex on the first segment of the tag (Phase 3 logic). Reuse, do not re-derive.
- **D-05:** RenderNode-to-TreeNode kind map (1:1 except jsx-split):
  ```
  jsx (isComponent)   → component { name, children, file, line }
  jsx (!isComponent)  → element   { tag, children, file, line }
  text                → text
  branch              → branch
  list                → list
  fragment            → fragment
  spread              → spread
  error               → error
  ```
  `slot` has no RenderNode source — the Analyzer synthesizes it from layout chains and parallel routes (D-09).
- **D-06:** `file:line` on every TreeNode is the **call site** (the JSXElement position in the source — what `walkRenderFlow` already records on `RenderNode.line`). Definition site (where `export function Card()` lives) is NOT carried. Rationale: the agent's job is to navigate to where to *edit*, which is the use site. SPEC R2 acceptance criterion "true `file:line` per match" is satisfied: each occurrence carries its own call-site location.
- **D-07:** Component-reference resolution at IR-build time is NOT performed in Phase 5. The Analyzer treats `<Card>` as an opaque `kind:"component", name:"Card"` leaf (its children are whatever JSX children appeared at the call site, not the resolved Card body). Following imports into Card.tsx and inlining its render flow is a v2 expansion — `focus_on` already finds occurrences by name across the union IR.
- **D-08:** `runtime: "client"` propagation — when the IR-build layer materializes a `kind:"component"` node from a `ComponentDefinition` whose `runtime === "client"`, it sets `layoutHint = "client"`. Server-runtime components leave `layoutHint` unset. If a per-element walker contributes its own `layoutHint` (none in v1), concatenate with `; ` separator. Per SPEC R7 acceptance: markdown line for `<Foo>` from a `"use client"` file ends with a layoutHint suffix containing `"client"`.

### Slot-substitution & parallel routes

- **D-09:** Slot-substitution algorithm — **inside-out wrap**:
  ```ts
  let tree = buildPageTree(pageEntry);
  for (const layoutEntry of routeMatch.entries.layouts.reverse()) {
    const layoutTree = buildLayoutTree(layoutEntry);
    tree = replaceSlot(layoutTree, "children", tree);
  }
  ```
  Each layer is built once; `replaceSlot(layoutTree, name, replacement)` is a simple recursive visit-and-clone that replaces the first `kind:"slot", name === target` node it finds. Layout chain order in `RouteMatch.entries` is root-down (Phase 4 D-02), so we reverse and wrap from innermost outward. Final `tree` is the outermost layout's component with the chain nested into its `children` slot.
- **D-10:** Parallel routes (`@modal`, etc.) appear as a **`kind:"slot", name:"<slotName>"` sibling node inside the children of the parent layout's component**, alongside the existing `kind:"slot", name:"children"` slot. The slot's children are the parallel route's tree (built recursively from `routeMatch.slots["<slotName>"]`). Matches SPEC R1 acceptance criterion: "the `@modal` slot appears as a `kind:"slot", name:"modal"` sibling node carrying the modal subtree."
  - Slot order within parent: `children` slot first (the main route flow), then parallel slots in stable lexicographic order of slot name (deterministic snapshots).
  - If a layout layer never contains a `children` slot in its own JSX, the substitution silently skips wrapping at that layer (an authoring bug in the user's project, not ours to fix; document under Constraints).
- **D-11:** Special files (`template.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `default.tsx`) inlined into `RouteMatch.entries` by Phase 4 — Phase 5 v1 treats them as **siblings of the layout/page tree at their segment level**, wrapped under a synthetic `kind:"fragment"` if more than one is present at the same level. They are NOT slot-substituted (no slot semantics in Next.js for these). Their tree contribution: build via the same `buildLayoutTree` path (extract default-export's render flow → translate to TreeNode), attach as siblings of the segment's main slot replacement.

### Style sidecar storage (find_by_style)

- **D-12:** Style sidecar lives in the Analyzer instance as `Map<string, StyleIndex>` keyed by `${file}:${line}:${tag}`. `StyleIndex = { classNames: string[]; styleKeys: string[] }`. The composite key is unique per element (JSX cannot nest two openings with the same tag at the same source line). Matches SPEC R4 acceptance: "deduplicated by file:line:nodeIdentity" — `nodeIdentity` here is exactly `file:line:tag`. JSON-safe, iterable, no WeakMap workaround.
- **D-13:** Style data is scraped by **re-walking JSX during IR build**, NOT by mutating RenderNode/ComponentDefinition (those shapes are locked at D-05/R8). The IR-build pass that translates `RenderNode → TreeNode` reads `RenderNode.attributes` (already populated by `walkRenderFlow` for `kind:"jsx"` nodes) and, for each element/component node, extracts:
  - `classNames` from any `name === "className"` attribute whose `value.kind === "literal"` and whose value is a string — split on `/\s+/`, filter empty, dedup within the node.
  - `styleKeys` from any `name === "style"` attribute whose `value.kind === "expression"` and whose `source` is a JSX object expression literal (parse the slice with Babel's `parseExpression` to extract top-level keys; if parse fails, drop silently).
  Result is written into the sidecar map under the node's composite key. `find_by_style` then iterates the map.
- **D-14:** ClassName matching in v1 is **literal-only**. Expressions like `className={cn("flex", cond && "p-4")}` are skipped — `cn`/`clsx`/`cva`/`twMerge` argument extraction is deferred to v2. SPEC R4 acceptance fixtures use literal strings, so this is on-spec. Document the limitation in CONTEXT and in the tool's `description.describe()` (already locked, but a runtime warning when the user's project has expression-typed classNames is acceptable — surface via `Envelope.warnings` once per call, not per node, to avoid noise).
- **D-15:** Style-prop matching: `style={{ marginTop: 8, color: "red" }}` matches on key (`marginTop`, `color`), never value. `data-*`, `aria-*`, and other dash-prefixed props are NOT scanned (SPEC R4 lock). `style={someVar}` (non-literal expression) is silently dropped — same v1 limitation as classNames.

### Fixture project shape

- **D-16:** Hybrid layout under `test/fixtures/phase-05/`:
  - **One kitchen-sink Next.js project** at `test/fixtures/phase-05/kitchen-sink/` covering R1–R7 acceptance examples in a single tree:
    - 3-tier nested layouts at `app/layout.tsx`, `app/(group)/layout.tsx`, `app/(group)/dashboard/layout.tsx`, with `app/(group)/dashboard/settings/page.tsx` (R1).
    - `app/@modal/login/page.tsx` for parallel-route slot (R1 acceptance #3).
    - `<Card>` referenced from two routes (`/dashboard` under `<Sidebar>`, `/profile` under `<Header>`) for `focus_on` (R2).
    - `<button>Submit</button>` and `<span>submit form</span>` text content for `find_by_text` (R3 substring + case-insensitive).
    - `<div className="flex items-center">` and `<span style={{ marginTop: 8, color: "red" }}>` for `find_by_style` (R4 token + key).
    - One file with `"use client"` directive at line 1; one peer file without it (R7 runtime annotation).
    - One file with both `className="flex"` and `style={{ flex: 1 }}` on the same node (R4 dedup acceptance).
  - **Micro-fixtures** for corner cases under `test/fixtures/phase-05/micro/`:
    - `parse-error/` — a single `app/page.tsx` with a syntax error (R8 `kind:"error"` IR node).
    - `mutation-test/` — a `app/page.tsx` whose contents the cache test mutates between calls (R5 ARCH-02 verification).
    The kitchen-sink fixture is NOT mutated by tests — corner cases live in their own micro-fixtures so test runs stay independent and the kitchen-sink stays a stable snapshot anchor.
- **D-17:** Fixtures are real on-disk `.tsx` files (not generated programmatically). Matches Phase 3 (`test/fixtures/parser/`) and Phase 4 (`test/fixtures/next-app-router/`) precedent. Readable, reproducible, fast on Windows CI.
- **D-18:** SPEC acceptance examples become fixture filenames verbatim where possible — keep the path-to-acceptance mapping mechanical (1:1 with R1–R7 quoted shapes). Same approach Phase 4 took.

### Test layout

- **D-19:** Tier 1 (Analyzer unit tests) at `test/core/analyzer.test.ts` — exercise each query method directly against fixtures (no MCP transport / handler / schema parsing). Fast, deterministic, isolates Analyzer logic from MCP plumbing.
- **D-20:** Tier 2 (MCP handler integration tests) under `test/mcp/tools/` — invoke each handler through its zod input schema (`inputSchema.parse({...})`), assert the returned `ToolResponse` envelope passes `EnvelopeSchema.parse`, assert markdown vs JSON `format` paths both work, assert no-throw on user-data error inputs (R8). Pattern matches Phase 2 Tier 1 + Tier 2 split (`02-05-PLAN.md`).
- **D-21:** Snapshot strategy: markdown outputs use `toMatchFileSnapshot` (file snapshots reviewable in PR diff), JSON outputs use `toMatchInlineSnapshot` for small focused cases. Already established in Phase 1.

### Claude's Discretion

- **Union-IR build-once memoization within a single call** — `focus_on` / `find_by_text` / `find_by_style` each enumerate every route. The Analyzer MAY memoize the route → TreeNode map inside a single `new Analyzer()` instance to avoid re-walking the same route per query method. ARCH-02 forbids cross-call cache, not within-call. Planner picks the shape (lazy `Map<route, TreeNode>` field on the instance, or eager build-on-construct). Tests verify no cross-call leakage by always constructing a fresh `Analyzer` per handler call.
- **Warnings dedup strategy** — where multiple files contribute the same warning class (e.g., "expression-typed className skipped"), planner decides whether to emit once-per-call, once-per-file, or all. SPEC R8 only requires that warnings exist for unmatched routes and parse errors; the rest is informational.
- **Error-node placement in union trees** — for TOOL-02/03/04, when a route's parse fails, planner picks whether the `kind:"error"` node appears (a) in the union tree at that route's slot, or (b) only via `Envelope.warnings` while the route is silently dropped from the union. SPEC R8 ALLOWS (a); the choice is which is more debuggable.
- **Slot ordering when both `children` and parallel slots exist** — D-10 says lexicographic by slot name after `children`. If a planning insight reveals a more useful order (e.g., follow the directory-listing order Phase 4 produced), planner may override — but stable across calls is non-negotiable.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements (locked)
- `.planning/phases/05-ir-queries-tool-wire-up/05-SPEC.md` — Locked requirements (TOOL-01..04 + ARCH-02 + R6 fragment + R7 runtime + R8 no-throw). Read first.
- `.planning/REQUIREMENTS.md` §Tools / §Architecture — TOOL-01..04, ARCH-02 source.
- `.planning/PROJECT.md` — Non-negotiables (stdio, static-only, parse-on-demand, no-cache v1).
- `.planning/ROADMAP.md` §Phase 5 — Goal + 5 success criteria.

### Phase 4 contracts (consumed unchanged)
- `src/adapters/types.ts` — `RouteMatch` (4-field), `ComponentDefinition` (12-field with `runtime`), `RenderNode` (7-kind), `ResolveResult`, `ParseContext`, `ParseResult`. Type-only imports allowed under adapter island rule.
- `src/adapters/next/NextJsAdapter.ts` — All 5 methods implemented; consumed via `FrameworkAdapter` interface only.
- `src/adapters/FrameworkAdapter.ts` — 5-method interface (ARCH-01). Phase 5 calls `detect`, `discoverEntries`, `mapRouteToEntry`, `extractComponents`. Does NOT extend the contract.

### Phase 1–3 locks (must not regress)
- `src/ir/schema.ts` — `TreeNode` 9-kind discriminated union (D-10 lock). No additions.
- `src/ir/envelope.ts` — `Envelope` 6-field schema (D-15 lock). No additions; multi-match rides synthetic `kind:"fragment"` root.
- `src/renderers/markdown.ts` — Untouched. Already handles fragment as transparent (children rendered without an extra root line per `walk` logic).
- `src/renderers/json.ts` — Untouched. Round-trips any TreeNode through `EnvelopeSchema.parse`.
- `src/renderers/envelope-builder.ts` — `buildEnvelope(tree, opts)` is the canonical envelope construction path. Reuse, do not re-implement.
- `src/core/paths.ts` — `toForwardSlash` for every `file` field at the IR boundary (D-07 forward-slash lock).
- `src/core/parser/index.ts` — `parseFile(ctx, absPath)` is the canonical parse primitive; honors per-call `astCache`. Re-use through `extractComponents` rather than calling directly.
- `src/core/render-flow/index.ts` — `walkRenderFlow` already produces `RenderNode` with `attributes[]` (`JsxAttribute` union: literal | expression | spread). D-13 reads `attributes` here.
- `src/mcp/tools/{get-full-hierarchy,focus-on,find-by-text,find-by-style}.ts` — Tool input schemas locked at Phase 2; Phase 5 only fills handler bodies.
- `src/mcp/tools/common.ts` — `projectRootSchema` shared fragment.
- `src/mcp/errors.ts` — `withErrorBoundary`, `notImplemented`, `ToolResponse` shape. Reuse for envelope wrapping.
- `src/core/resolve-root.ts` — `resolveRoot(args.projectRoot)` is the canonical root-resolution path (ARCH-03).
- `test/architecture/island.test.ts` — Layer 2 test that `src/core/**` does not import `src/adapters/next/**`. Type-only imports from `src/adapters/types.ts` are permitted; runtime imports must go through the `FrameworkAdapter` interface.

### Prior phase decisions (carry forward)
- `.planning/phases/04-next-js-app-router-adapter/04-CONTEXT.md` — D-01..D-04 (`RouteMatch` shape), D-08 (forward-slash), D-12 (no-throw extends to Phase 5).
- `.planning/phases/03-parser-core-ast-resolution-extractors/03-CONTEXT.md` — D-01 (pure-function ParseContext), D-02 (per-call astCache), D-09 (component-level classNames vs per-element), D-11 (island rule), D-12 (no-throw).
- `.planning/phases/02-mcp-transport-shell/02-CONTEXT.md` — MCP-04 stdout/stderr discipline (no `console.log` in handlers); withErrorBoundary contract.
- `.planning/phases/01-scaffolding-ir-foundation/01-CONTEXT.md` — Forward-slash path convention; ARCH-03 root resolution; markdown / JSON snapshot patterns.

### Research notes (still authoritative)
- `.planning/research/PITFALLS.md` §3.1–§3.4 — App Router routing semantics; `"use client"` propagation rules; default-export-only; route.ts exclusion. Applies when reading layouts.
- `.planning/research/STACK.md` — `tinyglobby`, Babel, `get-tsconfig` versions; "no new runtime deps" constraint (Levenshtein hand-rolled).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`buildEnvelope(tree, opts)`** — `src/renderers/envelope-builder.ts`. Canonical Envelope construction with toolVersion, generatedAt, schemaVersion. All 4 handlers wrap their final tree with this; no new envelope code.
- **`renderMarkdown(tree, envelope)` / `renderJson(tree, envelope)`** — `src/renderers/{markdown,json}.ts`. Already accept any TreeNode. Phase 5 produces trees they render unchanged.
- **`withErrorBoundary(name, fn)`** — `src/mcp/errors.ts`. Wraps every handler with the structured-error fallback. Reuse for the same shape; only the inner body changes from `notImplemented(name)` to real logic.
- **`resolveRoot(args.projectRoot)`** — `src/core/resolve-root.ts`. Already wired in every stub handler; preserve.
- **`toForwardSlash(absPath)`** — `src/core/paths.ts`. Apply at every IR-leaving path boundary (D-07).
- **`walkRenderFlow(body, source, file)`** — `src/core/render-flow/index.ts`. Returns `RenderNode` (7-kind) with `JsxAttribute[]` populated. The Analyzer's IR-build layer reads attributes here for D-13 className/style scrape.
- **`NextJsAdapter`** — All 5 methods Phase 4-complete. Analyzer talks to this through the `FrameworkAdapter` interface only (island rule).
- **`ParseContext` w/ `astCache`** — Phase 3 D-02. Analyzer instantiates one ParseContext per call and threads it through `extractComponents`.

### Established Patterns

- **D-12 no-throw rule** — every adapter / parser surface returns errors via shape (`{ ok: false, ... }`, `kind:"error"` nodes, `RouteMatch.matched: false`). Phase 5 extends this to MCP handlers: any user-data error becomes envelope warnings or `kind:"error"` IR nodes; only programming bugs surface through `withErrorBoundary` as MCP errors.
- **Forward-slash discipline** — every `file:` field at the IR boundary passes through `toForwardSlash`. Markdown / JSON renderers do NOT re-normalize — the IR is the contract surface.
- **Per-call caches as instance/local fields** — Phase 3 (`ParseContext.astCache`), Phase 4 (route-trie within `mapRouteToEntry`). Phase 5's Analyzer is the same pattern at the next layer up.
- **Adapter island enforcement** — `src/core/**` may import `src/adapters/types.ts` for types only and call adapter methods through `FrameworkAdapter`. The `test/architecture/island.test.ts` Layer 2 test catches violations.
- **Snapshot testing** — file snapshots for markdown trees, inline snapshots for small JSON cases (Phase 1 D-19 pattern).

### Integration Points

- **Tool handler → Analyzer** — Each of the 4 handlers in `src/mcp/tools/*.ts` constructs `new Analyzer({ root, adapter: NextJsAdapter })` per call, invokes the matching query method, wraps result with `buildEnvelope` + format dispatch (markdown vs JSON).
- **Analyzer → NextJsAdapter** — Through the `FrameworkAdapter` interface (5 methods). No direct `import { NextJsAdapter } from "../adapters/next/..."` inside `src/core/`.
- **Analyzer → renderers** — Pure data path: Analyzer returns `Envelope`, handler picks renderer by `format` arg.
- **Style sidecar lifecycle** — Built during IR-build pass, queried by `findByStyle`, dropped when Analyzer instance is GC'd at handler exit.

### Constraints from existing code

- `RenderNode` is the locked Phase 3 output shape; D-13 forbids extending it. The style sidecar is the workaround for per-element data.
- `TreeNode` 9-kind discriminated union has no `style` / `attributes` field (D-10 lock); the sidecar must live OUTSIDE TreeNode.
- `Envelope` 6-field schema has no per-match metadata field (D-15 lock); multi-match envelopes use synthetic `kind:"fragment"` root, with each match's `file:line` carried by the match node itself.
- `walkRenderFlow` is pure JSX-walking; it does not resolve component imports. D-07's "no IR-time component resolution" aligns with this — focus_on works on the call-site tree.
- Markdown renderer already labels `kind:"fragment"` as `<>` and walks children directly (no extra root line) — SPEC R6 acceptance is satisfied with no renderer change.

</code_context>

<specifics>
## Specific Ideas

- **Composite key `${file}:${line}:${tag}` is the node-identity primitive** for both style sidecar (D-12) and `find_by_style` dedup (SPEC R4 acceptance). Use the same key everywhere a node needs to be identified across maps; never invent a parallel scheme.
- **SPEC acceptance examples → fixture filenames verbatim** — `app/(group)/dashboard/settings/page.tsx`, `app/@modal/login/page.tsx`, the literal strings `"Submit"` / `"submit form"`, the literal classes `"flex items-center"`, the literal style `{{ marginTop: 8, color: "red" }}`. Mechanical mapping makes acceptance verification grep-able.
- **Inside-out layout wrapping is the canonical algorithm** — `entries.layouts.reverse()` then iterate `tree = replaceSlot(layout, "children", tree)`. Resist any "build top-down with placeholder fill" alternative; it complicates parallel-slot handling.
- **Levenshtein call site is the only consumer** — keep it inline in `Analyzer.ts` and test it through `find_by_text` zero-match fallback fixtures. No standalone unit test needed.
- **Kitchen-sink fixture is the snapshot anchor** — a single stable Next.js project shape used by the broadest acceptance criteria. Per-tool corner cases (parse-error, mutation-test) live in micro-fixtures so they don't pollute the snapshot.
- **Tool handlers stay thin** — the entire body of each handler is roughly: `resolveRoot → new Analyzer → analyzer.<query>(args) → buildEnvelope → render by format`. No business logic in the handlers.

</specifics>

<deferred>
## Deferred Ideas

- **Component-reference inlining** — following `<Card>` imports into `Card.tsx` and inlining its render flow at the call site. Out of scope for v1; `focus_on` already finds occurrences across the union IR by name. Revisit when agent feedback shows call-site-only trees miss the user's intent.
- **`cn`/`clsx`/`cva`/`twMerge` argument extraction for `find_by_style`** — Phase 3 D-09 already captures `ClassToken[]` at component level; per-element extraction across these helpers is a v2 expansion. Document the literal-only limitation in tool description.
- **Per-call AST cache test that grep finds zero `static` fields** — implementation-level, but SPEC R5 acceptance lists it. Keep in PLAN as a verification task, not a deferred idea.
- **Performance tuning for `find_by_*`** — Phase 6 territory per SPEC. Within-call memoization (Claude's discretion above) is the only perf concession in Phase 5.
- **Cross-call cache / persistent index** — ARCH-02 forbids in v1. v2 candidate after Phase 6 latency measurements.
- **Slot semantics for `template.tsx` / `loading.tsx` / `error.tsx`** — Phase 5 v1 treats them as siblings of the layout/page tree (D-11). True render-time semantics (e.g., `loading.tsx` wrapping during async transitions) is a deeper Next.js modeling effort, deferred to v2.
- **Pages Router adapter** — explicitly v2.

</deferred>

---

*Phase: 05-ir-queries-tool-wire-up*
*Context gathered: 2026-04-29*
