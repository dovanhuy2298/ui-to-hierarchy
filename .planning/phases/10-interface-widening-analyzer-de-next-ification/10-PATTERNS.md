# Phase 10: Interface Widening & Analyzer De-Next-ification — Pattern Map

**Mapped:** 2026-05-13
**Files analyzed:** 4 modified files (no new files)
**Analogs found:** 4 / 4 (all exact role-match within the same files)

---

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/adapters/FrameworkAdapter.ts` | interface / contract | — | Itself (existing 5-method interface) | exact — extend in place |
| `src/adapters/next/NextJsAdapter.ts` | adapter implementation | CRUD + request-response | Itself (existing 5-method impl) | exact — add 3 methods to existing object literal |
| `src/core/Analyzer.ts` | orchestrator / core | request-response + tree-transform | Itself (existing class with adapter delegation) | exact — migrate 5 module-scope functions, update 3 callsites |
| `test/adapters/FrameworkAdapter.test.ts` | structural locking test | — | Itself (existing 5-method locking test) | exact — update count 5 → 8 |

---

## Pattern Assignments

### `src/adapters/FrameworkAdapter.ts` (interface, no data flow)

**Analog:** `src/adapters/FrameworkAdapter.ts` (itself — extend in place)

**Current interface pattern** (lines 1–47):
```typescript
import type { ComponentDefinition, ParseContext, ResolveResult, RouteMatch } from "./types.js";

export interface FrameworkAdapter {
  detect(absRoot: string): Promise<boolean> | boolean;
  discoverEntries(absRoot: string): Promise<string[]> | string[];
  resolveModule(
    ctx: ParseContext,
    fromFile: string,
    specifier: string,
    importedName: string,
  ): ResolveResult;
  extractComponents(
    ctx: ParseContext,
    entryFiles: string[],
    opts?: { fullClasses?: boolean },
  ): ComponentDefinition[];
  mapRouteToEntry(absRoot: string, route: string): Promise<RouteMatch> | RouteMatch;
}
```

**3 new method signatures to append** (derived from SPEC + RESEARCH Pattern 1):
```typescript
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
```

**Comment to update** (line 11):
```typescript
// BEFORE:
// Adding a 6th method to this interface requires a milestone amendment.
// The 5-key set is asserted at runtime by
// `test/adapters/FrameworkAdapter.test.ts` to catch accidental additions.

