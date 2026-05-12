# Pitfalls Research — v1.2 Expo Router + React Native Adapter

**Domain:** Integration pitfalls — adding a SECOND `FrameworkAdapter` (Expo Router + RN) to a system shipped with NextJsAdapter only
**Researched:** 2026-05-12
**Confidence:** HIGH on the code-archaeology pitfalls (verified against `src/adapters/`, `src/core/`, `src/core/extractors/`, `Analyzer.ts`); MEDIUM on RN/Expo ecosystem specifics (cross-checked against Expo Router docs, NativeWind docs, RN StyleSheet docs; flagged where LOW)

> Supersedes the v1.0/v1.1 pitfalls research previously at this path. v1.0/v1.1 pitfalls are now part of the validated shipping discipline (Windows path forward-slash invariant, `traverse` ESM interop shim, MCP stdio stderr-only diagnostics, atomic `--init` write with EXDEV fallback) and aren't re-litigated here.

---

## Critical Pitfalls

### Pitfall 1: Cementing Next.js assumptions into the IR/Analyzer by writing the second adapter against today's `FrameworkAdapter` contract

**What goes wrong:**
The 5-method `FrameworkAdapter` interface looks framework-agnostic, but the call sites in `src/core/Analyzer.ts` are not. Concrete leaks discovered in code:

1. `deriveRoutesFromEntries` (Analyzer.ts:1194-1233) is hard-coded to Next.js: it walks `app/` or `src/app/`, treats `(group)` as transparent, `@slot` as parallel-route folder, and `_` prefix as private. Expo Router uses `(group)` and `[param]` similarly **but has NO `@slot` concept**, has NO private-folder convention, and adds `+not-found.tsx` + `+html.tsx` + `+native-intent.tsx` that this function does not know about. Routes for an Expo project will be silently mis-derived.
2. `buildRouteTree` (Analyzer.ts:891-932) hard-codes Next.js file-role semantics via `isPageFile` / `isLayoutFile` / `isSpecialFile` (Analyzer.ts:663-677) using regexes for `page|layout|template|loading|error|not-found|default`. Expo Router's equivalents are `_layout.tsx` (NOT `layout.tsx`) and the page is **any non-`_`-prefixed file**, not specifically `page.tsx`. These regexes will reject every Expo file.
3. `attachParallelSlot` (Analyzer.ts:396-429) only exists because Next.js has parallel routes. The slot infra is in the framework-agnostic Analyzer, not the adapter. For Expo it is dead weight that should still be reachable (zero parallel slots is fine), but surrounding code treats `rm.slots` as always-meaningful.
4. `runtime: "use client" | "server"` propagation (NextJsAdapter.ts:137-140, Analyzer.ts:178-196 `layoutHint = "client"`) is App-Router-specific. RN has no client/server boundary. The `TreeNode.layoutHint` field needs either a Native-flavored value or to stay unset — but the markdown renderer probably emits `[client]` glyphs based on it.
5. The `<Slot/>` problem: `collectChildrenSlotLines` (Analyzer.ts:495-507) looks for `Identifier("children")`. Expo Router's analogue is `<Slot/>` from `expo-router` — a JSX element, not an identifier. Layout-chain wrapping will produce empty children arrays for every Expo `_layout.tsx`.

**Why it happens:**
v1.0 shipped one adapter. Every place the Analyzer "knew about routing" was free to assume Next.js semantics because the test fixtures all looked like Next.js. The 5-method interface was the *narrow waist*, but the wide ends on either side (`deriveRoutesFromEntries`, `isPageFile`, `injectChildrenSlots`) silently absorbed Next.js conventions.

**How to avoid:**
- Move `deriveRoutesFromEntries`, `isPageFile`, `isLayoutFile`, `isSpecialFile` into the adapter, or expose them as additional methods on `FrameworkAdapter`. Concretely: add `classifyEntry(absPath): "page" | "layout" | "other"` and `enumerateRoutes(absRoot): Promise<string[]>` to the contract. (The locked-5-methods test at `test/adapters/FrameworkAdapter.test.ts` will fail — that is the *correct* trigger to widen the interface deliberately, with a milestone amendment note.)
- For slot injection: add an adapter-provided slot-marker predicate `(name: string, importSource: string) => boolean` so Next.js still uses `{children}` and Expo uses `<Slot/>` from `expo-router`.
- Treat `layoutHint = "client"` as a Next-specific value. Introduce `layoutHint?: "client" | "native"` (or framework-neutral set) in `src/ir/schema.ts` and let each adapter populate it.
- Write the ExpoRouterAdapter *test fixture first* (Pitfall 9) and run the existing Analyzer against it as a forcing function — every place it silently produces an empty tree marks a leaked assumption.

**Warning signs:**
- ExpoRouterAdapter passes its unit tests but `getFullHierarchy("/")` against an Expo fixture returns `buildFragmentRoot([])`.
- Snapshot diffs show Expo `_layout.tsx` entries dropped because the file-role regex matched `layout.` but not `_layout.`.
- `collectChildrenSlotLines` returns 0 lines on an Expo `_layout.tsx` that visibly contains `<Slot/>`.
- v1.0 snapshots flip when the abstraction is widened — those are *real* changes the locking test should catch.

**Phase to address:**
Phase 1 — Interface widening & Analyzer de-Next-ification. Must precede any ExpoRouterAdapter implementation, otherwise the second adapter will be born monkey-patching around Analyzer assumptions.

---

### Pitfall 2: Adapter auto-detect that reads `package.json` naively — false positives, monorepos, missing files

**What goes wrong:**

