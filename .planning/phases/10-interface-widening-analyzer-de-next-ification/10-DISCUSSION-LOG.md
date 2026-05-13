# Phase 10: Interface Widening & Analyzer De-Next-ification — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-13
**Phase:** 10-interface-widening-analyzer-de-next-ification
**Areas discussed:** enumerateRoutes coupling, collectChildrenSlotLines shape, slotMarker importSource value

---

## enumerateRoutes coupling

| Option | Description | Selected |
|--------|-------------|----------|
| enumerateRoutes internalizes discoverEntries | NextJsAdapter.enumerateRoutes(absRoot) calls discoverNextEntries internally. buildUnionIR drops its discoverEntries call — only calls enumerateRoutes. Clean: adapter owns all Next.js entry discovery + routing logic together. | ✓ |
| buildUnionIR calls both separately | buildUnionIR still calls discoverEntries(root) for entries, then calls enumerateRoutes(root) which also calls discoverEntries internally. Redundant double-discovery — messy. | |

**User's choice:** enumerateRoutes internalizes discoverEntries (Recommended)
**Notes:** None — clear preference for the clean adapter-owns-everything approach.

---

## collectChildrenSlotLines shape

| Option | Description | Selected |
|--------|-------------|----------|
| Private method on Analyzer class | Move into class as private collectChildrenSlotLines(ast). Calls this.adapter.slotMarker() naturally. SPEC says "private helper" — class private method fits. | ✓ |
| Module-scope function with adapter param | Keep as standalone function, change signature to collectChildrenSlotLines(ast, adapter: FrameworkAdapter). Adds island-rule concern at module scope. | |

**User's choice:** Private method on Analyzer class (Recommended)
**Notes:** None — consistent with SPEC language "private helper".

---

## slotMarker importSource value

| Option | Description | Selected |
|--------|-------------|----------|
| Pass empty string "" | Analyzer passes "" because {children} is a React prop, not an import. NextJsAdapter.slotMarker implements: name === "children" (ignore importSource). SPEC test is a unit test of interface contract, not dictating runtime value. | ✓ |
| Resolve import source via collectImportBindings | Reuse collectImportBindings to look up where 'children' comes from. But children isn't in imports — it's a prop. More complex with no real benefit. | |

**User's choice:** Pass empty string "" (Recommended)
**Notes:** NextJsAdapter.slotMarker ignores importSource for Next.js — `return name === "children"` is a one-liner.

---

## Claude's Discretion

- Migration order within phase (interface-first vs. simultaneous changes) — Claude decides.
- Snapshot update strategy (dedicated final pass vs. inline as delegation lands) — Claude decides.

## Deferred Ideas

None — discussion stayed within phase scope.
