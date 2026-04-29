---
phase: 04-next-js-app-router-adapter
reviewed: 2026-04-29T09:16:09Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - src/adapters/FrameworkAdapter.ts
  - src/adapters/next/NextJsAdapter.ts
  - src/adapters/next/detect.ts
  - src/adapters/next/discover.ts
  - src/adapters/next/route-map.ts
  - src/adapters/next/segments.ts
  - src/adapters/types.ts
  - test/adapters/next/NextJsAdapter.test.ts
  - test/adapters/next/detect.test.ts
  - test/adapters/next/discover.test.ts
  - test/adapters/next/route-map.test.ts
  - test/adapters/next/runtime.test.ts
  - test/adapters/types.test.ts
  - tsconfig.json
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-04-29T09:16:09Z
**Depth:** standard
**Files Reviewed:** 14 (source + tests; fixture files inspected as test inputs only)
**Status:** issues_found

## Summary

Phase 04 ships the Next.js App Router adapter (`detect`, `discoverEntries`,
`mapRouteToEntry`) plus the NEXT-04 runtime boundary plumbing in
`extractComponents`. The code is well-organized, defensively coded
(D-12 no-throw is consistently honored), and has strong test coverage
including dynamic segments, groups, parallel slots, and malformed input.

No security issues or critical bugs. Three warnings concern logic edges:
the intercepting-route alias is unreachable as written (the documented v1
behavior is not actually achieved), the optional-catch-all "parent-path"
branch silently drops surrounding group layouts, and `extractProps` drops
all props when the parameter is an `AssignmentPattern` wrapping a plain
`Identifier` (e.g., `function C(props: Props = {})`). Info-level items
cover redundant slot-merge logic, defensive AST-walk concerns, and a
testing-coverage gap that masks the intercepting-route bug.

## Warnings

### WR-01: Intercepting-route alias is unreachable; the documented v1 behavior is not exercised