1. **Monorepo with both** — `apps/web/` has `next` and `apps/mobile/` has `expo-router`, both in the workspace root's `package.json` (yarn classic hoists; pnpm doesn't). The current Next detect (`src/adapters/next/detect.ts:14-35`) anchors on `next.config.*` + `app/` directory presence, **not** `package.json`. That heuristic is robust. If the Expo detect uses only `package.json`, the two strategies disagree and both can "win" — non-deterministic adapter selection.
2. **Dep present, not used** — a project includes `expo-router` for a sub-package or doc example, but `app/` is empty or doesn't follow Expo conventions. A package-only check returns `true` and the adapter then returns 0 entries from `discoverEntries`, producing an empty IR with no diagnostic.
3. **Missing `package.json`** — passing `--root` at a sub-directory inside an Expo app where the `package.json` lives one level up. `fs.access` of the missing file should yield `false`, not throw.
4. **Tooling-only Expo presence** — `expo` installed without `expo-router` (plain Expo app using React Navigation). Auto-detect should NOT claim this is "Expo Router" — only the *router* package signals our adapter applies.
5. **Conflict resolution** — both `expo-router` AND `next.config.*` + `app/` exist. PROJECT.md v1.2 says "conflict → error rõ ràng". The error must tell the user *which sub-directories matched* and how to disambiguate, not just "ambiguous".

**Why it happens:**
`package.json` is the lazy "what is this project" lookup. Real projects mix tooling. Next.js's detector anchored on `next.config.*` (a config file is harder to leave behind by accident than a dep). Expo Router has no equivalent always-present marker — its config lives in `app.json`/`app.config.{js,ts}` which exist in *every* Expo project, not just Router ones.

**How to avoid:**
- Mirror Next's two-signal pattern: **Expo Router detect = `expo-router` in `package.json` deps AND `app/` directory with at least one `_layout.tsx` OR a route file**. The `_layout.tsx` is the cheapest unique-to-Router signal.
- Make detect run in parallel and require **exactly one** to return `true`. Two → fail with both matches in the error; zero → fail with both negatives. Wire this in CLI/MCP boot, not adapters.
- Surface the detected adapter on stderr at boot (existing stderr convention): "detected: ExpoRouterAdapter (matched: package.json/expo-router, app/_layout.tsx)".
- Add an explicit `--framework next|expo` CLI override that bypasses auto-detect — escape hatch for conflict case and CI determinism.
- Treat *any* fs error in detect as `false` (D-12 no-throw, mirroring `next/detect.ts:38-45`).

**Warning signs:**
- Test runs choose the wrong adapter on a monorepo fixture and produce empty trees.
- "Framework not detected" fires on a valid Expo project with `app.json` but no `_layout.tsx` at root (signals markers too strict).
- "Both matched" error doesn't name the matching paths.

