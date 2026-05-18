# Phase 12: ExpoRouterAdapter Routing & RN Primitives — Pattern Map

**Mapped:** 2026-05-18
**Files analyzed:** 9 (5 new, 2 modified, 2 new test files referenced)
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/core/import-bindings.ts` | utility | transform | `src/core/Analyzer.ts` lines 124–160 | exact (extract verbatim) |
| `src/adapters/expo/discover.ts` | utility | file-I/O | `src/adapters/next/discover.ts` | exact (mirror with priority reversal) |
| `src/adapters/expo/segments.ts` | utility | transform | `src/adapters/next/segments.ts` | role-match (drop intercepting/parallel/private; rename `param`→`name`) |
| `src/adapters/expo/route-map.ts` | utility | file-I/O | `src/adapters/next/route-map.ts` | role-match (simpler: linear scan, no parallel slots) |
| `src/adapters/expo/rn-primitives.ts` | utility | transform | `src/adapters/next/segments.ts` (allowlist shape) | partial-match (allowlist + helper function shape) |
| `src/adapters/expo/ExpoRouterAdapter.ts` | adapter | request-response | `src/adapters/next/NextJsAdapter.ts` | exact (fill stubs using same orchestration pattern) |
| `src/core/Analyzer.ts` | orchestrator | request-response | self | self-modification (extend `collectChildrenSlotLines`) |
| `test/adapters/expo/segments.test.ts` | test | — | `test/adapters/next/route-map.test.ts` lines 1–60 | exact |
| `test/adapters/expo/discover.test.ts` | test | — | `test/adapters/next/discover.test.ts` lines 1–60 | exact |

---

## Pattern Assignments

### `src/core/import-bindings.ts` (utility, transform)

**Analog:** `src/core/Analyzer.ts` (extract from lines 124–160)

**Imports pattern** — copy from `src/core/Analyzer.ts` lines 22–25:
```typescript
import * as t from "@babel/types";
import { traverse } from "./babel-shim.js";
```

**Core pattern** — extract verbatim from `src/core/Analyzer.ts` lines 135–160. The `interface ImportBinding` and `function collectImportBindings` must become top-level named exports. Remove the `function` keyword and add `export`:

```typescript
// src/core/Analyzer.ts lines 135–160 — move verbatim, add `export` to both
export interface ImportBinding {
  source: string;
  importedName: string;
}

