# Phase 10: Interface Widening & Analyzer De-Next-ification — Research

**Researched:** 2026-05-13
**Domain:** TypeScript interface refactoring — adapter pattern widening + intra-module code migration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** `NextJsAdapter.enumerateRoutes(absRoot)` calls `discoverNextEntries(absRoot)` internally — the adapter owns full Next.js entry discovery + route derivation logic together.

**D-02:** `Analyzer.buildUnionIR()` drops its `discoverEntries` call entirely. The two-call pattern (`discoverEntries` → `deriveRoutesFromEntries`) is replaced with a single `await this.adapter.enumerateRoutes(this.root)` call. No redundant double-discovery.

**D-03:** `collectChildrenSlotLines` becomes a private method on the `Analyzer` class (not a module-scope function). This lets it call `this.adapter.slotMarker(name, importSource)` naturally. Callsite in `buildTreeForEntry` changes from `collectChildrenSlotLines(cachedParse.ast)` to `this.collectChildrenSlotLines(cachedParse.ast)`.

**D-04:** When `Analyzer` calls `this.adapter.slotMarker(name, importSource)` for `{children}` JSX expression containers, it passes `""` (empty string) as `importSource`. `{children}` is a React prop, not an imported component — Analyzer has no import tracking at that traversal point.

**D-05:** `NextJsAdapter.slotMarker` implementation: `return name === "children"` — ignores `importSource` entirely for Next.js. The SPEC unit test `slotMarker("children", "react")` tests interface contract, not the runtime value Analyzer passes.

### Claude's Discretion

- Migration order within the phase (interface-first vs. simultaneous interface+implementation+cleanup) — Claude decides based on what produces the cleanest atomic commits.
- Whether to snapshot-update in a dedicated final pass or inline as each delegation point lands — Claude decides based on test stability during the refactor.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADAPT-01 | `FrameworkAdapter` interface widened with `classifyEntry`, `enumerateRoutes`, `slotMarker`; Analyzer's 5 leak sites delegate to adapter | Code inspection confirms exact 5 leak sites; new method signatures derived from SPEC |
| ADAPT-02 | `NextJsAdapter` migrated to widened interface; locking test updated; snapshots re-locked; suite stays green (≥353) | Current suite at 360/360; snapshot re-lock is vitest `--update-snapshots` pass |
</phase_requirements>

---

## Summary

Phase 10 is a pure structural refactoring — zero new behavior, zero new external dependencies, zero new test fixtures. The objective is to route five Next.js-specific code sites in `src/core/Analyzer.ts` through three new `FrameworkAdapter` methods, then implement those methods in `NextJsAdapter`. The existing codebase already follows the adapter delegation pattern (see `buildTreeForEntry` calling `this.adapter.extractComponents`); this phase extends that pattern to three additional capability boundaries.

The migration has two invariants that must hold throughout: (1) the island rule — `src/core/Analyzer.ts` may only import from `src/adapters/` as `import type`, never as a runtime value import; (2) byte-identical output — no markdown or JSON snapshot content should change after refactoring.

The five leak sites are well-bounded and mechanically replaceable. The highest-risk step is `buildUnionIR` where the two-call pattern (`discoverEntries` + `deriveRoutesFromEntries`) is replaced by a single `adapter.enumerateRoutes` call — this changes control flow in the async hot path and is the most likely to introduce subtle behavior drift if not tested end-to-end before snapshot re-lock.

**Primary recommendation:** Migrate interface-first (expand `FrameworkAdapter` → implement in `NextJsAdapter` → remove from `Analyzer`) in a single wave; run `vitest run` after each file change; do snapshot re-lock only after all 5 leak sites are fully migrated.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| File role classification (page/layout/special) | Adapter (`NextJsAdapter`) | — | Framework-specific filename conventions; must not live in core |
| Route enumeration from filesystem | Adapter (`NextJsAdapter`) | — | Framework-specific directory structure (app/, route groups, @parallel) |
| Slot marker detection | Adapter (`NextJsAdapter`) | Analyzer (AST walk plumbing) | Framework decides what "slot" means; Analyzer provides the AST traversal harness |
| AST traversal for slot lines | Core (`Analyzer` private method) | — | Tree-walking is framework-agnostic; only the predicate (`slotMarker`) is adapter-provided |
| Parallel-slot tree mutation | Core (`Analyzer` — `attachParallelSlot`) | — | Generic tree surgery; no framework knowledge required; confirmed by SPEC req 8 |
| `layoutHint: "client"` propagation | Core (`Analyzer` — `buildTreeForEntry`) | — | Already adapter-sourced via `def.runtime`; classification of "client" is Next.js–centric but gated by the `def.runtime` value from adapter |

