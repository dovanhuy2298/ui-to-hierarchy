---
phase: 04-next-js-app-router-adapter
fixed_at: 2026-04-29T09:30:00Z
review_path: .planning/phases/04-next-js-app-router-adapter/04-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-04-29T09:30:00Z
**Source review:** .planning/phases/04-next-js-app-router-adapter/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (Critical + Warning)
- Fixed: 3
- Skipped: 0

Info-severity findings (IN-01..IN-04) were intentionally out of scope for
this iteration (`fix_scope: critical_warning`) and remain unaddressed.

## Fixed Issues

### WR-01: Intercepting-route alias is unreachable

**Files modified:** `src/adapters/next/route-map.ts`
**Commit:** 66985f7
**Applied fix:** When `buildTree` registers the alias for an intercepting
folder under `seg.targetSegment`, it now stores a clone of the child node
whose `segment` is rewritten to a synthetic `{ kind: "static", name: targetSegment }`.
The original `walk()` short-circuits intercepting-kind segments via
`continue`, so the alias was never reachable; with the synthetic static
segment the URL walker now matches it as a regular named child while the
original raw-folder entry is still skipped (avoiding double-match).
The clone shares the underlying `children` / `files` / `parallelSiblings`
maps via spread so subsequent file registration on `child` propagates to
the alias automatically. Verified with `npx tsc --noEmit` (clean) and
`vitest run test/adapters/next/route-map.test.ts` (34 pass).

### WR-02: `extractProps` drops props for `AssignmentPattern` wrapping `Identifier`

**Files modified:** `src/adapters/next/NextJsAdapter.ts`
**Commit:** 031241a
**Applied fix:** Added a fall-through branch in `extractProps` immediately
after the plain-identifier check that handles `function C(props: Props = {})`:
the parameter is `AssignmentPattern` whose `left` is `Identifier`. Returns
a single positional prop entry with `optional: true` (default value implies
optional). Mirrored the case in `readTypeSlice` so the type annotation
hanging off `param.left` is captured. Verified with `npx tsc --noEmit`
(clean) and full adapter suite (69 pass).

### WR-03: Terminal optional-catch-all branch drops surrounding group layouts

**Files modified:** `src/adapters/next/route-map.ts`
**Commit:** 23c49d1
**Applied fix:** Replaced the flat `expandGroupsAndChildren(node)` iteration
in the terminal `urlSegments.length === 0` branch with the same
`expandGroups(node, [])` pattern used in the non-terminal branch. The
fix iterates `cand.children` and prepends `pre` (group-collapsed layout
entries) to `branchEntries` so transparent group layouts on the path to
the optional-catch-all child are included in the returned entries.
Verified with `npx tsc --noEmit` (clean) and full adapter suite (69 pass).

---

_Fixed: 2026-04-29T09:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
