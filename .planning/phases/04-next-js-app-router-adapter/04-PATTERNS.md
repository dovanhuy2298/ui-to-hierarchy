# Phase 4: Next.js App Router Adapter — Pattern Map

**Mapped:** 2026-04-29
**Files analyzed:** 16 (4 src + 6 test + ~6 fixture trees)
**Analogs found:** 16 / 16 (every new file has a strong same-tree precedent)

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `src/adapters/types.ts` *(modify)* | adapter-types | type-definition | self (existing file — append `RouteMatch`, add `runtime` field) | exact |
| `src/adapters/FrameworkAdapter.ts` *(modify)* | adapter-interface | type-definition | self (existing file — change `mapRouteToEntry` return type only) | exact |
| `src/adapters/next/NextJsAdapter.ts` *(modify)* | adapter-impl | orchestrator | self (existing file — replace 3 stub bodies + plumb `runtime`) | exact |
| `src/adapters/next/detect.ts` *(new)* | detection | filesystem-probe | `src/core/resolver/relative.ts` (`probeFile` — existence-probe in order) | role-match |
| `src/adapters/next/discover.ts` *(new)* | discovery | filesystem-glob | `src/core/resolver/relative.ts` + `src/core/paths.ts` (forward-slash + probe pattern) | role-match |
| `src/adapters/next/route-map.ts` *(new)* | route-mapping | tree-build + walk | `src/core/resolver/index.ts` (`resolveModule` orchestrator + `doResolve`) | role-match |
| `src/adapters/next/segments.ts` *(new)* | utility (classifier) | pure-function | `src/core/resolver/node-modules.ts` (regex-driven specifier classifier) | role-match |
| `test/adapters/types.test.ts` *(modify)* | test (shape) | unit | self (existing file — bump `12 → 13` count, add `runtime` literal) | exact |
| `test/adapters/next/NextJsAdapter.test.ts` *(modify)* | test (integration) | unit | self (existing file — drop "throws not implemented" assertion at lines 25–29) | exact |
| `test/adapters/next/detect.test.ts` *(new)* | test (unit) | request-response | `test/core/resolver/relative.test.ts` (path-existence + forward-slash assertions) | role-match |
| `test/adapters/next/discover.test.ts` *(new)* | test (unit) | request-response | `test/core/resolver/relative.test.ts` (fixture-tree + path-list assertions) | role-match |
| `test/adapters/next/route-map.test.ts` *(new)* | test (unit) | request-response | `test/core/resolver/barrel.test.ts` (multi-case fixture-driven walker tests) | partial-match |
| `test/adapters/next/runtime.test.ts` *(new)* | test (integration) | request-response | `test/adapters/next/NextJsAdapter.kitchen-sink.test.ts` (end-to-end via `extractComponents`) | exact |
| `test/fixtures/next-app-router/**` *(new)* | fixture (kitchen-sink) | static-files | `test/fixtures/parser/resolver/shadcn-barrel/**` (multi-file real-tree fixture) | role-match |
| `test/fixtures/next-detect-with-app/**`, `next-detect-with-src-app/**`, `next-detect-pages-only/**`, `next-detect-no-config/**` *(new)* | fixture (micro) | static-files | `test/fixtures/parser/resolver/multi-target/**` (fixture-per-variant pattern) | role-match |

---

## Pattern Assignments

### `src/adapters/types.ts` (modify — adapter-types)

**Analog:** self — `src/adapters/types.ts:202–233` (existing `ComponentDefinition` block) and `:250–255` (existing `ResolveResult` shape used as the discriminated-union model for `RouteMatch`).

**Field-add pattern (append `runtime` to `ComponentDefinition`)** — keep alphabetic-by-purpose order documented at lines 192–198 and the field-count check note at line 199:
```typescript
// extend lines 202–233 with:
export interface ComponentDefinition {
  // ...existing 11 fields (name … styledTemplates) unchanged...
  styledTemplates: StyledTemplate[];
  /**
   * Per-file Next.js runtime boundary (NEXT-04, D-10..D-13).
   * Read from `ast.program.directives[0]?.value.value`:
   *   - `"use client"` → `"client"`
   *   - `"use server"` or absent → `"server"` (App Router default)
   * Shared across every ComponentDefinition emitted from the same file.
   */
  runtime: "server" | "client";
}
```

