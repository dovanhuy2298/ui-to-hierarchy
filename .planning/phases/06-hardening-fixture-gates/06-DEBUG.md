# Phase 06 — Integration Test Debug Report

**Date:** 2026-05-05
**Status:** diagnosis only — no fixes applied (Phase 06 SPEC: "Out of scope: Fixing bugs uncovered by phase 6")
**Reproduction:** `pnpm test:integration` after `pnpm build`

## Summary

**Three independent root causes**, none caused by the Phase 06 fixtures themselves. All three are pre-existing defects in the Phase 02 / Phase 05 production code that were never exercised by Phase 1–5 unit tests. The pnpm-monorepo fixture is the first end-to-end test that calls `find_by_*` / `focus_on` against fixtures with cross-package imports and string-literal JSX props — both of which the implementation never handled. The user-visible "first" failure (FAIL #1, `find_by_style` envelope corruption) is the most surface-level: it would fire on **every** `find_by_style` / `find_by_text` / `focus_on` call against **every** fixture (shadcn-barrels, nested-routes, web, admin), because the bug is in the tool handler itself, not the fixture. Per D-14, FAIL #1 is `block` (falsifies Phase 02 D-15 envelope contract); FAIL #2 falsifies SPEC R1/R3 acceptance directly (`block`); FAIL #3 is a Phase-3-or-earlier IR design omission (`block` because the admin-fixture assertion that exposes it is locked SPEC R3 acceptance). Recommend fixing in priority order #1 → #2 → #3 because #1 blocks the entire integration suite from observing any other tool behavior.

---

## Failure 1: `find_by_style` (and `find_by_text`, `focus_on`) envelope corruption

- **Root cause:** Three of the four MCP tool handlers — `find_by_style`, `find_by_text`, `focus_on` — return the **markdown-rendered tree** in `content[0].text` instead of the JSON envelope. The integration test calls `JSON.parse(text)` on every tool response, which immediately throws `SyntaxError: Unexpected token '<'` because the markdown begins with `<>` (the `labelFor(fragment)` glyph for an empty `buildFragmentRoot([])`). Only `get_full_hierarchy` honors a `format` parameter and emits JSON.
- **Why "find_by_style + apps/admin" surfaces first:** the test runs `get_full_hierarchy` first per fixture (passes JSON), then the three other tools (all fail identically). Vitest's failure ordering reports the four-fixture × three-tool grid in the order it executes; the user-quoted message `<> @ <synthetic>:0` is the markdown rendering of an empty fragment, meaning the `find_by_style({class_or_prop:"grid"})` call against `apps/admin` returned zero matches AND was emitted as markdown. The empty-result vs. populated-result distinction is irrelevant — the JSON.parse failure fires regardless.
- **Evidence:**
  - `src/mcp/tools/find-by-style.ts:34` → `const text = renderMarkdown(tree, envelope);` — returns markdown only, no `format` param on the input schema (lines 17–25).
  - `src/mcp/tools/find-by-text.ts:34` → identical pattern.
  - `src/mcp/tools/focus-on.ts:39` → identical pattern.
  - `src/mcp/tools/get-full-hierarchy.ts:42–45` → has `format: z.enum(["markdown", "json"])` switch; the only handler that can emit JSON.
  - `src/renderers/markdown.ts:34` → `case "fragment": return "<>";` and line 68 → `return "${label}${hint} @ ${node.file}:${node.line}";` — produces the exact `<> @ <synthetic>:0` text observed when `tree = buildFragmentRoot([])` (`src/core/Analyzer.ts:459`, `file: "<synthetic>", line: 0`).
  - `test/integration/mcp-e2e.test.ts:63–67` → `extractEnvelope` unconditionally `JSON.parse(text)`s the response.
- **Fix shape:** Two viable directions, planner picks:
  1. **Symmetric `format` param on all four tools** — add the same `format: z.enum(["markdown","json"]).default("markdown")` schema field to `find_by_style`, `find_by_text`, `focus_on`; the integration test already passes `format: "json"` only for `get_full_hierarchy` and would need to be updated to pass it for the other three calls (or call `argsFor` with an explicit `format: "json"`). Cleanest, but expands the public MCP API.
  2. **Always-include-JSON envelope alongside markdown** — return `content: [{type:"text", text: markdown}, {type:"text", text: JSON.stringify(envelope)}]` and update the test's `extractEnvelope` to find the JSON-shaped text. Avoids API surface change but couples the tool response shape to test introspection.
  - **Recommended:** option (1). Aligns with `get_full_hierarchy`'s precedent and matches the integration test's existing `format: "json"` opt-in pattern. Touch points: `src/mcp/tools/{find-by-style,find-by-text,focus-on}.ts` (add format to inputSchema + branch on it in handler — same 4-line pattern already in `get-full-hierarchy.ts:42–45`); `src/renderers/json.ts` (already exists, used by `get_full_hierarchy`); `test/integration/mcp-e2e.test.ts` `argsFor` blocks (add `format: "json"` for non-`get_full_hierarchy` tools).

## Failure 2: workspace package not resolved (Button.file points at consumer)

- **Root cause:** The IR build pipeline never invokes the resolver to relocate a JSX `<Button/>` callsite to its definition file. `walkRenderFlow` records `file = <calling-file>` on every `kind:"jsx"` RenderNode (including `isComponent: true`); `Analyzer.renderNodeToTreeNode` copies that file straight into `kind:"component"` TreeNodes. `resolveModule` (which would correctly: tsconfig-paths-resolve `@acme/ui` → `packages/ui/src/index.ts`, then `chaseBarrel` the `export { Button } from "./button"` re-export to `packages/ui/src/button.tsx`) is wired into the `NextJsAdapter` interface (`src/adapters/next/NextJsAdapter.ts:55–62`) but is never called by `Analyzer` during tree construction. The resolver itself is correct — both `getPathsMatcher` (with two-level `extends` from `apps/web/tsconfig.json` → `tsconfig.base.json`, verified by reading `src/core/resolver/tsconfig.ts:46–47` which uses `getTsconfig(ctx.resolvedRoot)`) and `chaseBarrel` (which handles the `export { Button } from "./button"` form at `src/core/resolver/barrel.ts:62–76`) would land on the right file. The wiring gap is the bug.
- **Evidence:**
  - `src/core/render-flow/index.ts:130–169` `jsxElementToNode` — every emitted RenderNode has `file` = the file passed in by `walkRenderFlow`, which is the entry/parsed file (the consumer).
  - `src/core/Analyzer.ts:121–131` — for `rn.isComponent`, builds `{kind:"component", name:rn.tag, file: fwdFile, line: rn.line}` straight from the RenderNode; no resolver call, no import lookup.
  - `src/adapters/next/NextJsAdapter.ts:55–62` — `resolveModule` is exposed on the adapter but only `extractComponents` calls into the parser; nothing in the IR-build path consults it for component callsites.
  - `src/core/resolver/index.ts:115–186` — `doResolve` correctly checks tsconfig paths first (line 67–85), then bare specifier; for `@acme/ui` it would find the matched `packages/ui/src/index.ts` candidate, parse it, find no local `Button` declaration (it only re-exports), and recurse via `chaseBarrel` to `button.tsx`.
  - Fixture confirms: `apps/web/app/page.tsx:1` `import { Button } from "@acme/ui";`; `tsconfig.base.json:7–11` defines `paths: {"@acme/ui": ["packages/ui/src/index.ts"]}` with `baseUrl: "."`; `packages/ui/src/index.ts:1` `export { Button } from "./button";`; `packages/ui/src/button.tsx` defines `Button`. The chain is intact in the fixture; the call to walk it is missing in the IR build.
- **Fix shape:** In `Analyzer.renderNodeToTreeNode` (or a new step in `buildTreeForEntry` that runs after render-flow walk and before TreeNode emission), for every `kind:"jsx"` RenderNode with `isComponent: true`:
  1. Look up the JSX tag name in the entry file's import bindings (collect imports once per entry from the cached AST in `ctx.astCache` — same source the resolver already consumes).
  2. If found, call `this.adapter.resolveModule(ctx, entryFile, importSpecifier, tagName)`.
  3. If the result is `{ok:true, kind:"local"}`, override `file` (and reset `line` to either 1 or — better — the resolved-component's declaration line via a one-off `discoverComponents` pass on the resolved file, which `extractComponents` already does upstream).
  4. Otherwise (external/not-found/cycle), keep the call-site `file:line` and optionally append a warning to `ctx.warnings`.
  - Touch points: `src/core/Analyzer.ts` (add an import-binding map per entry around the existing `buildTreeForEntry` flow at lines 508–572; thread it into `renderNodeToTreeNode` or do a post-pass walk over the built tree). No new resolver code needed — this is purely a wiring change.
  - This same fix repairs the shadcn-barrels invariant (test asserts `Button.file` ends with `components/ui/button.tsx`) — same gap, different fixture.

## Failure 3: 'Manage users' (and any string-literal JSX prop value) absent from envelope

- **Root cause:** The IR's `TreeNode` schema has no field for JSX attributes/props. `walkRenderFlow.jsxElementToNode` extracts attributes into `RenderNode.attributes` (with `value: { kind: "literal", value: "Manage users" }` for the `label` prop), but `Analyzer.renderNodeToTreeNode` discards `rn.attributes` entirely when building TreeNodes — only `scrapeStyleAttributes` reads them, and only for the `className` and `style` keys. Consequently no string literal that lives inside a JSX prop ever reaches the envelope's `tree` (or anywhere else in the response). The admin fixture's `<Button label="Manage users" />` is the first test case where a fixture invariant asserts on a prop-value string. The admin app **is** walked (page.tsx is discovered, parsed, and emits `<div>` → `<Button>`/`<DataTable>` component children — confirmed because the admin invariant `dataTables.length > 0` would be the next assertion to fail and isn't separately reported), but the prop value is invisible by design omission.
- **Evidence:**
  - `test/fixtures/phase-06/pnpm-monorepo/apps/admin/app/page.tsx:5` → `<Button label="Manage users" />` — text lives only as a string-literal JSX attribute value.
  - `src/core/render-flow/index.ts:138–141` → string-literal attributes ARE captured into `RenderNode.attributes` as `{kind:"literal", value:"Manage users"}`.
  - `src/core/Analyzer.ts:111–141` `renderNodeToTreeNode` for `case "jsx"` → only calls `scrapeStyleAttributes(rn, sidecar)`; never reads `rn.attributes` again. The returned TreeNode shape (`{kind:"component", name, children, file, line, [layoutHint]}`) has no field to hold attributes.
  - `src/core/Analyzer.ts:69–93` `scrapeStyleAttributes` — explicit allowlist of `attr.name === "className"` and `attr.name === "style"`; everything else is dropped on the floor.
  - `src/ir/schema.ts:13–20` `TreeNode kind:"component"` shape — no attributes/props field at all. Same for `kind:"element"`.
  - `src/renderers/markdown.ts:15–39` `labelFor` — emits only the component name `<Button>`, never any prop value. (Not directly relevant to the admin assertion which JSON-stringifies the envelope, but confirms the omission is end-to-end.)
- **Fix shape:** Choose between two scopes:
  1. **Minimum to satisfy R3 acceptance:** include children-as-text-content when a JSX element has a single string-literal prop named `label`/`title`/`children`. Heuristic-only; fragile; doesn't generalize.
  2. **Proper IR extension:** add an optional `attributes?: Array<{name: string, value: string}>` field to `kind:"component"` and `kind:"element"` TreeNode variants, populated by `renderNodeToTreeNode` from `rn.attributes` (filter to literal-string values; expression/spread attrs are out of scope for v1 since their resolved value is unknown statically). Update `EnvelopeSchema`/`TreeNodeSchema` in `src/ir/schema.ts:13–28` and `src/ir/envelope.ts`. Extend `renderMarkdown.labelFor` to optionally append `key="value"` pairs (style choice).
  - **Recommended:** option (2). It is the minimal change that makes the admin invariant pass while staying schema-honest. It also makes `find_by_text` actually useful for prop-text searches (the admin `find_by_text({query:"Manage users"})` invariant that currently piggybacks on FAIL#1 will become a real test once #1 is fixed). Touch points: `src/ir/schema.ts` (TreeNode shape), `src/ir/envelope.ts` (no change — re-exports schema), `src/core/Analyzer.ts:111–141` (`renderNodeToTreeNode` for jsx case + new helper to filter literal attrs), `src/core/Analyzer.ts:764–809` (`findByText` walker — also harvest matches from `node.attributes[*].value` strings). No change to `walkRenderFlow` (already extracts attributes correctly); no change to `find_by_style` style-sidecar path (orthogonal).

---

## Suggested gap closure plan ordering

**Wave 1 (must precede everything):** Fix #1 (envelope-format symmetry).
- Until tools other than `get_full_hierarchy` emit JSON, the integration suite cannot assert anything past the `JSON.parse` line for 9 of its 16 invocations (3 tools × 4 fixtures + path-gate dependency). Failures #2 and #3 are partially observable today only through `get_full_hierarchy`; full coverage requires #1 first.
- Independent of #2 and #3 — touches only `src/mcp/tools/{find-by-style,find-by-text,focus-on}.ts` and the test's `argsFor`.

**Wave 2 (parallel, both unblocked by Wave 1):**
- **Fix #2** (resolver wiring in IR build). Independent of #3. Touches `src/core/Analyzer.ts` only; no schema change.
- **Fix #3** (TreeNode attributes field). Independent of #2. Touches `src/ir/schema.ts`, `src/ir/envelope.ts`, `src/core/Analyzer.ts`. Includes a TreeNode schema-version bump consideration — D-15 envelopes are pinned to `schemaVersion: "1"`; adding an optional field is non-breaking for parsers but should be noted in a Findings entry.

**Wave 3 (verification):** Re-run `pnpm test:integration`. Expected outcome: all 16 tool invocations + 4 path-gate assertions pass. If the shadcn-barrels Button assertion still fails after #2, the resolver's barrel-chase against the shadcn fixture deserves its own investigation (shadcn was not exercised in this debug session — only its symptom shape was inferred from shared code paths).

**Out of this debug's scope (record as Findings under D-13 if still observable post-fix):**
- The `nested-routes` fixture's `@sidebar` slot reachability assertion (`test/integration/mcp-e2e.test.ts:138–143`) was not investigated. It does not match any of the three reported failures and may pass once Wave 1 lands (it's gated on the same `JSON.parse` for `find_by_text`/`find_by_style` calls there).
- `find_by_style({class_or_prop:"grid"})` against admin returning empty matches today is a downstream symptom of FAIL#1 (the assertion never runs). Whether `grid` is correctly extracted from `<table className="grid grid-cols-4">` in `packages/ui/src/datatable.tsx` is testable only after Wave 2's #2 lands (because today the table's `file` is the consumer page.tsx, but the style sidecar is keyed by `file:line:tag` from the *RenderNode* during `scrapeStyleAttributes` which uses the same call-site file — so the sidecar key may match either way; needs verification post-fix, not a separate root cause).
