# Phase 12: ExpoRouterAdapter Routing & RN Primitives — Research

**Researched:** 2026-05-18
**Domain:** Expo Router file-system routing adapter, React Native primitive classification, Babel AST traversal
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `<Tabs.Screen>` and `<Stack.Screen>` become child TreeNodes with `kind: "component"` — consistent with how the tree renders every JSX element. Not flattened into parent attributes.
- **D-02:** Literal `name` attribute → string attribute on the child node as-is.
- **D-03:** `options={...}` object → serialized via `JSON.stringify` compact as the `"options"` attribute value. Non-serializable values are omitted silently.
- **D-04:** Extract `collectImportBindings` from `Analyzer.ts` into `src/core/import-bindings.ts`. Exports `collectImportBindings(ast: t.File): Map<string, ImportBinding>` and the `ImportBinding` interface.
- **D-05:** `Analyzer.ts` is refactored to import from `../../core/import-bindings.js`. Net-zero behavior change — all existing tests remain green.
- **D-06:** `ExpoRouterAdapter` and `src/adapters/expo/rn-primitives.ts` import from `../../core/import-bindings.js`. Island rule: adapters→core direction is permitted.
- **D-07:** `discoverEntries` returns routing files only — `.tsx`/`.jsx`/`.ts`/`.js` under the Expo app root, excluding `**/components/**`, `**/hooks/**`, `**/utils/**`, `**/node_modules/**`.
- **D-08:** `src/app/` takes priority over `app/` when both exist. Warning emitted naming both paths when both present.
- **D-09:** `mapRouteToEntry(absRoot, route)` returns `entries` as full layout chain + page file in root→leaf→page order.
- **D-10:** Matches the Next.js pattern; Analyzer's slot mechanism handles layout chain wiring without adapter changes.
- **D-11:** Expo's `parseSegment` uses `name` field (not `param`). Export as `ExpoSegment` type from `src/adapters/expo/segments.ts`.

### Claude's Discretion

- Exact glob pattern for routing file discovery within those constraints (D-07).

### Deferred Ideas (OUT OF SCOPE)

- `StyleSheet.create`, inline `style={{}}`, style array merging, NativeWind `className` — Phase 13
- Platform-suffix fallback — Phase 14
- Integration test suite across both fixtures — Phase 15
- `--init` template update — Phase 15
- `<Tabs.Screen>` non-literal computed `name` (beyond warning) — deferred
- Namespace import resolution (`import * as RN`) — documented limitation only
- `useLocalSearchParams`, `useRouter`, `<Link href>` — v1.3+
- Drawer navigator — v1.3+
- Sister-package primitives (`react-native-safe-area-context`, `expo-image`) — v1.3+
- `[[...opt]]` fixture file addition — unit test string only
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ROUTE-01 | Route discovery root: `app/` vs `src/app/`; `src/app/` wins when both exist | `discover.ts` pattern mirrored from Next.js `resolveAppRoot`; WARNING when both exist |
| ROUTE-02 | Layout chain via `<Slot/>` from `expo-router` marks children injection point | **Critical finding:** `collectChildrenSlotLines` in `Analyzer.ts` currently only scans `JSXExpressionContainer` nodes; must also scan `JSXOpeningElement` for `<Slot/>` JSX elements |
| ROUTE-03 | Dynamic segment parsing: `[param]`, `[...rest]`, `[[...opt]]` | `segments.ts` port from Next.js; drop parallel/intercepting/private; use `name` (not `param`) per D-11 |
| ROUTE-04 | Route groups transparent in URL; `_layout.tsx` inside group participates | `route-map.ts` skips group names in route strings; group layouts in chain |
| ROUTE-05 | `index.tsx` maps to parent URL (`/` for root, `/settings` for `settings/index.tsx`) | `enumerateRoutes` strips `index` from final route segment |
| RN-01 | `<Tabs>` and `<Tabs.Screen name="..." options={...}>` enumerated; non-literal `name` → warning | JSX walker checks `JSXMemberExpression` with `object.name === "Tabs"` |
| RN-02 | `<Stack>` and `<Stack.Screen>` enumerated analogously to Tabs | Same walker handles both, parameterized by navigator name |
| RN-03 | `+not-found.tsx` classified as `"special"`; `+html.tsx`, `+native-intent.tsx`, `+api.ts` → `"other"` | `classifyEntry` regex on basename |
</phase_requirements>

---

## Summary

Phase 12 fills the `ExpoRouterAdapter` stub shipped in Phase 11 with real implementations across five new modules and one modified core utility. All the machinery needed already exists in the Next.js adapter and in `Analyzer.ts` — this phase is a focused port with well-understood deviations: Expo uses `<Slot/>` (a JSX element) instead of `{children}` (a JSX expression), `(group)` directories are transparent, and RN primitives are classified by import source rather than tag name alone.

The single highest-risk implementation item is **`collectChildrenSlotLines` in `Analyzer.ts`**: it currently scans only `JSXExpressionContainer` nodes for `{children}`. Expo's `<Slot/>` is a self-closing JSX element, so it will never trigger that visitor. The method must be extended to also visit `JSXOpeningElement` nodes and call `adapter.slotMarker(name, importSource)` there. This is a surgical change to a core shared method — all 388+ existing tests must stay green after the modification.

