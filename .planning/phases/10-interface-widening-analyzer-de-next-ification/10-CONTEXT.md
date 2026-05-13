# Phase 10: Interface Widening & Analyzer De-Next-ification — Context

**Gathered:** 2026-05-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Tách 5 Next.js-specific functions khỏi `src/core/Analyzer.ts` vào `FrameworkAdapter` interface (3 new methods) và `NextJsAdapter` implementation — sao cho output markdown + JSON byte-identical, full vitest suite vẫn ≥353 green.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**8 requirements are locked.** See `10-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `10-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- `src/adapters/FrameworkAdapter.ts` — add `classifyEntry`, `enumerateRoutes`, `slotMarker` to the interface
- `src/adapters/next/NextJsAdapter.ts` — implement 3 new methods; move Next.js routing logic from Analyzer.ts
- `src/core/Analyzer.ts` — remove 5 Next.js-specific functions; replace with adapter delegation calls
- `test/adapters/FrameworkAdapter.test.ts` — update method-count locking assertion from 5 to 8
- Snapshot re-lock (`vitest run --update-snapshots` if any diverge after delegation)
- Keeping all 353+ existing tests green

**Out of scope (from SPEC.md):**
- Any `ExpoRouterAdapter` implementation (Phase 12)
- `slotMarker` for Expo Router `<Slot/>` (Phase 12)
- Adapter detection / `selectAdapter` (Phase 11)
- Tool-handler refactor to use `selectAdapter` (Phase 11)
- `enumerateRoutes` for Expo Router (Phase 12)
- React Native primitive recognition (Phases 12–13)
- Style extraction (Phases 12–13)
- `--framework` CLI flag (Phase 11)
- Integration tests for Expo fixtures (Phase 15)

</spec_lock>

<decisions>
## Implementation Decisions

### enumerateRoutes — coupling to discoverEntries

- **D-01:** `NextJsAdapter.enumerateRoutes(absRoot)` calls `discoverNextEntries(absRoot)` **internally** — the adapter owns full Next.js entry discovery + route derivation logic together.
- **D-02:** `Analyzer.buildUnionIR()` **drops its `discoverEntries` call entirely**. The two-call pattern (`discoverEntries` → `deriveRoutesFromEntries`) is replaced with a single `await this.adapter.enumerateRoutes(this.root)` call. No redundant double-discovery.

### collectChildrenSlotLines — refactor shape

- **D-03:** `collectChildrenSlotLines` becomes a **private method on the `Analyzer` class** (not a module-scope function). This lets it call `this.adapter.slotMarker(name, importSource)` naturally. Callsite in `buildTreeForEntry` changes from `collectChildrenSlotLines(cachedParse.ast)` to `this.collectChildrenSlotLines(cachedParse.ast)`.

### slotMarker — importSource value at runtime

- **D-04:** When `Analyzer` calls `this.adapter.slotMarker(name, importSource)` for `{children}` JSX expression containers, it passes **`""` (empty string)** as `importSource`. `{children}` is a React prop, not an imported component — Analyzer has no import tracking at that traversal point.
- **D-05:** `NextJsAdapter.slotMarker` implementation: `return name === "children"` — **ignores `importSource` entirely** for Next.js, because `{children}` is always a slot marker regardless of source. The SPEC unit test `slotMarker("children", "react")` tests interface contract, not the runtime value Analyzer passes.

### Claude's Discretion

- Migration order within the phase (interface-first vs. simultaneous interface+implementation+cleanup) — Claude decides based on what produces the cleanest atomic commits.
- Whether to snapshot-update in a dedicated final pass or inline as each delegation point lands — Claude decides based on test stability during the refactor.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Spec
- `.planning/phases/10-interface-widening-analyzer-de-next-ification/10-SPEC.md` — Locked requirements, boundaries, acceptance criteria, and grep-verifiable checks. MUST read before planning.

### Core Files to Modify
- `src/core/Analyzer.ts` — Orchestrator containing the 5 leak sites to remove; island rule (D-11) enforced by Biome + architecture test
- `src/adapters/FrameworkAdapter.ts` — Interface to widen from 5 to 8 methods; comment about "6th method requires milestone amendment" must be updated
- `src/adapters/next/NextJsAdapter.ts` — Adapter to implement 3 new methods
- `test/adapters/FrameworkAdapter.test.ts` — Locking test to update from 5-method to 8-method assertion

### Architecture Rules
- `test/architecture/island.test.ts` — Enforces island rule (D-11): nothing under `src/core/` may value-import from `src/adapters/`. Type-only imports are allowed (verified by `// biome-ignore` comments already in Analyzer.ts).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/adapters/next/discover.ts` — `discoverNextEntries(absRoot)`: already implements Next.js entry discovery. `NextJsAdapter.enumerateRoutes` calls this function directly.
- `src/core/babel-shim.js` — `traverse` shim already handles CJS/ESM interop footgun; `collectChildrenSlotLines` (as private method) continues using this.
- `src/core/paths.ts` — `toForwardSlash` utility already used throughout Analyzer; `enumerateRoutes` logic in NextJsAdapter should continue using it.

### Established Patterns
- **Adapter delegation pattern**: `buildTreeForEntry` already calls `this.adapter.extractComponents` and `resolveComponentCallsites(... this.adapter ...)` — the new `this.adapter.classifyEntry`, `this.adapter.enumerateRoutes`, `this.adapter.slotMarker` calls follow the same pattern.
- **Island rule (D-11)**: `Analyzer.ts` already uses `import type` with `// biome-ignore` comments for FrameworkAdapter type. New delegation calls must not create value-level imports — the type-only pattern is already established.
- **Error wrapping in buildUnionIR**: existing try/catch around `discoverEntries` should be reused/adapted for `enumerateRoutes` (same failure mode, same warning push pattern).

### Integration Points
- `buildUnionIR` (line 968) — replaces `discoverEntries` + `deriveRoutesFromEntries` with single `enumerateRoutes` call
- `buildTreeForEntry` (line 788) — `collectChildrenSlotLines` (now private method) called at line 844; `isPageFile`/`isLayoutFile`/`isSpecialFile` replaced by `this.adapter.classifyEntry` calls at lines 898–902
- `deriveRoutesFromEntries` (line 1194) — deleted from Analyzer.ts; logic migrates into `NextJsAdapter.enumerateRoutes`
- `isPageFile`/`isSpecialFile`/`isLayoutFile` (lines 663–676) — deleted from Analyzer.ts; logic migrates into `NextJsAdapter.classifyEntry`
- `collectChildrenSlotLines` (line 495) — migrated to private Analyzer method; logic updated to call `this.adapter.slotMarker(name, "")`

</code_context>

<specifics>
## Specific Ideas

- `NextJsAdapter.classifyEntry(absPath)` implementation: reuses the existing regex patterns from the three deleted functions, consolidated into a single switch/if-chain returning `"page" | "layout" | "special" | "other"`.
- `NextJsAdapter.enumerateRoutes(absRoot)` implementation: calls `discoverNextEntries(absRoot)` then runs the current `deriveRoutesFromEntries` logic inline (or extracted to a private helper within the discover module).
- `NextJsAdapter.slotMarker(name, _importSource)` implementation: `return name === "children"` — one-liner. The `importSource` parameter is accepted but unused for Next.js.
- The FrameworkAdapter.ts comment "Adding a 6th method requires a milestone amendment" → update to "8-method set locked by Phase 10 SPEC (10-SPEC.md)".

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 10-interface-widening-analyzer-de-next-ification*
*Context gathered: 2026-05-13*