---

## Standard Stack

This phase introduces no new dependencies. All tools used are already in the project.

### Existing Tools in Use

| Tool | Version | Role in This Phase |
|------|---------|-------------------|
| TypeScript | `^5.20.1` | Interface widening and type-checking the 8-method set |
| vitest | `^4.3.6` | Running full suite (360 tests); snapshot re-lock |
| `@babel/traverse` | `^7.29.0` | Already used in `collectChildrenSlotLines`; stays in place as private Analyzer method |
| `@babel/types` | `^7.29.0` | `t.isIdentifier`, `t.isJSXExpressionContainer` used in slot line collection |
| tinyglobby | `^0.2.16` | Already used in `discover.ts`; `enumerateRoutes` reuses it via `discoverNextEntries` |

**Installation:** No new packages required.

---

## Architecture Patterns

### System Architecture Diagram

```
Analyzer.buildUnionIR()
  │
  └─► adapter.enumerateRoutes(root)          ← NEW (replaces discoverEntries + deriveRoutesFromEntries)
        │
        ├─ discoverNextEntries(root)          ← reuses existing discover.ts
        └─ deriveRoutesFromEntries logic      ← migrated inline to NextJsAdapter

Analyzer.buildRouteTree(rm)
  │
  ├─► isPageFile(entry)   →  adapter.classifyEntry(entry) === "page"     ← NEW
  └─► isLayoutFile(entry) →  adapter.classifyEntry(entry) === "layout"   ← NEW

Analyzer.buildTreeForEntry(absFile)
  │
  └─► this.collectChildrenSlotLines(ast)     ← NEW (was module-scope fn)
        │
        └─► adapter.slotMarker(name, "")     ← NEW delegate call inside traverse visitor
```

### Recommended Project Structure

No structural changes — all edits are within existing files:

```
src/
├── adapters/
│   ├── FrameworkAdapter.ts          # EDIT: add 3 methods, update comment
│   └── next/
│       └── NextJsAdapter.ts         # EDIT: implement 3 new methods
└── core/
    └── Analyzer.ts                  # EDIT: remove 5 functions, add private method, update callsites
test/
└── adapters/
    └── FrameworkAdapter.test.ts     # EDIT: update locking assertion from 5 to 8 methods
```

### Pattern 1: Interface Widening (FrameworkAdapter.ts)

**What:** Add 3 new method signatures to the existing `FrameworkAdapter` interface.
**When to use:** Any time a new framework-specific capability boundary is identified.

```typescript
// Source: existing FrameworkAdapter.ts pattern + SPEC requirements
export interface FrameworkAdapter {
  // ... existing 5 methods ...

  /** Classify an entry file by its role in the framework's routing model. */
  classifyEntry(absPath: string): "page" | "layout" | "special" | "other";

  /** Enumerate all route strings for the project root. */
  enumerateRoutes(absRoot: string): string[] | Promise<string[]>;

  /**
   * Return true if the identifier `name` (from source `importSource`) is a
   * slot injection point for this framework.
   * Next.js: name === "children" (importSource ignored).
   * Expo Router: name === "Slot" && importSource === "expo-router".
   */
  slotMarker(name: string, importSource: string): boolean;
}
```

**CRITICAL:** The `FrameworkAdapter.ts` comment currently says "Adding a 6th method requires a milestone amendment." This MUST be updated to: "8-method set locked by Phase 10 SPEC (10-SPEC.md)."

### Pattern 2: NextJsAdapter — classifyEntry implementation

**What:** Consolidate the 3 file-role functions from Analyzer.ts into a single adapter method.

```typescript
// Source: derived from existing isPageFile/isLayoutFile/isSpecialFile in Analyzer.ts
classifyEntry(absPath: string): "page" | "layout" | "special" | "other" {
  const base = toForwardSlash(absPath).split("/").pop() ?? "";
  if (/^page\.(tsx|jsx|ts|js)$/.test(base)) return "page";
  if (/^layout\.(tsx|jsx|ts|js)$/.test(base)) return "layout";
  if (/^(layout|template|loading|error|not-found|default)\.(tsx|jsx|ts|js)$/.test(base)) return "special";
  return "other";
},
```