**Phase to address:**
Phase 2 — adapter detection + selection wiring. Ship with at least one monorepo fixture exercising both adapters present (mirroring v1.0's `pnpm-monorepo` fixture).

---

### Pitfall 3: `StyleSheet.create({...})` lookups assumed to be locally declared and statically literal

**What goes wrong:**
Obvious implementation: walk AST, find `const styles = StyleSheet.create({ card: { padding: 8 } })`, build `Map<keyName, propsObject>`, then on `<View style={styles.card}/>` look up `card` and emit `{ padding: "8" }`. This breaks on every realistic codebase:

1. **Styles imported from another file** — `import { styles } from "./styles"`. The `styles` binding inside the component file points at an external module; the single-file extractor pipeline (`src/core/extractors/index.ts`) doesn't follow it.
2. **Computed keys** — `styles[variant]` / `styles["card-" + size]`. No static answer; must collapse to `{ raw }` per inline-style precedent (`extractInlineStyle` line 47).
3. **Spread inside `StyleSheet.create`** — `StyleSheet.create({ ...baseStyles, card: {...} })` — same cross-file problem as #1 if `baseStyles` is imported.
4. **Factory functions** — `const makeStyles = (theme) => StyleSheet.create({...}); const styles = makeStyles(useTheme())`. The walker sees `styles = makeStyles(...)` — a CallExpression, not `StyleSheet.create`. No way to resolve without execution.
5. **Hook-returned styles** — `const styles = useStyles()`. Same as #4.
6. **`StyleSheet.flatten([...])`** — merges array of style objects/IDs. RN-specific.
7. **Re-export through a barrel** — `import { styles } from "@/styles"`. Existing barrel chase covers this *if* we plug into it.

**Why it happens:**
StyleSheet is a runtime registry — the `{padding:8}` only exists at runtime. Static analysis has to accept low-recall/high-precision subset or pretend to handle more and silently lie.

**How to avoid:**
- Define an explicit **support matrix** before coding. v1.2 target: (a) in-file `StyleSheet.create({...})` with literal keys, identifier lookups `styles.card`; (b) imported `styles` from a sibling file, **single-hop only** (no re-export chains in this pass — defer); (c) computed/factory/hook → `{ raw }` + warning; (d) `StyleSheet.flatten` → unsupported, raw + warning.
- For case (b): reuse `core/resolver` — call `adapter.resolveModule` for the import source, parse the resolved file (reuse `ParseContext.astCache`), find the named export, walk its `StyleSheet.create`. Bounded one-hop work.
- Snapshot tests must include fixtures for *each unsupported case* asserting the `{ raw }` shape + warning.
- Decide explicitly whether `styleKeys` holds the *property keys* (e.g. `padding`, `margin`) or the *named StyleSheet key* (e.g. `card`). Keep Next.js interpretation ("CSS property names") and have `find_by_style("card")` match the lookup-key separately (new index dimension).

**Warning signs:**
- A user file using `import { styles } from "./styles"` returns no `styleKeys` for any element.
- `find_by_style("padding")` works on inline-style fixtures but returns nothing on `StyleSheet.create` fixtures with `padding:`.
- A computed-key access throws or returns empty object instead of `{ raw }`.

**Phase to address:**
Phase 4 — RN style signal extraction. Publish the support matrix as a doc comment in `src/core/extractors/rn-stylesheet.ts` so reviewers can confirm scope before debating implementation.

---

### Pitfall 4: `style={[a, b, dynamic && styles.c]}` array merge — falsy branches and `layoutHint`

**What goes wrong:**
RN `style` accepts an array: `style={[styles.base, styles.padded, isActive && styles.active, { marginTop: top }]}`. Concrete issues:

1. **Order matters** — later entries override earlier (last-wins per property). IR has no property-level merge; just records keys. For `find_by_style` the union is what matters.
2. **Falsy / conditional entries** — `isActive && styles.active`. At static time we don't know `isActive`. **Both branches** should contribute to the styleIndex (so `find_by_style("active")` still finds the element), but `src/core/render-flow/conditionals.ts` is built for JSX children, not attribute values. v1's `findByStyle` walks the tree and matches via the sidecar keyed by `file:line:tag`, so a conditional style branch attached to the same JSX element hits the same key with merged data. **Recommend: union flatten** (recall-favoring).
3. **Spread arrays** — `style={[...baseStyles, styles.x]}` — cross-file problem (Pitfall 3).
4. **Nested arrays** — `style={[[a, b], c]}` is legal. Recursive flatten required.
5. **`layoutHint` consequences** — if `isLayoutClass` (`tailwind/layout-prefixes.ts`) is generalized for RN, conditional `flex: 1` inside a falsy entry should still mark element as "potentially layout-affecting". Conservative answer: treat conditional layout signals as layout-affecting (precision loss but keeps the agent-helpfulness property).
6. **Mixed object + ID** — legacy `StyleSheet.create` returned numeric IDs. `style={[42, {...}]}` is technically valid; treat as opaque.

**Why it happens:**
Web `className` is a flat string. RN `style` is a polymorphic mini-DSL (object | array | falsy | ID), and conditional contribution to layout-hint has no parallel in v1 Next.js code.

**How to avoid:**
- Write array-flatten as a small dedicated function (`flattenStyleArray(expr): StyleEntry[]`) before integrating. Unit-test in isolation against ≥8 shapes (literal array, conditional entry, spread, nested, mixed types, empty array, single element, expression-only).
- Falsy-branch entries contribute to the styleIndex *union*; warn if the branch contains an identifier lookup we couldn't resolve.
- Pin the v1.2 stance on conditional `layoutHint` in `ARCHITECTURE.md` so it doesn't become a litigation point during phase reviews.
- Mirror inline-style's `__spread_${i}` convention (`extractInlineStyle:33`) for array entries we can't statically resolve.

**Warning signs:**
- `find_by_style("active")` misses elements styled as `style={[base, cond && styles.active]}`.
- Array-form style emits single `{raw}` instead of decomposed keys.
- Snapshot of `<View style={[styles.row, isOpen && styles.expanded]}>` doesn't show `expanded`'s keys present.

**Phase to address:**
Phase 4 — style signal extraction. Lands *after* Pitfall 3's StyleSheet resolution because the array-flatten calls into it.

---

### Pitfall 5: NativeWind className treated as web Tailwind by `find_by_style` and `isLayoutClass`

**What goes wrong:**
NativeWind v4 uses Tailwind class names on RN elements (`<View className="flex-1 p-4 bg-red-500">`). Temptation: reuse `extractTailwindClasses` and the `LAYOUT_PREFIXES` list. Where this breaks:

1. **`bg-*` / `text-*` colors** — identical to web. ✓ Reuse works.
2. **Platform variants** — NativeWind v4 supports `ios:`, `android:`, `web:`, `native:` variants (e.g. `ios:bg-blue-500`). v1's variant-strip regex needs to handle arbitrary `prefix:` — verify before assuming reuse. If it strips them, layout-class check matches; if not, layout detection silently fails on every prefixed class.
3. **Web-only no-ops** — `block`, `inline-block`, `float-left`, `clear-both`, `cursor-pointer`. NativeWind ignores them at runtime. `find_by_style("inline-block")` would still match (we don't know it's a no-op on RN). Precision loss, not correctness bug — callout only.
4. **RN-only classes** — `font-system` or platform-specific colors. `isLayoutClass` is allow-list so unknowns pass through `kind:"raw"` (`extractTailwindClasses:37`). ✓ Probably fine.
5. **`tw\`...\`` tagged template** — current extractor only looks at `className` attributes. **Decide: support `tw\`...\`` in v1.2 or document unsupported.** Recommend: unsupported, warn when seen.
6. **`className` on non-NativeWind RN primitives** — someone passes `className` to `<View>` without `nativewind` configured. Meaningless at runtime, but we'll index it. Acceptable precision loss.
7. **`space-y-*`** — web-only utility (sibling margin). No great RN equivalent; arguably shouldn't be promoted to layout-hint. Edge case; document, don't fix in v1.2.

**Why it happens:**
NativeWind is *deliberately* compatible with web Tailwind syntax. 80% just works. The 20% is where wrongness hides.

**How to avoid:**
- Add NativeWind variants test to the Tailwind extractor: assert `ios:` / `android:` / `web:` / `native:` strip the same way `hover:` / `md:` do.
- Document in `STACK.md` that v1.2 reuses `extractTailwindClasses` unchanged for NativeWind; only the *extraction-trigger predicate* might need to expand.
- Add fixture: Expo Router project with `nativewind` + `tailwind.config.js`, exercising at least one platform-variant class and one falsy-conditional via `cn(...)` helper. Snapshot `find_by_style`.
- For `tw\`...\``: catch the binding usage with a one-line check and emit a warning. Don't silently miss it.

**Warning signs:**
- `find_by_style("flex-1")` works on `className="flex-1"` but misses `className="ios:flex-1"`.
- Snapshot for NativeWind fixture shows no `classNames` populated despite className attributes in source.
- Agent reports "Tailwind classes my screenshot suggests aren't matching" on a real Expo project.

**Phase to address:**
Phase 4 — combined with Pitfall 4. Variant-strip test lives next to existing `tailwind/layout-prefixes` tests.

---

### Pitfall 6: Expo Router routing edge cases — groups, `+`-prefixed specials, typed routes, tabs introspection

**What goes wrong:**
Expo Router's filesystem routing *looks* like Next.js but diverges. Verified against Expo Router docs:

1. **Group routes `(group)` don't add URL segments** — same as Next.js; ✓ existing logic handles it (Analyzer.ts:1221) once moved into the adapter.
2. **Tab/stack layouts** — `_layout.tsx` inside `(tabs)/` typically default-exports `<Tabs>` from `expo-router`, with `<Tabs.Screen>` children. The agent needs to see tab structure: walk JSX of `<Tabs>` and surface its `<Tabs.Screen name="...">` children as virtual entries. Without this, tabs `_layout.tsx` looks empty of meaningful structure.
3. **`+not-found.tsx`** — wildcard 404 route, matched only when no other route matches. The `+`-prefix is **not** in any current regex. It will either be treated as a static segment (wrong) or rejected (loses the file). Recommend: register but exclude from URL-walk, surface in fixture tests.
4. **`+html.tsx` / `+native-intent.tsx`** — web/native entry points. Out of scope for v1.2 routing; explicit exclusion list with rationale comment.
5. **`index.tsx` semantics** — same as Next's `page.tsx` (file represents the route at parent's URL). Map `index.tsx` → "page at this segment" inside the Expo adapter's tree-builder.
6. **Dynamic segments `[param]`, `[...rest]`, `[[...opt]]`** — same syntax. ✓ `classifySegment` (`src/adapters/next/segments.ts`) is reusable *if lifted* to a framework-neutral location. Refactor, don't copy-paste.
7. **No `@slot` parallel routes** — drop that branch in Expo route-map.
8. **No intercepting routes** — drop those too.
9. **Typed routes (Expo Router v3+)** — generates `.expo/types/router.d.ts`. **Does NOT affect filesystem routing.** Just ensure `tinyglobby` ignores it (already excluded via `node_modules` rule — verify `.expo/` too).
10. **Root layout vs nested layouts** — `app/_layout.tsx` is always-present at runtime. Static analysis can tolerate its absence (just less wrapping).
11. **`(tabs)/(stack)/route` deep nesting** — multiple group + layout layers. Existing Next layout-chain walker handles this *if* `discoverEntries` returns root-down order. Confirm.

