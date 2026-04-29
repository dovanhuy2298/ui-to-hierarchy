# Phase 5: IR Queries & Tool Wire-up — Specification

**Created:** 2026-04-29
**Ambiguity score:** 0.14 (gate: ≤ 0.20)
**Requirements:** 8 locked

## Goal

Wire all four MCP tools (`get_full_hierarchy`, `focus_on`, `find_by_text`, `find_by_style`) end-to-end through a new `Analyzer` orchestrator that translates `NextJsAdapter` output (`ComponentDefinition[]` + `RouteMatch`) into the locked IR `TreeNode` shape and emits an `Envelope` to the existing markdown / json renderers — closing requirements TOOL-01 through TOOL-04 and ARCH-02.

## Background

Phase 4 closed the adapter side: [src/adapters/next/NextJsAdapter.ts](src/adapters/next/NextJsAdapter.ts) now implements `detect`, `discoverEntries`, `mapRouteToEntry → RouteMatch`, and `extractComponents → ComponentDefinition[]` with the 12-field shape including `runtime`. The four MCP tool handlers in [src/mcp/tools/](src/mcp/tools/) are still stubs returning `notImplemented(name)` — they parse `args`, call `resolveRoot`, then bail.

What is missing on the IR-query side:

- **No `Analyzer` class** anywhere in `src/`. The orchestrator that ties adapter → render-flow → IR → renderer does not exist yet.
- **No translator from `ComponentDefinition[] + RouteMatch` to `TreeNode`.** The IR schema in [src/ir/schema.ts](src/ir/schema.ts) is locked at 9 kinds (D-10) and the `Envelope` in [src/ir/envelope.ts](src/ir/envelope.ts) is locked at 6 fields (D-15). Both must be honoured without modification.
- **No query primitives** over the IR (subtree-by-name, ancestor walk, text scan, class/style scan).
- **Renderers are ready and untouched:** [src/renderers/markdown.ts](src/renderers/markdown.ts) and [src/renderers/json.ts](src/renderers/json.ts) accept any `TreeNode` + `Envelope`; Phase 5 must produce trees they already render correctly.
- **Tool input schemas are locked** at Phase 2 (`route`, `component`, `query`, `class_or_prop`, `projectRoot`, `format`). Phase 5 only fills the handler body.
- **ARCH-02** forbids cross-call cache: every tool call must construct a fresh `Analyzer` with its own per-call AST cache.

The phase exists because the four tools are the entire user-visible surface of v1 — without them, the project ships nothing usable.

## Requirements

1. **TOOL-01 — `get_full_hierarchy(route, format?)` returns the layout chain + page subtree as a single nested tree.** Layouts are composed via slot substitution: each layout's render-flow keeps its `kind: "slot", name: "children"` node, and the `Analyzer` replaces that slot with the next-deeper layer's tree (root layout wraps next layout … wraps page).
   - Current: handler returns `notImplemented("get_full_hierarchy")`.
   - Target: handler resolves route via `NextJsAdapter.mapRouteToEntry`, parses each `RouteMatch.entries` file, runs render-flow on each, slot-substitutes from root downward, attaches parallel-route slots (see R3), and returns `Envelope` rendered via `renderMarkdown` (default) or `renderJson`.
   - Acceptance: For fixture `app/(group)/dashboard/settings/page.tsx` with layouts at `app/`, `app/(group)/`, `app/(group)/dashboard/`, calling `get_full_hierarchy({ route: "/dashboard/settings" })` returns markdown whose root is the outermost layout's component, whose `children` slot resolves to the next layout, recursively down to the page. JSON format on the same input round-trips through `EnvelopeSchema.parse` without error.

