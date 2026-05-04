---
phase: 05-ir-queries-tool-wire-up
reviewed: 2026-05-04T00:00:00Z
depth: standard
files_reviewed: 38
files_reviewed_list:
  - src/core/Analyzer.ts
  - src/core/index.ts
  - src/mcp/tools/find-by-style.ts
  - src/mcp/tools/find-by-text.ts
  - src/mcp/tools/focus-on.ts
  - src/mcp/tools/get-full-hierarchy.ts
  - test/core/__snapshots__/analyzer-dashboard-settings.md
  - test/core/__snapshots__/analyzer-feed-with-modal.md
  - test/core/analyzer.test.ts
  - test/fixtures/phase-05/kitchen-sink/app/(group)/dashboard/layout.tsx
  - test/fixtures/phase-05/kitchen-sink/app/(group)/dashboard/page.tsx
  - test/fixtures/phase-05/kitchen-sink/app/(group)/dashboard/settings/page.tsx
  - test/fixtures/phase-05/kitchen-sink/app/(group)/layout.tsx
  - test/fixtures/phase-05/kitchen-sink/app/(group)/profile/page.tsx
  - test/fixtures/phase-05/kitchen-sink/app/@modal/login/page.tsx
  - test/fixtures/phase-05/kitchen-sink/app/@modal/page.tsx
  - test/fixtures/phase-05/kitchen-sink/app/components/Card.tsx
  - test/fixtures/phase-05/kitchen-sink/app/components/Header.tsx
  - test/fixtures/phase-05/kitchen-sink/app/components/Sidebar.tsx
  - test/fixtures/phase-05/kitchen-sink/app/components/StyledThing.tsx
  - test/fixtures/phase-05/kitchen-sink/app/components/SubmitButton.tsx
  - test/fixtures/phase-05/kitchen-sink/app/feed/page.tsx
  - test/fixtures/phase-05/kitchen-sink/app/layout.tsx
  - test/fixtures/phase-05/kitchen-sink/app/login/page.tsx
  - test/fixtures/phase-05/kitchen-sink/app/profile/page.tsx
  - test/fixtures/phase-05/kitchen-sink/app/server-test/ClientComp.tsx
  - test/fixtures/phase-05/kitchen-sink/app/style-test/page.tsx
  - test/fixtures/phase-05/kitchen-sink/next.config.js
  - test/fixtures/phase-05/kitchen-sink/tsconfig.json
  - test/fixtures/phase-05/micro/mutation-test/app/layout.tsx
  - test/fixtures/phase-05/micro/mutation-test/app/page.tsx
  - test/fixtures/phase-05/micro/mutation-test/tsconfig.json
  - test/fixtures/phase-05/micro/parse-error/app/layout.tsx
  - test/fixtures/phase-05/micro/parse-error/app/page.tsx
  - test/fixtures/phase-05/micro/parse-error/tsconfig.json
  - test/mcp/tools/find-by-style.test.ts
  - test/mcp/tools/find-by-text.test.ts
  - test/mcp/tools/focus-on.test.ts
  - test/mcp/tools/get-full-hierarchy.test.ts
findings:
  critical: 2
  warning: 7
  info: 4
  total: 13
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-05-04
**Depth:** standard
**Files Reviewed:** 38
**Status:** issues_found

## Summary

The Analyzer wires up four IR-query tools, follows ARCH-02 (no static / module-scope state), and observes D-07 forward-slash discipline at the IR boundary. The query algorithms and slot substitution are well-structured. However, the review surfaces two BLOCKER-class defects that will produce wrong results in normal usage:

1. The committed snapshot fixtures contain machine-absolute Windows paths (`E:/ui-to-hierarch/...`), which guarantees `toMatchFileSnapshot` failure for any contributor not running on `E:\ui-to-hierarch`, on any CI runner, and on Linux/macOS.
2. The `/login` parallel-slot test relies on `@modal/login/page.tsx` matching `/login`, but Next.js semantics treat `@modal/login` as a slot of the parent route — and `app/login/page.tsx` already owns `/login`. Whichever wins, the snapshot encodes a tree where ModalLogin and LoginPage are merged under the same route, which conflates parallel-slot resolution semantics. This is a BLOCKER for the feature spec, not just a test concern.

