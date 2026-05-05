---
phase: 06-hardening-fixture-gates
reviewed: 2026-05-05T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/core/Analyzer.ts
  - src/ir/schema.ts
  - src/mcp/tools/find-by-style.ts
  - src/mcp/tools/find-by-text.ts
  - src/mcp/tools/focus-on.ts
  - src/renderers/markdown.ts
  - test/core/__snapshots__/analyzer-dashboard-settings.md
  - test/integration/mcp-e2e.test.ts
findings:
  critical: 0
  warning: 5
  info: 6
  total: 11
status: warnings_fixed
fix_summary:
  warnings_fixed: 5
  info_deferred: 6
  fixed_at: 2026-05-05T00:00:00Z
---

# Phase 06: Code Review Report

**Reviewed:** 2026-05-05
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

The Phase 06 implementation introduces literal-string attribute extraction, an
import-binding resolver post-pass, a children-slot injection algorithm, and a
broad MCP integration suite. The Analyzer correctly observes the R8 no-throw
contract and the D-07 forward-slash invariant is uniformly enforced via
`toForwardSlash`. The integration test scaffolding (`mcp-e2e.test.ts`) is
solid — schema validation, build-staleness guard, and Windows-path gates are
all in place.

The defects found cluster around three areas:

1. **`injectChildrenSlots` heuristic is fragile.** The post-order traversal
   plus mutating-Set sentinel means slot assignment depends on traversal order
   rather than scoped containment, and there is no upper bound on the
   `sl >= tree.line` match (Case A) — an empty element on line 5 can claim a
   `{children}` literal that appeared on line 80 in an unrelated subtree if
   no closer container was emptier-and-earlier-seen.
2. **Component-pick ambiguity in `buildTreeForEntry`.** The comment promises
   "default-export's renderFlow" but the code picks `defs.find(...) ?? defs[0]`
   — the first non-parse-error definition, regardless of whether it is the
   default export. Files exporting multiple components produce non-deterministic
   results from the consumer's point of view.
3. **`attachParallelSlot` silently drops slot data.** When the outermost node
   is not a `kind:"component"` (e.g. when `pageFile` is undefined and the page
   tree starts as an empty fragment root), parallel slots are discarded with
   no warning emitted to `ctx.warnings`.

There is also significant code duplication across the four MCP tool files
(`find-by-style.ts`, `find-by-text.ts`, `focus-on.ts`, and the implied
`get-full-hierarchy.ts`) — every tool repeats the same envelope-build +
markdown/json-render dance.

## Warnings

### WR-01: `injectChildrenSlots` Case A has no upper bound on slot line

**File:** `src/core/Analyzer.ts:488-502`
**Issue:** Case A only checks `if (sl >= tree.line)` to decide whether to
inject a `{children}` slot into an empty element. There is no upper bound
check (no closing-tag line, no JSX-element line range). When a layout file
contains both an early empty element (e.g. `<hr />` on line 5) and a
`{children}` expression at line 80, the empty element on line 5 can claim
the slotLine because it satisfies `80 >= 5`. The post-order traversal
(children before parent) makes this even more order-dependent: the first
empty element visited in DFS-postorder that has any `sl >= tree.line` wins
the smallest such `sl`, not the closest enclosing one.

The mutating-Set stopgap noted in the comment ("WR-01 stopgap") prevents
double-assignment of the same slot line, but does not fix the
mis-assignment problem itself.

**Fix:**
```ts
// Capture the closing-tag line range for each JSX element during the
// initial AST traversal (in collectChildrenSlotLines or a sibling pass),
// then in injectChildrenSlots check both ends:
//
//   if (sl >= tree.line && sl <= tree.closingLine) { ... }
//
// Alternatively, perform the slot-injection inside the parser (in the
// Babel visitor that builds RenderNode) where lexical containment is
// directly observable, instead of trying to reconstruct it post-hoc
// from line-number heuristics on the IR.
```

### WR-02: `buildTreeForEntry` may pick the wrong component when a file has multiple exports