**Why it happens:**
The two systems share heritage but diverge in details. Re-implementing from Next adapter line-by-line is faster than reading docs — exactly where bugs come from.

**How to avoid:**
- Lift `classifySegment` to `src/core/routing/segments.ts` or accept duplication explicitly with a `// SHARED` comment block and sync test.
- Write Expo route-map to handle: groups (transparent), dynamic/catch-all (same as Next), `index.tsx` (page), `_layout.tsx` (layout), `+*.tsx` (registered but not URL-mapped).
- Tabs/Stack/Drawer recognition: when `_layout.tsx` default-export's JSX root is `Tabs`/`Stack`/`Drawer` from `expo-router`, record `<Tabs.Screen>` `name` props in the IR. v1.2 minimum: enumerate in a warning. v2 ambition: model as virtual route segments.
- Fixture coverage: (a) basic single-route, (b) tabs with three screens + one nested stack, (c) dynamic param `[id].tsx` inside a group, (d) deep group nesting `(tabs)/(stack)/foo`.

**Warning signs:**
- `get_full_hierarchy("/")` on Expo fixture returns just `app/index.tsx` — no `_layout.tsx` wrapping.
- Route accessible via tabs (`/profile` inside `(tabs)/profile.tsx`) returns "route not matched".
- `+not-found.tsx` appears as route `/+not-found`.
- Typed-routes-enabled project produces parse errors on `.expo/types/router.d.ts`.

**Phase to address:**
Phase 3 — ExpoRouterAdapter routing. The `<Tabs>`-introspection nicety is a Phase 3 stretch; basic routing lands cleanly first.

---

### Pitfall 7: RN primitive vs user-defined `<Text>` — disambiguate via import source, not name

**What goes wrong:**
RN has **capitalized** primitive names: `<View>`, `<Text>`, `<ScrollView>`, `<Image>`, `<Pressable>`, `<FlatList>`, `<SectionList>`, `<Touchable*>`, `<Modal>`, `<Switch>`, `<TextInput>`, `<KeyboardAvoidingView>`. The capital-letter convention means existing `isComponent` detection (which keys on capitalized JSX names per `src/core/render-flow/component-detect.ts`) will treat ALL of these as "components" — even though for layout-hint purposes they're primitives (the RN equivalent of `<div>`).

