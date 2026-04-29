# Phase 5: IR Queries & Tool Wire-up - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-29
**Phase:** 05-ir-queries-tool-wire-up
**Areas discussed:** Analyzer file layout, RenderNode→TreeNode + slot-substitution, Style sidecar storage, Fixture project shape

---

## Gray-area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Analyzer file layout | Single file vs split modules | ✓ |
| RenderNode→TreeNode + slot-substitution | Mapping rules + inside-out vs outside-in algo | ✓ |
| Style sidecar storage | WeakMap vs file:line key vs layoutHint encoding | ✓ |
| Fixture project shape | Kitchen-sink vs hybrid vs per-tool | ✓ |

**User's choice:** All four areas selected for discussion.

---

## Analyzer file layout

| Option | Description | Selected |
|--------|-------------|----------|
| Single file (Recommended) | Analyzer.ts contains class + IR-build + queries + fragment helper + Levenshtein. ~600–800 LOC. | ✓ |
| Split: Analyzer + ir-build/ + queries/ | Per-concern modules <200 LOC each. | |
| Hybrid: Analyzer + ir-build/ only | Class + queries co-located; IR-build split for testability. | |

**User's choice:** Single file.

| Option | Description | Selected |
|--------|-------------|----------|
| Levenshtein inline (Recommended) | Hand-rolled ≤30 LOC inside Analyzer.ts; tested via find_by_text. | ✓ |
| Levenshtein at src/core/levenshtein.ts | Re-usable utility with own unit tests. | |

**User's choice:** Inline.

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse ParseContext.astCache (Recommended) | Analyzer constructor builds one ParseContext per call; no second cache layer. | ✓ |
| Analyzer's own Map<absPath, AST> | Independent cache field on the Analyzer instance. | |

**User's choice:** Reuse ParseContext.astCache.

---

## RenderNode → TreeNode + slot-substitution

| Option | Description | Selected |
|--------|-------------|----------|
| isComponent→component, else→element (Recommended) | Reuse walkRenderFlow's existing isComponent flag. | ✓ |
| Resolve component→layout file at IR-build | Run resolveModule eagerly to get definition-site file:line. | |

**User's choice:** isComponent flag (call-site only).

| Option | Description | Selected |
|--------|-------------|----------|
| Call site (Recommended) | file:line is the JSXElement position where the node is used. | ✓ |
| Definition site | file:line is the `export function Card()` declaration line. | |
| Both via metadata | Call site primary; definition site encoded in layoutHint. | |

**User's choice:** Call site.

| Option | Description | Selected |
|--------|-------------|----------|
| Inside-out wrap (Recommended) | tree=page; for layout in entries.reverse(): tree=replaceSlot(layout,'children',tree). | ✓ |
| Outside-in placeholder fill | Build root layout first, fill placeholders recursively. | |

**User's choice:** Inside-out wrap.

| Option | Description | Selected |
|--------|-------------|----------|
| Sibling of {children} in parent (Recommended) | @modal becomes kind:slot,name:modal sibling within parent layout's component children. | ✓ |
| Top-level fragment children | Synthesize fragment root with [main-tree, modal-tree] as children. | |

**User's choice:** Sibling of {children}.

---

## Style sidecar storage

| Option | Description | Selected |
|--------|-------------|----------|
| Map<string, StyleIndex> keyed by file:line:tag (Recommended) | Composite key is unique per node; JSON-safe; matches dedup spec. | ✓ |
| WeakMap<TreeNode, StyleIndex> | Identity-based; not iterable; needs companion Set. | |
| Encode in layoutHint string | Stuff classes/keys into a string; pollutes markdown output. | |

**User's choice:** file:line:tag composite key.

| Option | Description | Selected |
|--------|-------------|----------|
| Re-walk JSX during IR build (Recommended) | Read RenderNode.attributes during translation; emit StyleIndex per element. | ✓ |
| Extend RenderNode/ComponentDefinition | Add per-element style field. (Conflicts with D-05 / R8 schema locks.) | |

**User's choice:** Re-walk JSX.

| Option | Description | Selected |
|--------|-------------|----------|
| Literal-only attrs (Recommended) | Only string-literal className values are tokenized; expressions skipped. | ✓ |
| Parse cn/clsx call args | Recursive arg extraction from helper calls. | |

**User's choice:** Literal-only.

---

## Fixture project shape

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid: 1 kitchen-sink + micro-fixtures (Recommended) | One shared fixture for R1–R7; micro-fixtures for parse-error and mutation tests. | ✓ |
| Single kitchen-sink only | All cases in one project, including parse-error file. | |
| Per-tool fixtures | One project per tool. | |

**User's choice:** Hybrid.

| Option | Description | Selected |
|--------|-------------|----------|
| Real on-disk .tsx files (Recommended) | Hand-written files under test/fixtures/phase-05/. | ✓ |
| Inline strings, written to tmpdir at test time | Per-test programmatic fixture generation. | |

**User's choice:** Real on-disk files.

| Option | Description | Selected |
|--------|-------------|----------|
| Both Tier 1 + Tier 2 (Recommended) | Analyzer unit tests + handler integration tests. | ✓ |
| Tier 2 only | All tests through MCP handlers. | |

**User's choice:** Both tiers.

---

## Claude's Discretion

- Union-IR build-once memoization within a single Analyzer call (focus_on/find_by_text/find_by_style share the per-route IR pass) — planner picks lazy vs eager.
- Warnings dedup strategy when multiple files contribute the same warning class.
- Error-node placement in union trees — at the route's slot in the union IR (visible) vs Envelope.warnings only (silent).
- Slot ordering when both `children` and parallel slots exist — D-10 says lexicographic after `children`, planner may override if a more useful order emerges.

## Deferred Ideas

- Component-reference inlining (follow `<Card>` to Card.tsx body) — v2.
- `cn`/`clsx`/`cva`/`twMerge` argument extraction for find_by_style — v2.
- Performance tuning for find_by_* — Phase 6.
- Cross-call cache / persistent index — v2 (ARCH-02).
- Render-time semantics for template.tsx / loading.tsx / error.tsx — v2.
- Pages Router adapter — v2.