export function collectImportBindings(ast: t.File): Map<string, ImportBinding> {
  const out = new Map<string, ImportBinding>();
  traverse(ast, {
    ImportDeclaration(path: { node: t.ImportDeclaration }) {
      const source = path.node.source.value;
      for (const spec of path.node.specifiers) {
        if (t.isImportSpecifier(spec)) {
          const localName = spec.local.name;
          const importedName = t.isIdentifier(spec.imported)
            ? spec.imported.name
            : spec.imported.value;
          out.set(localName, { source, importedName });
        } else if (t.isImportDefaultSpecifier(spec)) {
          out.set(spec.local.name, { source, importedName: "default" });
        }
        // ImportNamespaceSpecifier intentionally skipped (v1 carve-out).
      }
    },
  });
  return out;
}
```

**Island rule:** This file must contain ZERO imports from `src/adapters/`. `traverse` must be imported from `./babel-shim.js` (never directly from `@babel/traverse`).

---

### `src/core/Analyzer.ts` (modify — extend `collectChildrenSlotLines`)

**Analog:** self (lines 1153–1174)

**Change:** After the refactor imports `collectImportBindings` from `../../core/import-bindings.js` (remove internal definition at lines 135–160), extend `collectChildrenSlotLines` to add a second visitor alongside the existing `JSXExpressionContainer` visitor.

**Current pattern** — `src/core/Analyzer.ts` lines 1153–1174:
```typescript
private collectChildrenSlotLines(ast: t.File): Set<number> {
  const lines = new Set<number>();
  const adapter = this.adapter;
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

**Extended pattern** — add `JSXOpeningElement` visitor to the same `traverse` call (same `lines`, `adapter`, `bindings` captures):
```typescript
JSXOpeningElement(path: { node: t.JSXOpeningElement }) {
  const nameNode = path.node.name;
  if (t.isJSXIdentifier(nameNode)) {
    const binding = bindings.get(nameNode.name);
    const importSource = binding?.source ?? "";
    if (adapter.slotMarker(nameNode.name, importSource)) {
      const line = path.node.loc?.start.line ?? 0;
      lines.add(line);
    }
  }
},
```

**Import change** — replace the internal `ImportBinding` interface and `collectImportBindings` function (lines 135–160) with:
```typescript
import { collectImportBindings } from "./import-bindings.js";
import type { ImportBinding } from "./import-bindings.js";
```

---

### `src/adapters/expo/discover.ts` (utility, file-I/O)

**Analog:** `src/adapters/next/discover.ts`

**Imports pattern** — copy from `src/adapters/next/discover.ts` lines 13–16 (same imports, same pattern):
```typescript
import { access } from "node:fs/promises";
import { join } from "node:path";
import { glob } from "tinyglobby";
import { toForwardSlash } from "../../core/paths.js";
```

**`resolveExpoRoot` pattern** — mirrors `resolveAppRoot` from `src/adapters/next/discover.ts` lines 25–35, **but with reversed candidate order** (D-08: `src/app` wins):
```typescript
// src/adapters/next/discover.ts lines 25–35 — COPY but reverse candidate order
export async function resolveExpoRoot(absRoot: string): Promise<string | null> {
  // src/app takes priority over app/ (D-08 — reversed from Next.js)
  for (const candidate of [join(absRoot, "src", "app"), join(absRoot, "app")]) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      /* not found */
    }
  }
  return null;
}
```

**`discoverEntries` pattern** — mirrors `src/adapters/next/discover.ts` lines 37–51, with different glob pattern (all `.tsx/.jsx/.ts/.js`, not just special-named files) and different ignore list (D-07):
```typescript
// src/adapters/next/discover.ts lines 37–51 — COPY and adapt glob + ignore
export async function discoverEntries(absRoot: string): Promise<string[]> {
  const appRoot = await resolveExpoRoot(absRoot);
  if (!appRoot) return [];

  const matches = await glob(["**/*.{tsx,jsx,ts,js}"], {
    cwd: appRoot,
    absolute: true,
    ignore: [
      "**/components/**",
      "**/hooks/**",
      "**/utils/**",
      "**/node_modules/**",
    ],
    dot: false,
  });

  return matches
    .map(toForwardSlash)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
```

**Warning channel pattern (D-08 dual-root warning):** Store in instance-level `pendingWarnings: string[]` on `ExpoRouterAdapter`. `discoverEntries` is a standalone function here — the dual-root detection must be implemented inside `ExpoRouterAdapter.discoverEntries()` (the adapter method wrapper), which calls `resolveExpoRoot` internally and pushes to `this.pendingWarnings` before delegating to the standalone `discoverEntries`. Flush `pendingWarnings` into `ctx.warnings` at the start of `extractComponents`.

---

### `src/adapters/expo/segments.ts` (utility, transform)

**Analog:** `src/adapters/next/segments.ts`

**Imports pattern** — none needed (pure functions, no imports).

**Core pattern** — copy regex constants from `src/adapters/next/segments.ts` lines 23–25, drop Next.js-only patterns (intercepting, parallel, private), add `RX_SPECIAL`, rename return field from `param` to `name` (D-11):

```typescript
// src/adapters/next/segments.ts lines 23–31 — COPY these three regexes
const RX_OPTIONAL_CATCH_ALL = /^\[\[\.\.\.([^\]]+)\]\]$/;
const RX_CATCH_ALL = /^\[\.\.\.([^\]]+)\]$/;
const RX_DYNAMIC = /^\[([^\]]+)\]$/;
// src/adapters/next/segments.ts line 32 — COPY group regex
const RX_GROUP = /^\(([^)]+)\)$/;
// ADD: Expo-specific special files (+not-found, +html, +api)
const RX_SPECIAL = /^\+/;
```

**`ExpoSegment` type** — distinct from `SegmentKind`; uses `name` not `param`:
```typescript
// Different from src/adapters/next/segments.ts SegmentKind — uses `name` field throughout
export type ExpoSegment =
  | { kind: "static"; name: string }
  | { kind: "dynamic"; name: string }
  | { kind: "catch-all"; name: string }
  | { kind: "optional-catch-all"; name: string }
  | { kind: "group"; name: string }
  | { kind: "index" }
  | { kind: "special"; name: string };
```

**`parseSegment` function** — mirrors `classifySegment` from `src/adapters/next/segments.ts` lines 34–58, but simpler (strip extension first, no intercepting/parallel/private branches):
```typescript
// src/adapters/next/segments.ts lines 34–58 — COPY structure, adapt field names and add cases
export function parseSegment(dir: string): ExpoSegment {
  const bare = dir.replace(/\.(tsx|jsx|ts|js)$/, "");
  if (bare === "index") return { kind: "index" };
  let m: RegExpExecArray | null;
  if ((m = RX_OPTIONAL_CATCH_ALL.exec(bare))) return { kind: "optional-catch-all", name: m[1]! };
  if ((m = RX_CATCH_ALL.exec(bare))) return { kind: "catch-all", name: m[1]! };
  if ((m = RX_DYNAMIC.exec(bare))) return { kind: "dynamic", name: m[1]! };
  if ((m = RX_GROUP.exec(bare))) return { kind: "group", name: m[1]! };
  if (RX_SPECIAL.test(bare)) return { kind: "special", name: bare };
  return { kind: "static", name: bare };
}
```

---

### `src/adapters/expo/route-map.ts` (utility, file-I/O)

**Analog:** `src/adapters/next/route-map.ts`

**Imports pattern** — copy from `src/adapters/next/route-map.ts` lines 26–30, adapt module paths:
```typescript
import { glob } from "tinyglobby";
import { toForwardSlash } from "../../core/paths.js";
import type { RouteMatch } from "../types.js";
import { resolveExpoRoot } from "./discover.js";
import { parseSegment } from "./segments.js";
```

**No-throw contract** — copy `cloneEmpty()` from `src/adapters/next/route-map.ts` lines 57–59:
```typescript
// src/adapters/next/route-map.ts lines 57–59 — copy verbatim
function cloneEmpty(): RouteMatch {
  return { matched: false, entries: [], params: {}, slots: {} };
}
```

**`enumerateRoutes` helper** — mirrors `NextJsAdapter.enumerateRoutes` from `src/adapters/next/NextJsAdapter.ts` lines 72–112, adapted for Expo (use `parseSegment` instead of inline regex, skip `group` kind instead of group-shaped regex):
```typescript
// src/adapters/next/NextJsAdapter.ts lines 87–110 — COPY the route building loop, adapt
for (const entry of entries) {
  // ... get rel path from appRoot
  const parts = rel.split("/");
  parts.pop(); // remove filename
  const routeSegments: string[] = [];
  let skip = false;
  for (const part of parts) {
    const seg = parseSegment(part);
    if (seg.kind === "group") continue;        // groups transparent in URL
    if (seg.kind === "special") { skip = true; break; }  // +not-found not a route
    if (seg.kind === "index") continue;
    if (seg.kind === "static") routeSegments.push(seg.name);
    if (seg.kind === "dynamic") routeSegments.push(`[${seg.name}]`);
    if (seg.kind === "catch-all") routeSegments.push(`[...${seg.name}]`);
    if (seg.kind === "optional-catch-all") routeSegments.push(`[[...${seg.name}]]`);
  }
  // ... also handle index in filename
}
```

**`mapRouteToEntry` pattern** — Expo uses a simpler linear scan (no parallel slots, no tree structure needed). Instead of the full tree-walk from `src/adapters/next/route-map.ts`, use a linear walk: for each path level from appRoot to page file, check if a `_layout.tsx` exists at that level and add it to the chain. This is the `buildLayoutChain` helper pattern:
```typescript
// Linear layout chain — simpler than Next.js tree walk; no parallel slots in v1
export async function mapRouteToEntry(absRoot: string, route: string): Promise<RouteMatch> {
  if (typeof route !== "string" || !route.startsWith("/")) return cloneEmpty();
  // ... resolve appRoot, find matching page file, collect _layout.tsx at each dir level
  // Return { matched: true, entries: [...layouts, pageFile], params: {}, slots: {} }
}
```

---

### `src/adapters/expo/rn-primitives.ts` (utility, transform)

**Analog:** `src/adapters/next/segments.ts` (allowlist + helper shape); `src/core/import-bindings.ts` (import)

**Imports pattern:**
```typescript
import type { ImportBinding } from "../../core/import-bindings.js";
```

**Core pattern — allowlist + helper:**
```typescript
// No analog in codebase — new pattern; shape derived from RESEARCH.md Pattern 7
export const RN_PRIMITIVES = new Set([
  "View", "Text", "ScrollView", "Image", "Pressable",
  "TouchableOpacity", "TouchableHighlight", "TouchableWithoutFeedback",
  "FlatList", "SectionList", "Modal", "KeyboardAvoidingView", "SafeAreaView",
]);

export function isRNPrimitive(tagName: string, importSource: string): boolean {
  return RN_PRIMITIVES.has(tagName) && importSource === "react-native";
}
```

**Island rule:** This file may import from `../../core/import-bindings.js`. It must NOT be imported from `src/core/`.

---

### `src/adapters/expo/ExpoRouterAdapter.ts` (adapter, request-response)

**Analog:** `src/adapters/next/NextJsAdapter.ts`

**Current stub location:** `src/adapters/expo/ExpoRouterAdapter.ts` (all 8 methods, lines 1–82)

**Class vs object shape:** `ExpoRouterAdapter` is a class (Phase 11 decision); `NextJsAdapter` is a plain object. Pattern remains the same per-method — no structural change needed.

**Imports pattern** — copy structure from `src/adapters/next/NextJsAdapter.ts` lines 19–40, adapt to expo modules:
```typescript
// src/adapters/next/NextJsAdapter.ts lines 19–40 — COPY and adapt
import * as t from "@babel/types";
import type { FrameworkAdapter } from "../FrameworkAdapter.js";
import type { ComponentDefinition, ParseContext, ResolveResult, RouteMatch } from "../types.js";
import { parseFile } from "../../core/parser/index.js";
import { toForwardSlash } from "../../core/paths.js";
import { discoverComponents } from "../../core/render-flow/component-detect.js";
import { walkRenderFlow } from "../../core/render-flow/index.js";
import { resolveModule as coreResolveModule } from "../../core/resolver/index.js";
import { traverse } from "../../core/babel-shim.js";
import { collectImportBindings } from "../../core/import-bindings.js";
import { discoverEntries as expoDiscoverEntries, resolveExpoRoot } from "./discover.js";
import { parseSegment } from "./segments.js";
import { mapRouteToEntry as expoMapRouteToEntry, enumerateRoutes as expoEnumerateRoutes } from "./route-map.js";
import { isRNPrimitive, RN_PRIMITIVES } from "./rn-primitives.js";
```

**`classifyEntry` pattern** — copy from `src/adapters/next/NextJsAdapter.ts` lines 64–70, adapt for Expo basename patterns:
```typescript
// src/adapters/next/NextJsAdapter.ts lines 64–69 — COPY structure, replace regexes
classifyEntry(absPath: string): "page" | "layout" | "special" | "other" {
  const base = toForwardSlash(absPath).split("/").pop() ?? "";
  if (/^_layout\.(tsx|jsx|ts|js)$/.test(base)) return "layout";
  if (/^\+not-found\.(tsx|jsx|ts|js)$/.test(base)) return "special";
  if (/^\+/.test(base)) return "other";
  return "page";
},
```

**`enumerateRoutes` pattern** — copy delegation pattern from `src/adapters/next/NextJsAdapter.ts` lines 72–112:
```typescript
// src/adapters/next/NextJsAdapter.ts lines 72–112 — COPY the delegation pattern
async enumerateRoutes(absRoot: string): Promise<string[]> {
  return expoEnumerateRoutes(absRoot);
},
```

**`extractComponents` pattern** — copy full method from `src/adapters/next/NextJsAdapter.ts` lines 118–158, then add Expo-specific post-processing (RN primitive override, namespace import warning, `<Tabs.Screen>`/`<Stack.Screen>` walker):
```typescript
// src/adapters/next/NextJsAdapter.ts lines 118–158 — COPY as starting skeleton
extractComponents(
  ctx: ParseContext,
  entryFiles: string[],
  opts: { fullClasses?: boolean } = {},
): ComponentDefinition[] {
  // Flush pending warnings from discoverEntries (D-08 dual-root warning)
  for (const w of this.pendingWarnings) ctx.warnings.push(w);
  this.pendingWarnings = [];

  const out: ComponentDefinition[] = [];
  for (const absPath of entryFiles) {
    const fwdFile = toForwardSlash(absPath);
    const parsed = parseFile(ctx, absPath);
    if (parsed.kind === "error") {
      // ... same error path as NextJsAdapter lines 128–151
    }
    const bindings = collectImportBindings(parsed.ast);
    // Namespace import warning (SPEC Req 10)
    // ... traverse for ImportNamespaceSpecifier from "react-native"
    const components = discoverComponents(parsed.ast);
    for (const comp of components) {
      // buildComponentDefinition equivalent + RN primitive post-processing
    }
  }
  return out;
},
```

**`walkAst` + `collectJsxElements` utilities** — copy verbatim from `src/adapters/next/NextJsAdapter.ts` lines 219–259. These are private helpers needed for the `<Tabs.Screen>`/`<Stack.Screen>` walker.

**Pending warnings field** — add to class body:
```typescript
private pendingWarnings: string[] = [];
```

**`slotMarker` — do NOT change** (already correct at lines 79–81 of current stub):
```typescript
// src/adapters/expo/ExpoRouterAdapter.ts lines 79–81 — keep as-is
slotMarker(name: string, importSource: string): boolean {
  return name === "Slot" && importSource === "expo-router";
}
```

---

## Shared Patterns

### `traverse` import (all adapter and core files using Babel traversal)

**Source:** `src/core/babel-shim.ts` lines 1–14
**Apply to:** `src/core/import-bindings.ts`, `src/adapters/expo/ExpoRouterAdapter.ts`

```typescript
// src/core/babel-shim.ts — ONLY valid import path for @babel/traverse
import { traverse } from "../../core/babel-shim.js";
// For files inside src/core/:
import { traverse } from "./babel-shim.js";
```

Never use `import traverse from "@babel/traverse"` directly. This is documented as a known CJS/ESM footgun in CLAUDE.md.

### `toForwardSlash` normalization (all files emitting paths)

**Source:** `src/core/paths.ts` (existing)
**Apply to:** `src/adapters/expo/discover.ts`, `src/adapters/expo/route-map.ts`, `src/adapters/expo/ExpoRouterAdapter.ts`

```typescript
import { toForwardSlash } from "../../core/paths.js";
// Every path string emitted to tree output or returned as entries must pass through:
toForwardSlash(absPath)
```

### No-throw contract (all methods returning route/entry data)

**Source:** `src/adapters/next/route-map.ts` lines 57–59, `src/adapters/next/NextJsAdapter.ts` lines 128–151
**Apply to:** `src/adapters/expo/route-map.ts` (`mapRouteToEntry`), `src/adapters/expo/ExpoRouterAdapter.ts` (`extractComponents`)

```typescript
// src/adapters/next/route-map.ts lines 57–59
function cloneEmpty(): RouteMatch {
  return { matched: false, entries: [], params: {}, slots: {} };
}
// On any failure: return cloneEmpty() — never throw
```

### Warnings channel (all warning emissions)

**Apply to:** `src/adapters/expo/ExpoRouterAdapter.ts`

```typescript
// All warnings pushed to ctx.warnings[] — never console.*
ctx.warnings.push(`Namespace import '${spec.local.name}' from 'react-native' detected at ${fwdFile}:${line} — members not classified as RN primitives`);
ctx.warnings.push(`Non-literal name prop on <${navigatorName}.Screen> at ${fwdFile}:${line} — screen not enumerated`);
```

### Lex sort (all discover functions returning file arrays)

**Source:** `src/adapters/next/discover.ts` lines 49–51
**Apply to:** `src/adapters/expo/discover.ts`

```typescript
// src/adapters/next/discover.ts lines 49–51 — copy verbatim
.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
```

---

## Test File Patterns

### `test/adapters/expo/segments.test.ts`

**Analog:** `test/adapters/next/route-map.test.ts` lines 1–60

```typescript
// test/adapters/next/route-map.test.ts lines 1–10 — COPY structure
import { describe, expect, it } from "vitest";
import { parseSegment } from "../../../src/adapters/expo/segments.js";

describe("parseSegment", () => {
  it("classifies static segment", () => {
    expect(parseSegment("settings")).toEqual({ kind: "static", name: "settings" });
  });
  it("classifies [id] as dynamic — name field not param", () => {
    expect(parseSegment("[id]")).toEqual({ kind: "dynamic", name: "id" });
  });
  // ...
});
```

### `test/adapters/expo/discover.test.ts`

**Analog:** `test/adapters/next/discover.test.ts` lines 1–60

```typescript
// test/adapters/next/discover.test.ts lines 1–14 — COPY structure
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverEntries, resolveExpoRoot } from "../../../src/adapters/expo/discover.js";

const ROOT = path.resolve("test/fixtures/expo-basic");
```

---

## No Analog Found

No files are without an analog. All 5 new source files have close existing analogs in the Next.js adapter layer.

---

## Metadata

**Analog search scope:** `src/adapters/next/`, `src/core/`, `test/adapters/next/`
**Files read:** 8 source files, 2 test files
**Pattern extraction date:** 2026-05-18

### Critical Implementation Notes (from RESEARCH.md — must be conveyed to planner)

1. **`collectChildrenSlotLines` extension is the highest-risk change.** It touches shared core logic used by both adapters. The `JSXOpeningElement` visitor must be added INSIDE the existing `traverse(ast, { ... })` call (same closure captures `adapter`, `bindings`, `lines`).

2. **`import-bindings.ts` extraction is net-zero behavior.** `Analyzer.ts` keeps calling the same function; only the import path changes. The `ImportBinding` interface and `collectImportBindings` function move from private to exported.

3. **Priority reversal:** `resolveExpoRoot` checks `["src/app", "app"]` (Expo order, D-08). `resolveAppRoot` checks `["app", "src/app"]` (Next.js order). Do not copy the order verbatim.

4. **`ExpoSegment` uses `name` field everywhere.** `SegmentKind` uses `param` for dynamic variants. Mixing the two breaks unit tests. The types are intentionally distinct — do not alias or extend `SegmentKind`.

5. **All `@babel/traverse` usage must go through `src/core/babel-shim.ts`.** This is a hard rule enforced by CLAUDE.md. The shim resolves the CJS/ESM interop footgun.