The disambiguation: a user writes their own `Text` component in `@/components/Text`. Now `<Text>` in JSX could be the RN primitive (no navigable file — it's in `node_modules/react-native`) or their wrapper (resolve to `@/components/Text.tsx`). Verified in current code: `resolveComponentCallsites` (Analyzer.ts:273-349) **already uses import bindings** to disambiguate — it calls `adapter.resolveModule(...)` per callsite and respects `kind:"external"` vs `kind:"local"`. The *machinery is there*. What's missing:

1. An "RN primitives" recognition list, to mark `<View>`/`<Text>`/etc imported *from `"react-native"`* with `kind:"element"` (like `<div>`) or `layoutHint:"rn-primitive"`. Without it, the markdown renderer prints every `<View>` as a component (technically true, but loses the visual cue distinguishing "RN scaffolding" from "user component I can drill into").
2. Recognition keys on **import source `"react-native"`**, not tag name. `<Text>` from `@/components/Text` stays a component; `<Text>` from `"react-native"` reclassifies.
3. Namespace imports (`import * as RN from "react-native"; <RN.View/>`) — explicitly skipped by `collectImportBindings` (Analyzer.ts:155 carve-out). Acceptable v1.2 limitation; warn when detected.
4. Re-exports — `export { View } from "react-native"` in a shim file. The barrel-chase resolver (`core/resolver/barrel.ts`) should follow this. Verify with a fixture.
5. Sister-package primitives: `<SafeAreaView>` in `"react-native-safe-area-context"`; `<Image>` may be RN built-in OR `expo-image`; `<StatusBar>` in `expo-status-bar`. **Decide: strictly `"react-native"` in v1.2** with a doc comment listing deferred packages and an extension point.

**Why it happens:**
Capitalization-based heuristic is the JSX standard for distinguishing components from intrinsic elements. RN broke that convention by making all primitives capitalized. The resolver-based disambiguation is the correct fix; the v1.0 architecture already supports it — we just have to use it.

**How to avoid:**
- Define `RN_PRIMITIVES: ReadonlySet<string>` in `src/adapters/expo/primitives.ts`. Verify against `react-native`'s types to avoid drift (pin version in `STACK.md`).
- In the resolver pass, after resolving the import source, if `source === "react-native"` AND `importedName ∈ RN_PRIMITIVES`, set TreeNode's `kind:"element"` OR keep `kind:"component"` + add `layoutHint:"rn-primitive"`. Latter is less invasive but requires renderer updates.
- Snapshot test: `<View>` from `react-native` vs `<View>` from user component file produce visibly different tree nodes.

**Warning signs:**
- `focus_on("View")` returns hundreds of matches across every RN component (true but useless).
- `find_by_text` on `<Text>Hello</Text>` works, but tree printer shows `Text` as navigable component with `file: node_modules/react-native/...`.
- User-wrapped `<Text>` misclassified as RN primitive because resolver doesn't follow its import.

**Phase to address:**
Phase 5 — RN primitive recognition + IR plumbing. Depends on Phase 1 (interface widening) only for the `layoutHint` field if that route is chosen.

---

### Pitfall 8: Platform-specific extensions `.ios.tsx` / `.android.tsx` / `.web.tsx` / `.native.tsx`

**What goes wrong:**
Metro's resolution: tries `Foo.ios.tsx`, `Foo.android.tsx`, `Foo.native.tsx`, `Foo.tsx` (web target reverses). A file `Button.ios.tsx` + `Button.android.tsx` coexist; at runtime only one loads per platform. For static analysis:

1. **`tinyglobby` enumeration includes ALL of them** — `discoverEntries` picks up `index.ios.tsx` and `index.android.tsx` as two separate entries. If both compile to route `/`, we either pick arbitrarily (loses info) or report a conflict (annoying for legitimate cross-platform projects).
2. **Resolver semantics** — `import Button from "./Button"` should resolve to *which* `Button.*.tsx`? Currently `src/core/resolver/relative.ts` doesn't know about platform suffixes. It falls back to `Button.tsx` (non-suffixed) and misses platform-specific variants — sometimes correct (if a base exists), sometimes producing an "unresolved" warning.
3. **`.web.tsx`** — same problem reversed. Many Expo projects target web.
4. **`.native.tsx`** — covers both iOS and Android, used when web has a different impl. Often paired with base `.tsx` or `.web.tsx`.
5. **v1.1 Windows path discipline gate passed** — that gate covered forward-slash normalization. Platform-suffix is orthogonal; don't claim coverage.

**Why it happens:**
Metro's resolution is a runtime layer above the filesystem. Static-analysis tools have to reimplement it or punt.

**How to avoid:**
- Choose a default static-analysis platform. **Recommend: prefer `.tsx` (no suffix) > `.native.tsx` > `.ios.tsx` > `.android.tsx` > `.web.tsx`**. Reason: no-suffix is the most common "shared" implementation; `.native.*` is the universal mobile variant.
- Surface a warning when platform variants exist: `"platform-variants for Button: [Button.ios.tsx, Button.android.tsx]; analyzing Button.ios.tsx (use --platform to override)"`.
- In `discoverEntries`, dedupe by stripping platform suffix and keeping one representative per logical path with the preference above.
- In the resolver, after relative-resolve fails (or as a parallel check), try platform-suffixed variants in preference order. Cache result.
- Add fixture with `Button.ios.tsx` + `Button.android.tsx` to lock behavior.
- Optional CLI flag `--platform ios|android|web|native` for CI determinism — cheap if implemented as a `ParseContext` field.

**Warning signs:**
- Route enumeration shows two entries for `/` because `index.ios.tsx` and `index.android.tsx` both exist.
- Import of `./Button` reports unresolved even though `Button.ios.tsx` is present.
- Snapshot diffs differ across CI runners that sort files differently.

**Phase to address:**
Phase 3 (discoverEntries dedup) + Phase 6 (resolver path-suffix awareness). The discoverEntries side is small; the resolver side is a careful diff to existing logic.

---

### Pitfall 9: Test fixtures that "look like Expo Router" but don't exercise routing semantics

**What goes wrong:**
The temptation: copy Next.js fixture, rename `page.tsx` → `index.tsx`, swap `<div>` for `<View>`, call it an Expo fixture. Result: fixture compiles in snapshot tests, but doesn't exercise divergent semantics (no `_layout.tsx` with `<Slot/>`, no tabs, no platform-suffix files, no `StyleSheet.create`). Adapter passes tests yet fails on real projects.

Specific things v1.0 fixtures don't have analogs for:
1. **`_layout.tsx` with `<Slot/>`** — most common Expo Router layout. Without a fixture, `<Slot/>`-injection (analog to `injectChildrenSlots`) is untested.
2. **`StyleSheet.create({...})` + lookup** — needed to exercise Pitfall 3.
3. **`style={[...]}` array form** — needed for Pitfall 4.
4. **NativeWind `className` with platform variants** — needed for Pitfall 5.
5. **Platform-suffix files** — needed for Pitfall 8.
6. **`<Tabs>` with `<Tabs.Screen>` children** — needed for Pitfall 6's tab story.
7. **`expo-router` and `react-native` imports actually resolved** — without these in fixture's `node_modules` (or a stub), the resolver returns `unresolved` for every primitive. Either install minimal `node_modules` per fixture (heavy) OR add a stub (lighter). Pick a precedent and follow it.

Harder problem: an Expo Router project is only minimally valid when `package.json` declares `expo-router`, `app.json` (or `app.config.*`) exists, `expo` SDK version is set, and `app/_layout.tsx` exists. Skipping any makes it "not really" Expo Router for detect purposes. Detect must pass on the fixture, OR fixture marked as partial-detect-skip (with explicit `--framework expo` override).

**Why it happens:**
Fixtures grow path-of-least-resistance. Copy, mutate, ship. Minimal-viable-fixture is much smaller than minimal-viable-project-that-detects-as-Expo.

**How to avoid:**
- Before writing adapter code, design fixture tree (≥2 per PROJECT.md):
  - **Fixture A — `expo-basic`**: `package.json` with `expo-router` + `react-native`, `app.json`, `app/_layout.tsx` (with `<Slot/>` from `expo-router`), `app/index.tsx` (with `<View>` + `<Text>` + a `StyleSheet.create`), `tsconfig.json` with path aliases.
  - **Fixture B — `expo-tabs-and-dynamic`**: A plus `app/(tabs)/_layout.tsx` (with `<Tabs>`), `app/(tabs)/index.tsx`, `app/(tabs)/profile.tsx`, `app/post/[id].tsx`, `app/+not-found.tsx`, NativeWind `className` usage, a `Button.ios.tsx` + `Button.android.tsx` pair.
- Stub `react-native` and `expo-router` per fixture as a single-file `.d.ts` or minimal `index.ts` exporting the names we care about (`View`, `Text`, `Slot`, `Tabs`, `Stack`, `Drawer`, etc.) so the resolver returns `kind:"external"` with `source:"react-native"`/`"expo-router"` instead of `unresolved`.
- Drive ≥50% of fixture coverage through integration tests that spawn the published binary (mirroring v1.0 pattern). Unit tests on `Analyzer` can pass while the binary path is broken.
- Lock fixture conventions in `ARCHITECTURE.md` so subsequent fixtures don't drift.

**Warning signs:**
- Adapter unit tests pass but integration tests fail (or vice versa).
- Fixture has `_layout.tsx` but snapshot doesn't show `<Slot/>` injection — fixture missing the actual `<Slot/>` JSX.
- Resolver returns `unresolved` for `View` because fixture doesn't stub `react-native`.
- Fixture passes detect but `discoverEntries` returns `[]`.

**Phase to address:**
Phase 0 — fixture design + stub package shape. **Must come before any adapter code.** This is the lesson v1.0's integration phase learned the hard way.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Re-implement `classifySegment` inside Expo adapter instead of lifting | Skip an interface widening | Two copies of `[param]`/`[...rest]`/`(group)` parsing — drift between adapters | Never. Lift to `src/core/routing/segments.ts` or accept duplication with `// SHARED` markers + sync test. |
| Detect Expo Router by `package.json` only (no `app/_layout.tsx` check) | One-liner detect | False positives on monorepos and dep-but-unused projects | Never. Mirror Next's two-signal pattern. |
| Skip cross-file `StyleSheet.create` resolution (in-file only) | Faster to ship; ~70% real-world stylesheets are in-file | `find_by_style` + inline-style fidelity collapse for projects organizing styles externally (most non-trivial apps) | Acceptable for v1.2 *if* we emit `{ raw }` + warning for cross-file cases and document the limit. Defer one-hop import resolution to v1.3 only with published support matrix. |
| Skip `<Tabs>`/`<Stack>` JSX introspection — only enumerate filesystem | Half the work for tabs/stacks | IR doesn't reflect what user can navigate to via tabs; agent has to read source | Acceptable for v1.2 if a warning surfaces "layout uses `<Tabs>` — screen list not enumerated". Required for v1.3. |
| Treat namespace imports (`import * as RN`) as opaque (existing v1 carve-out) | Inherit v1 carve-out | Subset of projects (uncommon) get worse component resolution | Acceptable — explicit carve-out documented in `Analyzer.ts:155`. Same justification for v1.2. |
| `+not-found.tsx` / `+html.tsx` excluded from URL routing | Avoid edge case in route walker | These pages don't show up in `get_full_hierarchy` results | Acceptable for v1.2; `+not-found` should be reachable via `focus_on` even if not via URL. |
| Reuse `LAYOUT_PREFIXES` unchanged | Zero code change | Some web-only Tailwind classes (e.g. `block`, `space-y-*`) treated as layout-affecting on RN | Acceptable — precision loss only, never a correctness bug. Revisit on user feedback. |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `FrameworkAdapter.detect()` | Read `package.json` synchronously and throw if missing | `fs.access` with `try/catch`, return `false` on any error (D-12 — see `next/detect.ts`) |
| Adapter selection | Pick first adapter whose `detect()` returns `true` | Run all in parallel; require exactly one `true`; fail with clear error otherwise. Provide `--framework` override. |
| `discoverEntries` ordering | Return whatever order `tinyglobby` gives | Sort lex by explicit codepoint comparator (`next/discover.ts:50`) — required for deterministic snapshots |
| `extractComponents` parse errors | Throw on bad source | Return synthetic `ComponentDefinition` with `kind:"error"` renderFlow (D-12 — `NextJsAdapter.ts:73-95`) |
| Cross-file StyleSheet lookup | Re-parse the resolved file fresh each time | Use `ctx.astCache` from `ParseContext` — already wired in v1.0 |
| `<Slot/>` injection | Add separate `injectSlotElements` function | Generalize `injectChildrenSlots` (Analyzer.ts:552) — take a predicate `(name, importSource) => boolean` so Next.js still uses `{children}` and Expo uses `<Slot/>` from `expo-router` |
| `traverse` ESM interop | `import traverse from "@babel/traverse"` directly | Use existing `babel-shim.ts` (the `(traverse as any).default ?? traverse` pattern is locked behind a regression test) |
| Path normalization | `path.join` and let Windows backslashes leak | Every `file:` field passes through `toForwardSlash` (D-07/D-08 — Analyzer.ts:25). v1.1 Windows gate flags regressions. |
| Fixture `node_modules` | Install real `react-native` (huge) | Stub via `index.d.ts` or minimal `index.ts` exporting the names we care about |
| RN primitive detection | Check tag name only (`name === "View"`) | Check tag name AND resolved import source (`source === "react-native"`) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Re-parsing imported style files per element | Slow on components with many `<View style={styles.x}/>` lookups | Reuse `ctx.astCache` and a per-call `Map<absPath, Map<exportName, StyleSheetEntry>>` | Files with 50+ JSX elements all using same `styles` import |
| Re-walking full AST per style-key lookup | Same as above | Build StyleSheet map once when file first seen (lazy memoize on `ctx`) | Same scale |
| `tinyglobby` enumeration in `mapRouteToEntry` per route | Repeated full glob on every `get_full_hierarchy` call within a single Analyzer | Already partially mitigated by `routeTreeCache` (Analyzer.ts:765); ensure new adapter participates | When user calls multiple `get_full_hierarchy` in one session |
| Platform-suffix resolver retries (Pitfall 8) | Slow resolver on RN projects | Cache resolution per `(fromFile, specifier)` in `ctx.resolverCache` (already exists); include platform-suffix attempt result | Large RN projects with many cross-platform files |

## Security Mistakes

Beyond the 18 threats already modeled in v1.0:

| Mistake | Risk | Prevention |
|---------|------|------------|
| Execute `StyleSheet.create` arguments to "resolve" computed keys | Arbitrary code execution from user code | Static analysis only — never `eval`, `import()`, `new Function`. Babel parse + walk only (same rule v1.0 follows). |
| Follow imports outside the project root | Read files outside user's project (`../../../../etc/passwd`) | Constrain `resolveModule` results to absolute paths under `ctx.resolvedRoot` (existing invariant — keep it for cross-file walks too) |
| Trust `package.json` `name` field for framework detection | Spoofable; could be set to anything | Detect by dep presence + structural signal (Next's two-signal pattern) |
| Glob into `node_modules` during entry discovery | Pulls in vendored Expo Router examples | `tinyglobby` `ignore: ["**/node_modules/**"]` (already in `next/discover.ts:44`) — copy to Expo adapter; also exclude `.expo/` |
| Stub `expo-router` exports in a fixture using a relative path that escapes the fixture | Fixture test bleeds outside its directory | Lock fixtures to relative paths inside their own dir; integration runner enforces cwd |

## UX Pitfalls

| Pitfall | Agent Impact | Better Approach |
|---------|--------------|-----------------|
| `<View>`/`<Text>` shown as components with no resolvable file | Agent sees "navigate to `View`" but can't, wastes tool calls | Mark RN primitives with `kind:"element"` or `layoutHint:"rn-primitive"`; renderer skips navigation hint |
| `find_by_style("flex-1")` returns hundreds of matches | Unactionable result | Already handled by v1 envelope shape; document expected match counts in `--init` guide |
| `get_full_hierarchy("/")` returns empty tree because `_layout.tsx` was rejected | Agent silently misled | Surface adapter-detection result + entry count as warnings on every tool call |
| Expo `(tabs)/` layout returns layout chain but no per-tab structure | Agent doesn't know what tabs exist | Even a warning `"layout uses <Tabs>; screens detected: home, profile"` is better than nothing |
| `find_by_text` on `<Text>Hello</Text>` works, but `<Text>{t("greeting")}</Text>` returns nothing | Common in i18n-wired apps | Document static-text-only limitation in `--init` guide; v1.2 punts on i18n |
| Cross-file `StyleSheet.create` styles report `{raw}` instead of expanded keys | Agent can't search by property key | Warning lists which file holds the unparsed StyleSheet so agent can open it |

## "Looks Done But Isn't" Checklist

- [ ] **ExpoRouterAdapter `detect`**: Often missing the structural signal (only checks `package.json`) — verify it also requires `app/_layout.tsx` OR at least one route file
- [ ] **`discoverEntries`**: Often missing platform-suffix dedup — verify two-platform `index.{ios,android}.tsx` doesn't produce two `/` routes
- [ ] **`mapRouteToEntry`**: Often missing `index.tsx` → page mapping (different from Next's `page.tsx`) — verify with fixture
- [ ] **RN primitive detection**: Often only checks tag name, not import source — verify user-defined `Text` is NOT misclassified
- [ ] **`<Slot/>` injection**: Often missing — verify `_layout.tsx` snapshot shows a `kind:"slot"` node where `<Slot/>` lives in source
- [ ] **Style array merge**: Often forgets conditional branches — verify `find_by_style` matches keys from falsy-conditional entries
- [ ] **NativeWind platform variants**: Often missing in variant-strip regex — verify `ios:flex-1` is recognized as layout class
- [ ] **`+not-found.tsx`**: Often parses as regular `/+not-found` route — verify reachable via `focus_on` but not URL-mapped
- [ ] **`<Tabs>` introspection**: Often skipped — verify at least a warning surfaces "screens: a, b, c"
- [ ] **Cross-file `StyleSheet.create`**: Often silently returns empty — verify `{raw}` + warning is emitted
- [ ] **Fixture `node_modules` stubs**: Often missing — verify resolver returns `kind:"external" source:"react-native"` (not unresolved) for primitives
- [ ] **Windows path discipline**: v1.1 gate covers most cases; verify a fixture with backslashes-in-source-paths (Windows-authored) still passes
- [ ] **Adapter auto-detect monorepo**: Often picks one without warning — verify monorepo with both produces explicit error
- [ ] **`runtime: "client"` vs RN**: Often left set to `"server"` by default — verify the IR field is either absent or set to a sensible RN value
- [ ] **v1.0 NextJsAdapter snapshots**: Often regress when Analyzer is generalized — verify the locking test explicitly opts in to new method shapes

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Interface widening shipped wrong (Pitfall 1) | HIGH | Revert via interface-locking test; the FrameworkAdapter method-count assertion makes accidental changes loud. Worst case: ship behind `--framework` flag and fix abstraction in v1.3. |
| Auto-detect picks wrong adapter (Pitfall 2) | LOW | `--framework expo\|next` CLI override; document in `--init` guide |
| Cross-file StyleSheet broken (Pitfall 3) | MEDIUM | Emit `{raw}` + warning fallback; ship in-file-only support and document |
| Array-style merge wrong (Pitfall 4) | MEDIUM | Conservative: collapse whole array to `{raw}` per element; precision loss but correctness preserved |
| NativeWind variants mis-stripped (Pitfall 5) | LOW | One-line regex fix; add test |
| `+not-found.tsx` mis-routed (Pitfall 6) | LOW | Add to exclusion list in route-map |
| RN primitive misclassified (Pitfall 7) | LOW | Resolver-based classification; fix at one site (resolver pass in Analyzer) |
| Platform-suffix file resolution broken (Pitfall 8) | MEDIUM | Add suffix-aware retry in `resolveRelative`; cache result |
| Fixture inadequacy (Pitfall 9) | HIGH | Bad fixtures hide bugs that ship — recovery is "v1.2.1 with new fixtures and re-verification." Cheap up front; expensive after. |

## Pitfall-to-Phase Mapping

Suggested phase plan derived from these pitfalls. Roadmapper should treat as a starting point.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 — Interface leaks Next.js assumptions | Phase 1 — Interface widening | FrameworkAdapter locking test updated; NextJsAdapter still passes v1.0 snapshots; Expo adapter shell compiles against new interface |
| 2 — Auto-detect false positives | Phase 2 — Detect + selection | Monorepo fixture (`apps/web` Next + `apps/mobile` Expo); `--framework` override exercised |
| 3 — StyleSheet.create resolution | Phase 4 — RN style signals | Fixture per unsupported case (computed key, factory, cross-file, spread) snapshot-asserts `{raw}` + warning shape |
| 4 — Style array merge | Phase 4 — RN style signals | Unit test of `flattenStyleArray` against ≥8 input shapes; integration `find_by_style` on falsy-conditional fixture |
| 5 — NativeWind divergence | Phase 4 — RN style signals | Fixture exercises platform variants + `cn(...)` helper; snapshot `find_by_style("ios:flex-1")` |
| 6 — Expo Router routing edge cases | Phase 3 — Expo routing | Per-case fixture: groups, tabs, dynamic, `+not-found`, deep nesting |
| 7 — RN primitive disambiguation | Phase 5 — RN primitives | Fixture pairs: `<Text>` from `react-native` vs from `@/components/Text`, both snapshot-tested |
| 8 — Platform-suffix files | Phase 3 (enumerate) + Phase 6 (resolve) | Fixture with `Button.{ios,android}.tsx`; `discoverEntries` dedups; resolver finds right variant |
| 9 — Fixture inadequacy | Phase 0 — Fixture design | Two fixtures (`expo-basic`, `expo-tabs-and-dynamic`) checked in BEFORE Phase 1 code; stub package shape documented |

## Sources

- **Existing codebase (HIGH confidence)** — direct reads:
  - `e:/ui-to-hierarch/src/adapters/FrameworkAdapter.ts` (5-method interface, island rule)
  - `e:/ui-to-hierarch/src/adapters/next/NextJsAdapter.ts` (the leaks documented in Pitfall 1)
  - `e:/ui-to-hierarch/src/adapters/next/detect.ts` (two-signal detection pattern to mirror)
  - `e:/ui-to-hierarch/src/adapters/next/discover.ts` (tinyglobby + sort discipline)
  - `e:/ui-to-hierarch/src/adapters/next/route-map.ts` (segment tree; Expo Router won't reuse most of this)
  - `e:/ui-to-hierarch/src/core/Analyzer.ts` (the Next.js-shaped orchestrator — surfaces leaks at lines 663-677, 891-932, 1194-1233, 396-429, 495-507)
  - `e:/ui-to-hierarch/src/core/render-flow/component-detect.ts` (component discovery; capitalization-based)
  - `e:/ui-to-hierarch/src/core/extractors/index.ts`, `inline-style.ts`, `tailwind/index.ts`, `tailwind/layout-prefixes.ts` (style extraction patterns to extend)
  - `e:/ui-to-hierarch/.planning/PROJECT.md` (v1.2 active requirements)
  - `e:/ui-to-hierarch/.planning/MILESTONES.md` (v1.0/v1.1 shipped scope)
- **Expo Router docs (MEDIUM confidence — current as of 2026-05)** — https://docs.expo.dev/router/ — verified group/dynamic/catch-all conventions, `_layout.tsx`, `<Slot/>`, `<Tabs>`/`<Stack>`/`<Drawer>`, `+not-found.tsx`/`+html.tsx`/`+native-intent.tsx`, typed routes.
- **NativeWind v4 docs (MEDIUM confidence)** — https://www.nativewind.dev/ — platform variants `ios:`/`android:`/`web:`/`native:`, `className` on RN primitives.
- **React Native docs (HIGH confidence)** — https://reactnative.dev/docs/stylesheet — `StyleSheet.create`, `StyleSheet.flatten`, array form of `style` prop.
- **Metro bundler platform extensions (HIGH confidence)** — https://reactnative.dev/docs/platform-specific-code — `.ios.tsx`, `.android.tsx`, `.native.tsx`, `.web.tsx` resolution order.
- **Prototype script (HIGH confidence)** — `e:/ui-to-hierarch/generate-component-hierarchy.ts` (RN-targeting reference cited in CLAUDE.md; same Babel pipeline shape).

---
*Pitfalls research for: Adding ExpoRouterAdapter (React Native + Expo Router) parallel to NextJsAdapter in ui-to-hierarchyMCP*
*Researched: 2026-05-12*
