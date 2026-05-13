---
phase: 10-interface-widening-analyzer-de-next-ification
reviewed: 2026-05-13T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/adapters/FrameworkAdapter.ts
  - src/adapters/next/NextJsAdapter.ts
  - src/core/Analyzer.ts
  - test/adapters/FrameworkAdapter.test.ts
  - test/adapters/NextJsAdapter.test.ts
findings:
  critical: 2
  warning: 4
  info: 1
  total: 7
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-05-13T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Reviewed the Phase 10 implementation: the `FrameworkAdapter` interface widening to 8 methods, the `NextJsAdapter` concrete implementation, and `Analyzer` de-Next-ification. The interface shape itself is clean and the `NextJsAdapter` method implementations are generally correct. Two blockers were found: (1) `collectChildrenSlotLines` in `Analyzer` passes an empty string as `importSource` to `adapter.slotMarker`, making slot detection silently broken for any non-Next.js adapter that relies on import source (e.g. Expo Router's `Slot`); (2) the `enumerateRoutes` test in `NextJsAdapter.test.ts` uses an `expo-basic` fixture whose entry convention (`app/index.tsx`) does not match the Next.js file-naming convention the adapter looks for (`page.tsx`), making the test vacuous. Four warnings cover: a fragile `classifyEntry` regex order, `nodeWithChildren` silently dropping children for non-container ancestor kinds in `focusOn`, a `sliceSource` fallback that produces garbage type-slice output instead of an empty string, and an unexercised assertion in the `enumerateRoutes` test.

---

## Critical Issues

### CR-01: `adapter.slotMarker` always called with empty `importSource` — Expo Router slot detection permanently broken

**File:** `src/core/Analyzer.ts:1159`

**Issue:** `collectChildrenSlotLines` calls `adapter.slotMarker(expr.name, "")` with a hardcoded empty string as the `importSource` argument. The `FrameworkAdapter` contract (and the JSDoc on line 55 of `FrameworkAdapter.ts`) explicitly states that non-Next.js adapters like Expo Router must check `importSource === "expo-router"` to identify `<Slot>` injection points. Because `importSource` is always `""`, any adapter whose `slotMarker` implementation tests the source will never match, and `{children}` / `<Slot>` slot lines are silently not collected. For Expo Router this means the entire slot-injection path produces no slots regardless of the source file's content.

The fix requires the AST traversal to determine the actual import source for each identifier used in a `JSXExpressionContainer`. The `collectImportBindings` helper already exists in the same file and produces exactly this map.

**Fix:**

```typescript
// In collectChildrenSlotLines, use the import-binding map to supply the
// correct importSource to adapter.slotMarker.
private collectChildrenSlotLines(ast: t.File): Set<number> {
  const lines = new Set<number>();
  const adapter = this.adapter;
  // Resolve import sources for identifiers used in JSX expression containers.
  const bindings = collectImportBindings(ast);
  traverse(ast, {
    JSXExpressionContainer(path: { node: t.JSXExpressionContainer }) {
      const expr = path.node.expression;
      if (t.isIdentifier(expr)) {
        const binding = bindings.get(expr.name);
        const importSource = binding?.source ?? "";
        if (adapter.slotMarker(expr.name, importSource)) {
          const line = path.node.loc?.start.line ?? 0;
          lines.add(line);
        }
      }
    },
  });
  return lines;
}
```

---

### CR-02: `enumerateRoutes` test uses wrong fixture — test is vacuous for Next.js adapter

**File:** `test/adapters/NextJsAdapter.test.ts:61-73`

**Issue:** The test at line 57–73 asserts `NextJsAdapter.enumerateRoutes` behavior using the `test/fixtures/expo-basic` fixture. The fixture is described in the test's own comment as containing `app/index.tsx`. However, `NextJsAdapter.enumerateRoutes` (line 90 of `NextJsAdapter.ts`) only recognises files matching `/^page\.(tsx|jsx|ts|js)$/`. An `app/index.tsx` file does not match this pattern, so `enumerateRoutes` returns `[]` for this fixture. The test then passes because:
- `Array.isArray([])` is `true`
- `[...[]].sort()` equals `[]`
- `[].every(r => !r.includes("@"))` is vacuously `true`
- `[].every(r => !r.startsWith("/_"))` is vacuously `true`

The test never exercises the actual route-enumeration logic. It provides zero coverage for the cases it is supposed to guard (parallel-route exclusion, private-folder exclusion).

**Fix:** Replace the `expo-basic` fixture with a Next.js App Router fixture that contains proper `page.tsx` files, including at least one route that would be excluded by the `@` and `_` filters:

```typescript
// Use a Next.js fixture, not an Expo Router fixture
const root = path.join(process.cwd(), "test/fixtures/next-basic");
const routes = await NextJsAdapter.enumerateRoutes(root);

// Now assert at least one concrete route so the test is non-vacuous
expect(routes).toContain("/");
```

If only the `expo-basic` fixture is available and the test is intentionally checking "no crash + empty result", the test description must be changed to reflect that intent, and a proper Next.js fixture test must be added.

---

## Warnings

### WR-01: `nodeWithChildren` silently drops descendant for `branch`/`list` ancestor kinds in `focusOn`

**File:** `src/core/Analyzer.ts:1191-1198`

**Issue:** `nodeWithChildren` returns the original `node` unchanged for its `default` case (any kind that is not `component`, `element`, or `fragment`). This means `buildAncestorChain` and `buildAncestorChainWithLeaf` (called by `focusOn`) silently drop the `children` argument when an ancestor node in the tree is a `kind:"branch"` or `kind:"list"`. Concretely: if a component named `Button` is rendered inside the `thenBranch` of a conditional, the `focusOn("Button", "up")` result's ancestor chain would stop at the branch node without nesting the (empty) placeholder child inside it — the ancestry chain is silently truncated at that point.

**Fix:**

```typescript
function nodeWithChildren(node: TreeNode, children: TreeNode[]): TreeNode {
  switch (node.kind) {
    case "component": return { ...node, children };
    case "element":   return { ...node, children };
    case "fragment":  return { ...node, children };
    case "branch":
      // Preserve the branch structure; nest the descendant chain in thenBranch.
      return { ...node, thenBranch: children[0] ?? null, elseBranch: null };
    case "list":
      return children[0] ? { ...node, item: children[0] } : node;
    default:
      return node;
  }
}
```

---

### WR-02: `classifyEntry` has overlapping `if` chains — `layout` classified correctly only by accident

**File:** `src/adapters/next/NextJsAdapter.ts:64-69`

**Issue:** The three `if` statements on lines 66–68 are independent (not `if / else if`). All three are checked even after an earlier one has already triggered a `return`. While early-return semantics make this functionally correct today, the `special` regex on line 68 also matches `layout.*` files. If the `layout` check on line 67 is ever removed or re-ordered, `layout.tsx` silently becomes `"special"`. The existing regression test (test line 26–29) guards against the current behavior but not against future refactors. The test file itself (line 6) annotates this as "Pitfall 1".

**Fix:** Convert to `else if` to make the mutual-exclusivity explicit and eliminate the dependency on order:

```typescript
classifyEntry(absPath: string): "page" | "layout" | "special" | "other" {
  const base = toForwardSlash(absPath).split("/").pop() ?? "";
  if (/^page\.(tsx|jsx|ts|js)$/.test(base)) return "page";
  else if (/^layout\.(tsx|jsx|ts|js)$/.test(base)) return "layout";
  else if (/^(template|loading|error|not-found|default)\.(tsx|jsx|ts|js)$/.test(base)) return "special";
  return "other";
},
```

Note: the `special` regex has also been corrected here to remove `layout` from it, which eliminates the underlying overlap.

---

### WR-03: `sliceSource` defaults `start` to `0` — produces source prefix garbage instead of empty string

**File:** `src/adapters/next/NextJsAdapter.ts:388-392`

**Issue:** When `node.start` is `null` or `undefined`, `sliceSource` falls back to `0` (line 389). `source.slice(0, 0)` returns `""`, which is fine. But when `node.end` is also `null`/`undefined`, `end` defaults to `start` (which is `0`), so `source.slice(0, 0)` returns `""` — coincidentally correct. However, if `node.start` is defined but `node.end` is not, `end` defaults to `start`, producing a zero-length slice instead of the actual type annotation text. More critically, if `node.start` is `null` but `node.end` has a real value (e.g., `50`), then `source.slice(0, 50)` returns the first 50 characters of the source file — clearly wrong content for a type annotation.

This case is theoretically possible: Babel occasionally omits `start` on synthesized nodes or range-stripped ASTs.

**Fix:**

```typescript
function sliceSource(source: string, node: t.Node): string {
  if (node.start == null || node.end == null) return "";
  return source.slice(node.start, node.end);
}
```

---

## Info

### IN-01: `collectChildrenSlotLines` comment says "Pitfall 3 — this context" but the captured variable is never used with `this`

**File:** `src/core/Analyzer.ts:1155`

**Issue:** The comment `// capture before traverse (Pitfall 3 — this context)` refers to capturing `this.adapter` into a local `adapter` variable before entering the `traverse` callback. This is a valid guard against losing the `this` binding inside the callback. However, the comment only links to an internal "Pitfall 3" reference with no further documentation. Future maintainers who unfamiliar with the pitfall catalogue may remove the capture thinking it is unnecessary indirection.

**Fix:** Expand the comment to be self-explanatory:

```typescript
// `this` is not available inside @babel/traverse visitor callbacks (the
// traverse function calls visitors without binding them to the outer class
// instance). Capture adapter in a local variable before entering traverse.
const adapter = this.adapter;
```

---

_Reviewed: 2026-05-13T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
