---
phase: 08-v1-0-polish
reviewed: 2026-05-12T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/adapters/types.ts
  - src/core/parser/index.ts
  - src/renderers/markdown.ts
  - test/core/parser/parseFile.test.ts
  - test/fixtures/parser/parse-errors/decl-lines.tsx
  - test/renderers/markdown.test.ts
findings:
  critical: 0
  blocker: 0
  warning: 4
  info: 5
  total: 9
status: warnings_fixed
fixes:
  WR-01:
    status: fixed
    commit: f2701d6
  WR-02:
    status: fixed
    commit: f2484d3
  WR-03:
    status: fixed
    commit: 3887f7e
  WR-04:
    status: fixed
    commit: 03fd9d7
---

# Phase 08: Code Review Report

**Reviewed:** 2026-05-12
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 08 introduces `declLines` population in `parseFile` plus a warnings prefix
in `renderMarkdown`. The implementation is small, well-scoped, and the test
coverage on the parser changes is solid. No security issues and no Critical-tier
bugs were found.

However, the review uncovered several real defects:

1. A self-contradicting test assertion (`expect(out).not.toContain("\\")`) that
   will fail the moment any real attribute value contains a backslash or quote
   — exactly the inputs the renderer's defensive escape logic was added to
   handle (WR-05).
2. A gap in `collectDeclLines` coverage: the most common production component
   pattern (`const X = forwardRef(...)` / `memo(...)`) is silently skipped,
   silently falling back to `line: 1` for a huge class of real-world
   components. This contradicts POLISH-03's stated goal of "true declaration
   line".