**Type-add pattern (append `RouteMatch` after `ResolveResult`)** — mirror the doc-block style of `ResolveResult` (lines 240–249); D-02 four-field shape:
```typescript
/**
 * Output of `FrameworkAdapter.mapRouteToEntry(...)` (Phase 4, D-01..D-04).
 *
 * D-12 no-throw: any failure (route doesn't match, app/ missing, malformed
 * input) collapses to `{ matched: false, entries: [], params: {}, slots: {} }`.
 * Caller checks `matched`. Phase 5's toIR() consumes this shape.
 */
export interface RouteMatch {
  matched: boolean;
  entries: string[];                              // forward-slash absolute, root-down
  params: Record<string, string | string[]>;
  slots: Record<string, string[]>;
}
```

---

### `src/adapters/FrameworkAdapter.ts` (modify — adapter-interface)

**Analog:** self — `src/adapters/FrameworkAdapter.ts:20–47`.

**Signature-change pattern (line 46 only — preserves 5-method count, ARCH-01):**
```typescript
import type { ComponentDefinition, ParseContext, ResolveResult, RouteMatch } from "./types.js";

// ...existing detect/discoverEntries/resolveModule/extractComponents unchanged...

/** Map a route string to entries + params + slots (Phase 4, NEXT-01..03). */
mapRouteToEntry(absRoot: string, route: string): Promise<RouteMatch> | RouteMatch;
```
The existing `Promise<T> | T` union (lines 22, 25, 46) is reused — D-07 lets all four routing methods go async via `tinyglobby`.

---

### `src/adapters/next/NextJsAdapter.ts` (modify — adapter-impl)

**Analog:** self. Three replacement targets (lines 40, 44, 48 — currently `throw new Error("not implemented in Phase 3")`) plus one insertion inside `buildComponentDefinition` (lines 103–141).

**Imports pattern (lines 20–37) — extend with new sibling modules:**
```typescript
import type { ComponentDefinition, ParseContext, PropSignature, RenderNode, ResolveResult, RouteMatch } from "../types.js";
import { detect as detectNextProject } from "./detect.js";
import { discoverEntries as discoverNextEntries } from "./discover.js";
import { matchRoute } from "./route-map.js";
```

**Stub-replacement pattern — mirror the Phase 3 `resolveModule` thin-delegation shape (lines 52–59):**
```typescript
async detect(absRoot: string): Promise<boolean> {
  return detectNextProject(absRoot);
},

async discoverEntries(absRoot: string): Promise<string[]> {
  return discoverNextEntries(absRoot);
},

async mapRouteToEntry(absRoot: string, route: string): Promise<RouteMatch> {
  return matchRoute(absRoot, route);
},
```

**Runtime plumbing pattern (insert in `buildComponentDefinition` between line 119 `collectStyleSignals` and line 127 `return`):**
```typescript
// NEXT-04 / D-10..D-12: per-file directive read.
// Babel separates leading directive prologue from `body` automatically per ES spec,
// so `directives[0]` is the spec-correct "first non-comment string-literal statement".
const firstDirective = ast.program.directives[0]?.value.value;
const runtime: "server" | "client" =
  firstDirective === "use client" ? "client" : "server";

return {
  // existing 11 fields...
  styledTemplates: styleSignals.styledTemplates,
  runtime,
};
```

**Error/D-12 pattern preserved (lines 70–92 already model "synthetic ComponentDefinition with kind:'error' renderFlow"):** the new parse-error branch must also include `runtime: "server"` (default) on the synthetic record so the 12-field shape stays exhaustive.

---

### `src/adapters/next/detect.ts` (new — detection)

**Analog:** `src/core/resolver/relative.ts` (lines 24–48: `probeFile`) — same "iterate candidate paths in fixed order, return first hit, swallow exceptions" shape.