// AFTER:
// 8-method set locked by Phase 10 SPEC (10-SPEC.md).
// Asserted at runtime by `test/adapters/FrameworkAdapter.test.ts`.
```

---

### `src/adapters/next/NextJsAdapter.ts` (adapter implementation, CRUD + request-response)

**Analog:** `src/adapters/next/NextJsAdapter.ts` (itself — add 3 methods to existing object literal)

**Existing import pattern** (lines 19–40) — already has `discoverNextEntries` and `toForwardSlash`:
```typescript
import * as t from "@babel/types";
import type { FrameworkAdapter } from "../FrameworkAdapter.js";
import { toForwardSlash } from "../../core/paths.js";
import { discoverEntries as discoverNextEntries } from "./discover.js";
// ... other imports
```

**Existing delegation method pattern** (lines 43–53) — copy this shape for new methods:
```typescript
export const NextJsAdapter: FrameworkAdapter = {
  async detect(absRoot: string): Promise<boolean> {
    return detectNextProject(absRoot);
  },

  async discoverEntries(absRoot: string): Promise<string[]> {
    return discoverNextEntries(absRoot);
  },

  async mapRouteToEntry(absRoot: string, route: string): Promise<RouteMatch> {
    return matchRoute(absRoot, route);
  },
  // ...
};
```

**classifyEntry implementation** — copy regex patterns verbatim from Analyzer.ts lines 663–676:
```typescript
classifyEntry(absPath: string): "page" | "layout" | "special" | "other" {
  const base = toForwardSlash(absPath).split("/").pop() ?? "";
  if (/^page\.(tsx|jsx|ts|js)$/.test(base)) return "page";
  if (/^layout\.(tsx|jsx|ts|js)$/.test(base)) return "layout";
  if (/^(layout|template|loading|error|not-found|default)\.(tsx|jsx|ts|js)$/.test(base)) return "special";
  return "other";
},
```
NOTE: `"layout"` check MUST come before `"special"` — `isSpecialFile` regex also matches `layout.*`
files (Pitfall 1 in RESEARCH.md). `classifyEntry` fixes this by returning the most specific
classification first.

**enumerateRoutes implementation** — migrate `deriveRoutesFromEntries` (Analyzer.ts lines 1194–1233)
inline; source `entries` from `discoverNextEntries` call (D-01/D-02). `toForwardSlash` already
imported. Keep `Array.from(routes).sort()` verbatim (Pitfall 4):
```typescript
async enumerateRoutes(absRoot: string): Promise<string[]> {
  const entries = await discoverNextEntries(absRoot);
  const routes = new Set<string>();
  const fwdRoot = toForwardSlash(absRoot);

  let appRoot: string | null = null;
  for (const dir of ["app", "src/app"]) {
    const candidate = `${fwdRoot}/${dir}`;
    if (entries.some((e) => toForwardSlash(e).startsWith(`${candidate}/`))) {
      appRoot = candidate;
      break;
    }
  }
  if (!appRoot) return [];

  for (const entry of entries) {
    const fwd = toForwardSlash(entry);
    // Use this.classifyEntry — but since we are inside the object literal,
    // call classifyEntry directly or extract base check inline:
    const base = fwd.split("/").pop() ?? "";
    if (!/^page\.(tsx|jsx|ts|js)$/.test(base)) continue;
    if (!fwd.startsWith(`${appRoot}/`)) continue;

    const rel = fwd.slice(appRoot.length + 1);
    const parts = rel.split("/");
    parts.pop();

    const routeSegments: string[] = [];
    let skip = false;
    for (const part of parts) {
      if (/^\(.+\)$/.test(part)) continue;
      if (/^@/.test(part)) { skip = true; break; }
      if (/^_/.test(part)) { skip = true; break; }
      routeSegments.push(part);
    }
    if (skip) continue;

    const route = routeSegments.length === 0 ? "/" : `/${routeSegments.join("/")}`;
    routes.add(route);
  }

  return Array.from(routes).sort();
},
```
ALTERNATIVE: Extract the body to a private helper `function deriveRoutes(entries, fwdRoot)` at
module scope within NextJsAdapter.ts and call it from `enumerateRoutes`. Either approach is valid.

**slotMarker implementation** (D-05 — one-liner, `importSource` unused for Next.js):
```typescript
slotMarker(name: string, _importSource: string): boolean {
  return name === "children";
},
```

---

### `src/core/Analyzer.ts` (orchestrator, request-response + tree-transform)

**Analog:** `src/core/Analyzer.ts` (itself — 3 callsite replacements + 1 private method migration + deletion of 5 module-scope functions)

**Island rule import pattern** (lines 17–20) — new delegation calls must NOT add new imports here;
the existing `import type` with biome-ignore comments is the established pattern:
```typescript
// biome-ignore lint/style/noRestrictedImports: type-only import; erased at compile time (D-11 island invariant unaffected)
import type { ComponentDefinition, ParseContext, RenderNode, RouteMatch } from "../adapters/types.js";
// biome-ignore lint/style/noRestrictedImports: type-only import; erased at compile time (D-11 island invariant unaffected)
import type { FrameworkAdapter } from "../adapters/FrameworkAdapter.js";
```

**Existing adapter delegation pattern in traverse visitors** (lines 854–864 context) — `const ctx = this.ctx`
capture pattern is already established; new private method must use `const adapter = this.adapter`
before `traverse()` call (Pitfall 3 — `this` is not available inside non-arrow Babel visitor callbacks):
```typescript
// Pattern already used in Analyzer.ts for this.ctx in traverse:
const ctx = this.ctx;
traverse(ast, {
  SomeNode(path) {
    // uses ctx (captured), NOT this.ctx
  }
});
```

**collectChildrenSlotLines — migrate from module-scope function (line 495) to private class method:**

Before (lines 495–507, module-scope):
```typescript
function collectChildrenSlotLines(ast: t.File): Set<number> {
  const lines = new Set<number>();
  traverse(ast, {
    JSXExpressionContainer(path: { node: t.JSXExpressionContainer }) {
      const expr = path.node.expression;
      if (t.isIdentifier(expr) && expr.name === "children") {
        const line = path.node.loc?.start.line ?? 0;
        lines.add(line);
      }
    },
  });
  return lines;
}
```

After (private class method — inside Analyzer class body):
```typescript
private collectChildrenSlotLines(ast: t.File): Set<number> {
  const lines = new Set<number>();
  const adapter = this.adapter;   // capture before traverse (Pitfall 3)
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

**Callsite update in buildTreeForEntry** (line 844):
```typescript
// BEFORE:
const slotLines = collectChildrenSlotLines(cachedParse.ast);
// AFTER:
const slotLines = this.collectChildrenSlotLines(cachedParse.ast);
```

**isPageFile / isLayoutFile deletion and callsite replacements in buildRouteTree** (lines 896–902):
```typescript
// BEFORE (lines 896–902):
let pageFile: string | undefined;
for (let i = entries.length - 1; i >= 0; i--) {
  if (isPageFile(entries[i]!)) { pageFile = entries[i]; break; }
}
const layoutFiles = entries.filter((e) => isLayoutFile(e));

// AFTER:
let pageFile: string | undefined;
for (let i = entries.length - 1; i >= 0; i--) {
  if (this.adapter.classifyEntry(entries[i]!) === "page") { pageFile = entries[i]; break; }
}
const layoutFiles = entries.filter((e) => this.adapter.classifyEntry(e) === "layout");
```

**buildUnionIR replacement of two-call pattern** (lines 968–986):
```typescript
// BEFORE (lines 968–986):
private async buildUnionIR(): Promise<TreeNode[]> {
  let entries: string[];
  try {
    entries = await this.adapter.discoverEntries(this.root);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    this.ctx.warnings.push(`discoverEntries error: ${message}`);
    return [];
  }
  const routes = deriveRoutesFromEntries(entries, this.root);
  // ...
}

// AFTER:
private async buildUnionIR(): Promise<TreeNode[]> {
  let routes: string[];
  try {
    routes = await this.adapter.enumerateRoutes(this.root);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    this.ctx.warnings.push(`enumerateRoutes error: ${message}`);
    return [];
  }
  // ...
}
```

**Functions to DELETE from Analyzer.ts** (all are module-scope):
- `isPageFile` (lines 663–666)
- `isSpecialFile` (lines 668–671) — also used inside `deriveRoutesFromEntries` at line 1211 which is also being deleted
- `isLayoutFile` (lines 673–676)
- `deriveRoutesFromEntries` (lines 1194–1233)
- `collectChildrenSlotLines` (lines 491–507) — replaces with private class method

---

### `test/adapters/FrameworkAdapter.test.ts` (structural locking test)

**Analog:** Itself — update in place.

**Current test pattern** (lines 1–31) — Record trick enforces exhaustive coverage at compile time:
```typescript
import { describe, expect, it } from "vitest";
import type { FrameworkAdapter } from "../../src/adapters/FrameworkAdapter.js";

describe("ARCH-01 FrameworkAdapter shape", () => {
  it("interface has exactly 5 methods ...", () => {
    const stub: Record<keyof FrameworkAdapter, true> = {
      detect: true,
      discoverEntries: true,
      resolveModule: true,
      extractComponents: true,
      mapRouteToEntry: true,
    };
    expect(Object.keys(stub).sort()).toEqual([
      "detect",
      "discoverEntries",
      "extractComponents",
      "mapRouteToEntry",
      "resolveModule",
    ]);
    expect(Object.keys(stub)).toHaveLength(5);
  });
});
```

**Updated test pattern** (full replacement):
```typescript
import { describe, expect, it } from "vitest";
import type { FrameworkAdapter } from "../../src/adapters/FrameworkAdapter.js";

describe("ARCH-01 FrameworkAdapter shape", () => {
  it("interface has exactly 8 methods (detect, discoverEntries, resolveModule, extractComponents, mapRouteToEntry, classifyEntry, enumerateRoutes, slotMarker)", () => {
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
});
```

---

## Shared Patterns

### Island Rule (D-11) — Apply to all Analyzer.ts edits
**Source:** `src/core/Analyzer.ts` lines 17–20
**Apply to:** Every new line in Analyzer.ts that references adapter methods
```typescript
// Value-level imports from src/adapters/ are FORBIDDEN in src/core/.
// Access the adapter only via the already-injected `this.adapter` instance field.
// Type-only imports are allowed with the biome-ignore comment pattern shown above.
// New delegation calls follow: this.adapter.classifyEntry(...), this.adapter.enumerateRoutes(...),
// this.adapter.slotMarker(...) — no new import statements required.
```

### Traverse Visitor Capture Pattern — Apply to new private method
**Source:** `src/core/Analyzer.ts` (pattern inferred from existing `const ctx = this.ctx` captures)
**Apply to:** `private collectChildrenSlotLines` method in Analyzer.ts
```typescript
// Capture class fields before traverse() call — 'this' is not the class instance
// inside non-arrow Babel visitor callbacks.
const adapter = this.adapter;
traverse(ast, {
  SomeVisitor(path) {
    adapter.someMethod(...);   // OK — captured reference
    // this.adapter.someMethod(...);  // WRONG — 'this' is NodePath here
  },
});
```

### Adapter Object Literal Method Pattern — Apply to NextJsAdapter.ts additions
**Source:** `src/adapters/next/NextJsAdapter.ts` lines 42–105
**Apply to:** `classifyEntry`, `enumerateRoutes`, `slotMarker` additions
```typescript
export const NextJsAdapter: FrameworkAdapter = {
  // All methods defined as shorthand methods in the object literal.
  // Async methods use async/await. Sync methods are plain functions.
  // Methods that delegate to module-scope helpers follow the pattern:
  //   return helperFunction(arg);
  // The object literal satisfies FrameworkAdapter at the type level — TypeScript
  // will error at compile time if any required method is missing.
};
```

### Warning Push Pattern — Apply to buildUnionIR error handling
**Source:** `src/core/Analyzer.ts` lines 972–975
**Apply to:** `enumerateRoutes` catch block in `buildUnionIR`
```typescript
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  this.ctx.warnings.push(`enumerateRoutes error: ${message}`);
  return [];
}
```

---

## No Analog Found

None — all 4 files are modifications of existing files. No new files are created in this phase.

---

## Wave 0 Gap: `test/adapters/NextJsAdapter.test.ts`

The RESEARCH.md Validation Architecture section flags that this file may not yet exist. Before
planning, confirm:
```
Glob("test/adapters/NextJsAdapter.test.ts")
```
If absent, create it with the vitest pattern from `test/adapters/FrameworkAdapter.test.ts` (lines 1–2
for imports, `describe` / `it` structure). Required unit tests per RESEARCH.md:
- `classifyEntry("app/page.tsx") === "page"`
- `classifyEntry("app/layout.tsx") === "layout"`
- `classifyEntry("app/loading.tsx") === "special"`
- `classifyEntry("app/layout.tsx") !== "special"` (Pitfall 1 regression guard)
- `slotMarker("children", "react") === true`
- `slotMarker("Slot", "expo-router") === false`
- `enumerateRoutes` smoke test (sorted, no parallel-route entries)

---

## Metadata

**Analog search scope:** `src/adapters/`, `src/core/Analyzer.ts`, `test/adapters/`
**Files read:** 6 (FrameworkAdapter.ts, NextJsAdapter.ts, Analyzer.ts [targeted sections], discover.ts, FrameworkAdapter.test.ts)
**Pattern extraction date:** 2026-05-13
