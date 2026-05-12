# Architecture Research — v1.2 ExpoRouterAdapter Integration

**Domain:** MCP server — second `FrameworkAdapter` plugged alongside `NextJsAdapter`
**Researched:** 2026-05-12
**Confidence:** HIGH (grounded in current repo files, not external claims)

---

## TL;DR

`ExpoRouterAdapter` is a sibling `adapters/expo/` module that implements the **same locked 5-method `FrameworkAdapter` contract** consumed by `Analyzer`. The IR schema, renderers, and MCP tools do **not** change. The only `core/` change is a small, generic `core/styles/rn/` module for `StyleSheet.create` + style-array merge (NativeWind reuses the existing Tailwind extractor). Adapter selection is a new `src/adapters/select.ts` helper called from the 4 MCP tool handlers, replacing the hard-coded `NextJsAdapter` import. The `route` arg, currently regex-validated for Next.js segment syntax, must relax to also accept Expo Router groups/dynamic patterns (regex change in `tools/get-full-hierarchy.ts`).

**Net delta:** 1 new adapter (~6 files), 1 new style module (~3 files), 1 new selector (1 file), 4 tool-handler 3-line edits, 1 regex relaxation. **Zero** changes to `src/ir/`, `src/renderers/`, `src/core/Analyzer.ts`, `src/core/parser/`, `src/core/render-flow/`, `src/core/resolver/`.

---

## Existing Architecture Map (v1.1 baseline)

```
src/
  cli.ts                          # bin entry — startServer() | runInit()
  mcp/
    server.ts                     # createServer() registers tools[]
    tools/
      index.ts                    # tools = [getFullHierarchy, focusOn, findByText, findByStyle]
      get-full-hierarchy.ts       # hardcodes: new Analyzer({ root, adapter: NextJsAdapter })
      focus-on.ts                 # idem
      find-by-text.ts             # idem
      find-by-style.ts            # idem
      common.ts                   # projectRootSchema
  core/                           # FRAMEWORK-AGNOSTIC island consumer
    Analyzer.ts                   # consumes FrameworkAdapter interface only
    resolve-root.ts               # arg > env > cwd (ARCH-03)
    parser/                       # Babel parse primitive (shared)
    resolver/                     # tsconfig paths + barrel chase (shared)
    render-flow/                  # JSX walker (shared)
    extractors/                   # Tailwind, inline-style, CSS Modules, styled-components
    paths.ts, babel-shim.ts
  ir/
    schema.ts                     # TreeNode 9-kind discriminated union + zod
  renderers/
    markdown.ts, json.ts, envelope-builder.ts
  adapters/                       # ISLAND — nothing in core/ir/renderers may import this
    types.ts                      # ComponentDefinition (13 fields), ParseContext, RouteMatch, ...
    FrameworkAdapter.ts           # locked 5-method interface
    next/
      NextJsAdapter.ts            # the only impl in v1.1
      detect.ts, discover.ts, segments.ts, route-map.ts
```

### The 5-method `FrameworkAdapter` contract (from `src/adapters/FrameworkAdapter.ts`)

| Method                | Signature                                                                                | What Analyzer calls it for                              |
| --------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `detect`              | `(absRoot) => Promise<boolean> \| boolean`                                               | (currently unused by Analyzer — selector consumes this) |
| `discoverEntries`     | `(absRoot) => Promise<string[]> \| string[]`                                             | `Analyzer.buildUnionIR` to enumerate routes             |
| `resolveModule`       | `(ctx, fromFile, specifier, importedName) => ResolveResult`                              | `resolveComponentCallsites` in `Analyzer`               |
| `extractComponents`   | `(ctx, entryFiles, opts?) => ComponentDefinition[]`                                      | `Analyzer.buildTreeForEntry` per file                   |
| `mapRouteToEntry`     | `(absRoot, route) => Promise<RouteMatch> \| RouteMatch`                                  | `Analyzer.getOrBuildRouteTree`                          |

The contract is enforced by `test/adapters/FrameworkAdapter.test.ts` (5-key set). Adding a 6th method is a milestone-level change. **v1.2 does not change the interface.**

---

## v1.2 Target Architecture