**Imports pattern — match research §"Detect heuristic (R5)" code example:**
```typescript
import { access } from "node:fs/promises";
import { join } from "node:path";
```
(No `toForwardSlash` needed here — return value is `boolean`. ESM `.js` import suffix convention is enforced project-wide.)

**Core pattern (no-throw probe loop, mirrors `probeFile` lines 28–47):**
```typescript
const NEXT_CONFIGS = ["next.config.js", "next.config.mjs", "next.config.cjs", "next.config.ts"];

export async function detect(absRoot: string): Promise<boolean> {
  let hasConfig = false;
  for (const name of NEXT_CONFIGS) {
    if (await exists(join(absRoot, name))) { hasConfig = true; break; }
  }
  if (!hasConfig) return false;
  if (await exists(join(absRoot, "app"))) return true;
  if (await exists(join(absRoot, "src", "app"))) return true;
  return false;
}

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}
```

**Error handling pattern (D-12 no-throw):** copy the try/catch idiom from `relative.ts:50–56` (`safeStatIsFile`) — collapse permission / ENOENT to `false`.

---

### `src/adapters/next/discover.ts` (new — discovery)

**Analog:** `src/core/resolver/relative.ts` (forward-slash discipline at line 31, 39, 44) + research §"Tinyglobby usage for `discoverEntries`" verified example.

**Imports pattern:**
```typescript
import { access } from "node:fs/promises";
import { join } from "node:path";
import { glob } from "tinyglobby";
import { toForwardSlash } from "../../core/paths.js";
```

**Core pattern (D-05/D-06/D-08/D-09 — single source of private-folder gating via glob ignore):**
```typescript
const SPECIAL = "{page,layout,template,loading,error,not-found,default}";
const EXTS = "{tsx,jsx,ts,js}";

export async function resolveAppRoot(absRoot: string): Promise<string | null> {
  for (const candidate of [join(absRoot, "app"), join(absRoot, "src", "app")]) {
    try { await access(candidate); return candidate; } catch { /* nope */ }
  }
  return null;
}

export async function discoverEntries(absRoot: string): Promise<string[]> {
  const appRoot = await resolveAppRoot(absRoot);
  if (!appRoot) return [];
  const matches = await glob([`**/${SPECIAL}.${EXTS}`], {
    cwd: appRoot,
    absolute: true,
    ignore: ["**/_*/**", "**/node_modules/**"],
    dot: false,
  });
  return matches
    .map(toForwardSlash)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
```

**Forward-slash pattern (D-08):** every emitted path passes through `toForwardSlash` before leaving the function — same rule applied at `relative.ts:31`, `:39`, `:44` (`toForwardSlash(path.resolve(candidate))`).

---

### `src/adapters/next/segments.ts` (new — utility / classifier)

**Analog:** `src/core/resolver/node-modules.ts` — pure regex-driven classifier returning a discriminated record (`packageNameFromSpecifier` etc.). No I/O.

**Core pattern (research §"Pattern Segment-tree route matching" + §"Dynamic Segment Matching Rules" extractParam):**
```typescript
export type SegmentKind =
  | { kind: "static"; name: string }
  | { kind: "dynamic"; param: string }
  | { kind: "catch-all"; param: string }
  | { kind: "optional-catch-all"; param: string }
  | { kind: "group"; label: string }
  | { kind: "parallel"; slot: string }
  | { kind: "intercepting"; level: 0 | 1 | 2 | "root"; targetSegment: string }
  | { kind: "private"; name: string };

export function classifySegment(folder: string): SegmentKind {
  // [[...opt]]  →  optional-catch-all
  // [...rest]   →  catch-all
  // [slug]      →  dynamic
  // (group)     →  group
  // @slot       →  parallel
  // (.)x / (..)x / (...)x / (..)(..)x → intercepting
  // _internal   →  private
  // anything-else → static
}
```
Discriminated-union return shape mirrors `ResolveResult` (`src/adapters/types.ts:250–255`) — no throws, every input maps to exactly one variant.

---

### `src/adapters/next/route-map.ts` (new — route-mapping)

**Analog:** `src/core/resolver/index.ts` — same "outer cached entry function delegating to inner orchestrator that builds an in-memory model from one I/O pass and walks it" shape (`resolveModule` → `doResolve` at lines 40–53 / 109–187).