The second important insight is the `import-bindings.ts` extraction (D-04). `collectImportBindings` is used in two places in `Analyzer.ts` — once in `collectChildrenSlotLines` (needs to distinguish `<Slot/>` source) and once in `buildTreeForEntry` (for resolver post-pass). Moving it to `src/core/import-bindings.ts` before wiring the Expo adapter keeps the island rule intact and avoids code duplication.

**Primary recommendation:** Implement in five waves: (1) shared utility extraction, (2) routing infrastructure files, (3) `ExpoRouterAdapter` method implementations, (4) Analyzer `collectChildrenSlotLines` JSXOpeningElement extension, (5) tests and snapshot re-lock.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Route root detection (`app/` vs `src/app/`) | `src/adapters/expo/discover.ts` | — | File I/O concern belongs in the adapter, not core |
| File globbing for routing entries | `src/adapters/expo/discover.ts` | `tinyglobby` | Adapter owns discovery; tinyglobby is already a dep |
| Segment classification | `src/adapters/expo/segments.ts` | — | Pure function, no I/O; same pattern as Next.js |
| URL route string building | `src/adapters/expo/route-map.ts` | `segments.ts` | Uses segment parser; pure function over files list |
| Layout chain construction | `src/adapters/expo/ExpoRouterAdapter.ts` | `Analyzer.ts` (slot substitution) | Adapter provides `mapRouteToEntry` + `entries`; Analyzer's `buildRouteTree` does inside-out slot wrap |
| `<Slot/>` slot injection | `Analyzer.ts` (`collectChildrenSlotLines`) | `ExpoRouterAdapter.slotMarker` | Analyzer orchestrates slot lines; slotMarker delegated to adapter |
| RN primitive allowlist | `src/adapters/expo/rn-primitives.ts` | — | Data definition belongs near the adapter that uses it |
| Import-source disambiguation | `src/adapters/expo/ExpoRouterAdapter.ts` (extractComponents) | `src/core/import-bindings.ts` | Adapter uses shared binding utility; island rule: adapters may import core |
| `<Tabs>`/`<Stack>` JSX walking | `src/adapters/expo/ExpoRouterAdapter.ts` (extractComponents) | — | Adapter-specific JSX pattern recognition |
| `collectImportBindings` utility | `src/core/import-bindings.ts` (NEW) | — | Extracted from Analyzer; shared between Analyzer and ExpoRouterAdapter |

---

## Standard Stack

### Core (already installed — no new runtime deps)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `tinyglobby` | `^0.2.16` | File discovery glob | Already a dep; same API as `fast-glob` |
| `@babel/parser` | `^7.29.2` | Parse `.tsx`/`.jsx` files | Used by `extractComponents` |
| `@babel/traverse` | `^7.29.0` | AST visitor pattern | Import via `src/core/babel-shim.ts` only |
| `@babel/types` | `^7.29.0` | AST node type guards | `t.isJSXMemberExpression`, `t.isJSXOpeningElement`, etc. |
| `node:fs/promises` | built-in | `access()` for root detection | Same as Next.js `discover.ts` |
| `node:path` | built-in | `join()` for root path composition | Standard |

**No new `npm install` required.** [VERIFIED: codebase grep + SPEC constraint "no new runtime dependencies beyond Phase 11"]

### Supporting (dev tools — already installed)

| Library | Purpose |
|---------|---------|
| `vitest@^4.3.6` | Test runner, snapshots |
| `tsx@^4.21.0` | Run TS source during dev |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `tinyglobby` | `fast-glob` | `fast-glob` is heavier; `tinyglobby` already a dep |
| `@babel/traverse` | Hand-rolled AST walk | Traverse has visitor pattern; for whole-file scans it is cleaner |
| `JSON.stringify` for `options` | Custom serializer | D-03 specifies `JSON.stringify` compact; non-serializable values silently omitted |

---

## Package Legitimacy Audit

No new packages are installed in this phase. All dependencies used are already in `node_modules/`. [VERIFIED: SPEC constraint + `package.json` inspection]

| Package | Registry | Disposition |
|---------|----------|-------------|
| `tinyglobby` | npm (existing dep) | Approved — already installed |
| `@babel/parser` | npm (existing dep) | Approved — already installed |
| `@babel/traverse` | npm (existing dep) | Approved — already installed |
| `@babel/types` | npm (existing dep) | Approved — already installed |

**Packages removed due to slopcheck:** none
**Packages flagged as suspicious:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Expo Router Project (app/)
         │
         ▼