```
src/
  cli.ts                          # UNCHANGED
  mcp/
    server.ts                     # UNCHANGED
    tools/
      *.ts                        # MODIFIED — replace hardcoded NextJsAdapter import
                                  #   with `await selectAdapter(root)`
      get-full-hierarchy.ts       # MODIFIED — relax `route` regex to accept Expo
                                  #   Router groups + dynamic segments (largely the
                                  #   same surface as Next; main delta is groups `(name)`
                                  #   and `[...rest]` already present, but the regex
                                  #   was written for Next semantics — re-audit)
  core/
    Analyzer.ts                   # UNCHANGED (consumes interface, not impl)
    parser/                       # UNCHANGED — Babel parse is framework-agnostic
    resolver/                     # UNCHANGED — tsconfig paths used by Expo too
    render-flow/                  # UNCHANGED
    extractors/                   # UNCHANGED
                                  #   ↳ Tailwind extractor REUSED for NativeWind
                                  #     className (NativeWind = Tailwind for RN;
                                  #     same `className="..."` JSX surface)
    styles/                       # NEW — generic, framework-agnostic
      rn/
        index.ts                  # public façade
        stylesheet-create.ts      # parse `StyleSheet.create({ ... })` → Map<key, props>
        style-prop.ts             # resolve `style={styles.x}`, `style={[a,b,c && d]}`
  ir/
    schema.ts                     # UNCHANGED — no new TreeNode kinds needed
  renderers/                      # UNCHANGED
  adapters/                       # ISLAND
    types.ts                      # UNCHANGED — `ComponentDefinition` 13-field shape
                                  #   already accommodates RN (classNames=NativeWind,
                                  #   inlineStyles=resolved RN style, file-level
                                  #   `runtime` is N/A — set to "client" constant for RN)
    FrameworkAdapter.ts           # UNCHANGED
    select.ts                     # NEW — auto-detect from target project's package.json
    next/                         # UNCHANGED
    expo/                         # NEW — sibling of next/
      ExpoRouterAdapter.ts        # impl all 5 methods
      detect.ts                   # has `expo-router` in deps + has `app/` (or `src/app/`)
      discover.ts                 # glob `app/**/{_layout,index,[*],...}.{tsx,jsx}`
      route-map.ts                # Expo Router segment semantics (mirror next/route-map)
      segments.ts                 # parse `[param]`, `[...rest]`, `[[...opt]]`, `(group)`
      rn-primitives.ts            # name set: View, Text, ScrollView, FlatList, Image,
                                  #   Pressable, Touchable*, SectionList, ...
                                  #   Used by extractComponents to treat these as
                                  #   `kind:"element"` (lowercase-style), not `kind:"component"`
```

### What is genuinely new vs modified vs untouched