**Imports pattern:**
```typescript
import { glob } from "tinyglobby";
import { toForwardSlash } from "../../core/paths.js";
import type { RouteMatch } from "../types.js";
import { classifySegment, type SegmentKind } from "./segments.js";
import { resolveAppRoot } from "./discover.js";
```

**Core orchestrator pattern (mirrors `resolveModule` flow: I/O → build model → walk → discriminated return):**
```typescript
interface SegmentNode {
  segment: SegmentKind;
  children: Map<string, SegmentNode>;
  files: Partial<Record<"page" | "layout" | "template" | "loading" | "error" | "notFound" | "default", string>>;
  parallelSiblings: Map<string, SegmentNode>;   // @slot subtrees keyed by slot name
}

export async function matchRoute(absRoot: string, route: string): Promise<RouteMatch> {
  const empty: RouteMatch = { matched: false, entries: [], params: {}, slots: {} };
  if (typeof route !== "string" || !route.startsWith("/")) return empty;          // D-12: malformed input
  const appRoot = await resolveAppRoot(absRoot);
  if (!appRoot) return empty;
  const files = await glob([`**/{page,layout,template,loading,error,not-found,default}.{tsx,jsx,ts,js}`], {
    cwd: appRoot, absolute: true, ignore: ["**/_*/**", "**/node_modules/**"], dot: false,
  });
  const tree = buildTree(files.map(toForwardSlash), toForwardSlash(appRoot));
  return walk(tree, splitRoute(route));
}
```

**No-throw / no-match pattern (D-12, D-03):** every early return uses the same `empty` literal. Mirrors `resolveModule` returning `{ ok: false, kind: "not-found", ... }` rather than throwing.

**Per-call cache pattern:** the segment tree is a local variable, GC'd when `matchRoute` returns — matches the per-call `astCache` / `resolverCache` pattern from `ParseContext` (types.ts:291–297) and respects ARCH-02 (no cross-call cache).

---

### `test/adapters/types.test.ts` (modify — test/shape)

**Analog:** self (existing file).

**Change pattern (lines 16, 17–30, 31–47):** add one literal field, bump two count assertions:
```typescript
// in the literal (after styledTemplates: []):
runtime: "server",

// in the sorted-keys array (insert "runtime" alphabetically — between "renderFlow" and "styledTemplates"):
"renderFlow", "runtime", "styledTemplates", ...

// final length:
expect(Object.keys(value)).toHaveLength(13);

// describe text:
it("has all 13 locked fields", () => { ... });
```

---

### `test/adapters/next/NextJsAdapter.test.ts` (modify — test/integration)

**Analog:** self.

**Removal pattern (lines 25–29):** delete the `'detect / discoverEntries / mapRouteToEntry throw "not implemented in Phase 3"'` test entirely. Replace with a positive smoke test that mirrors `extractComponents returns ComponentDefinition[]` shape (lines 31–64) but exercises the now-real routing methods against the kitchen-sink fixture.

**Field-shape update (lines 48–63):** the sorted-keys array must include `"runtime"` and length comment must match the new 13-field shape.

---

### `test/adapters/next/detect.test.ts` (new — test/unit)

**Analog:** `test/core/resolver/relative.test.ts` (lines 1–25). Same shape — fixture-tree-based existence assertions.

**Imports + ctx pattern:**
```typescript
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detect } from "../../../src/adapters/next/detect.js";

describe("R5 NextJsAdapter.detect heuristic", () => {
  const fx = (name: string) => path.resolve(`test/fixtures/${name}`);

  it("returns true for project with next.config.mjs + app/", async () => {
    expect(await detect(fx("next-detect-with-app"))).toBe(true);
  });
  it("returns true for project with next.config.* + src/app/", async () => {
    expect(await detect(fx("next-detect-with-src-app"))).toBe(true);
  });
  it("returns false for Pages-Router-only project", async () => {
    expect(await detect(fx("next-detect-pages-only"))).toBe(false);
  });
  it("returns false when no next.config.* present", async () => {
    expect(await detect(fx("next-detect-no-config"))).toBe(false);
  });
});
```