In addition there are real bugs in `injectChildrenSlots` (line-based heuristic that misplaces slots when JSX spans multiple lines or when nested elements share lines), a fragment-flattening behavior in `buildTreeForEntry` that loses fragment line info, an early-exit bug in the Levenshtein loop that can hide better candidates, and several handler/test quality issues.

## Critical Issues

### CR-01: Snapshot files contain absolute machine-specific paths — tests will fail on every other machine

**Files:**
- `test/core/__snapshots__/analyzer-dashboard-settings.md:1-12`
- `test/core/__snapshots__/analyzer-feed-with-modal.md:1-11`

**Issue:** Both committed snapshots embed the reviewer's drive-letter absolute path:

```
<RootLayout> @ E:/ui-to-hierarch/test/fixtures/phase-05/kitchen-sink/app/layout.tsx:1
```

The fixture root is computed via `path.resolve("test/fixtures/phase-05/kitchen-sink")` in `analyzer.test.ts:40`, producing an absolute path. `buildEnvelope` is called with `resolvedRootOverride: KS` (an absolute path), but the IR `file` fields are also absolute, and the markdown renderer is evidently not rebasing them against `resolvedRoot`. Any other contributor or CI runner will get `/home/runner/work/...` or `C:/Users/.../` and the snapshot diff will be 100% mismatch.

This means: (a) the test suite is not portable, (b) `toMatchFileSnapshot` will always fail outside this developer machine, (c) the snapshot is effectively useless as a regression artifact.

**Fix:** Either (1) make the markdown renderer rebase `file` paths to be relative to `resolvedRoot` before emitting (preferred — aligns with D-07 spirit), or (2) post-process the snapshot in the test by stripping `KS + "/"` from the markdown before calling `toMatchFileSnapshot`. Option 2 example:

```ts
const markdown = renderMarkdown(tree, envelope)
  .replaceAll(toForwardSlash(KS) + "/", "");
await expect(markdown).toMatchFileSnapshot("./__snapshots__/analyzer-dashboard-settings.md");
```

Then re-record the snapshots.

### CR-02: `/login` parallel-slot test conflates two distinct routes — wrong semantics encoded in snapshot

**Files:**
- `test/core/analyzer.test.ts:146-168`
- `test/core/__snapshots__/analyzer-feed-with-modal.md:4-11`
- `src/core/Analyzer.ts:566-607` (`buildRouteTree`)

**Issue:** The test resolves route `/login` and asserts a `kind:"slot", name:"modal"` exists in the result. The snapshot at `analyzer-feed-with-modal.md:4-11` shows BOTH `<LoginPage>` (from `app/login/page.tsx`) AND `<ModalLogin>` (from `app/@modal/login/page.tsx`) appearing as siblings under the body — the modal slot tree is "Login + ModalLogin merged."

But that is not Next.js parallel-route semantics. `@modal` is a parallel slot owned by the same segment that contains it: `app/@modal/login/page.tsx` is the modal slot view for the URL `/login`, and `app/login/page.tsx` is the primary view for `/login`. The expected IR shape is `RootLayout → { children: LoginPage, modal: ModalLogin }`, where `modal` is a slot with the ModalLogin tree as its content — not a sibling fragment.

Looking at `attachParallelSlot` in `Analyzer.ts:232-254`:

```ts
return {
  ...tree,
  children: [
    ...tree.children,
    slotMarker,    // kind:"slot", name:"modal"
    slotTree,      // kind:"component", name:"ModalLogin", ...
  ],
};
```

The slot marker and the slot content are appended as **two unrelated siblings** of `RootLayout`'s primary child. Consumers walking the IR cannot tell that `slotTree` belongs to `slotMarker`. This:

1. Breaks consumer contracts — there is no parent/child relationship between the slot marker and its content; downstream code cannot answer "what tree fills this slot?"
2. Pollutes the children array of any layout that has parallel slots; if there are multiple slots, all marker+content pairs are flattened into one ordered list with no way to know which content corresponds to which marker (only positional adjacency, which is fragile and undocumented).
3. Allows duplication: when the user requests `/login` (which has its own `app/login/page.tsx`), that page is rendered as the primary `children` slot AND the `@modal/login/page.tsx` is rendered alongside as `modal` content, but the latter is recursively built via `buildRouteTree` of an entirely separate slot route — so the ModalLogin tree is wrapped in a fresh `RootLayout` chain (because slot entries from `mapRouteToEntry` carry their own layout entries). The snapshot at line 9 confirms `<ModalLogin>` appears at the top level, suggesting only the first layout was kept, but the precise contract is not asserted.

The comment at the top of the test explicitly notes this is a "deviation" from the plan, but a deviation that produces the wrong IR shape is a defect, not a documentation issue.

**Fix:** Two parts.

1. Change `attachParallelSlot` so the slot marker carries the slot content, e.g. introduce a `kind:"slot"` node with a `content` field (requires schema change) or wrap the content in a way that ties it back to the marker:

```ts
// schema: kind:"slot" gains optional `content?: TreeNode`
return {
  ...tree,
  children: [...tree.children, { ...slotMarker, content: slotTree }],
};
```

2. When recursing into `buildRouteTree` for a slot, do NOT include the slot route's own layout chain — strip the layouts that are also present in the parent route's `entries`, so the slot content is the page subtree only. Compare `slotEntries` against `rm.entries` and only build the subtree below the shared layout depth.

3. Re-do the snapshot using a route that genuinely has a parallel slot and no competing primary page (e.g. `/feed` with a separate `@modal` slot defined for that segment), or at minimum add a regression test that asserts `slotMarker.content === slotTree` once the schema is fixed.

## Warnings

### WR-01: `injectChildrenSlots` line-based heuristic misplaces or duplicates slots

**File:** `src/core/Analyzer.ts:300-368`

**Issue:** The "inject `{children}` at the right place" logic uses raw line numbers from the AST and tries to decide insertion via `sl >= tree.line` (Case A) or `sl > lastChildLine` (Case B). This breaks in several realistic shapes:

1. **Multi-line opening tags.** `<div\n  className="x"\n>` — `tree.line` points to the `<` line, the body is several lines later. If a sibling inside this `<div>` lives at line `tree.line` (impossible only because the `<div>` opens on its own line), the comparison `sl >= tree.line` is satisfied for ANY descendant slot line, so the algorithm injects a `children` slot into the FIRST empty descendant rather than the actual layout root. There is no nesting check.

2. **Multiple empty siblings.** If a layout file contains `<div><span/><span/>{children}</div>` and the inner `<span/>`s are empty elements, Case A injects the slot into the FIRST empty span it visits (depth-first), not into the parent `<div>` after the existing children.

3. **Fragments in layouts.** `injectChildrenSlots` only handles `component`, `element`, `fragment`, `branch`, `list`. If the body tree is a `kind:"jsx"`-derived element nested inside a `kind:"branch"`, the slot lines may live on the conditional path; injection skips them silently.

4. **Multiple `{children}` are not handled.** The slotLines `Set<number>` is iterated per element with `for (const sl of slotLines)`, but `slotLines` is shared across the whole recursive walk. After Case A injects ONE slot for the first slotLine, subsequent recursion will use the same set and inject the same slotLine again into another element. Slots are not removed from the set after use.

The root cause is using line numbers as proxies for AST identity. The render-flow walker dropped the `{children}` JSXExpressionContainer, but the right fix is upstream: emit a synthetic `kind:"slot", name:"children"` from the walker when it sees `{children}` instead of post-processing.

**Fix:** Best fix — patch the render-flow walker (in the adapter / `extractComponents` pipeline) to translate `JSXExpressionContainer { expression: Identifier("children") }` directly into a `RenderNode { kind:"slot", name:"children" }` so it lands in the right tree position by construction. As a stopgap, change `collectChildrenSlotLines` to return `Array<{line, column, parentLine}>` and match against (line, column) pairs while consuming each entry as it is injected.

### WR-02: `buildTreeForEntry` flattens fragment body and loses original component line for synthetic wrapper

**File:** `src/core/Analyzer.ts:545-554`

**Issue:**

```ts
children: bodyTree.kind === "fragment" ? bodyTree.children : [bodyTree],
```