┌─────────────────────────────────────┐
│      ExpoRouterAdapter              │
│                                     │
│  discoverEntries()                  │
│    └─► expo/discover.ts             │
│         ├─ resolveExpoRoot()        │  app/ vs src/app/ → src/app/ wins
│         └─ tinyglobby glob()        │  excludes components/hooks/utils
│                                     │
│  enumerateRoutes()                  │
│    └─► expo/route-map.ts            │
│         ├─ parseSegment() ──────────┼──► expo/segments.ts
│         ├─ skip groups in URL       │    (static/dynamic/catch-all/
│         └─ strip index              │     group/index/special)
│                                     │
│  mapRouteToEntry()                  │
│    └─► expo/route-map.ts            │
│         └─ buildLayoutChain()       │  root→leaf→page order (D-09)
│                                     │
│  classifyEntry()                    │
│    └─ regex on basename             │  _layout→layout, +not-found→special
│                                     │  +html/+api→other, else→page
│                                     │
│  extractComponents()                │
│    ├─ parseFile() [existing core]   │
│    ├─ discoverComponents() [core]   │
│    ├─ collectImportBindings() ──────┼──► core/import-bindings.ts (NEW)
│    ├─ walkRenderFlow() [core]       │
│    ├─ RN primitive check ───────────┼──► expo/rn-primitives.ts (NEW)
│    │   └─ isRNPrimitive(tag, src)   │    allowlist + "react-native" source
│    └─ Tabs/Stack JSX walker         │    JSXMemberExpression visitor
│                                     │
│  slotMarker()                       │
│    └─ name==="Slot" &&              │  already correct (Phase 11)
│       src==="expo-router"           │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│   Analyzer.ts (modified)            │
│                                     │
│  collectChildrenSlotLines()         │
│    ├─ JSXExpressionContainer ───────┼──► {children} (Next.js path)
│    └─ JSXOpeningElement ────────────┼──► <Slot/> (NEW: Expo path)
│         └─ slotMarker(name, src) ◄──┘
│                                     │
│  buildTreeForEntry()                │
│    └─ collectImportBindings() ──────┼──► core/import-bindings.ts (via import)
└─────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── core/
│   ├── import-bindings.ts     # NEW: extracted from Analyzer.ts
│   ├── Analyzer.ts            # MODIFIED: import from import-bindings.ts,
│   │                          #   extend collectChildrenSlotLines for JSXOpeningElement
│   └── paths.ts               # existing — toForwardSlash used throughout
├── adapters/
│   └── expo/
│       ├── ExpoRouterAdapter.ts  # MODIFIED: replace 5 stubs
│       ├── detect.ts             # existing — unchanged
│       ├── discover.ts           # NEW: resolveExpoRoot + discoverEntries
│       ├── segments.ts           # NEW: parseSegment → ExpoSegment
│       ├── route-map.ts          # NEW: buildLayoutChain + enumerateRoutes helper
│       └── rn-primitives.ts      # NEW: RN_PRIMITIVES allowlist + isRNPrimitive()
test/
└── adapters/
    └── expo/
        ├── detect.test.ts        # existing
        ├── segments.test.ts      # NEW: unit tests for parseSegment
        ├── discover.test.ts      # NEW: resolveExpoRoot + discoverEntries
        ├── route-map.test.ts     # NEW: enumerateRoutes + mapRouteToEntry
        ├── rn-primitives.test.ts # NEW: allowlist + isRNPrimitive
        └── ExpoRouterAdapter.test.ts  # NEW or extended: full adapter + snapshots
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File globbing | Custom `fs.readdir` recursion | `tinyglobby` | Handles ignore patterns, absolute paths, forward slashes; already a dep |
| AST traversal | Recursive switch-on-node-type | `@babel/traverse` via `babel-shim.ts` | Visitor pattern handles all node types; handles ESM/CJS interop |
| ESM/CJS `traverse` interop | Direct `import traverse from "@babel/traverse"` | `import { traverse } from "../../core/babel-shim.js"` | Known footgun documented in CLAUDE.md; shim is THE ONLY import path |
| JSON serialization of `options` | Custom serializer | `JSON.stringify` | D-03 specifies this; non-serializable values silently omitted |
| Forward-slash normalization | Custom replace | `toForwardSlash` from `src/core/paths.ts` | Handles both `path.sep` and literal backslashes (Windows invariant) |

**Key insight:** Every hard problem in this phase already has a proven solution in the Next.js adapter. Port first, deviate only where Expo diverges.

---

## Critical Implementation Finding: `collectChildrenSlotLines` Extension

[VERIFIED: codebase inspection of `src/core/Analyzer.ts` lines 1153–1174]

**The problem:** `collectChildrenSlotLines` in `Analyzer.ts` visits only `JSXExpressionContainer` nodes:
```typescript
JSXExpressionContainer(path) {
  const expr = path.node.expression;
  if (t.isIdentifier(expr)) { ... }
}
```
This catches `{children}` (the Next.js pattern) but NOT `<Slot />` (the Expo pattern). `<Slot/>` is a `JSXElement` with a `JSXOpeningElement` — it is never wrapped in a `JSXExpressionContainer`.

**The fix:** Extend `collectChildrenSlotLines` to also visit `JSXOpeningElement`:
```typescript
// Source: src/core/Analyzer.ts — collectChildrenSlotLines, to be extended
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
}
```

**Why this is safe:** `ExpoRouterAdapter.slotMarker` returns `true` only for `name === "Slot" && importSource === "expo-router"`. `NextJsAdapter.slotMarker` returns `true` only for `name === "children"` — it will never fire on a `JSXOpeningElement` named `"children"` because React renders `children` as a JSX expression, not a JSX element. The two adapters' `slotMarker` logic naturally partition the two AST node types.

**Risk:** This is the only change touching `Analyzer.ts` core logic (the other is just moving `collectImportBindings` to an import). Run the full test suite after this change.

---

## Architecture Patterns

### Pattern 1: `resolveExpoRoot` (mirrors `resolveAppRoot` from Next.js)

**What:** Detect the Expo app root directory; `src/app/` priority over `app/`.
**When:** Called by `discoverEntries`, `enumerateRoutes`, `mapRouteToEntry`.

```typescript
// Source: mirroring src/adapters/next/discover.ts pattern
import { access } from "node:fs/promises";
import { join } from "node:path";

export async function resolveExpoRoot(absRoot: string): Promise<string | null> {
  // src/app takes priority (D-08)
  for (const candidate of [join(absRoot, "src", "app"), join(absRoot, "app")]) {
    try {
      await access(candidate);
      return candidate;
    } catch { /* not found */ }
  }
  return null;
}
```