Note: `isSpecialFile` currently returns `true` for `layout.*` files too (its regex includes `layout`). The new `classifyEntry` returns `"layout"` (not `"special"`) for layout files since the `"layout"` check comes first. This is behavior-preserving because Analyzer's callsites use `isLayoutFile` and `isSpecialFile` separately — `classifyEntry` returns the most specific classification first.

### Pattern 3: NextJsAdapter — enumerateRoutes implementation

**What:** Move `deriveRoutesFromEntries` from Analyzer.ts and combine with `discoverNextEntries` call.

```typescript
// Source: D-01/D-02 decisions + existing discover.ts + Analyzer.ts deriveRoutesFromEntries
async enumerateRoutes(absRoot: string): Promise<string[]> {
  const entries = await discoverNextEntries(absRoot);
  // ... deriveRoutesFromEntries logic inlined here, using entries and absRoot ...
  // Returns Array.from(routes).sort() as before
},
```

The full `deriveRoutesFromEntries` logic (lines 1194–1233 in Analyzer.ts) moves verbatim into this method. The only change: the function receives `entries` from the local `discoverNextEntries` call instead of as a parameter.

### Pattern 4: NextJsAdapter — slotMarker implementation

**What:** One-liner per D-05.

```typescript
// Source: D-04/D-05 decisions
slotMarker(name: string, _importSource: string): boolean {
  return name === "children";
},
```

### Pattern 5: Analyzer — collectChildrenSlotLines as private method

**What:** Migrate the module-scope `collectChildrenSlotLines` function to a private class method that calls `this.adapter.slotMarker`.

```typescript
// Source: D-03/D-04 decisions + existing module-scope function at Analyzer.ts:495
private collectChildrenSlotLines(ast: t.File): Set<number> {
  const lines = new Set<number>();
  const adapter = this.adapter;
  traverse(ast, {
    JSXExpressionContainer(path: { node: t.JSXExpressionContainer }) {
      const expr = path.node.expression;
      if (t.isIdentifier(expr) && adapter.slotMarker(expr.name, "")) {
        const line = path.node.loc?.start.line ?? 0;
        lines.add(line);
      }
    },
  });
  return lines;
}
```

The `traverse` visitor callback is a plain function (not an arrow function), so `this` is not available inside it — use a local `const adapter = this.adapter` capture before the traverse call. [VERIFIED: existing Analyzer.ts uses this capture pattern for `this.ctx` in traverse visitors]

### Pattern 6: Analyzer.buildUnionIR — replace two-call with single enumerateRoutes call

**What:** Remove `discoverEntries` + `deriveRoutesFromEntries`; replace with `adapter.enumerateRoutes`.

```typescript
// Source: D-02 decision + existing buildUnionIR at Analyzer.ts:968
private async buildUnionIR(): Promise<TreeNode[]> {
  let routes: string[];
  try {
    routes = await this.adapter.enumerateRoutes(this.root);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    this.ctx.warnings.push(`enumerateRoutes error: ${message}`);
    return [];
  }
  // ... rest unchanged ...
}
```

The warning message key changes from `discoverEntries error:` to `enumerateRoutes error:`. Check whether any test snapshots or assertions key on the exact warning string — if so, update them.

### Pattern 7: Analyzer.buildRouteTree — replace isPageFile/isLayoutFile calls

**What:** Replace the two per-entry classification calls with `adapter.classifyEntry`.

```typescript
// Source: existing buildRouteTree at Analyzer.ts:897-902
// Before:
let pageFile: string | undefined;
for (let i = entries.length - 1; i >= 0; i--) {
  if (isPageFile(entries[i]!)) { pageFile = entries[i]; break; }
}
const layoutFiles = entries.filter((e) => isLayoutFile(e));

// After:
let pageFile: string | undefined;
for (let i = entries.length - 1; i >= 0; i--) {
  if (this.adapter.classifyEntry(entries[i]!) === "page") { pageFile = entries[i]; break; }
}
const layoutFiles = entries.filter((e) => this.adapter.classifyEntry(e) === "layout");
```

### Pattern 8: Locking test update (FrameworkAdapter.test.ts)

**What:** Update the `Record<keyof FrameworkAdapter, true>` stub and length assertion.