3. A field-count drift between the `ComponentDefinition` docstring ("12-field
   shape") and the actual interface (13 fields including `runtime`).
4. Markdown-output safety: attribute values are escaped for `"` and `\` but not
   for `<`, `>`, or newlines, so a JSX attribute containing those will produce
   malformed tree output downstream.

## Warnings

### WR-01: Test assertion forbids the exact output the renderer is documented to produce

**Status:** RESOLVED — fixed in commit `f2701d6` (assertions narrowed to a regex that only rejects stray backslashes outside documented escape positions).

**File:** `test/renderers/markdown.test.ts:16, 31`
**Issue:** Two test cases assert `expect(out).not.toContain("\\")`. But
`renderMarkdown` → `formatAttributes` (src/renderers/markdown.ts:21-24)
deliberately emits `\\` and `\"` whenever an attribute value contains a
backslash or double quote — that's the WR-05 defensive-escape behavior cited
inline in the file. The assertion is correct only for fixtures that happen to
contain no backslashes/quotes in attribute values. As soon as a fixture (or a
future kitchen-sink expansion) includes e.g. `className="foo\bar"` or
`title='He said "hi"'`, the assertion will fail even though the renderer is
behaving exactly as specified.

This is a brittle, *false-negative-prone* test that will misfire on the very
inputs the production code was hardened against.

**Fix:** Either drop the assertion, or narrow it to a property the renderer
actually guarantees, e.g.:
```ts
// Reject stray backslashes only outside the documented escape positions:
expect(out).not.toMatch(/(?<!\\)\\(?![\\"])/);
// Or simply remove it — the file snapshot already locks the output shape.
```

---

### WR-02: `collectDeclLines` misses the dominant React component pattern (`forwardRef` / `memo`)

**Status:** RESOLVED — fixed in commit `f2484d3` (`recordVariable` broadened to accept `CallExpression` and `TaggedTemplateExpression` inits; new `forwardref-component.tsx` fixture + 3 assertions added for Button/Card/Box at lines 12/16/20).

**File:** `src/core/parser/index.ts:59-68`
**Issue:** `recordVariable` only records a `VariableDeclarator` when its `init`
is `ArrowFunctionExpression` or `FunctionExpression`:
```ts
if (init.type !== "ArrowFunctionExpression" && init.type !== "FunctionExpression") continue;
```
This silently skips the most common real-world component shapes:
```tsx
export const Button = forwardRef<HTMLButtonElement, Props>((props, ref) => ...);
export const Card = memo(function Card(props) { ... });
export const Modal = styled.div`...`;
```
For each of these, `init.type` is `CallExpression` / `TaggedTemplateExpression`
— so the binding is never written into `declLines`, and per the documented
D-03 fallback the caller will resolve to `line: 1`. POLISH-03's stated purpose
is "the true declaration line" — silently degrading to line 1 for forwardRef /
memo / styled components defeats that purpose for a large fraction of the
codebases this MCP server is meant to analyze.

Note this is also not visible in the test suite: `decl-lines.tsx` does not
include a `forwardRef` / `memo` / `styled` case, so the gap is invisible to
the green bar.

**Fix:** Broaden the init check to record any `VariableDeclarator` whose init
is callable-like, then assert in tests:
```ts
const init = decl.init;
if (!init) continue;
const callableLike =
  init.type === "ArrowFunctionExpression" ||
  init.type === "FunctionExpression" ||
  init.type === "CallExpression" ||           // forwardRef(...), memo(...)
  init.type === "TaggedTemplateExpression";   // styled.div`...`
if (!callableLike) continue;
const line = decl.id.loc?.start.line ?? decl.loc?.start.line;
if (line !== undefined) out.set(decl.id.name, line);
```
Add a `forwardRef-component.tsx` fixture and a test asserting the binding line
is captured (not falling back to 1).

---

### WR-03: Markdown renderer escapes only `\` and `"` — `<`, `>`, and `\n` in attribute values produce malformed tree lines

**Status:** RESOLVED — fixed in commit `3887f7e` (`formatAttributes` now also escapes `\n`→`\n`, `\r`→`\r`, `<`→`&lt;`, `>`→`&gt;` in attribute values).

**File:** `src/renderers/markdown.ts:19-25`
**Issue:** `formatAttributes` escapes backslashes and double quotes:
```ts
const escaped = a.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
```
But JSX attribute values legitimately contain other characters that break the
tree output:

- `\n` (newlines in template-literal-derived attributes) — produces a line
  break mid-tree, desynchronizing every subsequent prefix column.
- `<` / `>` — `<Foo title="3 > 2">` becomes literally `<Foo title="3 > 2">` in
  the output, which is then ambiguous when a downstream consumer (the AI
  agent itself, or a markdown viewer) tries to recover element boundaries.
- Carriage returns `\r` — same issue as `\n`.

The component label format `<Name attr="value">` is being treated as
HTML-like, and the consumer surface (`renderMarkdown` is the canonical
agent-facing rendering) deserves stronger guarantees than "escape quotes and
nothing else."

**Fix:** Either escape `\n`, `\r`, `<`, `>` as well, or hex-escape every
control char and unsafe glyph:
```ts
const escaped = a.value
  .replace(/\\/g, "\\\\")
  .replace(/"/g, '\\"')
  .replace(/\n/g, "\\n")
  .replace(/\r/g, "\\r")
  .replace(/</g, "&lt;")   // optional — only if HTML-ish viewers matter
  .replace(/>/g, "&gt;");
```

---

### WR-04: `ComponentDefinition` doc says "12-field shape" but the interface has 13 fields

**Status:** RESOLVED — fixed in commit `03fd9d7` (header comment, R8 docstring, and inline R8 reference all amended to "13-field shape (R8 amended by NEXT-04)"). `test/adapters/types.test.ts` already asserts 13 fields — no test change needed.

**File:** `src/adapters/types.ts:183, 188-202`
**Issue:** The block-comment header (line 183) and the docstring (line 188)
both describe the shape as "locked 12-field". The doc-comment field-count
check on line 201 says:
> Field count check (test/adapters/types.test.ts) asserts Object.keys(...) === 13

But the prose still says "12-field". Counting the interface members on lines
204-241: `name, file, line, kind, wrappers, props, textContent, renderFlow,
classNames, inlineStyles, cssModuleRefs, styledTemplates, runtime` = 13 fields.

The "12" was correct before NEXT-04 added `runtime` (Phase 4). This drifted
during Phase 4/8 work. R8 was originally "12 fields" — if the lock is still
considered valid as 13, the doc needs a one-line correction; if 12 was the
contract, then `runtime` is a contract violation that wasn't caught.

**Fix:** Update the docstring to say "locked 13-field shape" and update the
"R8 — locked 12-field shape" assertion comment to "R8 (amended NEXT-04) —
locked 13-field shape". Verify `test/adapters/types.test.ts` actually asserts
13 (the docstring claims it does, but worth re-confirming).

## Info

### IN-01: Text truncation can split UTF-16 surrogate pairs

**File:** `src/renderers/markdown.ts:34-37`
**Issue:** `v.length > TEXT_MAX` and `v.slice(0, TEXT_MAX)` operate on UTF-16
code units. A string containing emoji or astral-plane characters can be sliced
mid-surrogate, producing a lone-surrogate `…` ending. For text labels in a
component tree this is cosmetic, but it can produce invalid UTF-8 if the
output is later byte-encoded.
**Fix:** Use `Array.from(v).slice(0, TEXT_MAX).join("")` to operate on code
points, or accept the trade-off and document it.

---

### IN-02: `formatAttributes` parameter type doesn't match the source-of-truth shape

**File:** `src/renderers/markdown.ts:15-17`
**Issue:** The function accepts `Array<{ name: string; value: string }> |
undefined`. But the canonical `TreeNode` definition (src/ir/schema.ts:20, 29)
already types `attributes` as `Array<{ name: string; value: string }> |
undefined` via `attributes?`. Duplicating the structural type here means a
future change to `TreeNode.attributes` (e.g. adding a discriminator) silently
desyncs the renderer without a compile error.
**Fix:** Import the inferred member type:
```ts
type AttrList = NonNullable<Extract<TreeNode, {kind:"element"}>["attributes"]>;
function formatAttributes(attrs: AttrList | undefined): string { ... }
```

---

### IN-03: `layoutHint` rendering can collide with the `@ file:line` separator

**File:** `src/renderers/markdown.ts:78-82`
**Issue:** `lineFor` produces `${label}${hint} @ ${file}:${line}`. If a
`layoutHint` ever contains ` @ ` (e.g. a future hint like "@media query"),
downstream regex parsers of the markdown tree could mis-split the file/line
suffix.
**Fix:** Either escape `@` inside `layoutHint`, or use a less collision-prone
separator (e.g. ` — ` or two spaces + tab). Likely a tiny risk in
practice; documenting the constraint inline would suffice.

---

### IN-04: Test relies on undocumented content of `valid-baseline.tsx`

**File:** `test/core/parser/parseFile.test.ts:131-132`
**Issue:** The assertion `expect(r.declLines.get("Hello")).toBe(1)` couples
the parser test to the exact textual content of `valid-baseline.tsx`. If
someone later adds a leading import or comment to the fixture, this test
breaks for an unrelated reason. The inline comment ("valid-baseline.tsx
declares `export function Hello() { ... }` on line 1") helps, but a more
robust approach is asserting the line corresponds to the actual line in the
fixture.
**Fix:** Make the dependency explicit, e.g. read the fixture and assert the
returned line matches the line of the `export function Hello` text — or just
accept that this is a fixture invariant and add a comment to the fixture
itself saying "Line 1 is load-bearing for parseFile.test.ts".

---

### IN-05: `decl-lines.tsx` imports `react` solely for a type — unused at runtime

**File:** `test/fixtures/parser/parse-errors/decl-lines.tsx:3`
**Issue:** `import { type ReactNode } from "react"` is fine syntactically and
the parser doesn't care, but if any future lint or compile pass runs over the
fixtures directory, this requires `react` in `devDependencies`. Confirm
fixtures are excluded from typecheck/lint (the `parse-errors` directory name
suggests they are, but no `tsconfig` exclude was verified during this
review).
**Fix:** Either drop the `ReactNode` annotation (use `any`/`unknown`) or add
an explicit `// @ts-nocheck` and exclude from tsconfig — whichever the
project convention prefers.

---

_Reviewed: 2026-05-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