**Note:** Next.js `resolveAppRoot` checks `app/` first then `src/app/`. Expo is reversed per D-08.

### Pattern 2: `ExpoSegment` type with `name` field (not `param`)

**What:** Distinct from Next.js `SegmentKind` which uses `param`. Expo uses `name` per D-11.
**When:** `parseSegment(dir: string): ExpoSegment` — called by route-map.ts.

```typescript
// Source: src/adapters/expo/segments.ts (to create)
export type ExpoSegment =
  | { kind: "static"; name: string }
  | { kind: "dynamic"; name: string }        // [id] → name: "id"
  | { kind: "catch-all"; name: string }      // [...rest] → name: "rest"
  | { kind: "optional-catch-all"; name: string } // [[...opt]] → name: "opt"
  | { kind: "group"; name: string }          // (tabs) → name: "tabs"
  | { kind: "index" }                        // index.tsx
  | { kind: "special"; name: string };       // +not-found → name: "+not-found"

// Order: most-specific first (optional-catch-all before catch-all)
const RX_OPTIONAL_CATCH_ALL = /^\[\[\.\.\.([^\]]+)\]\]$/;
const RX_CATCH_ALL = /^\[\.\.\.([^\]]+)\]$/;
const RX_DYNAMIC = /^\[([^\]]+)\]$/;
const RX_GROUP = /^\(([^)]+)\)$/;
const RX_SPECIAL = /^\+/;

export function parseSegment(dir: string): ExpoSegment {
  // strip extension if present
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

### Pattern 3: `discoverEntries` for Expo Router

**What:** Globe all routing files under Expo app root, excluding non-routing subdirs (D-07).
**Key difference from Next.js:** Expo uses ANY `.tsx/.jsx/.ts/.js` filename (not just Next.js special names like `page`, `layout`). But Expo does have routing-specific names like `_layout`, `index`, `+not-found`.

```typescript
// Source: mirroring src/adapters/next/discover.ts + D-07 decisions
export async function discoverEntries(absRoot: string): Promise<string[]> {
  // Check for both roots; warn if both exist (D-08)
  const srcAppRoot = join(absRoot, "src", "app");
  const appRoot = join(absRoot, "app");
  let chosenRoot: string | null = null;
  let hasSrcApp = false;
  let hasApp = false;
  try { await access(srcAppRoot); hasSrcApp = true; } catch {}
  try { await access(appRoot); hasApp = true; } catch {}

  if (hasSrcApp && hasApp) {
    // emit warning via ctx — but discoverEntries has no ctx param...
    // Warning must be passed via ParseContext or returned as a side channel
    chosenRoot = srcAppRoot;
  } else if (hasSrcApp) {
    chosenRoot = srcAppRoot;
  } else if (hasApp) {
    chosenRoot = appRoot;
  }

  if (!chosenRoot) return [];

  const matches = await glob(["**/*.{tsx,jsx,ts,js}"], {
    cwd: chosenRoot,
    absolute: true,
    ignore: [
      "**/components/**",
      "**/hooks/**",
      "**/utils/**",
      "**/node_modules/**",
    ],
    dot: false,
  });

  return matches.map(toForwardSlash).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
```

**Open question for planner:** `discoverEntries` signature is `(absRoot: string): Promise<string[]>` — no `ctx` parameter to push warnings to. The SPEC says "emits envelope warning naming both paths when both exist". Warnings in this codebase go to `ParseContext.warnings[]`. Options: (a) return `{ entries, warnings }` shape — but that breaks the `FrameworkAdapter` interface, (b) pass warnings as a separate parameter, (c) emit to `console.warn` (violates "never `console.*`" rule), (d) store warnings on the adapter instance. Recommendation: store in an instance-level `pendingWarnings: string[]` array on `ExpoRouterAdapter`, flushed into `ctx.warnings` during `extractComponents` call.

### Pattern 4: `classifyEntry` for Expo Router files

**What:** Classify file role based on basename.

```typescript
// Source: mirroring src/adapters/next/NextJsAdapter.ts classifyEntry
classifyEntry(absPath: string): "page" | "layout" | "special" | "other" {
  const base = toForwardSlash(absPath).split("/").pop() ?? "";
  // _layout.tsx → layout
  if (/^_layout\.(tsx|jsx|ts|js)$/.test(base)) return "layout";
  // +not-found.tsx → special (participates in tree as error boundary)
  if (/^\+not-found\.(tsx|jsx|ts|js)$/.test(base)) return "special";
  // +html.tsx, +native-intent.tsx, +api.ts → other (silently excluded)
  if (/^\+/.test(base)) return "other";
  // index.tsx, [id].tsx, settings.tsx → page
  return "page";
}
```

### Pattern 5: `enumerateRoutes` for Expo Router

**What:** Build URL route strings from discovered files. Groups are transparent (skip in URL); `index.tsx` collapses to parent.

```typescript
// Logic: for each file classified as "page", walk path segments
// from appRoot to file; skip group segments; collapse index
async enumerateRoutes(absRoot: string): Promise<string[]> {
  const entries = await this.discoverEntries(absRoot);
  const routes = new Set<string>();

  for (const entry of entries) {
    if (this.classifyEntry(entry) !== "page") continue;
    const fwd = toForwardSlash(entry);
    // strip appRoot prefix and extension
    // split into dir segments
    // for each segment: parseSegment; if group → skip; if index → skip (terminal)
    // build route string
    routes.add(route);
  }

  return Array.from(routes).sort();
}
```

### Pattern 6: `mapRouteToEntry` for Expo Router

**What:** Given a route string (e.g., `/[id]`), return the full layout chain + page file as `entries` array in root→leaf→page order (D-09).

```typescript
// Route: "/(tabs)/[id]" → normalize to "/[id]" (groups stripped)
// Entries: ["app/_layout.tsx", "app/(tabs)/_layout.tsx", "app/(tabs)/[id].tsx"]
// Algorithm:
//   1. Enumerate all files under appRoot
//   2. For each _layout.tsx: determine its URL prefix (strip group names)
//   3. Match layout chain by URL prefix containment
//   4. Append the matching page file
```

### Pattern 7: RN Primitive Classification

**What:** Classify a JSX tag as `kind: "element"` (RN primitive) vs `kind: "component"` (user component) based on import source.

```typescript
// Source: src/adapters/expo/rn-primitives.ts (to create)
export const RN_PRIMITIVES = new Set([
  "View", "Text", "ScrollView", "Image", "Pressable",
  "TouchableOpacity", "TouchableHighlight", "TouchableWithoutFeedback",
  "FlatList", "SectionList", "Modal", "KeyboardAvoidingView", "SafeAreaView",
]);

export function isRNPrimitive(tagName: string, importSource: string): boolean {
  return RN_PRIMITIVES.has(tagName) && importSource === "react-native";
}
```

**In `extractComponents`:** After `walkRenderFlow`, post-process `RenderNode` tree to override `isComponent: false` (→ `kind: "element"`) for nodes where `isRNPrimitive(tag, importSource)` is true.

**Warning for namespace imports:** In `collectImportBindings`, `ImportNamespaceSpecifier` is intentionally skipped (v1 carve-out). The hook in `ExpoRouterAdapter.extractComponents` must detect namespace specifiers explicitly and push a warning to `ctx.warnings[]`.

### Anti-Patterns to Avoid

- **`import traverse from "@babel/traverse"` directly** — use `import { traverse } from "../../core/babel-shim.js"` only. The direct import is a known CJS/ESM footgun.
- **`console.warn()` or `console.log()` for warnings** — all warnings MUST go to `ctx.warnings[]`. No `console.*` in adapter code.
- **Using `param` field for `ExpoSegment`** — SPEC and D-11 require `name`. Using `param` will break unit tests.
- **Forgetting `toForwardSlash` on emitted paths** — every path in tree output must pass through `toForwardSlash`. Windows backslash guard is an established invariant.
- **Placing `isRNPrimitive` logic in core** — it belongs in `src/adapters/expo/rn-primitives.ts`. Core must not reference adapter-specific domain knowledge.
- **Importing `ExpoRouterAdapter` modules from `src/core/`** — island rule violation. `src/core/import-bindings.ts` must contain ZERO adapter references.

---

## Common Pitfalls

### Pitfall 1: `collectChildrenSlotLines` Misses `<Slot/>`

**What goes wrong:** `<Slot/>` appears in Expo layouts but the slot injection never fires because `collectChildrenSlotLines` only visits `JSXExpressionContainer`. The tree is built without slot injection — `app/index.tsx` never appears as a child of `_layout.tsx`.
**Why it happens:** `<Slot/>` is a JSX element, not a JSX expression container. The comment in Analyzer says "for `{children}` JSXExpressionContainers" — it was written for Next.js only.
**How to avoid:** Extend `collectChildrenSlotLines` to also visit `JSXOpeningElement` and call `adapter.slotMarker(name, source)` there.
**Warning signs:** `expo-basic` snapshot shows flat tree with no nested children; `app/index.tsx` is missing from tree.

### Pitfall 2: Next.js `resolveAppRoot` Priority is Reversed for Expo

**What goes wrong:** Copy-pasting `resolveAppRoot` from `next/discover.ts` verbatim — it checks `app/` first, then `src/app/`. Expo (D-08) wants `src/app/` first.
**Why it happens:** Habit and the fact that Next.js and Expo both support both paths.
**How to avoid:** In `expo/discover.ts`, iterate `[join(absRoot, "src", "app"), join(absRoot, "app")]` — `src/app` first.
**Warning signs:** SPEC REQ-01 acceptance test fails (fixture with both roots routes to `app/` instead of `src/app/`).

### Pitfall 3: `ExpoSegment` Using `param` Instead of `name`

**What goes wrong:** `parseSegment("[id]")` returns `{ kind: "dynamic", param: "id" }` — matching the Next.js shape. Unit tests written per SPEC acceptance criteria expect `name`.
**Why it happens:** Copying Next.js `segments.ts` without changing the field name.
**How to avoid:** Define `ExpoSegment` with `name` field from the start; don't alias Next.js `SegmentKind`.
**Warning signs:** `parseSegment("[id]") → { kind: "dynamic", param: "id" }` — test expects `name`.

### Pitfall 4: Warning Emission in `discoverEntries` Without `ctx`

**What goes wrong:** `discoverEntries(absRoot)` has no access to `ParseContext` to push warnings. The "both roots" warning (D-08 / SPEC REQ-01) needs a channel.
**Why it happens:** `FrameworkAdapter.discoverEntries` signature is `(absRoot: string): Promise<string[]>` — no `ctx` param.
**How to avoid:** Store pending warnings in an instance-level array on `ExpoRouterAdapter`: `private pendingWarnings: string[] = []`. Flush into `ctx.warnings` at the start of `extractComponents`.
**Warning signs:** Test for dual-root warning finds no warning even when both `app/` and `src/app/` exist.

### Pitfall 5: Group Directories in `discoverEntries` Exclusion

**What goes wrong:** Adding `"**/(tabs)/**"` or any group-folder-shaped glob to the ignore list. Groups like `(tabs)` contain routing files — their `_layout.tsx` is essential to the layout chain.
**Why it happens:** Trying to filter only non-routing subdirectories but accidentally filtering groups.
**How to avoid:** Only ignore well-known non-routing names: `components`, `hooks`, `utils`, `node_modules`. Never ignore `(*)` patterns.
**Warning signs:** `expo-tabs-and-dynamic` has empty route list; `(tabs)/_layout.tsx` missing from tree.

### Pitfall 6: `<Tabs.Screen>` Walker and Non-Literal `name`

**What goes wrong:** Crashing when `<Tabs.Screen name={tabName} />` is encountered instead of a string literal.
**Why it happens:** Assuming `attr.value` is a `StringLiteral` without checking.
**How to avoid:** Check `t.isStringLiteral(attr.value)` before extracting; if not a literal, push a warning and skip.
**Warning signs:** Fixture with non-literal `name` throws during `extractComponents`.

### Pitfall 7: `import-bindings.ts` Accidentally Imports Adapter Types

**What goes wrong:** `src/core/import-bindings.ts` imports `ImportBinding` from a type defined in `src/adapters/types.ts` or vice versa.
**Why it happens:** Forgetting the island rule when creating the new utility.
**How to avoid:** `ImportBinding` interface must be defined IN `src/core/import-bindings.ts` itself, exporting it for adapters to reuse. No `src/adapters/` imports in `src/core/`.
**Warning signs:** `test/architecture/island.test.ts` fails.

---

## Code Examples

### `collectImportBindings` (source — to be extracted)

```typescript
// Source: src/core/Analyzer.ts lines 140–160 — move verbatim to src/core/import-bindings.ts
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

### Namespace Import Warning Detection

```typescript
// Source: to be added in ExpoRouterAdapter.extractComponents
// Detect namespace imports like: import * as RN from "react-native"
traverse(ast, {
  ImportDeclaration(path: { node: t.ImportDeclaration }) {
    const source = path.node.source.value;
    for (const spec of path.node.specifiers) {
      if (t.isImportNamespaceSpecifier(spec) && source === "react-native") {
        const line = path.node.loc?.start.line ?? 0;
        ctx.warnings.push(
          `Namespace import '${spec.local.name}' from 'react-native' detected at ${fwdFile}:${line} — members not classified as RN primitives`
        );
      }
    }
  }
});
```

### `<Tabs.Screen>` / `<Stack.Screen>` Walker

```typescript
// Source: pattern derived from src/adapters/next/NextJsAdapter.ts collectJsxElements
// Detect <Tabs.Screen name="index" options={{ title: "Home" }} />
traverse(ast, {
  JSXElement(path: { node: t.JSXElement }) {
    const openingEl = path.node.openingElement;
    const nameNode = openingEl.name;
    if (!t.isJSXMemberExpression(nameNode)) return;
    const obj = nameNode.object;
    const prop = nameNode.property;
    if (!t.isJSXIdentifier(obj) || !t.isJSXIdentifier(prop)) return;
    if (prop.name !== "Screen") return;
    const navigatorName = obj.name; // "Tabs" or "Stack"

    // Extract name attribute
    let screenName: string | undefined;
    let optionsValue: string | undefined;
    for (const attr of openingEl.attributes) {
      if (!t.isJSXAttribute(attr)) continue;
      if (!t.isJSXIdentifier(attr.name)) continue;
      if (attr.name.name === "name") {
        if (t.isStringLiteral(attr.value)) {
          screenName = attr.value.value;
        } else {
          // Non-literal name: warn and skip
          const line = attr.loc?.start.line ?? 0;
          ctx.warnings.push(
            `Non-literal name prop on <${navigatorName}.Screen> at ${fwdFile}:${line} — screen not enumerated`
          );
        }
      }
      if (attr.name.name === "options") {
        // Serialize options object to compact JSON (D-03)
        if (t.isJSXExpressionContainer(attr.value) && t.isObjectExpression(attr.value.expression)) {
          try {
            // Build a plain object from literal properties only
            const obj: Record<string, unknown> = {};
            for (const prop of attr.value.expression.properties) {
              if (!t.isObjectProperty(prop) || prop.computed) continue;
              const k = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null;
              const v = t.isStringLiteral(prop.value) ? prop.value.value
                      : t.isNumericLiteral(prop.value) ? prop.value.value
                      : t.isBooleanLiteral(prop.value) ? prop.value.value
                      : undefined;
              if (k && v !== undefined) obj[k] = v;
            }
            optionsValue = JSON.stringify(obj);
          } catch { /* silently omit */ }
        }
      }
    }
    // Emit TreeNode for this Screen (D-01/D-02/D-03)
    // ...
  }
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `slotMarker` checked only via `JSXExpressionContainer` | Must also check `JSXOpeningElement` for `<Slot/>` JSX elements | Phase 12 (this phase) | Enables Expo layout chain injection |
| `collectImportBindings` inline in `Analyzer.ts` | Extracted to `src/core/import-bindings.ts` | Phase 12 (this phase) | Shared by Analyzer and ExpoRouterAdapter; island rule satisfied |
| `SegmentKind` with `param` field | `ExpoSegment` with `name` field | Phase 12 (this phase) | Cleaner API; distinct from Next.js to avoid confusion |

**No deprecated patterns introduced** — all changes extend existing patterns.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `discoverEntries` warning for dual-root should use instance-level `pendingWarnings` flushed in `extractComponents` | Pattern 3 (warning channel) | If wrong approach chosen, warning may silently drop or require interface change |
| A2 | `expo-tabs-and-dynamic` route for `(tabs)/index.tsx` should enumerate as `/` (not `/(tabs)`) | Standard Stack / enumerateRoutes | Snapshot re-lock will catch if wrong |
| A3 | `<Tabs.Screen>` nodes should appear as `kind: "component"` children in the tree per D-01 | Code Examples | If Analyzer strips them differently, need to investigate render-flow walker output |

---

## Open Questions

1. **Warning channel for `discoverEntries`**
   - What we know: `discoverEntries(absRoot): Promise<string[]>` has no `ctx` parameter
   - What's unclear: Best pattern for routing dual-root warning into `ctx.warnings`
   - Recommendation: Instance-level `pendingWarnings: string[]` on `ExpoRouterAdapter`, flushed at start of `extractComponents`; OR document it as "warning returned only when `extractComponents` is called" and suppress in `enumerateRoutes` path (SPEC acceptance test calls `get_full_hierarchy` which goes through `extractComponents`)

2. **`mapRouteToEntry` algorithm complexity**
   - What we know: Must return `entries` in root→leaf→page order (D-09); groups are transparent; layout chain must include group `_layout.tsx` files
   - What's unclear: Whether to reuse the Next.js tree-building approach or implement a simpler linear scan
   - Recommendation: Start with simpler linear scan (Expo has no parallel slots, no intercepting routes in v1) — walk the path, collect `_layout.tsx` at each directory level (even inside groups), append the page file

3. **`<Tabs.Screen>` as `kind: "component"` vs `kind: "element"`**
   - What we know: D-01 says `kind: "component"` for consistency with how the tree renders every JSX element
   - What's unclear: `Tabs.Screen` is a JSX member expression — the render-flow walker likely emits it as `isComponent: true` already (since it starts with uppercase `Tabs`)
   - Recommendation: Verify by running render-flow walker on `(tabs)/_layout.tsx` fixture; if it already produces `kind: "component"` for `Tabs.Screen`, no special handling needed

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js >= 20 | Runtime | ✓ | (project requirement) | — |
| `tinyglobby` | `discover.ts` globbing | ✓ | `^0.2.16` in package.json | — |
| `@babel/parser` | `extractComponents` | ✓ | `^7.29.2` in package.json | — |
| `@babel/traverse` | `collectImportBindings` | ✓ | `^7.29.0` in package.json | — |
| `@babel/types` | Type guards | ✓ | `^7.29.0` in package.json | — |
| `vitest` | Tests | ✓ | `^4.3.6` in package.json | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

Current test suite: **388 passing, 1 failing** (pre-existing failure unrelated to this phase, verified by running `rtk vitest run`).

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` — this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest `^4.3.6` |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npx vitest run test/adapters/expo/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ROUTE-01 | `resolveExpoRoot` prefers `src/app/` over `app/`; warning when both | unit | `npx vitest run test/adapters/expo/discover.test.ts` | ❌ Wave 0 |
| ROUTE-01 | `discoverEntries` returns empty for non-Expo root | unit | same file | ❌ Wave 0 |
| ROUTE-02 | `expo-basic` tree has `app/index.tsx` as child of `_layout.tsx` at `<Slot/>` position | snapshot | `npx vitest run test/adapters/expo/ExpoRouterAdapter.test.ts` | ❌ Wave 0 |
| ROUTE-03 | `parseSegment("[id]")` → `{ kind: "dynamic", name: "id" }` | unit | `npx vitest run test/adapters/expo/segments.test.ts` | ❌ Wave 0 |
| ROUTE-03 | `parseSegment("[...rest]")` → `{ kind: "catch-all", name: "rest" }` | unit | same file | ❌ Wave 0 |
| ROUTE-03 | `parseSegment("[[...opt]]")` → `{ kind: "optional-catch-all", name: "opt" }` | unit | same file | ❌ Wave 0 |
| ROUTE-03 | `expo-tabs-and-dynamic` tree labels `[id]` with dynamic kind | snapshot | ExpoRouterAdapter.test.ts | ❌ Wave 0 |
| ROUTE-04 | `expo-tabs-and-dynamic` route for `(tabs)/index.tsx` is `/` (not `/(tabs)`) | unit | `npx vitest run test/adapters/expo/route-map.test.ts` | ❌ Wave 0 |
| ROUTE-04 | `(tabs)/_layout.tsx` appears in layout chain | snapshot | ExpoRouterAdapter.test.ts | ❌ Wave 0 |
| ROUTE-05 | `app/index.tsx` maps to `/` | unit | route-map.test.ts | ❌ Wave 0 |
| ROUTE-05 | nested `settings/index.tsx` maps to `/settings` | unit | route-map.test.ts | ❌ Wave 0 |
| RN-01 | `expo-tabs-and-dynamic` enumerates `<Tabs.Screen>` nodes with `name` and `options` | snapshot | ExpoRouterAdapter.test.ts | ❌ Wave 0 |
| RN-01 | Non-literal `name` on `<Tabs.Screen>` emits warning | unit | ExpoRouterAdapter.test.ts | ❌ Wave 0 |
| RN-02 | `<Stack>` with literal-named screens produces enumerated nodes | unit | ExpoRouterAdapter.test.ts | ❌ Wave 0 |
| RN-03 | `+not-found.tsx` → `classifyEntry` returns `"special"` | unit | `npx vitest run test/adapters/expo/` | ❌ Wave 0 |
| RN-03 | `+html.tsx` → `classifyEntry` returns `"other"` | unit | same | ❌ Wave 0 |
| RN-03 | `expo-tabs-and-dynamic` tree includes `+not-found.tsx` as special sibling | snapshot | ExpoRouterAdapter.test.ts | ❌ Wave 0 |
| SPEC-09 | `<Text>` from `react-native` → `kind: "element"` with `text: "Hello world"` for literal children | unit | `npx vitest run test/adapters/expo/rn-primitives.test.ts` | ❌ Wave 0 |
| SPEC-10 | `<Text>` from `@/components/Text` → `kind: "component"` | unit | rn-primitives.test.ts | ❌ Wave 0 |
| SPEC-10 | `import * as RN from "react-native"` + `<RN.Text>` → warning, node stays `kind: "component"` | unit | ExpoRouterAdapter.test.ts | ❌ Wave 0 |
| SPEC-11 | `<Text>Hello world</Text>` (RN) → `text: "Hello world"` | unit | rn-primitives.test.ts | ❌ Wave 0 |
| SPEC-11 | `<Text>{dynamic}</Text>` → no `text` field | unit | rn-primitives.test.ts | ❌ Wave 0 |
| ARCH | All 388+ existing tests stay green | regression | `npx vitest run` | ✅ (existing) |

### Snapshot Tests Needed

- `expo-basic` full hierarchy snapshot (markdown tree output)
- `expo-tabs-and-dynamic` full hierarchy snapshot (markdown tree output)

Both snapshots are new (no existing snapshots for Expo fixtures). They should be created during implementation and committed as the locked baseline.

### Sampling Rate

- **Per task commit:** `npx vitest run test/adapters/expo/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `test/adapters/expo/segments.test.ts` — covers ROUTE-03 `parseSegment` unit tests
- [ ] `test/adapters/expo/discover.test.ts` — covers ROUTE-01 root detection
- [ ] `test/adapters/expo/route-map.test.ts` — covers ROUTE-04, ROUTE-05 route string building
- [ ] `test/adapters/expo/rn-primitives.test.ts` — covers RN primitive classification (SPEC-09/10/11)
- [ ] `test/adapters/expo/ExpoRouterAdapter.test.ts` — snapshot + integration tests

All are new files; framework is already installed.

---

## Security Domain

This phase performs static analysis only — no code execution, no network calls, no user authentication, no secrets handling. ASVS categories V2, V3, V4, V6 do not apply. V5 (input validation) is limited to the `parseSegment` function's regex matchers, which are pure string classifiers with no injection risk.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | minimal | Regex-based segment parsing; no untrusted network input |
| V6 Cryptography | no | — |

---

## Sources

### Primary (HIGH confidence)

- `src/core/Analyzer.ts` (lines 1153–1174) — [VERIFIED: codebase read] `collectChildrenSlotLines` only visits `JSXExpressionContainer`; critical finding for ROUTE-02
- `src/adapters/next/discover.ts` — [VERIFIED: codebase read] reference implementation for `resolveAppRoot` + `discoverEntries` patterns
- `src/adapters/next/segments.ts` — [VERIFIED: codebase read] regex patterns for segment classification; basis for `ExpoSegment`
- `src/adapters/next/route-map.ts` — [VERIFIED: codebase read] layout chain construction algorithm; basis for Expo `mapRouteToEntry`
- `src/adapters/next/NextJsAdapter.ts` — [VERIFIED: codebase read] `extractComponents` structure including JSX walker and prop extraction
- `src/core/babel-shim.ts` — [VERIFIED: codebase read] only safe import path for `@babel/traverse`
- `src/adapters/FrameworkAdapter.ts` — [VERIFIED: codebase read] 8-method interface lock
- `12-CONTEXT.md` — [VERIFIED: direct read] locked decisions D-01 through D-11
- `12-SPEC.md` — [VERIFIED: direct read] 11 requirements, acceptance criteria, boundaries
- `test/fixtures/expo-basic/` and `test/fixtures/expo-tabs-and-dynamic/` — [VERIFIED: codebase read] actual fixture content

### Secondary (MEDIUM confidence)

- `test/adapters/next/route-map.test.ts` — [CITED: codebase read] test patterns for segment classification unit tests to mirror
- `test/adapters/next/discover.test.ts` — [CITED: codebase read] test patterns for discover unit tests

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in existing `package.json` + codebase
- Architecture: HIGH — based on direct codebase inspection of all referenced modules
- Pitfalls: HIGH — pitfall 1 (`collectChildrenSlotLines`) is verified by direct code inspection; others are derived from established patterns
- Warning channel design: MEDIUM — multiple valid approaches; recommendation given but planner should choose

**Research date:** 2026-05-18
**Valid until:** 2026-06-18 (stable codebase, no external dependencies changing)