---

### `test/adapters/next/discover.test.ts` (new — test/unit)

**Analog:** `test/core/resolver/relative.test.ts` — same fixture-driven, list-shape assertions; forward-slash discipline asserted same way (`hit?.includes("\\")` style, `relative.test.ts:12, 19`).

**Core test pattern:**
```typescript
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverEntries } from "../../../src/adapters/next/discover.js";

const ROOT = path.resolve("test/fixtures/next-app-router");

describe("R6 NextJsAdapter.discoverEntries", () => {
  it("returns lex-sorted forward-slash absolute paths to all special files", async () => {
    const out = await discoverEntries(ROOT);
    expect(out.every((p) => !p.includes("\\"))).toBe(true);
    expect(out).toEqual([...out].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });
  it("excludes _private folders", async () => {
    const out = await discoverEntries(ROOT);
    expect(out.some((p) => p.includes("/_internal/"))).toBe(false);
  });
  it("includes (group) and @slot folder contents", async () => {
    const out = await discoverEntries(ROOT);
    expect(out.some((p) => p.includes("/(marketing)/"))).toBe(true);
    expect(out.some((p) => p.includes("/@modal/"))).toBe(true);
  });
});
```

---

### `test/adapters/next/route-map.test.ts` (new — test/unit)

**Analog:** `test/core/resolver/barrel.test.ts` (multi-case fixture-driven walker tests). Same shape: one `describe` block per requirement, each case asserts a shape on the walker output.

**Core test pattern (covers NEXT-01/02/03 — keyed by `-t` filters in the research §"Phase Requirements → Test Map" table):**
```typescript
import path from "node:path";
import { describe, expect, it } from "vitest";
import { matchRoute } from "../../../src/adapters/next/route-map.js";

const ROOT = path.resolve("test/fixtures/next-app-router");

describe("NEXT-01 layout chain", () => {
  it("returns root-down chain with siblings for /dashboard/settings", async () => {
    const m = await matchRoute(ROOT, "/dashboard/settings");
    expect(m.matched).toBe(true);
    expect(m.entries[0]).toMatch(/app\/layout\.tsx$/);
    expect(m.entries.at(-1)).toMatch(/app\/dashboard\/settings\/page\.tsx$/);
  });
});

describe("NEXT-02 conventions", () => {
  it("group (marketing) contributes layout but no URL segment", async () => {
    const m = await matchRoute(ROOT, "/about");
    expect(m.matched).toBe(true);
    expect(m.entries.some((p) => p.includes("/(marketing)/layout"))).toBe(true);
  });
  it("@modal appears in slots, not entries", async () => {
    const m = await matchRoute(ROOT, "/login");
    expect(m.slots.modal?.[0]).toMatch(/@modal\/login\/page/);
  });
  it("(.)photo intercepts sibling segment", async () => { /* ... */ });
  it("_private excluded everywhere", async () => { /* ... */ });
});

describe("NEXT-03 params", () => {
  it("[slug] → string param", async () => {
    const m = await matchRoute(ROOT, "/blog/hello");
    expect(m.params).toEqual({ slug: "hello" });
  });
  it("[...rest] → string[] param", async () => {
    const m = await matchRoute(ROOT, "/files/a/b/c");
    expect(m.params).toEqual({ rest: ["a", "b", "c"] });
  });
  it("[[...opt]] matches both /maybe and /maybe/x", async () => { /* ... */ });
  it("returns matched:false on malformed route", async () => {
    expect((await matchRoute(ROOT, "hello")).matched).toBe(false);
  });
});
```

---

### `test/adapters/next/runtime.test.ts` (new — test/integration)

**Analog:** `test/adapters/next/NextJsAdapter.kitchen-sink.test.ts` (lines 1–67) — same `extractComponents`-via-fixture end-to-end shape with `ParseContext` builder.

**Imports + ctx helper pattern (verbatim shape from kitchen-sink.test.ts:1–16):**
```typescript
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NextJsAdapter } from "../../../src/adapters/next/NextJsAdapter.js";
import type { ParseContext } from "../../../src/adapters/types.js";

function ctx(): ParseContext {
  return {
    resolvedRoot: path.resolve("."),
    tsconfig: null,
    astCache: new Map(),
    resolverCache: new Map(),
    warnings: [],
  };
}
```