**File:** `src/core/Analyzer.ts:683-686`
**Issue:** The comment on line 666 says "Wraps the default-export's
renderFlow into a kind:'component' node," but the code picks
`defs.find((d) => d.name !== "<parse-error>") ?? defs[0]`. There is no check
that the picked definition is the default export. For a file that exports
multiple components (e.g. a `components/Card.tsx` that exports `Card` and a
named `CardHeader`), the order of `defs` returned by
`adapter.extractComponents` determines which one becomes the route's tree —
and that order is not part of the FrameworkAdapter contract reviewed here.
For the route-tree case where `absFile` is a layout/page, this is usually
fine because Next.js page/layout files have a default export; for the
resolver post-pass case (when a component callsite resolves to a barrel
re-export's source), it can silently pick a sibling helper component.

**Fix:**
```ts
// Either tighten the contract on extractComponents to return defs in
// "default-export-first" order, or filter explicitly:
const def =
  defs.find((d) => d.isDefault && d.name !== "<parse-error>") ??
  defs.find((d) => d.name !== "<parse-error>") ??
  defs[0];
// (Add `isDefault: boolean` to ComponentDefinition if not present.)
```

### WR-03: `attachParallelSlot` silently drops slot trees when the outermost node is not a component

**File:** `src/core/Analyzer.ts:394-416`
**Issue:** When `tree.kind !== "component"` (line 415), the function returns
the tree unchanged — the `slotTree` and `slotName` arguments are discarded
with no warning pushed to `ctx.warnings`. In `buildRouteTree`, when
`pageFile` is undefined the initial tree is `buildFragmentRoot([])` (a
`kind:"fragment"`), and any layouts that fail to wrap it would also leave
a non-component root. In those edge cases, parallel-route slots
(`@sidebar`, `@modal`, etc.) vanish from the IR with no diagnostic — a
silent correctness loss.

**Fix:**
```ts
function attachParallelSlot(
  tree: TreeNode,
  slotName: string,
  slotTree: TreeNode,
  warnings: string[],
): TreeNode {
  // ... existing component branch ...

  warnings.push(
    `parallel slot '@${slotName}' could not be attached: route tree root is kind:'${tree.kind}', not 'component'`,
  );
  return tree;
}
// And thread ctx.warnings into the call site at line 788.
```

### WR-04: `Math.max(...newChildren.map((c) => c.line))` can return 0 from synthetic nodes

**File:** `src/core/Analyzer.ts:506`
**Issue:** Synthetic nodes produced by `buildFragmentRoot` and
`attachParallelSlot` have `line: 0`. If `newChildren` happens to contain
only synthetic nodes (unusual but possible during partial recovery from a
parse error), `lastChildLine` resolves to 0 and any positive `sl > 0` from
the slot-lines set will satisfy `sl > lastChildLine`, claiming the slot
inappropriately. Combined with WR-01, this widens the surface for
mis-assignment.

**Fix:**
```ts
const lastChildLine = Math.max(
  0,
  ...newChildren.map((c) => c.line).filter((n) => n > 0),
);
// Then guard: if (lastChildLine === 0) skip Case B.
```

### WR-05: `formatAttributes` does not escape backslashes before quotes

**File:** `src/renderers/markdown.ts:20`
**Issue:** The replace `\b.value.replace(/"/g, '\\"')` escapes embedded
double quotes but does not first escape backslashes. A literal-string
attribute value of `a\b` round-trips to `a\b` (a literal backslash in the
markdown output), which:

1. Breaks the integration test's defense-in-depth assertion at
   `test/integration/mcp-e2e.test.ts:276` IF the attribute value with
   a backslash is ever serialized — currently the test only checks the
   JSON envelope, not the markdown rendering, so this is latent.
2. Cannot be reliably parsed back by a consumer expecting standard
   double-quoted-string escape semantics: a value of `a\"b` (literal
   backslash + quote) becomes `a\\\"b` in output, which on re-parse looks
   like an escaped quote followed by a stray quote.

Also relevant: the `\b` (literal backslash present in user JSX source via
strings like `className="a\b"`) would currently leak directly into the
markdown tree label, which violates the spirit of D-07's
forward-slash-only-paths invariant for path-like attributes (e.g. `src=`,
`href=`).

**Fix:**
```ts
const parts = attrs.map((a) => {
  const escaped = a.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `${a.name}="${escaped}"`;
});
```

## Info

### IN-01: `buildAncestorChain` drops the matched component for `scope:"up"`

**File:** `src/core/Analyzer.ts:1099-1106`
**Issue:** For `scope:"up"`, the leaf of the rebuilt chain is
`nodeWithChildren(ancestors[last], [])` — the deepest ancestor with empty
children. The matched component itself is intentionally not in the chain
(comment on line 887-888 supports this), but the deepest ancestor also
loses its sibling subtrees. Whether this is desired UX is a spec
question; flagging for clarity.

**Fix:** Document the intent in a code comment so future readers don't
mistake the empty-children for an oversight, e.g.:
```ts
// scope:"up" returns ancestors as a single linear chain. The deepest
// ancestor's siblings (and the matched node itself) are intentionally
// elided so the response is a strict ancestor path, not a subtree.
```

### IN-02: Tool handlers duplicate envelope/render scaffolding

**File:** `src/mcp/tools/find-by-style.ts:34-46`, `src/mcp/tools/find-by-text.ts:34-46`, `src/mcp/tools/focus-on.ts:39-51`
**Issue:** All three handlers contain the same five-line block:
construct Analyzer, call analyzer method, build envelope, splice warnings,
render markdown-or-json. With one more tool (`get_full_hierarchy`), this
will be four copies. A single helper —
`runAnalyzerTool(args, analyzerMethod)` — would absorb the boilerplate
and make the per-tool files declaration-only.

**Fix:** Extract a shared helper to `src/mcp/tools/common.ts` that takes
`(tree, warnings, format, root)` and emits the `ToolResponse`. Each
tool file then becomes ~12 lines (schema + handler thunk).

### IN-03: `extractLiteralAttributes` return type is wider than its behavior

**File:** `src/core/Analyzer.ts:111-121`
**Issue:** The function's return type is
`Array<{ name; value }> | undefined`, and at line 120 it returns
`undefined` when empty. Callers at lines 194 and 205 use
`if (literalAttrs)` to guard. This works, but a non-optional return
(`Array<...>` always, possibly empty) would be slightly cleaner and let
the caller use a length check uniformly.

**Fix:** Either return `Array<...>` always and `if (literalAttrs.length)`
on the caller side, or document why "absent" and "empty array" are
semantically distinct. Currently they aren't.

### IN-04: `collectChildrenSlotLines` only matches the literal identifier `children`

**File:** `src/core/Analyzer.ts:435-447`
**Issue:** The function matches `t.isIdentifier(expr) && expr.name === "children"`.
A layout that destructures the prop with a rename — e.g.
`function Layout({ children: kids })` and then `{kids}` — would not be
detected. This is acceptable for v1's stated carve-out, but worth a
dedicated comment so future readers don't think it's a complete
implementation of the slot-detection algorithm.

**Fix:** Add a doc comment noting the limitation. v1 carve-out only.

### IN-05: `mcp-e2e.test.ts` regex `match(/\\\\/)` semantics

**File:** `test/integration/mcp-e2e.test.ts:276-279`
**Issue:** The regex source `/\\\\/` is two literal backslashes. After
`JSON.stringify` runs, a single backslash in any string field becomes
`\\` (two chars), so this regex matches any single backslash anywhere in
the envelope JSON. That is the correct intent, but the assertion
message "envelope JSON contains a backslash outside file fields" is
misleading — it actually catches backslashes in any field, including
file fields (which the per-node check above already covers). Consider
renaming the message to "any backslash in serialized envelope" for
accuracy.

**Fix:** Update the assertion message to match what the regex actually
detects.

### IN-06: `buildUnionIR` re-runs full project parse for every tool call

**File:** `src/core/Analyzer.ts:828-847` (and tool handlers)
**Issue:** Each MCP tool handler (`find-by-style`, `find-by-text`,
`focus-on`) constructs a fresh `new Analyzer(...)` per call, then
`focusOn`/`findByText`/`findByStyle` each call `buildUnionIR()` which
re-runs `discoverEntries` + `buildRouteTree` for every route. Within a
single tool call this is fine (the routeTreeCache memoizes), but across
calls there is no caching. Performance is out of v1 review scope per
`<review_scope>`, so this is informational only — but worth flagging
because the architecture comment at line 8 ("ARCH-02 contract: no
static fields, no module-scope cache variables") is the deliberate
choice that produces this re-parse cost.

**Fix:** No action for v1. When perf cache work begins, document the
tradeoff explicitly in ARCH-02.

---

_Reviewed: 2026-05-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