**File:** `src/adapters/next/route-map.ts:120-128, 273-324`
**Issue:** `buildTree` registers an intercepting folder (e.g., `(.)photo`)
under both its raw folder name AND `seg.targetSegment` ("photo"), pointing
the alias key at the SAME `SegmentNode` whose `segment.kind` is still
`"intercepting"`. Inside `walk`, every iteration over `cand.children`
short-circuits when `seg.kind === "intercepting"` (line 317-323: `continue`).
Because the alias child shares that kind, the URL token "photo" never
matches the intercepting subtree — the file-header invariant ("URL that
matches the stripped target may resolve to either the regular target
subtree OR the intercepting subtree — whichever was registered first wins")
is never observed in practice. The test that nominally covers this
(`route-map.test.ts:129-132` "intercepting (.)photo is parsed") only
asserts `m.matched === true` for `/photo/123`, which is satisfied by the
regular `app/photo/[id]/page.tsx` fixture — so the bug is invisible.
**Fix:** Either (a) when registering the alias, store a CLONE whose
`segment` reflects the alias as a `static`/`dynamic` of the target name
so the walker matches it, or (b) remove the `continue` for intercepting
when traversing via the alias key (e.g., track which key the iteration
saw and re-classify the target). Concrete sketch:
```ts
// in buildTree, when registering the alias:
if (seg.kind === "intercepting") {
  if (!node.children.has(seg.targetSegment)) {
    // Clone the node with a synthetic segment so walk() treats it as
    // a regular static-named child for matching purposes.
    const aliasNode: SegmentNode = {
      ...child,
      segment: { kind: "static", name: seg.targetSegment },
    };
    node.children.set(seg.targetSegment, aliasNode);
  }
}
```
Add a fixture-only test (e.g., move the regular `app/photo/[id]/page.tsx`
out and assert `/photo/123` still matches via `(.)photo` alone) to lock
the behavior.

### WR-02: `extractProps` drops props when parameter is `AssignmentPattern` wrapping an Identifier

**File:** `src/adapters/next/NextJsAdapter.ts:219-265`
**Issue:** When a function declares `function Card(props: Props = {})`, the
first parameter is an `AssignmentPattern` whose `left` is an `Identifier`
(not an `ObjectPattern`). The current branches handle:
1. `isIdentifier(param)` — yes for plain `props: Props`
2. `isObjectPattern(param)` — yes for `{ a }: Props`
3. `isAssignmentPattern + isObjectPattern(left)` — yes for `{ a } = {} : Props`

…but there is no branch for `AssignmentPattern + Identifier(left)`. That
falls through to `objPat = null` and returns `[]`, silently losing the
single positional prop. The same gap exists in `readTypeSlice`.
**Fix:** Add a fall-through for the identifier-with-default case:
```ts
// After the plain-identifier branch:
if (
  t.isAssignmentPattern(param) &&
  t.isIdentifier(param.left)
) {
  const id = param.left;
  return [{ name: id.name, typeSlice, optional: true }];
}
```
And in `readTypeSlice`, mirror the case so the type annotation hanging off
`param.left` is captured.

### WR-03: Terminal optional-catch-all branch drops surrounding group layouts

**File:** `src/adapters/next/route-map.ts:253-265`
**Issue:** In the terminal-no-token branch, when looking for a
parent-path optional-catch-all match, the code iterates
`expandGroupsAndChildren(node)` (which is a flat list with no `pre`
accumulation) and calls `harvestSpecials(child, branchEntries)` —
`branchEntries` is `[...entries]` (the current node's already-harvested
specials). If the optional-catch-all is reached only by traversing one or
more transparent group children, those group nodes' `layout`/`template`/
etc. are NOT included in the returned entries, even though Next.js would
render them. The non-terminal branch correctly threads `pre` from
`expandGroups`; the terminal branch silently diverges.
**Fix:** Replace `expandGroupsAndChildren(node)` with the same
`expandGroups(node, [])` flow used elsewhere, then iterate
`cand.children` and apply `pre` to `branchEntries`:
```ts
for (const { node: cand, pre } of expandGroups(node, [])) {
  for (const [, child] of cand.children) {
    if (
      child.segment.kind === "optional-catch-all" &&
      child.files.page
    ) {
      const branchEntries = [...entries, ...pre];
      params[child.segment.param] = [];
      harvestSpecials(child, branchEntries);
      branchEntries.push(child.files.page);
      return { ok: true, entries: branchEntries, params, slots };
    }
  }
}
```

## Info

### IN-01: Redundant slot-merge loop in `matchRoute`

**File:** `src/adapters/next/route-map.ts:406-414`
**Issue:** `mergedSlots` is built as `{ ...rootSlots, ...r.slots }`, which
already prefers `r.slots` keys over `rootSlots`. The subsequent loop
`for (const [k, v] of Object.entries(rootSlots))` then overwrites only
when `k in r.slots` with `r.slots[k]` — exactly what the spread already
did. The loop is a no-op.
**Fix:** Delete lines 407-414 and just return `mergedSlots = { ...rootSlots, ...r.slots }`.

### IN-02: `walkAst` could traverse Babel `tokens`/`comments` arrays if present on the input subtree

**File:** `src/adapters/next/NextJsAdapter.ts:174-199`
**Issue:** `SKIP_KEYS` excludes positional metadata and comment arrays, but
not `tokens`. If `parseFile` is ever configured with `tokens: true` (or
the harvested subtree happens to be a `File`/`Program`), the walker will
treat each Token object as a node (Tokens have a `.type` string and pass
`isAstNode`), inflating work and possibly misclassifying. Currently the
parser does not emit tokens, so this is latent.
**Fix:** Add `"tokens"` to `SKIP_KEYS`, or tighten `isAstNode` to assert
the type string is one of the known Babel node-type prefixes.

### IN-03: Test for intercepting route does not verify the intercept path

**File:** `test/adapters/next/route-map.test.ts:129-132`
**Issue:** The test resolves `/photo/123` against a fixture that has
both `app/photo/[id]/page.tsx` (regular) and `app/feed/(.)photo/[id]/page.tsx`
(intercepting). The assertion `m.matched === true` is satisfied by the
regular page, so the test passes even when the intercept code path is
broken (see WR-01). Strengthen by asserting which file appears in `entries`
and adding a fixture without the regular sibling.
**Fix:** After fixing WR-01, add:
```ts
expect(m.entries.some((p) => /\/feed\/\(\.\)photo\/\[id\]\/page\.tsx$/.test(p))).toBe(true);
```
or scope it under a dedicated fixture lacking `app/photo/[id]/page.tsx`.

### IN-04: `detect.ts` could parallelize four `fs.access` probes

**File:** `src/adapters/next/detect.ts:23-30`
**Issue:** Four config-name checks run sequentially in a loop. With cold
disk this can be 4x slower than `Promise.all` over the same set. Not a
correctness issue and per-call latency is negligible (microseconds for
hot FS), but trivially improvable. Performance is out of v1 scope; flagged
only as a low-effort cleanup.
**Fix:**
```ts
const hits = await Promise.all(
  NEXT_CONFIGS.map((n) => exists(join(absRoot, n)))
);
if (!hits.some(Boolean)) return false;
```

---

_Reviewed: 2026-04-29T09:16:09Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