**Core test pattern (covers D-16's four directive variants):**
```typescript
const FX = (rel: string) => path.resolve("test/fixtures/next-app-router", rel);

describe("NEXT-04 runtime boundary detection", () => {
  it('"use client" first line → runtime: "client"', () => {
    const c = ctx();
    const comps = NextJsAdapter.extractComponents(c, [FX("app/(marketing)/about/page.tsx")]);
    expect(comps[0]?.runtime).toBe("client");
  });
  it('no directive → runtime: "server"', () => { /* ... */ });
  it('"use server" → runtime: "server" (D-12 server-actions module)', () => { /* ... */ });
  it("leading comments before directive still detected", () => { /* ... */ });
  it("all components from same file share runtime value (per-file scope)", () => { /* ... */ });
});
```

---

### `test/fixtures/next-app-router/**` (new — fixture / kitchen-sink)

**Analog:** `test/fixtures/parser/resolver/shadcn-barrel/**` — multi-directory real-on-disk tree; D-15 ("real on-disk files, not generated programmatically") explicitly invokes this precedent.

**Tree-shape pattern (literal SPEC acceptance examples per D-14 + specifics §):**
```
test/fixtures/next-app-router/
├── next.config.mjs                      # for detect() positive case
├── app/
│   ├── layout.tsx                       # root layout
│   ├── page.tsx                         # root page
│   ├── (marketing)/
│   │   ├── layout.tsx
│   │   └── about/page.tsx               # → /about
│   ├── @modal/
│   │   └── login/page.tsx               # → slots.modal
│   ├── dashboard/
│   │   ├── layout.tsx
│   │   └── settings/
│   │       ├── layout.tsx
│   │       └── page.tsx                 # → /dashboard/settings
│   ├── feed/
│   │   └── (.)photo/[id]/page.tsx       # intercepting → app/photo
│   ├── photo/[id]/page.tsx              # intercepting target sibling
│   ├── blog/[slug]/page.tsx             # → params.slug
│   ├── files/[...rest]/page.tsx         # → params.rest
│   ├── maybe/[[...opt]]/page.tsx        # → params.opt (both /maybe and /maybe/x)
│   └── _internal/
│       └── scratch.tsx                  # private, excluded everywhere
```

**File-content pattern (each leaf .tsx is a minimal default-exported component — mirror `test/fixtures/parser/extractors/kitchen-sink.tsx` lines 9–15 brevity):**
```tsx
// app/(marketing)/about/page.tsx — D-16 "use client" line-1 case
"use client";
export default function About() { return <div>about</div>; }

// app/dashboard/page.tsx — D-16 no-directive case
export default function Dashboard() { return <div>dashboard</div>; }

// app/blog/[slug]/page.tsx — D-16 "use server" case
"use server";
export default function Blog() { return <div>blog</div>; }

// app/maybe/[[...opt]]/page.tsx — D-16 leading-comments + directive case
// banner comment
/* block comment */
"use client";
export default function Maybe() { return <div>maybe</div>; }
```

---

### `test/fixtures/next-detect-*/**` (new — fixture / micro)

**Analog:** `test/fixtures/parser/resolver/multi-target/**` — small per-variant project trees with their own `tsconfig.json`. Same pattern: one fixture per detection scenario.

**Tree-shape pattern (4 variants per SPEC R5):**
```
test/fixtures/next-detect-with-app/
├── next.config.mjs       (empty file is fine — detect only fs.access's it)
└── app/
    └── page.tsx          (any content)

test/fixtures/next-detect-with-src-app/
├── next.config.js
└── src/app/
    └── page.tsx

test/fixtures/next-detect-pages-only/
├── next.config.js
└── pages/
    └── index.tsx         (no app/, no src/app/)

test/fixtures/next-detect-no-config/
└── app/                  (app/ exists but no next.config.*)
    └── page.tsx
```

**File-content pattern:** every `next.config.*` can be empty (`detect()` only does `fs.access`, never imports — verified in research §"Detect heuristic" + Security §V12 mitigation). Every `page.tsx` can be a one-liner default export.

---

## Shared Patterns

### Forward-slash discipline (D-08)

**Source:** `src/core/paths.ts:15–17` (`toForwardSlash`).
**Apply to:** `discover.ts`, `route-map.ts`, every test file (in assertions like `expect(p.includes("\\")).toBe(false)`).
```typescript
export function toForwardSlash(p: string): string {
  return p.split(path.sep).join("/").replaceAll("\\", "/");
}
```
Already imported by `NextJsAdapter.ts:31` and `relative.ts:3`. Every path that leaves a Phase 4 module passes through this function — single point of truth.

### D-12 no-throw error handling

**Source:** `src/core/resolver/relative.ts:50–56` (`safeStatIsFile`) + `src/adapters/types.ts:250–255` (`ResolveResult` discriminated union).
**Apply to:** `detect.ts` (`exists` helper), `discover.ts` (`resolveAppRoot` try/catch), `route-map.ts` (every early-return uses the `empty: RouteMatch` literal).
```typescript
async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}
```
Permission errors, ENOENT, malformed inputs all collapse to a benign return shape. Mirrors how `resolveModule` returns `{ ok: false, kind: "not-found", ... }` instead of throwing.

### ESM `.js` import suffixes

**Source:** every existing file under `src/`. Project-wide convention enforced by `"type": "module"` + `moduleResolution: "bundler"`.
**Apply to:** every new `src/adapters/next/*.ts` import statement and every new `test/adapters/next/*.test.ts` import — including imports of modules whose file extension is `.ts` on disk (the `.js` suffix is required at the import site).

### Per-call cache (no cross-call state, ARCH-02)

**Source:** `src/adapters/types.ts:291–297` (`ParseContext` `astCache` / `resolverCache` are per-call) + `src/adapters/next/NextJsAdapter.test.ts:6–14` (`ctx()` builder constructs a fresh context per test).
**Apply to:** `route-map.ts` — the in-memory segment tree is a local variable inside `matchRoute`, GC'd on return. No module-level mutable state, no `Map<absRoot, tree>` cache. Tests do not need an `astCache` for routing methods (the segment tree is built from glob results, not from parsed ASTs).

### Vitest test-file shape

**Source:** `test/adapters/next/NextJsAdapter.kitchen-sink.test.ts:1–16` (imports + ctx builder) and `test/core/resolver/relative.test.ts:1–25` (fixture-path constant + per-case `it` block).
**Apply to:** all four new `test/adapters/next/*.test.ts` files. Standard `import { describe, expect, it } from "vitest"` import line; one `describe` per requirement (R5/R6/NEXT-01/02/03/04); fixture root computed once via `path.resolve("test/fixtures/...")` constant at top of file.

---

## No Analog Found

**None.** Every new file maps onto a same-tree precedent:

- `detect.ts`, `discover.ts` → `relative.ts` shape (fs probe + forward-slash + no-throw)
- `route-map.ts` → `resolver/index.ts` shape (orchestrator → inner walk → discriminated return)
- `segments.ts` → `node-modules.ts` shape (regex-driven pure classifier)
- `route-map.test.ts` → `barrel.test.ts` shape (multi-case fixture walker)
- `runtime.test.ts` → `kitchen-sink.test.ts` shape (extractComponents end-to-end)
- `next-app-router/**` → `shadcn-barrel/**` shape (multi-dir on-disk fixture tree)
- `next-detect-*/` → `multi-target/` shape (per-variant micro fixtures)

---

## Metadata

**Analog search scope:** `src/adapters/`, `src/core/resolver/`, `src/core/parser/`, `src/core/paths.ts`, `test/adapters/`, `test/core/resolver/`, `test/architecture/`, `test/fixtures/parser/`.
**Files scanned:** ~28 (3 adapter src, 5 resolver src, 1 parser src, 1 paths src, 4 adapter tests, 3 resolver tests, 1 architecture test, ~11 fixture trees inspected at directory level).
**Pattern extraction date:** 2026-04-29