When the component returns a JSX fragment (`<>...</>`), the wrapper `kind:"component"` keeps `bodyTree.children` but discards the original fragment node — including its `file` and `line` fields. This is observable in the kitchen-sink fixture for `SubmitButton.tsx` which returns `<>...</>`. Tooling consuming the IR can no longer tell that the component returned a fragment vs. multiple top-level elements, which matters for re-rendering / round-trip use cases.

Symmetrically, when `bodyTree.kind !== "fragment"` it wraps in `[bodyTree]` and the `component` node uses `def.line` (component definition site), not the JSX root line. That's fine for the wrapper but combined with the fragment-flatten case the behavior is inconsistent.

**Fix:** Preserve the fragment wrapper:

```ts
children: [bodyTree],
```

…and let consumers walk through the fragment node naturally. If flattening is desired for rendering, do it in the renderer, not in the IR.

### WR-03: Levenshtein early-exit hides better candidates

**File:** `src/core/Analyzer.ts:771-781`

**Issue:**

```ts
for (const { value, file, line } of allTextNodes) {
  const dist = levenshtein(queryLower, value.toLowerCase());
  if (dist <= 2) {
    candidates.push({ dist, value, file, line });
    if (candidates.length >= 5) break; // early exit (D-03)
  }
}
candidates.sort((a, b) => a.dist - b.dist);
```

The break stops iteration after 5 candidates of any distance ≤2, then sorts. If the first 5 hits are all distance 2 and a distance-1 hit exists at position 6, it is silently dropped, and the user gets worse "did you mean" suggestions than they could have. The comment claims "early exit (D-03)" but D-03 says the algorithm bound is on candidate count, not the order of discovery.

**Fix:** Collect all ≤2-distance candidates, sort, then slice:

```ts
for (const { value, file, line } of allTextNodes) {
  const dist = levenshtein(queryLower, value.toLowerCase());
  if (dist <= 2) candidates.push({ dist, value, file, line });
}
candidates.sort((a, b) => a.dist - b.dist);
const top = candidates.slice(0, 5);
```

If iteration cost is a concern, sort by length-difference cheap pre-filter first; do not truncate by encounter order.

### WR-04: Each MCP tool handler instantiates a fresh Analyzer + adapter per call — wasted work, but more importantly, no warning aggregation across tools

**Files:**
- `src/mcp/tools/get-full-hierarchy.ts:35-47`
- `src/mcp/tools/focus-on.ts:32-41`
- `src/mcp/tools/find-by-text.ts:27-36`
- `src/mcp/tools/find-by-style.ts:27-36`

**Issue:** Each handler constructs `new Analyzer({ root, adapter: NextJsAdapter })`. ARCH-02 requires per-call isolation — that is fine. But the `warnings` returned by `analyzer.findByStyle({...})` are spread into the envelope manually:

```ts
const envelope = { ...buildEnvelope(tree, { resolvedRootOverride: root }), warnings };
```

This relies on `buildEnvelope` not setting a `warnings` field of its own, OR on the spread order overwriting it. If `buildEnvelope` ever starts emitting its own warnings (e.g. for path resolution issues), this code silently overrides them. There is no test that confirms `buildEnvelope`'s own warnings are preserved.

**Fix:** Merge instead of overwriting:

```ts
const base = buildEnvelope(tree, { resolvedRootOverride: root });
const envelope = { ...base, warnings: [...(base.warnings ?? []), ...warnings] };
```

### WR-05: `getFullHierarchy` warning duplication when route is unmatched twice

**File:** `src/core/Analyzer.ts:668-684`

**Issue:**

```ts
const warns = [...this.ctx.warnings];
if (!warns.some((w) => w.includes("route not matched"))) {
  warns.push(`route not matched: ${args.route}`);
}
```

