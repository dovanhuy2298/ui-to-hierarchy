---
phase: 06-hardening-fixture-gates
plan: 10
subsystem: ir
tags: [treeNode, jsx-attributes, find-by-text, schema-evolution, zod, debug-3]

requires:
  - phase: 05-ir-queries
    provides: TreeNode schema, Analyzer.renderNodeToTreeNode, findByText
  - phase: 06-08
    provides: format-symmetric MCP tools (json branch covers integration assertion path)
provides:
  - Optional `attributes` field on TreeNode kind:'component' and kind:'element'
  - Literal-string JSX prop values now reach the envelope (closes DEBUG #3)
  - findByText matches against attribute values, returning the JSX site as the matched node
  - Markdown renderer surfaces attributes as `name="value"` pairs in labels
affects: [phase-07, future framework adapters that emit RenderNode.attributes]

tech-stack:
  added: []
  patterns:
    - "Additive optional field — D-15 schemaVersion '1' preserved (Standard Schema additive evolution)"
    - "Literal-string filter mirroring scrapeStyleAttributes (drop expression/spread/non-string-literal)"
    - "extractLiteralAttributes returns undefined when empty so JSON output stays minimal (no `attributes: []`)"

key-files:
  created: []
  modified:
    - src/ir/schema.ts
    - src/core/Analyzer.ts
    - src/renderers/markdown.ts
    - test/core/__snapshots__/analyzer-dashboard-settings.md

key-decisions:
  - "Literal-string-only filter: expression/spread attrs and non-string literals dropped per v1 carve-out — keeps the `attributes` array shape `Array<{name: string, value: string}>` simple at the wire boundary"
  - "Markdown surfacing applied (no snapshot regressions blocked it); only one analyzer snapshot regenerated and the diff is exactly attribute-surfacing"
  - "findByText returns the matched component/element node itself (not a synthetic text node) so file:line points at the JSX site that carries the prop"

patterns-established:
  - "TreeNode optional-field evolution: add to type alias and zod schema in lockstep (D-04 manual sync), keep schemaVersion pinned"
  - "Literal-attribute extraction: factor into a helper alongside scrapeStyleAttributes; both can coexist (style sidecar is orthogonal — findByStyle uses styleIndex, not TreeNode.attributes)"

requirements-completed: [ARCH-04]

duration: ~12m
completed: 2026-05-05
---

# Phase 06 Plan 10: TreeNode Attributes Field Summary

**Closes DEBUG #3: literal-string JSX props (e.g. `<Button label="Manage users" />`) now reach the envelope via an additive optional `attributes` field on component/element TreeNodes; integration suite goes 19/20 → 20/20**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-05T07:11:00Z
- **Completed:** 2026-05-05T07:14:00Z
- **Tasks:** 3
- **Files modified:** 4 (3 source, 1 snapshot regenerated intentionally)

## Accomplishments
- TreeNode schema (TS alias + zod) extended with optional `attributes?: Array<{name, value}>` on `kind:"component"` and `kind:"element"`; envelope `schemaVersion: "1"` preserved (D-15 additive evolution).
- `Analyzer.renderNodeToTreeNode` populates `attributes` from `RenderNode.attributes` filtered to literal-string values via a new `extractLiteralAttributes` helper. The helper returns `undefined` when empty so existing JSON output stays minimal (no synthetic `"attributes": []`).
- `Analyzer.findByText` now also matches against `node.attributes[*].value`; the matched component/element node itself is returned (not a synthetic text node) so `file:line` points at the JSX site that carries the prop. Levenshtein fallback automatically picks up attribute values because they share `allTextNodes`.
- `renderMarkdown.labelFor` surfaces literal attributes as `name="value"` pairs on component and element labels, with defensive escape of embedded double quotes.
- Integration assertions for the `pnpm-monorepo` apps/admin route now pass: `'Manage users'` substring is present in the JSON-stringified envelope; the apps/web non-overlap negative remains green.

## Task Commits

1. **Task 1: Extend TreeNode schema with optional attributes field** — `4a23263` (feat)
2. **Task 2: Populate attributes in renderNodeToTreeNode and match in findByText** — `0654caf` (feat)
3. **Task 3: Surface attributes in markdown renderer** — `5e093b5` (feat)

## Files Created/Modified
- `src/ir/schema.ts` — TreeNode union + zod `TreeNodeSchema` carry optional `attributes` on component/element
- `src/core/Analyzer.ts` — `extractLiteralAttributes` helper; populated in jsx case for both component (with `layoutHint` parity) and element (refactored to a `base` variable mirroring component); `findByText` walker extended with attribute-match path with `break` to dedupe per node
- `src/renderers/markdown.ts` — `formatAttributes` helper; appended to component/element labels; quotes inside attribute values escaped with `\"`
- `test/core/__snapshots__/analyzer-dashboard-settings.md` — regenerated; diff is exactly `className="..."` and `title="..."` additions on existing element/component lines, nothing else

## Decisions Made
- **Literal-string-only filter (v1 carve-out)**: matches the planner's choice and mirrors `scrapeStyleAttributes`. Expression and spread attrs and non-string literals are dropped — keeps the `Array<{name: string, value: string}>` shape simple at the wire boundary. Future v2 can lift this with a discriminated value union if needed.
- **`undefined` over `[]` when empty**: keeps JSON output minimal and existing test fixtures unchanged.
- **findByText returns the JSX site, not a synthetic text node**: agents asking "where is 'Manage users' in the source?" want the `<Button>` element's file:line, not a fake text-node location.
- **Markdown surfacing applied (Task 3 chose the "add" branch of its decision tree)**: only one snapshot needed regeneration and the diff is mechanical (attribute-surfacing only); the human-readable tree now carries the prop information that's now in the JSON.

## Deviations from Plan

None — plan executed exactly as written. The Task 3 decision tree resolved cleanly to "add the surfacing" because only one analyzer snapshot needed regeneration and the diff was exactly attribute-surfacing.

## Issues Encountered
None.

## Verification

- `pnpm build` exits 0 (verified after each task).
- `pnpm test` — **256/256 passing** (was 255/256 before Task 2). Includes:
  - Unit suite for analyzer/renderer/IR.
  - Integration suite (`test/integration/mcp-e2e.test.ts`) at **20/20** (was 19/20 after 06-09):
    - apps/admin assertion `JSON.stringify(envelope).includes("Manage users") === true` — PASS.
    - apps/web negative `JSON.stringify(envelope).includes("Manage users") === false` — PASS.
- `schemaVersion: "1"` in `src/ir/envelope.ts` unchanged (D-15 preserved).

## Self-Check: PASSED

Files exist and commits are present:
- FOUND: `src/ir/schema.ts` (modified, attributes on component/element)
- FOUND: `src/core/Analyzer.ts` (extractLiteralAttributes + findByText match path)
- FOUND: `src/renderers/markdown.ts` (formatAttributes)
- FOUND: `test/core/__snapshots__/analyzer-dashboard-settings.md` (regenerated, diff confirmed)
- FOUND commit: `4a23263` (Task 1)
- FOUND commit: `0654caf` (Task 2)
- FOUND commit: `5e093b5` (Task 3)

## Next Phase Readiness

- Phase 06 wave 2 gap-closures all complete: 06-08 (format symmetry), 06-09 (resolver wiring), 06-10 (attributes). Integration suite is now fully green (20/20).
- Phase 07 (or whatever follows) can rely on `TreeNode.attributes` being present on component/element nodes whenever the source has literal-string JSX props.
- Future framework adapters (RN, Vue, Svelte) should populate `RenderNode.attributes` with the same `JsxAttribute` shape for free attribute-surfacing.

---
*Phase: 06-hardening-fixture-gates*
*Completed: 2026-05-05*