```typescript
// Source: existing test at test/adapters/FrameworkAdapter.test.ts
it("interface has exactly 8 methods ...", () => {
  const stub: Record<keyof FrameworkAdapter, true> = {
    detect: true,
    discoverEntries: true,
    resolveModule: true,
    extractComponents: true,
    mapRouteToEntry: true,
    classifyEntry: true,
    enumerateRoutes: true,
    slotMarker: true,
  };
  expect(Object.keys(stub).sort()).toEqual([
    "classifyEntry",
    "detect",
    "discoverEntries",
    "enumerateRoutes",
    "extractComponents",
    "mapRouteToEntry",
    "resolveModule",
    "slotMarker",
  ]);
  expect(Object.keys(stub)).toHaveLength(8);
});
```

The TypeScript `Record<keyof FrameworkAdapter, true>` type will fail to compile if any method is missing from the stub — this provides compile-time locking in addition to the runtime length check.

### Anti-Patterns to Avoid

- **Adding `import` from `src/adapters/` in Analyzer.ts (non-type):** Violates island rule D-11. The existing `const adapter = this.adapter` capture pattern is the correct way to access adapter methods in traversal callbacks.
- **Moving `attachParallelSlot` to the adapter:** SPEC req 8 explicitly forbids this. Tree-mutation logic is framework-agnostic.
- **Running `--update-snapshots` before all 5 leak sites are migrated:** Any partial migration could silently accept incorrect output as a new baseline. Complete the full migration first, then run `vitest run` to confirm all tests pass, then run `--update-snapshots` only if divergences remain.
- **Calling `discoverEntries` from `buildUnionIR` after migration:** D-02 says the `discoverEntries` call is dropped entirely — `enumerateRoutes` handles both discovery and route derivation.
- **Using `adapter.slotMarker` anywhere other than `collectChildrenSlotLines`:** The only callsite is inside the private method; no other Analyzer code should call `slotMarker`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| `classifyEntry` regex patterns | New regex | Copy existing patterns from `isPageFile`/`isLayoutFile`/`isSpecialFile` verbatim | Patterns are already tested through 360 snapshot tests; changing them risks output divergence |
| Route derivation logic | New algorithm | Inline existing `deriveRoutesFromEntries` body into `NextJsAdapter.enumerateRoutes` | Same logic, same test coverage — migration is mechanical, not re-implementation |
| Traverse adapter capture | Closure pattern | `const adapter = this.adapter` before `traverse()` call | Babel traverse visitors run in the visitor context, not the class context |

---

## Common Pitfalls

### Pitfall 1: `isSpecialFile` catches layout files too

**What goes wrong:** The existing `isSpecialFile` regex is `^(layout|template|loading|error|not-found|default)\.` — it matches `layout.*` files. If `classifyEntry` returns `"special"` for layout files, `buildRouteTree`'s `isLayoutFile` replacement will silently stop finding layouts.
**Why it happens:** The three original functions have overlapping coverage; `isLayoutFile` was always called separately from `isSpecialFile`.
**How to avoid:** In `classifyEntry`, check for `"layout"` before `"special"`. The SPEC acceptance test `NextJsAdapter.slotMarker("children", "react")` does not cover this — add a unit test for `classifyEntry("app/layout.tsx") === "layout"` explicitly.
**Warning signs:** All `vitest run` tests for routes with layouts fail to produce wrapped trees.

### Pitfall 2: Warning message string assertion breakage

**What goes wrong:** A test may assert that a specific warning message contains `"discoverEntries error"`. After migration, the message becomes `"enumerateRoutes error"`.
**Why it happens:** `buildUnionIR`'s catch block pushes a warning with the old function name.
**How to avoid:** Grep for `"discoverEntries error"` in test files before finalizing.
**Warning signs:** A test in the warnings-related suite fails with unexpected string mismatch.

### Pitfall 3: `traverse` visitor `this` context capture