The `includes("route not matched")` substring check is too loose. If a previous adapter call produced a warning string that happens to contain the substring "route not matched" (e.g. from `getOrBuildRouteTree`'s `route resolution error for /foo: ...`), this branch will skip emitting the actual route-mismatch warning, hiding the failure for the current call.

Also `getOrBuildRouteTree` does NOT push a "route not matched" warning when `rm.matched === false`; only the `getFullHierarchy` wrapper does. So on a clean `Analyzer`, the first call gets a warning; if the same Analyzer were reused (it is not, but the code does not preclude it), the substring-based de-dup is ambiguous.

**Fix:** Match exactly on the route:

```ts
const expected = `route not matched: ${args.route}`;
if (!warns.includes(expected)) warns.push(expected);
```

### WR-06: `routeTreeCache` only stores `matched=true` results — repeated unmatched calls re-run discovery

**File:** `src/core/Analyzer.ts:612-632`

**Issue:** When `rm.matched === false`, the function returns `{ tree: emptyFragment, matched: false }` without caching. If `buildUnionIR` (used by focusOn / findByText / findByStyle) accidentally calls `getOrBuildRouteTree` for a non-existent route during one Analyzer's lifetime, it re-runs `mapRouteToEntry` each time. This is a perf concern — but since perf is out of v1 scope, it is filed as a quality issue: the cache contract is asymmetric and surprising.

**Fix:** Cache the negative result too:

```ts
private readonly routeTreeCache = new Map<string, { tree: TreeNode; matched: boolean }>();
```

### WR-07: `replaceSlot` only replaces the FIRST `kind:"slot"` it finds — silent behavior when a layout has multiple `{children}` references

**File:** `src/core/Analyzer.ts:200-223`

**Issue:** The doc comment at line 197-199 explicitly says "FIRST `kind:"slot"` with name === slotName … if no slot found, returns original tree unchanged (D-10 silent skip)." A layout that references `{children}` more than once (e.g. for split-pane layouts or accessibility) will end up with one slot replaced and the other left as a dangling `kind:"slot"` node. There is no warning emitted.

**Fix:** Two options. (1) Document the constraint explicitly and emit a `ctx.warnings` push when a layout contains multiple children-slot references. (2) Replace ALL slots; this is a clearer fit for layouts because the children prop is a single value and ALL `{children}` references should be replaced by the same subtree. Recommend option 2 — the current first-only behavior does not match Next.js / React semantics where `{children}` is a single binding.

## Info

### IN-01: `attachParallelSlot` has dead branch and silent failure for non-component roots

**File:** `src/core/Analyzer.ts:241-253`

**Issue:** "If tree is not a component at top level, return unchanged" silently drops the slot. This can happen if `buildTreeForEntry` returns a `kind:"error"` (parse failure on root layout) or an empty `buildFragmentRoot([])` (no page). The slot is silently ignored — no warning. Add a `ctx.warnings.push(...)` at line 253 to surface the case.

### IN-02: `parse-error` fixture is missing a `layout.tsx` referenced by tests

**File:** `test/fixtures/phase-05/micro/parse-error/app/layout.tsx`

**Issue:** Listed in the file-review scope and referenced by the test suite, but I could only verify `app/page.tsx` exists. If the file is absent, the adapter's `discoverEntries` may behave unpredictably for route `/`. Verify the fixture is complete; if the layout.tsx exists with `parse error` content, ensure the test asserts the page-error warning specifically rather than any error.

### IN-03: `next.config.js` is empty CJS — fine for Node, but `kitchen-sink` `tsconfig.json` does not declare `"type": "module"` parent or `"include"` field

**Files:**
- `test/fixtures/phase-05/kitchen-sink/tsconfig.json`
- `test/fixtures/phase-05/kitchen-sink/next.config.js`

**Issue:** `tsconfig.json` lacks `"include"` / `"exclude"`, so the adapter's `get-tsconfig` invocation may resolve broader-than-expected file sets. Also `jsx: "preserve"` is fine for Babel but if any consumer of the fixture's tsconfig swaps to TypeScript's parser, JSX won't be transformed. Low impact for v1.

### IN-04: Test snapshot file paths use `.md` extension but contain non-markdown ASCII tree characters

**Files:**
- `test/core/__snapshots__/analyzer-dashboard-settings.md`
- `test/core/__snapshots__/analyzer-feed-with-modal.md`

**Issue:** Files use `.md` extension but contents are not Markdown — they are tree-glyph fixtures that GitHub will try to render as Markdown (resulting in mangled display). Consider `.txt` or `.tree` extension. Cosmetic only.

---

_Reviewed: 2026-05-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