2. **TOOL-02 — `focus_on(component, scope)` walks the union IR of every route in the project.** `scope: "down"` returns the subtree rooted at each occurrence of `component`; `scope: "up"` returns the ancestor chain only (root → component, exclusive of component's children); `scope: "full"` returns ancestors + subtree (default). When the component appears in N places, the envelope's `tree` is a synthetic `kind: "fragment"` root whose children are the N match subtrees, each preserving its real `file:line`.
   - Current: handler returns `notImplemented("focus_on")`.
   - Target: handler enumerates every route via `NextJsAdapter.discoverEntries`, builds full IR per route through the same `Analyzer` pipeline as TOOL-01, scans the union of trees for `kind: "component" && name === args.component`, and assembles the synthetic fragment per `scope`. Component name regex is already enforced by Phase 2 input schema (`/^[A-Z][A-Za-z0-9_]*$/`).
   - Acceptance: Fixture project where `<Card>` appears in `/dashboard` (under `<Sidebar>`) and in `/profile` (under `<Header>`): `focus_on({ component: "Card", scope: "full" })` returns a fragment of 2 subtrees — one rooted at the `/dashboard` occurrence, one at `/profile` — each carrying its true `file:line`. Same call with `scope: "down"` returns just `<Card>` and its descendants for each match; `scope: "up"` returns only the ancestor chain (no descendants of `<Card>`).

3. **TOOL-03 — `find_by_text(query)` matches `kind: "text"` IR nodes case-insensitively, with Levenshtein fuzzy fallback when no exact substring match.** Match rule: `node.value.toLowerCase().includes(query.toLowerCase())`. Fallback (zero matches): emit up to 5 candidate text values whose Levenshtein distance to the query is ≤ 2 via `Envelope.warnings` as `"no exact match — did you mean: \"<candidate>\" @ file:line"`. Match envelope shape: synthetic `kind: "fragment"` root, children are the matched text nodes (preserving original `file:line`).
   - Current: handler returns `notImplemented("find_by_text")`.
   - Target: handler builds per-route IR via `Analyzer` (same union as TOOL-02), traverses every route's tree collecting `kind: "text"` nodes, applies the case-insensitive substring rule, returns fragment-rooted envelope. On zero matches, computes Levenshtein over the union of all text values and surfaces top-5 ≤ 2-distance candidates in `warnings`.
   - Acceptance: Fixture with `<button>Submit</button>` and `<span>submit form</span>`: `find_by_text({ query: "submit" })` returns a fragment of 2 text nodes with correct `file:line`. Fixture with only `<button>Submit</button>` and `find_by_text({ query: "submi" })` returns the match (substring hit). With no substring match (`query: "submitt"`), `tree.children` is empty and `warnings` contains `did you mean: "Submit" @ <file>:<line>`.

4. **TOOL-04 — `find_by_style(class_or_prop)` matches className tokens (space-split, exact-token equality) OR style-object property keys.** Two match conditions, evaluated on every `kind: "element"` and `kind: "component"` node:
   (a) The node has a `className` prop whose string value, split on whitespace, contains `args.class_or_prop` as an exact token.
   (b) The node has a `style={{ ... }}` JSX expression with `args.class_or_prop` as a top-level property key.
   Other style-related props (`data-*`, `aria-*`, etc.) are NOT scanned.
   - Current: handler returns `notImplemented("find_by_style")`.
   - Target: render-flow walker must surface className strings and style-prop keys onto IR nodes during traversal (extension at the IR-build layer, NOT a TreeNode schema change — store on `layoutHint` or new walker-internal sidecar map keyed by node identity). Handler scans union IR, collects matches, returns synthetic-fragment envelope identical in shape to TOOL-02 / TOOL-03.
   - Acceptance: Fixture `<div className="flex items-center">` matches `find_by_style({ class_or_prop: "flex" })` and `"items-center"`, but NOT `"item"` (exact token). Fixture `<span style={{ marginTop: 8, color: "red" }}>` matches `"marginTop"` and `"color"` but NOT `"red"` (value, not key). A node with both `className="flex"` and `style={{ flex: 1 }}` is reported once (deduplicated by file:line:nodeIdentity).

5. **ARCH-02 — Per-call `Analyzer` instance with per-call AST cache; no cross-call state.** Every tool handler constructs `new Analyzer({ root, adapter })` at call entry. The `Analyzer` owns a private `Map<absPath, AST>` populated lazily as files are parsed; the cache is GC'd when the handler returns.
   - Current: No `Analyzer` exists; no cache exists; nothing to verify.
   - Target: `src/core/Analyzer.ts` exports a class whose constructor receives root + adapter and exposes the four query methods used by tool handlers. The cache is an instance field, never module-level, never `static`.
   - Acceptance: Test that calls `get_full_hierarchy("/")` twice with a file mutation between calls observes the new content on call #2 (proves no stale AST). A grep for `static\s+\w+\s*[:=]` in `src/core/Analyzer.ts` returns zero file-level singletons; a grep for `let cache` / `const cache` at module scope (outside the class) returns zero hits.

6. **Synthetic fragment root for multi-match envelopes** — TOOL-02, TOOL-03, TOOL-04 share an envelope shape: `tree.kind === "fragment"`, `tree.file === "<synthetic>"`, `tree.line === 0`, `tree.children` is the match list (possibly empty).
   - Current: No code emits synthetic roots.
   - Target: A single helper `buildFragmentRoot(matches: TreeNode[]): TreeNode` lives in `src/core/Analyzer.ts` (or a sibling). Markdown renderer treats fragment kind as transparent (per existing D-08/D-09 — verify, do not modify renderer); JSON renderer round-trips it via existing `EnvelopeSchema.parse`.
   - Acceptance: `EnvelopeSchema.parse(envelope)` accepts the synthetic-rooted envelope. Markdown rendering produces a list-style tree without an extra root line for the fragment (uses children directly).

7. **Runtime annotation surfaces in markdown output via `layoutHint`** — `ComponentDefinition.runtime` (`"client"` or `"server"`) is propagated onto the IR node corresponding to that component as `layoutHint: "client"` (server is the default and is NOT annotated to keep markdown noise low).
   - Current: No code reads `runtime` from `ComponentDefinition`.
   - Target: When the `Analyzer` instantiates a `kind: "component"` IR node from a `ComponentDefinition`, it sets `layoutHint = "client"` if and only if the source ComponentDefinition has `runtime === "client"`. Server-runtime components leave `layoutHint` unset (or merge with existing layoutHint if walker emits one — concatenated with `; `, server-runtime contributing nothing).
   - Acceptance: Fixture file with `"use client"` directive contains `export function Foo()`; in the rendered markdown, the `<Foo>` line ends with a layoutHint suffix that includes `"client"`. A peer file without the directive renders `<Bar>` with no `client` hint.

8. **Empty-match and unresolved-route handling — no throws.** Every tool returns a well-formed `Envelope` even on no-match / no-route / parse-error cases. `mapRouteToEntry({ matched: false })` for TOOL-01 → return envelope with empty fragment tree + `warnings: ["route not matched: <route>"]`. Zero matches in TOOL-02/03/04 → empty-children fragment tree + appropriate warning. Per-file parse errors during scanning → emit `kind: "error"` IR node for that file's slot in the union and append the message to `warnings`; do NOT abort the call.
   - Current: `notImplemented` handlers throw via `withErrorBoundary` — Phase 5 must not introduce new throw paths.
   - Target: All four handlers always return a `ToolResponse` whose envelope passes `EnvelopeSchema.parse`. The only path through `withErrorBoundary` that surfaces as MCP error is internal bug (programming error / unhandled exception in the orchestrator) — user-data shapes (unknown route, no matches, parse errors in user files) are returned as data, not errors.
   - Acceptance: Test calling `get_full_hierarchy({ route: "/does-not-exist" })` returns a successful tool response whose `tree.children` is empty and whose `warnings[0]` contains `"route not matched"`. Test with a syntactically broken user file in the fixture proves a `kind: "error"` node appears in the union tree and the call still succeeds.

## Boundaries

**In scope:**
- `src/core/Analyzer.ts` — new class orchestrating per-call: route resolution → adapter calls → AST parse → render-flow → IR tree assembly with slot substitution → renderer.
- ComponentDefinition[] + RouteMatch → TreeNode translation (the missing IR-build layer).
- The 4 MCP tool handlers (replace `notImplemented` with real logic), preserving locked input schemas.
- IR query primitives: subtree-by-component-name, ancestor walk, text-node scan with Levenshtein fuzzy, className/style-key scan.
- Synthetic fragment root for multi-match envelopes; runtime → `layoutHint: "client"` annotation.
- Per-call AST cache inside `Analyzer`; assertion test that no cross-call cache exists.
- Vitest unit tests for each query primitive + integration tests covering all 8 acceptance criteria above; fixtures live under `test/fixtures/phase-05/`.

**Out of scope:**
- **Cross-call cache / persistent index** — ARCH-02 forbids; revisit only in v2.
- **Performance SLA for find_by_*** — full-project scan is O(routes × files) per call; correctness first, perf tuning is Phase 6 territory.
- **Pages Router routes** — v1 ships App Router only via `NextJsAdapter`.
- **MCP tool input schema changes** — schemas are locked at Phase 2; Phase 5 fills handler bodies, no signature changes.
- **TreeNode / Envelope schema changes** — D-10 (9 kinds) and D-15 (6 fields) are locked. Runtime rides on `layoutHint`; multi-match rides on synthetic `kind: "fragment"`.
- **Other framework adapters** — only `NextJsAdapter` is wired; the multi-adapter selection logic (when more adapters exist) is post-v1.
- **Client-side fetch / network / runtime evaluation** — static analysis only (PROJECT.md constraint).
- **MCP transport changes** — stdio only; no HTTP/SSE.
- **Markdown / JSON renderer changes** — Phase 5 must produce trees the existing renderers accept unmodified.

## Constraints

- **TreeNode schema (D-10) MUST remain locked at 9 kinds** — runtime annotation rides on `layoutHint`, not a new field.
- **Envelope schema (D-15) MUST remain locked at 6 fields** — multi-match rides on a synthetic `kind: "fragment"` root, not a new envelope field.
- **`FrameworkAdapter` 5-method interface (ARCH-01)** — Phase 5 only consumes existing methods; does not extend the contract.
- **D-12 no-throw rule** — none of the 4 tool handlers throw on user-data errors (unknown route, no matches, malformed user file). All such cases surface via empty fragment + `warnings[]` or `kind: "error"` IR nodes.
- **D-07 forward-slash paths** — every `file:` field in IR uses forward slashes; reuse `toForwardSlash` from [src/core/paths.ts](src/core/paths.ts).
- **MCP-04 stdout reserved for JSON-RPC** — diagnostics use `Envelope.warnings` or `process.stderr` via `src/mcp/log.ts`. Never `console.log`.
- **Per-call instance only (ARCH-02)** — `Analyzer`'s AST cache is an instance field; no module-level state, no `static` fields.
- **Adapter island rule** — `src/core/Analyzer.ts` may import from `src/adapters/types.ts` (for type-only imports of `ComponentDefinition` / `RouteMatch`) and call adapter methods through the `FrameworkAdapter` interface; it MUST NOT reach into `src/adapters/next/**` directly.
- **Babel ESM interop** — render-flow walker already handles `traverse.default ?? traverse`; Phase 5 reuses; no new Babel imports needed.
- **No new runtime deps** — Levenshtein implementation is hand-rolled (≤30 LOC); `tinyglobby` already covers any path globbing needed.

## Acceptance Criteria

- [ ] `get_full_hierarchy({ route: "/dashboard/settings" })` on a fixture with 3 nested layouts + page returns a single nested tree with 3 levels of slot-substitution wrapping the page subtree
- [ ] Same call with `format: "json"` produces an envelope that `EnvelopeSchema.parse` accepts without errors
- [ ] `get_full_hierarchy({ route: "/feed" })` on a fixture with `app/@modal/login/page.tsx` produces a tree where the `@modal` slot appears as a `kind: "slot", name: "modal"` sibling node carrying the modal subtree
- [ ] `focus_on({ component: "Card", scope: "full" })` on a fixture where `<Card>` appears in 2 routes returns a synthetic-fragment-rooted envelope with 2 child subtrees, each at its true `file:line`
- [ ] Same fixture, `scope: "up"` — each match subtree contains only the ancestor chain (no descendants of `<Card>`); `scope: "down"` — each subtree is rooted at `<Card>` (no ancestors)
- [ ] `find_by_text({ query: "Submit" })` matches case-insensitively (`<button>submit</button>` and `<span>SUBMIT FORM</span>` both match)
- [ ] `find_by_text({ query: "submitt" })` with no substring match returns empty fragment + `warnings` containing `did you mean: "Submit" @ <file>:<line>` (Levenshtein ≤ 2, top 5)
- [ ] `find_by_style({ class_or_prop: "flex" })` matches `className="flex items-center"` (token equality) but NOT `className="flexible"` or `className="myflex"`
- [ ] `find_by_style({ class_or_prop: "marginTop" })` matches `style={{ marginTop: 8 }}` but NOT `style={{ margin: 8 }}` and NOT `data-margintop="8"`
- [ ] A node with both `className="flex"` and `style={{ flex: 1 }}` is returned once (deduplicated by file:line)
- [ ] Two consecutive `get_full_hierarchy` calls with a file mutation between them observe the mutated content on call #2 (no cross-call cache)
- [ ] Static-analysis check: zero `static` fields and zero module-scope cache variables in `src/core/Analyzer.ts`
- [ ] `get_full_hierarchy({ route: "/does-not-exist" })` returns success with empty fragment tree + `warnings[0]` matching `/route not matched/`
- [ ] A fixture file with a syntax error appears as a `kind: "error"` IR node in the union tree; the call still returns success and the parser warning surfaces in `warnings`
- [ ] Component declared in a file starting with `"use client"` renders in markdown with a `client` token in its `layoutHint` suffix; server-runtime components have no `client` hint
- [ ] All 4 tool handlers produce envelopes that pass `EnvelopeSchema.parse`
- [ ] All Phase 1–4 tests still pass (no regression in IR schema, NextJsAdapter, renderers, MCP transport)
- [ ] Adapter island test still passes — `src/core/**` does not import from `src/adapters/next/**`

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                                                                  |
|--------------------|-------|------|--------|--------------------------------------------------------------------------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | TOOL-01..04 + ARCH-02 frozen; layout compose strategy (slot-based), find_by_* envelope shape, runtime placement all locked. |
| Boundary Clarity   | 0.88  | 0.70 | ✓      | 9 explicit out-of-scope items; D-10/D-15 schema locks reaffirmed; tool input schemas frozen.           |
| Constraint Clarity | 0.82  | 0.65 | ✓      | ARCH-02 per-call cache contract testable; no-throw locked; no new runtime deps; adapter island rule.   |
| Acceptance Criteria| 0.80  | 0.70 | ✓      | 18 pass/fail checks; concrete fixture shapes + concrete query strings; verifiable via grep + vitest.   |
| **Ambiguity**      | 0.14  | ≤0.20| ✓      | Gate passed after Round 2.                                                                              |

## Interview Log

| Round | Perspective       | Question summary                                                              | Decision locked                                                                                                |
|-------|-------------------|-------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| 0     | Researcher (auto) | What exists today vs Phase 5 goal?                                            | 4 stub handlers + no `Analyzer` + no IR-build layer; renderers + adapters ready; tool schemas locked.          |
| 1     | Researcher        | How does Analyzer compose layout chain into a single TreeNode?                | Slot-based nesting — each layout's `kind:"slot",name:"children"` is replaced by the next layer's tree.         |
| 1     | Researcher        | Scope of focus_on / find_by_text / find_by_style (no route param)?            | Scan whole project — Analyzer enumerates all routes via discoverEntries and queries the union IR.              |
| 1     | Researcher        | Where do parallel slots and runtime live in the IR?                           | Slots = sibling `kind:"slot"` nodes; runtime = `layoutHint: "client"` (only client annotated).                  |
| 1     | Researcher        | find_by_text matching + fuzzy strategy?                                       | Substring case-insensitive; Levenshtein ≤ 2 fallback (top 5) when no exact match.                              |
| 2     | Boundary Keeper   | find_by_style — what counts as a "style" hit?                                 | className token-equality OR style={{}} object key. No data-*/aria-*/value-substring matching.                  |
| 2     | Failure Analyst   | focus_on with N occurrences of the same component?                            | Return all matches as a synthetic-fragment-rooted envelope; preserve true file:line per match.                  |
| 2     | Boundary Keeper   | find_by_* output shape under locked Envelope schema?                          | Synthetic `kind:"fragment"` root with `file:"<synthetic>", line:0` and matches as `children[]`.                |
| 2     | Boundary Keeper   | Out-of-scope list?                                                            | (1) cross-call cache (2) perf SLA for find_by_* (3) Pages Router (4) tool contract changes.                    |

---

*Phase: 05-ir-queries-tool-wire-up*
*Spec created: 2026-04-29*
*Next step: /gsd-discuss-phase 5 — implementation decisions (Analyzer file layout, slot-substitution algorithm, render-flow → TreeNode mapping per ComponentDefinition kind, fixture project shape under test/fixtures/phase-05/, Levenshtein implementation location)*