| Component                         | Status         | File path                                          | Why                                                                                                                                                                                                            |
| --------------------------------- | -------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ExpoRouterAdapter`               | **NEW**        | `src/adapters/expo/ExpoRouterAdapter.ts`           | Implements 5 methods. Mirrors `NextJsAdapter`'s structure: delegating shim to sibling `detect/discover/route-map`; reuses `core/parser`, `core/resolver`, `core/render-flow`, `core/extractors` for everything except RN styles. |
| `expo/detect.ts`                  | **NEW**        | `src/adapters/expo/detect.ts`                      | Read target `package.json`: `dependencies.expo-router \|\| devDependencies.expo-router` AND presence of `app/` or `src/app/`. No-throw on read errors (return false).                                            |
| `expo/discover.ts`                | **NEW**        | `src/adapters/expo/discover.ts`                    | Glob `app/**/{_layout,index,*}.{tsx,jsx,ts,js}` under `app/` (or `src/app/`). Use `tinyglobby` (already a dep). Ignore `**/_*/**` (note: Expo Router `_layout` is special — handle by name, not by underscore-prefix ignore).         |
| `expo/route-map.ts`               | **NEW**        | `src/adapters/expo/route-map.ts`                   | Build layout chain (`_layout.tsx` per directory, root-down) + leaf (`index.tsx` or `[param].tsx`). Match params + groups. Mirrors `next/route-map.ts` but **simpler**: no parallel slots, no intercepting routes, no `template/loading/error/not-found` siblings. |
| `expo/segments.ts`                | **NEW**        | `src/adapters/expo/segments.ts`                    | Segment matcher: `[name]` / `[...rest]` / `[[...opt]]` / `(group)` (transparent). Largely a port of `next/segments.ts`.                                                                                       |
| `expo/rn-primitives.ts`           | **NEW**        | `src/adapters/expo/rn-primitives.ts`               | `export const RN_PRIMITIVES = new Set([...])`. Consumed during `extractComponents` to flag intrinsic-like elements. **Decision:** primitive names are still PascalCase JSX tags, so the existing `isComponent` boolean in `RenderNode` would mark them as components. The adapter post-processes: if `tag ∈ RN_PRIMITIVES`, force `isComponent: false` so Analyzer emits `kind:"element"` (parity with `<div>` for Next.js). |
| `core/styles/rn/stylesheet-create.ts` | **NEW**    | `src/core/styles/rn/stylesheet-create.ts`          | Generic — lives in `core/`, not in adapter. Detects `const styles = StyleSheet.create({ card: {...} })` (and `RN.StyleSheet.create`) and returns `Map<bindingName, Map<key, Record<prop, value>>>`. No adapter-specific knowledge. |
| `core/styles/rn/style-prop.ts`    | **NEW**        | `src/core/styles/rn/style-prop.ts`                 | Given a JSXElement and the StyleSheet map, resolve `style={styles.card}`, `style={[a,b]}`, `style={[a, cond && b]}` into a merged `Record<string, string \| { raw }>` matching `ComponentDefinition.inlineStyles`'s existing shape. |
| `core/styles/rn/index.ts`         | **NEW**        | `src/core/styles/rn/index.ts`                      | Façade: `extractRnStyles(ast, jsxElements, source, file) → ComponentStyleSignals` (same return shape as `core/extractors/index.ts`'s `collectStyleSignals`).                                                   |
| `core/extractors/tailwind/`       | **REUSED**     | (no change)                                        | NativeWind is `className="px-4 bg-red-500"` on RN elements — syntactically identical to web Tailwind. Existing extractor handles it without modification.                                                     |
| `adapters/select.ts`              | **NEW**        | `src/adapters/select.ts`                           | `selectAdapter(root): Promise<FrameworkAdapter>`. Reads target `package.json`. Both `next` and `expo-router` present → error `"Conflicting frameworks"`. Neither → error `"No supported framework detected"`. Strict error returned as `{ok:false, message}` so tool handlers turn it into MCP `isError:true`. |
| `mcp/tools/get-full-hierarchy.ts` | **MODIFIED**   | `src/mcp/tools/get-full-hierarchy.ts`              | (a) Replace `NextJsAdapter` import with `selectAdapter(root)`. (b) Relax `route` regex to drop Next-only special segments (parallel `@slot` already not in current regex; OK). Audit the existing regex against Expo Router segment grammar. |
| `mcp/tools/focus-on.ts`           | **MODIFIED**   | `src/mcp/tools/focus-on.ts`                        | Replace `NextJsAdapter` import with `selectAdapter`. No schema change.                                                                                                                                        |
| `mcp/tools/find-by-text.ts`       | **MODIFIED**   | `src/mcp/tools/find-by-text.ts`                    | Idem.                                                                                                                                                                                                          |
| `mcp/tools/find-by-style.ts`      | **MODIFIED**   | `src/mcp/tools/find-by-style.ts`                   | Idem. (No semantic change — `findByStyle` already matches against `styleKeys` which Analyzer scrapes from the `style={{...}}` expression. RN's `style={styles.card}` will resolve via `core/styles/rn`, but the **wire format consumed by `Analyzer.findByStyle` reads from the per-element style sidecar Map** populated by `scrapeStyleAttributes`. This means the RN style resolver's output must surface into that sidecar — see "Wiring point" below.) |
| `init/template.ts`                | **MODIFIED**   | `src/init/template.ts`                             | Add one paragraph mentioning Expo Router support. Bump `INIT_MARKER_VERSION` (the build-time constant) so re-runs detect a new template version.                                                              |
| `src/cli.ts`                      | **UNCHANGED**  | —                                                  | Adapter selection happens per tool-call, not at CLI startup. CLI cannot know `projectRoot` until the tool's args arrive (resolveRoot reads `args.projectRoot` first).                                          |
| `src/mcp/server.ts`               | **UNCHANGED**  | —                                                  | Tool registry is framework-agnostic.                                                                                                                                                                           |
| `src/core/Analyzer.ts`            | **UNCHANGED**  | —                                                  | Only consumes the `FrameworkAdapter` interface. `routeTreeCache` keying by route string, slot-substitution by `kind:"slot",name:"children"`, and `attachParallelSlot` all continue to work for Expo (which simply never emits parallel slots — `RouteMatch.slots` stays `{}`). |
| `src/ir/schema.ts`                | **UNCHANGED**  | —                                                  | See "IR schema impact" below — no new kinds required.                                                                                                                                                          |
| `src/renderers/*`                 | **UNCHANGED**  | —                                                  | Consume IR only.                                                                                                                                                                                               |
| `src/core/parser/`                | **UNCHANGED**  | —                                                  | Babel plugin set `["jsx", "typescript"]` parses RN TSX fine.                                                                                                                                                   |
| `src/core/resolver/`              | **UNCHANGED**  | —                                                  | tsconfig paths + barrel chase apply to RN repos identically.                                                                                                                                                   |
| `src/core/render-flow/`           | **UNCHANGED**  | —                                                  | JSX → `RenderNode` walking is framework-agnostic; the only knowledge that leaked into Next-specific logic was `runtime` (use-client/use-server), and that lives in `NextJsAdapter.buildComponentDefinition`. |

---

## Adapter selection — exact integration

### Where it lives

`src/adapters/select.ts` (new). It is **the only file outside `next/` and `expo/`** that knows about adapter implementations.

```typescript
// src/adapters/select.ts (sketch)
import type { FrameworkAdapter } from "./FrameworkAdapter.js";
import { NextJsAdapter } from "./next/NextJsAdapter.js";
import { ExpoRouterAdapter } from "./expo/ExpoRouterAdapter.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type SelectResult =
  | { ok: true; adapter: FrameworkAdapter; framework: "next" | "expo-router" }
  | { ok: false; code: "conflict" | "none" | "read-error"; message: string };

export async function selectAdapter(absRoot: string): Promise<SelectResult> {
  let pkg: { dependencies?: Record<string,string>; devDependencies?: Record<string,string> };
  try {
    pkg = JSON.parse(await readFile(join(absRoot, "package.json"), "utf8"));
  } catch (err) {
    return { ok: false, code: "read-error", message: `cannot read package.json at ${absRoot}` };
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const hasNext = !!deps?.["next"];
  const hasExpo = !!deps?.["expo-router"];
  if (hasNext && hasExpo) return { ok: false, code: "conflict", message: "both next and expo-router present" };
  if (hasNext) return { ok: true, adapter: NextJsAdapter, framework: "next" };
  if (hasExpo) return { ok: true, adapter: ExpoRouterAdapter, framework: "expo-router" };
  return { ok: false, code: "none", message: "neither next nor expo-router found in package.json" };
}
```

### Where it's called

Each of the 4 tool handlers, **after `resolveRoot` and before `new Analyzer(...)`**:

```typescript
// src/mcp/tools/get-full-hierarchy.ts (after edit)
const root = resolveRoot(args.projectRoot);
const sel = await selectAdapter(root);
if (!sel.ok) {
  return { content: [{ type: "text", text: sel.message }], isError: true };
}
const analyzer = new Analyzer({ root, adapter: sel.adapter });
```

### Why per-call, not at CLI startup

`projectRoot` resolves per tool call (arg > env > cwd). A user with `UI_TO_HIERARCH_ROOT` unset can call `get_full_hierarchy({ projectRoot: "/Users/x/repo-next" })` and `get_full_hierarchy({ projectRoot: "/Users/x/repo-expo" })` against the same server instance. Choosing the adapter at startup would lock the server to one framework. Per-call adds one `fs.readFile` per invocation (a few ms) — negligible vs. parsing.

### Adapter cache (optional micro-optimization)

`selectAdapter` could memoize `root → SelectResult` in module scope **without** violating ARCH-02 (ARCH-02 forbids cross-call **parse** state; static framework detection is metadata, not parsed user code, and stale results would self-heal on the next `package.json` change anyway). **Recommendation:** skip the cache in v1.2 for simplicity. Add it only if profiling shows it matters.

---

## Style-signal extraction — where each piece lives

### Decision: split by framework-coupling, not by language

| Signal                          | Lives in                                | Reasoning                                                                                                                                                                                                                                              |
| ------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NativeWind `className`          | **`core/extractors/tailwind/` (reuse)** | NativeWind is literally Tailwind for RN — same `className="..."` JSX surface, same `cn()`/`clsx()` call sites, same token grammar. No new code, no fork.                                                                                              |
| `StyleSheet.create({...})`      | **`core/styles/rn/` (new, generic)**    | The pattern `const X = StyleSheet.create({...})` is identifier-based detection (callee `StyleSheet.create`). It's syntactic, not adapter-policy. Lives in `core/` for the same reason `extractors/styled.ts` lives in `core/` (also identifier-based). |
| Inline `style={{...}}`          | **`core/extractors/inline-style.ts` (reuse)** | Already handles literals + raw expression slices into `Record<string, string \| {raw}>`. The shape matches what RN needs.                                                                                                                              |
| Style-array `style={[a, b]}`    | **`core/styles/rn/style-prop.ts` (new)** | Array merge is **specific to RN** (web React uses className for composition, not style arrays). But the resolver only needs the StyleSheet map + the JSX element — it's still pure syntax. Generic enough to live in `core/styles/rn/`.               |

### Why not put StyleSheet logic inside `ExpoRouterAdapter`?

Two reasons:
1. **Symmetry with `core/extractors/styled.ts`**: `extractStyledTemplates` is an identifier-driven extractor (callee `styled`) that lives in `core/` and is called by `collectStyleSignals`. `StyleSheet.create` is the same shape of problem. Keeping both in `core/styles/` or `core/extractors/` makes the codebase coherent.
2. **A future React Native CLI adapter (no Expo Router)** would want the same `StyleSheet.create` parsing. Putting it in `expo/` would force duplication when v1.3 ships.

### Wiring point inside the RN adapter

`ExpoRouterAdapter.extractComponents` mirrors `NextJsAdapter.extractComponents` but dispatches to `core/styles/rn`:

```typescript
// src/adapters/expo/ExpoRouterAdapter.ts (sketch of extractComponents)
import { collectStyleSignals } from "../../core/extractors/index.js";
import { extractRnStyles } from "../../core/styles/rn/index.js";
import { RN_PRIMITIVES } from "./rn-primitives.js";
// ...
const webSignals = collectStyleSignals(ast, jsxElements, source, file, opts);
const rnSignals = extractRnStyles(ast, jsxElements, source, file);
// Merge: NativeWind classNames come from webSignals; RN inline+stylesheet come from rnSignals
const merged = {
  classNames: webSignals.classNames,           // NativeWind
  inlineStyles: { ...webSignals.inlineStyles, ...rnSignals.inlineStyles },
  cssModuleRefs: [],                            // N/A for RN
  styledTemplates: webSignals.styledTemplates,  // styled-components/native exists; keep
};
```

### Style signal → Analyzer style sidecar

`Analyzer.scrapeStyleAttributes` (lines 61–99 of `Analyzer.ts`) currently reads only literal `className` strings and parses `style={{...}}` expressions in-line at the JSX site. **It does not consume `ComponentDefinition.inlineStyles`.** For `find_by_style` to match an RN element's `style={styles.card}` against a class/prop query like `"padding"`, **the resolved style keys must reach the per-element sidecar**.

**Recommended path:** the adapter resolves `style={styles.card}` into a literal/expression value **at the `RenderNode.attributes` level** (`JsxAttribute.value`) before Analyzer scrapes. Concretely:

- In `ExpoRouterAdapter.extractComponents`, after `walkRenderFlow` builds the `RenderNode` tree, post-process each `kind:"jsx"` node: if it has `style` attribute referencing a known `StyleSheet.create` key, rewrite the attribute value from `{ kind:"expression", source:"styles.card" }` to a synthetic expression containing the merged inline object, e.g. `{ kind:"expression", source:'{padding: 8, margin: 4}' }`. Analyzer's existing `parseExpression(...)` + `ObjectExpression` walker then extracts `["padding","margin"]` into the sidecar **with zero Analyzer change**.

**This is the single non-obvious wiring decision.** Document it in the adapter's header comment.

### Alternative considered

Add a new optional field `resolvedStyleKeys?: string[]` on `RenderNode { kind: "jsx" }` and teach Analyzer to read it. **Rejected** because it forces a parser-types contract change for one framework, breaking the "adapter is data-shape-equivalent" symmetry.

---

## IR schema impact — none

Existing 9 kinds (`component`, `element`, `text`, `branch`, `list`, `slot`, `error`, `fragment`, `spread`) cover every RN tree shape we encountered:

| RN construct                                | IR mapping                                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `<View><Text>Hi</Text></View>`              | `element(View) → element(Text) → text("Hi")` (after RN_PRIMITIVES post-process flips `isComponent`)   |
| `<MyCard />` (user component)               | `kind:"component"` — same as Next                                                                     |
| `{cond && <Foo/>}` / ternary                | `kind:"branch"` — same                                                                                 |
| `items.map(x => <Row/>)`                    | `kind:"list"` — same                                                                                   |
| `<FlatList renderItem={...}/>`              | `kind:"element"` (FlatList is in RN_PRIMITIVES); `renderItem` callback is not unpacked in v1 (parity with current Next behavior for similar render-prop patterns). |
| `_layout.tsx` wrapping `<Stack/>` + children | `kind:"component"(Layout) → kind:"element"(Stack) → kind:"slot",name:"children"` — Analyzer's existing `injectChildrenSlots` works unchanged |
| Expo Router `<Tabs/>` / `<Stack/>`          | `kind:"element"` (added to RN_PRIMITIVES under "expo-router primitives" sub-set)                       |

### `layoutHint` field

Currently optional `layoutHint?: string` is used only for `"client"` (set when `runtime === "client"`). For RN it's always client-side. **Decision:** leave `layoutHint` unset for RN nodes. Don't repurpose it for "screen vs modal vs tab" — that's a future v1.3 feature requiring an actual contract change. v1.2 is style-signal extraction + routing only.

### `attributes` field

Already `Array<{ name: string; value: string }>` (literal strings only). NativeWind `className`, RN string props (`accessibilityLabel`, `testID`), and resolved single-key style strings all fit. No change.

---

## Data flow (per tool call) — annotated

```
MCP client (Claude Code, Cursor, ...)
        │
        │ JSON-RPC over stdio
        ▼
src/mcp/server.ts (McpServer.registerTool)
        │
        ▼
src/mcp/tools/<tool>.ts handler
        │
        │ 1. resolveRoot(args.projectRoot)         ← ARCH-03 unchanged
        │ 2. selectAdapter(root)                   ← NEW
        │       ├─ next deps → NextJsAdapter
        │       ├─ expo-router deps → ExpoRouterAdapter
        │       ├─ both → error envelope
        │       └─ neither → error envelope
        │ 3. new Analyzer({ root, adapter })       ← unchanged
        │
        ▼
src/core/Analyzer.ts (unchanged)
        │
        │ adapter.discoverEntries(root)
        │ adapter.mapRouteToEntry(root, route)
        │ adapter.extractComponents(ctx, [file])
        │   ↳ NextJsAdapter           OR        ExpoRouterAdapter
        │       │                                  │
        │       │ core/parser/parseFile           │ core/parser/parseFile
        │       │ core/render-flow/walkRenderFlow │ core/render-flow/walkRenderFlow
        │       │ core/extractors/collectStyle.. │ core/extractors/collectStyle.. (Tailwind/NativeWind)
        │       │                                  │ core/styles/rn/extractRnStyles
        │       │                                  │ rn-primitives.ts post-process (isComponent flip)
        │       │                                  │ style-prop.ts (rewrite RenderNode style attr → expanded)
        │       ▼                                  ▼
        │     ComponentDefinition[] ←─── identical shape, 13 fields ───┘
        │
        │ adapter.resolveModule(...) for component callsites
        │
        ▼
TreeNode tree → renderers/markdown.ts | json.ts (unchanged)
        │
        ▼
MCP response { content: [{ type:"text", text }] }
```

---

## Recommended build order

Strict dependency ordering — each step is shippable independently with the previous step landed.

1. **`adapters/expo/rn-primitives.ts`** — pure constant set. Zero deps. Smallest possible "RN exists" beachhead.
2. **`adapters/expo/segments.ts` + `expo/discover.ts` + `expo/detect.ts`** — file-system / package.json probes, no parser involvement. Can be tested with fixture directories alone.
3. **`core/styles/rn/`** — generic StyleSheet parsing. Independent of any adapter; testable in isolation with a Babel AST fixture.
4. **`adapters/expo/route-map.ts`** — depends on `segments.ts` and `discover.ts`. No Analyzer dep.
5. **`adapters/expo/ExpoRouterAdapter.ts`** — wires steps 1–4 into the 5-method shape. Calls `core/parser`, `core/extractors`, `core/styles/rn`, `core/resolver`, `core/render-flow`. At this point you can unit-test `ExpoRouterAdapter` against a fixture Expo Router project **without touching the MCP layer**.
6. **`adapters/select.ts`** — depends on both `NextJsAdapter` (existing) and `ExpoRouterAdapter` (step 5).
7. **MCP tool handler edits** — 4 files, identical 3-line edit (resolveRoot → selectAdapter → Analyzer). Depends on step 6. Also bump the route regex in `get-full-hierarchy.ts`.
8. **Fixtures + integration tests** — 2 Expo Router fixtures (basic + tabs/dynamic params). Adds to existing `test/integration/mcp-e2e.test.ts`. Depends on step 7.
9. **`init/template.ts` update + INIT_MARKER_VERSION bump** — one-paragraph addition. Independent of steps 5–8; can ship in parallel.

### Critical-path note

Steps 1–5 do not break any v1.1 behavior — they only add files. Step 6 is the first commit that introduces a new import edge into the build. Step 7 is the first commit that changes existing tool handlers — that is where regression risk concentrates. Run the **full** existing test suite (353 cases) between step 7 and step 8 to catch any unintended Next.js regression before integration tests land.

---

## Cross-cutting concerns

### Error envelope from `selectAdapter`

Tool handlers currently return `{ content: [{ type:"text", text }] }` on success and lean on `withErrorBoundary` for throws. Adapter selection failures are **expected**, not exceptional. Recommendation:

```typescript
if (!sel.ok) {
  return {
    content: [{ type: "text" as const, text: sel.message }],
    isError: true,  // MCP convention from MCP-03
  };
}
```

This matches the v1.0 MCP-03 convention. Document in `mcp/errors.ts` if a new helper is wanted (`adapterSelectionError(sel)`), but a 3-line inline branch is fine.

### Route regex relaxation

`src/mcp/tools/get-full-hierarchy.ts` lines 20–22 hard-code a route regex tailored to Next App Router. Expo Router's segment grammar is a **strict subset** of what the current regex permits (no parallel `@slot` or intercepting `(.)/(..)/(...)`), so the regex **already accepts every valid Expo Router route**. **Verify** by adding Expo route fixtures to the existing regex unit test. Likely zero change required. If false positives matter (e.g. user passes `/(group)/items` which is valid for Expo but invalid as a routing URL — groups are transparent in both frameworks), document the canonical input form: routes are URLs, not file paths; groups are stripped before route matching by `mapRouteToEntry`.

### Test architecture invariant

The existing `test/architecture/island.test.ts` asserts nothing under `src/core/`, `src/ir/`, `src/renderers/` imports from `src/adapters/`. **`src/core/styles/rn/` must not import from `src/adapters/`**. The island gate will fail loudly if violated — good guardrail.

### Stdout/stderr discipline

Adapter selection failures **must not** call `console.*` — biome `noConsole: error` applies to `src/mcp/**`. Either throw (caught by `withErrorBoundary`) or return `isError: true`. The latter is preferred for expected outcomes.

### CRLF/path discipline

Expo fixtures must use forward-slash paths in expected output. The existing `toForwardSlash` discipline at every TreeNode build site continues to apply. Windows path gate (regex `/^[^\\]*$/` per node) catches violations in test.

### `next.config.*` vs Expo detection precedence

A Next.js project may transitively include `expo-router` (extreme edge case; nobody does this on purpose). Recommendation: `selectAdapter` does **not** read `next.config.*` or `app.json` — package.json deps are authoritative. Conflict explicitly errors. Better to fail loudly than guess.

---

## Anti-patterns to avoid

### Anti-pattern 1: Adapter-specific logic leaking into `Analyzer`

**What people do:** Add a `if (adapter.framework === "expo") { ... }` branch in `Analyzer.buildTreeForEntry` to handle RN.
**Why wrong:** Breaks ARCH-01 — the 5-method interface is the only contract. Adding framework branches in `core/` couples it to specific frameworks and forces every future adapter to update Analyzer.
**Do instead:** Anything framework-specific lives in the adapter's `extractComponents` (post-processing the `RenderNode` tree before returning) or in `mapRouteToEntry`.

### Anti-pattern 2: Adding a new `TreeNode` kind for RN primitives

**What people do:** Add `kind:"rn-element"` to distinguish from web `kind:"element"`.
**Why wrong:** IR schema bump that breaks every renderer, snapshot, and downstream tool consumer. Doubles the surface for trivial discrimination.
**Do instead:** Keep `kind:"element"`; the `tag` field (`View`, `Text`, `div`, `span`) is self-describing. If consumers ever need to filter "RN only", they can match on the RN_PRIMITIVES set.

### Anti-pattern 3: Caching `selectAdapter` results across calls without invalidation

**What people do:** Module-scope `Map<root, FrameworkAdapter>` cache.
**Why wrong:** If a user changes their `package.json` (added `expo-router`), the cache won't see it until the server restarts. Confusing for users iterating on a multi-framework monorepo.
**Do instead:** Skip the cache in v1.2; profile first if there's a real perf complaint.

### Anti-pattern 4: Putting `StyleSheet.create` parsing inside `ExpoRouterAdapter`

**What people do:** Inline it for "cohesion".
**Why wrong:** A future plain-React-Native adapter (no Expo Router) would need a duplicate. The pattern is identifier-syntactic, not routing-coupled.
**Do instead:** `core/styles/rn/` — generic.

---

## Integration points summary table

| New code touchpoint                              | Existing surface it integrates with                               | Direction         |
| ------------------------------------------------ | ------------------------------------------------------------------ | ----------------- |
| `ExpoRouterAdapter` (5 methods)                  | `FrameworkAdapter` interface in `src/adapters/FrameworkAdapter.ts` | implements        |
| `ExpoRouterAdapter.extractComponents`            | `core/parser/parseFile`, `core/render-flow/walkRenderFlow`, `core/extractors/collectStyleSignals`, `core/styles/rn/extractRnStyles`, `core/resolver/resolveModule` | calls (allowed: adapter → core) |
| `core/styles/rn/*`                               | (none — leaf module, consumed by `ExpoRouterAdapter`)              | consumed by       |
| `adapters/select.ts`                             | `next/NextJsAdapter`, `expo/ExpoRouterAdapter`                     | imports both      |
| `mcp/tools/*.ts` handlers (4 files)              | `selectAdapter` (new), `Analyzer` (unchanged)                      | calls             |
| Analyzer.scrapeStyleAttributes (lines 61–99)     | (unchanged) reads `RenderNode.attributes` — adapter is responsible for ensuring `style` attributes are pre-expanded for RN | indirect (via shape contract) |
| `init/template.ts`                               | `INIT_MARKER_VERSION` build constant in `tsup.config.ts`           | depends on        |

---

## Sources

- Repo file `src/adapters/FrameworkAdapter.ts` — interface contract.
- Repo file `src/adapters/types.ts` — `ComponentDefinition` (13 fields, R8 lock), `RouteMatch`, `ResolveResult`, `ParseContext`, `RenderNode`.
- Repo file `src/adapters/next/NextJsAdapter.ts` — reference implementation pattern to mirror for Expo.
- Repo file `src/core/Analyzer.ts` — confirms adapter consumed via interface only; verified style sidecar wiring in `scrapeStyleAttributes` (lines 61–99).
- Repo file `src/core/extractors/index.ts` — `collectStyleSignals` shape that `core/styles/rn/extractRnStyles` must mirror.
- Repo file `src/mcp/tools/get-full-hierarchy.ts` — confirms tool-handler adapter wiring site and route regex.
- `.planning/PROJECT.md` — Constraints (Node ≥20, ESM, Babel pipeline), Key Decisions (adapter island, parse-on-demand).
- `.planning/MILESTONES.md` v1.0/v1.1 — confirms 5-method lock and absence of `core/styles/` directory.