**What goes wrong:** Inside a `traverse()` visitor callback (non-arrow function), `this` is not the Analyzer instance.
**Why it happens:** Babel traverse sets the visitor context to a NodePath object, not the outer class.
**How to avoid:** Capture `const adapter = this.adapter` before the `traverse(ast, { ... })` call. Existing Analyzer.ts already uses `const ctx = this.ctx` captures in two places — follow the same pattern. [VERIFIED: Analyzer.ts lines 855–864 use `this.adapter` inside arrow function callbacks, not regular functions — but `traverse` visitors specifically use non-arrow callbacks per Babel's API]
**Warning signs:** `TypeError: Cannot read properties of undefined (reading 'slotMarker')` at runtime in tests.

### Pitfall 4: Snapshot divergence from `enumerateRoutes` ordering

**What goes wrong:** If `NextJsAdapter.enumerateRoutes` returns routes in a different order than the previous `deriveRoutesFromEntries`, `buildUnionIR` iterates in a different order, producing a different markdown tree sequence.
**Why it happens:** `deriveRoutesFromEntries` returns `Array.from(routes).sort()`. The migrated implementation must preserve the `.sort()` call.
**How to avoid:** Copy the `Array.from(routes).sort()` pattern verbatim from the existing Analyzer.ts:1232.
**Warning signs:** Snapshot tests fail with "received value does not match stored snapshot" where route order differs.

### Pitfall 5: TypeScript compile error from non-exhaustive `classifyEntry` return type

**What goes wrong:** If the `classifyEntry` return type `"page" | "layout" | "special" | "other"` is widened accidentally or `NextJsAdapter` returns an undeclared value, TypeScript will error.
**Why it happens:** String literal return type unions require exact matching.
**How to avoid:** Use `as const` return values in `NextJsAdapter.classifyEntry`; run `tsc --noEmit` after changes.

---

## Code Examples

### Full migration: Analyzer.ts buildRouteTree (lines 896–902)

```typescript
// BEFORE (Analyzer.ts lines 896–902)
let pageFile: string | undefined;
for (let i = entries.length - 1; i >= 0; i--) {
  if (isPageFile(entries[i]!)) { pageFile = entries[i]; break; }
}
const layoutFiles = entries.filter((e) => isLayoutFile(e));

// AFTER
let pageFile: string | undefined;
for (let i = entries.length - 1; i >= 0; i--) {
  if (this.adapter.classifyEntry(entries[i]!) === "page") { pageFile = entries[i]; break; }
}
const layoutFiles = entries.filter((e) => this.adapter.classifyEntry(e) === "layout");
```

### Full migration: Analyzer.ts buildUnionIR (lines 968–986)

```typescript
// BEFORE
let entries: string[];
try {
  entries = await this.adapter.discoverEntries(this.root);
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  this.ctx.warnings.push(`discoverEntries error: ${message}`);
  return [];
}
const routes = deriveRoutesFromEntries(entries, this.root);

// AFTER
let routes: string[];
try {
  routes = await this.adapter.enumerateRoutes(this.root);
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  this.ctx.warnings.push(`enumerateRoutes error: ${message}`);
  return [];
}
```

### Full migration: collectChildrenSlotLines callsite (Analyzer.ts line 844)

```typescript
// BEFORE (module-scope function call)
const slotLines = collectChildrenSlotLines(cachedParse.ast);

// AFTER (private method call)
const slotLines = this.collectChildrenSlotLines(cachedParse.ast);
```

---

## Runtime State Inventory

> Not applicable — this is a code-only refactoring phase with no rename of persistent values (no user_ids, DB keys, env vars, or registered task names change).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | No test asserts the exact string `"discoverEntries error"` in a warning message | Pitfall 2 | One test fails with a string mismatch; fix: update warning string in that test |
| A2 | `isSpecialFile` and `isLayoutFile` are only called from `buildRouteTree` in Analyzer.ts | Code patterns section | Additional callsites would need updating; grep before executing |
| A3 | The existing 360 tests (not 353 as SPEC assumes) are all passing as of Phase 9 completion | Validation Architecture | Floor is now 360, not 353; SPEC's "≥353" is a lower bound, not the target |

---

## Open Questions

1. **Warning string in tests**
   - What we know: `buildUnionIR` catch block pushes `"discoverEntries error: ..."`.
   - What's unclear: Whether any test snapshot or assertion asserts this exact string.
   - Recommendation: Run `grep -r "discoverEntries error" test/` before execution; update if found.

2. **`isSpecialFile` callsites beyond `buildRouteTree`**
   - What we know: `isSpecialFile` is visible at module scope in Analyzer.ts (grep confirms lines 663–676).
   - What's unclear: Whether there is any callsite other than `buildRouteTree`.
   - Recommendation: Run `grep -n "isSpecialFile\|isPageFile\|isLayoutFile" src/core/Analyzer.ts` at start of execution to confirm all callsites.

---

## Environment Availability

> Skipped — this phase is a pure code/config refactoring with no external service dependencies.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest `^4.3.6` |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `vitest run test/adapters/FrameworkAdapter.test.ts` |
| Full suite command | `vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADAPT-01 | FrameworkAdapter exposes 8 methods (classifyEntry, enumerateRoutes, slotMarker + existing 5) | structural/locking | `vitest run test/adapters/FrameworkAdapter.test.ts` | ✅ (update existing) |
| ADAPT-01 | classifyEntry("app/page.tsx") returns "page" | unit | `vitest run test/adapters/` | ❌ Wave 0 |
| ADAPT-01 | classifyEntry("app/layout.tsx") returns "layout" | unit | `vitest run test/adapters/` | ❌ Wave 0 |
| ADAPT-01 | classifyEntry("app/loading.tsx") returns "special" | unit | `vitest run test/adapters/` | ❌ Wave 0 |
| ADAPT-01 | classifyEntry("app/page.tsx") does NOT return "special" (Pitfall 1 regression guard) | unit | `vitest run test/adapters/` | ❌ Wave 0 |
| ADAPT-01 | slotMarker("children", "react") returns true | unit | `vitest run test/adapters/` | ❌ Wave 0 (specified in SPEC AC) |
| ADAPT-01 | slotMarker("Slot", "expo-router") returns false | unit | `vitest run test/adapters/` | ❌ Wave 0 (specified in SPEC AC) |
| ADAPT-01 | enumerateRoutes returns routes in sorted order | unit | `vitest run test/adapters/` | ❌ Wave 0 |
| ADAPT-02 | NextJsAdapter compiles, all 8 methods implemented | TypeScript compile | `npx tsc --noEmit` | implicit |
| ADAPT-02 | Full suite stays ≥353 green (currently 360) | regression | `vitest run` | ✅ existing suite |
| ADAPT-02 | Zero diverging snapshots after migration | snapshot | `vitest run --update-snapshots` | ✅ existing snapshots |

### Sampling Rate

- **Per file change:** `vitest run test/adapters/FrameworkAdapter.test.ts`
- **Per wave merge:** `vitest run`
- **Phase gate:** `vitest run` exits 0 with ≥ 360 passing tests (current count) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `test/adapters/NextJsAdapter.test.ts` — unit tests for `classifyEntry` (3 return-value cases + Pitfall 1 guard) and `slotMarker` (2 cases from SPEC AC); `enumerateRoutes` smoke test. This file may not exist yet — if it does, add to it; if not, create it.
- [ ] Inspect `test/adapters/` for an existing `NextJsAdapter.test.ts` before creating.

---

## Security Domain

> Not applicable — this phase performs no I/O, network access, authentication, cryptography, or user-data handling. It is a pure TypeScript interface refactoring. `security_enforcement` is implicitly enabled but no ASVS categories apply to this change.

---

## Sources

### Primary (HIGH confidence)

- `src/core/Analyzer.ts` (verified via Read tool) — exact line numbers for all 5 leak sites: `collectChildrenSlotLines` (495), `isPageFile`/`isSpecialFile`/`isLayoutFile` (663–676), `deriveRoutesFromEntries` (1194), `buildUnionIR` callsite (978), `buildRouteTree` callsites (898, 902)
- `src/adapters/FrameworkAdapter.ts` (verified via Read tool) — current 5-method interface; comment to update
- `src/adapters/next/NextJsAdapter.ts` (verified via Read tool) — current 5-method implementation; `discoverNextEntries` import already present
- `src/adapters/next/discover.ts` (verified via Read tool) — `discoverNextEntries` function signature: `async function discoverEntries(absRoot: string): Promise<string[]>`; re-exported as named export
- `test/adapters/FrameworkAdapter.test.ts` (verified via Read tool) — current 5-method locking test; exact update path confirmed
- `test/architecture/island.test.ts` (verified via Read tool) — island rule regex; confirms `import type` is allowed
- `vitest run` output (verified via Bash tool) — current test count: 360/360 passing

### Secondary (MEDIUM confidence)

- `.planning/phases/10-interface-widening-analyzer-de-next-ification/10-CONTEXT.md` — locked implementation decisions D-01 through D-05
- `.planning/phases/10-interface-widening-analyzer-de-next-ification/10-SPEC.md` — all 8 requirements and acceptance criteria

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all tools already in use and verified in codebase
- Architecture: HIGH — all 5 leak sites located and line-numbered; migration mechanics derived directly from existing code
- Pitfalls: HIGH — derived from concrete code inspection (regex overlap, traverse context, sort order)

**Research date:** 2026-05-13
**Valid until:** No expiry — codebase-only research; valid as long as source files are unchanged
