# Feature Research — v1.2 Expo Router + React Native

**Domain:** AST-driven UI hierarchy extraction for Expo Router + React Native mobile codebases (MCP tool surface for agentic coding clients)
**Researched:** 2026-05-12
**Confidence:** HIGH (Expo Router routing semantics, RN core primitives, StyleSheet/NativeWind verified via official `@expo/expo` + `facebook/react-native-website` docs through Context7)

## Scope Anchor

This document scopes **what the `ExpoRouterAdapter` must surface for v1.2** so an AI coding agent can ground a screenshot/description-based edit ("widen the card next to the avatar in the profile tab") in exact `file:line` locations. v1.0 features (4 tools, markdown+JSON, file:line, HOC unwrap, barrel chase, conditional branches, tsconfig paths, Tailwind/CSSM/inline/styled-components signals) are **assumed and unchanged**. Below is the delta only.

The "user" of these features is the **AI agent** consuming the hierarchy, not the human developer. "Table stakes" therefore means: without it, the agent cannot complete a typical RN edit task. "Differentiator" means: with it, the agent gets meaningfully better grounding than a naive AST dump would give.

---

## Feature Landscape

### Table Stakes (Agent cannot edit RN reliably without these)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **TS-1. `app/` and `src/app/` route discovery** | Mirrors Next.js v1.0 `app/` discovery. Expo Router projects use either; both are official. Without this, no route → hierarchy mapping. | **S** | Detect by probing `app/`, then `src/app/`. Single source of truth: `expoRouter.root` analog. |
| **TS-2. `_layout.tsx` chain composition** | Layouts wrap screens in Expo Router exactly like Next.js, but the layout exports a JSX tree containing `<Stack>` / `<Tabs>` / `<Drawer>` — children are injected by the router. Agent needs the full layout chain to know what wraps a screen (SafeAreaView, Provider, theme). | **M** | Compose layout chain root → leaf, same shape as v1.0 `RouteMatch.layoutChain`. `<Slot/>` and `<Stack/>`/`<Tabs/>` act as the children-injection point (Next.js analog: `{children}`). |
| **TS-3. `index.tsx` as route default** | Every directory's `index.tsx` is the route for that directory (`app/index.tsx` → `/`, `app/settings/index.tsx` → `/settings`). Mirrors Next.js. Without it, default routes look like orphans. | **S** | Pure naming convention. |
| **TS-4. Dynamic segments `[param]`, `[...rest]`, `[[...opt]]`** | Same syntax as Next.js App Router. `app/user/[id].tsx`, `app/blog/[...slug].tsx`, `app/search/[[...query]].tsx`. Already proven in v1.0 — port the segment parser. | **S** | Reuse v1.0 `segments.ts` logic; only the route-file extension scan differs. |
| **TS-5. Route groups `(group)`** | Identical semantics to Next.js: parens-wrapped directory is **invisible in URL** but contributes a `_layout.tsx`. Critical for the most common Expo pattern: `app/(tabs)/_layout.tsx`, `app/(auth)/login.tsx`. | **S** | Reuse v1.0 group-erasure path-build. |
| **TS-6. `(tabs)` group + `<Tabs>` navigator recognition** | The dominant Expo app shape. `app/(tabs)/_layout.tsx` exports `<Tabs><Tabs.Screen name="home" .../><Tabs.Screen name="profile" .../></Tabs>`. Agent needs to know "this screen is rendered inside the tab navigator with these sibling tabs and these `options`/`href`/`title`". | **M** | Detect `Tabs` import from `expo-router`, walk JSX for `<Tabs.Screen>` children, capture `name=` and inline `options={...}` (literal-string subset, consistent with v1.0 attributes carve-out). |
| **TS-7. `<Stack>` + `<Stack.Screen>` recognition** | The other primary navigator. `<Stack.Screen name="modal" options={{ presentation: "modal" }} />` is how modals are declared. Agent must see `presentation: "modal"` to understand a screen renders as a sheet, not a full route. | **M** | Same JSX-walk approach as TS-6. Capture `presentation`, `title`, `headerShown` as literal-string attributes when present. |
| **TS-8. `+not-found.tsx` (and `+html.tsx`) special files** | Expo's `+`-prefixed files are convention-bound siblings (404, web HTML shell). The agent should see them as recognized siblings, not unknown garbage. | **S** | `+not-found.tsx` → loading/error-style sibling under the nearest layout, mirroring v1.0 `loading`/`error`/`not-found` handling. `+html.tsx` is web-only; flag and skip from mobile route trees but list in envelope `notes`. `+api.ts` (API routes) is **out of scope** for UI hierarchy. |
| **TS-9. RN core component classification** | Without classifying `<View>` / `<Text>` / `<ScrollView>` / `<Image>` / `<Pressable>` / `<TouchableOpacity>` / `<TouchableHighlight>` / `<TouchableWithoutFeedback>` / `<FlatList>` / `<SectionList>` / `<Modal>` / `<SafeAreaView>` / `<KeyboardAvoidingView>` / `<TextInput>` / `<Button>` / `<Switch>` / `<ActivityIndicator>` as known primitives, every RN screen looks like "unknown component soup" to the agent. These are RN's HTML-tag analogs. | **M** | Hard-coded allowlist tagged with role: `layout` (View, ScrollView, SafeAreaView, KeyboardAvoidingView), `text` (Text, TextInput), `image` (Image), `pressable` (Pressable, Touchable*, Button), `list` (FlatList, SectionList, VirtualizedList), `overlay` (Modal), `indicator` (Switch, ActivityIndicator). Imported from `react-native`. |
| **TS-10. Text content extraction from `<Text>`** | The whole point of `find_by_text`. In RN, only `<Text>` can render strings (a string child outside `<Text>` throws at runtime). The v1.0 text walker assumes JSX string children anywhere are renderable — for RN it should anchor on `<Text>` specifically. Strings outside `<Text>` should still be captured (they're a code-smell the agent may want to find) but tagged as `kind: "text"` with `inText: false`. | **S** | Minor walker tweak; reuse `find_by_text` Levenshtein matcher unchanged. |
| **TS-11. `StyleSheet.create({...})` named-lookup resolution** | Dominant RN styling pattern. `const styles = StyleSheet.create({ card: { padding: 8 } }); <View style={styles.card} />` — agent searching for "padding 8 card" needs `styles.card` resolved back to the literal object so `find_by_style` works. | **M** | Babel pass: when a top-level `const X = StyleSheet.create({ ... })` is seen, index `X.<key>` → object-expression. When `style={X.<key>}` is seen, attach the object's literal keys/values to the JSX node's `styleSignal`. Only literal keys/values; expressions stay opaque. |
| **TS-12. Inline `style={{...}}` object** | The second-most-common pattern. `<View style={{ padding: 8 }} />`. v1.0 already handles this for `style` props on Next.js (`OUT-02 inline style` signal); confirm the same path fires for RN JSX. | **S** | Should be automatic; add an RN-fixture regression test. |
| **TS-13. Style array merge `style={[a, b, c]}`** | Idiomatic RN. `style={[styles.base, isActive && styles.active, { marginTop: insets.top }]}`. Each element must be classified: identifier → resolved via TS-11; object → inline literal (TS-12); logical-expr → conditional branch (already in v1.0 `OUT-04`). | **M** | New extractor: walk `ArrayExpression` inside `style=`. Emit one merged `styleSignal` per JSX node, plus mark conditional branches via existing `OUT-04` pathway. |
| **TS-14. NativeWind `className` recognition** | Tailwind for RN. Identical surface to Next.js: `<View className="flex-row gap-2 bg-zinc-900" />`. v1.0 already extracts `className`; for RN we only need to **enable** the Tailwind-class signal on RN primitives, not just HTML elements. | **S** | Confirm v1.0 className extractor isn't gated on `tagName` being lowercase HTML. Likely a one-line guard relaxation + RN fixture test. |
| **TS-15. Adapter auto-detect from `package.json`** | Already a v1.2 requirement in PROJECT.md. Detect `expo-router` in `dependencies`/`devDependencies` → `ExpoRouterAdapter`. Detect `next` → `NextJsAdapter`. Both → error with clear message naming which dirs (`app/` for Next vs `app/`+`expo-router` import) collide. Neither → error suggesting `--init`. | **S** | One-shot pre-flight in `Analyzer` constructor; emit decision as envelope `note` for debuggability. |

### Differentiators (Make the agent meaningfully smarter, not strictly required to ship)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **D-1. `Tabs.Screen` / `Stack.Screen` `options` projection onto child screen** | When the agent looks up `app/(tabs)/profile.tsx` it should see `options={{ title: "Profile", headerShown: false, tabBarIcon: ... }}` as a sidecar on the screen node, even though those options live in `(tabs)/_layout.tsx`. Pulls the navigator contract next to the screen the agent is editing. | **M** | Cross-file: layout walker indexes `Screen options` by `name=`, route-map join attaches them to the matching screen `TreeNode.attributes`. Literal-string subset only (consistent with v1.0 attribute carve-out). |
| **D-2. `useLocalSearchParams()` / `useSearchParams()` / `useGlobalSearchParams()` param surface** | A dynamic-route screen typically destructures `const { id } = useLocalSearchParams<{ id: string }>()`. Surfacing this param name (and type, if generic-annotated) on the screen node lets the agent generate code that references `id` correctly when editing. | **S** | Identifier-level scan in the screen file; surface as `params: ["id"]` on the screen `TreeNode`. |
| **D-3. `useRouter()` navigation-target extraction** | When the agent sees `router.push("/user/[id]")` or `router.navigate({ pathname: "/settings", ... })` it can render an outbound edge to the targeted screen. Improves cross-screen reasoning ("the button on `/home` navigates to `/profile`"). | **M** | String-literal extraction inside `router.push/replace/navigate/back` call args + `Link href=` props. Emit as `navTargets: string[]` on the source screen. Skip non-literal expressions silently. |
| **D-4. `<Link href={...} />` static-href harvesting (typed routes v4)** | Same justification as D-3 but for declarative navigation. Expo Router v4 typed routes guarantees these are statically analyzable strings or `{ pathname, params }` objects. | **S** | Subset of D-3's walker; share extractor. |
| **D-5. Array-syntax shared route groups `(home,search)`** | Expo Router supports `app/(home,search)/[user].tsx` — one source file, two route instances in memory. Niche but unique to RN/Expo (no Next.js analog). Surfacing both routes prevents "where does this file render?" confusion. | **M** | Parse the comma-separated group name, emit N `RouteMatch` entries from one source file. |
| **D-6. Modal-presentation flag on screen** | Specific case of D-1 worth calling out: when `<Stack.Screen name="x" options={{ presentation: "modal" }} />` is found, tag the `x` screen with `modal: true` on its `TreeNode`. Agent reasoning about "the modal that appears on home" becomes trivial. | **S** | Falls out of D-1 implementation. |
| **D-7. Theme/dark-mode style signal (`useColorScheme`)** | If a file calls `useColorScheme()` or branches on `isDark`/`theme === "dark"`, mark style branches as theme-conditional. Distinguishes "this view is conditionally styled by theme" from "this view is conditionally styled by user state". | **M** | Heuristic — match identifier `useColorScheme` import from `react-native`; tag any conditional JSX inside the same function as `themeConditional: true`. LOW confidence on naming purity — could yield false positives. |
| **D-8. FlatList `data` / `renderItem` identifier capture** | `<FlatList data={items} renderItem={({ item }) => <Card .../>} />` — agent needs to know the item component to edit list cells. Capture the bound identifier referenced inside `renderItem` (e.g., `Card`) and add it as a synthetic child of the FlatList node. | **M** | Walk `renderItem` arrow body for the first JSX root; recurse via existing v1.0 component resolution. |
| **D-9. Platform-specific file `*.ios.tsx` / `*.android.tsx`** | Expo (via Metro) supports platform-suffixed files. Surfacing them as siblings under one logical component helps the agent understand "this is the iOS-only variant". | **M** | Resolver enhancement: when resolving `Card`, also probe `Card.ios.tsx` and `Card.android.tsx`; emit as alternate-path siblings on the resolved node. |

### Anti-Features (Out of scope for v1.2 — and the alternatives)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **A-1. React Navigation code-based config (`createNativeStackNavigator`)** | Pre-Expo-Router RN apps use it; some hybrid apps still do. | Two competing routing models in one project = ambiguous truth. Code-based config is arbitrarily dynamic (programmatic `navigator.addScreen()`), not file-system-grounded — defeats v1.2's value prop. Expo Router *is* the supported v1.2 surface. | Document explicitly: "v1.2 requires `expo-router`. Pure React Navigation apps fall back to per-file parsing without route mapping." Defer to v2. |
| **A-2. Reanimated worklets, gestures, animations** | Screenshots often show animated state; agents may ask "what makes this slide in?" | Worklets execute on UI thread and use `'worklet'` directives; their semantics are runtime-only and not visible from JSX structure. Static analysis would mislead. | Capture the **presence** of `useSharedValue`/`useAnimatedStyle`/`Animated.*` as a `notes: ["uses Reanimated"]` envelope flag so the agent knows to read the source file rather than trust the tree for animated state. No tree-structural surfacing. |
| **A-3. Native modules / TurboModules / `NativeModules.X`** | Native bridges drive significant UI behavior (camera, biometrics). | Bridge calls are JS-side opaque function calls — no UI tree contribution. | Skip entirely. Agent must read source if it asks about native bridge behavior. |
| **A-4. Runtime device behavior (orientation, safe-area insets, keyboard)** | Layouts often hinge on `useSafeAreaInsets()` or `Dimensions.get('window')`. | These are runtime values; static analysis cannot resolve them. | Surface the **call site** of `useSafeAreaInsets`/`Dimensions`/`useWindowDimensions` as a `notes` flag on the screen. No structural inference. |
| **A-5. Style cascading across `style` array elements (computing the merged final style)** | Tempting to "merge `[styles.a, styles.b]` into one effective style object" so the agent sees a single answer. | Order-dependent, dynamic identifiers, conditional elements (`isActive && styles.active`) make the merged result a runtime value. Computing it statically would lie ~10% of the time. | Surface each element of the array independently with its conditional context (TS-13). Let the agent reason about merge order itself. |
| **A-6. Image asset resolution (`require('./img.png')`, remote URIs, `expo-image` cache modes)** | Agent might want to swap an image. | Asset pipeline is bundler-specific (Metro), and `require()` arguments are runtime-resolved. The `source` prop is enough as a literal string/identifier. | Emit `source` prop verbatim (already covered by v1.0 attributes carve-out). |
| **A-7. Drawer navigator from `@react-navigation/drawer`** | Some Expo apps use `<Drawer>` from expo-router. | Surface only if cheap; structurally identical to `<Tabs>`. If implementation parallels TS-6 with zero cost, include it; otherwise defer. | Treat as a stretch goal under TS-7's family. Do **not** scope as TS-level. |
| **A-8. Web-only Expo Router features (`+html.tsx` actual HTML shell, `useFocusEffect` web semantics)** | Expo Router runs on web too. | v1.2 targets mobile-first. Web-only edge cases distract from RN agent value. | Skip the contents of `+html.tsx`; just acknowledge its existence (TS-8). |
| **A-9. Type-aware analysis (resolving `useLocalSearchParams<T>` generic to concrete shape)** | Agent could use full type info. | Requires `ts-morph` / TS compiler API — ~60 MB cold start, orthogonal to the Babel pipeline (per STACK.md). v1.0 explicitly rejected this for the same reason. | Surface the generic source text verbatim if present; don't resolve it. |

---

## Feature Dependencies

```
TS-1 (app/ + src/app/ discovery)
   └─requires──> TS-15 (auto-detect adapter) so the right discoverer runs

TS-2 (_layout chain)
   └─requires──> TS-1
   └─enables───> TS-6, TS-7, D-1, D-6

TS-3 (index.tsx)        ──independent of all other TS items, depends only on TS-1
TS-4 (dynamic segments) ──reuses v1.0 segments.ts; depends only on TS-1
TS-5 (groups)           ──reuses v1.0 group erasure; depends only on TS-1

TS-6 (<Tabs>)
   └─requires──> TS-2 (must walk _layout JSX to find Tabs.Screen children)
   └─enables───> D-1 (Screen options projection), D-6 (modal flag — shared mechanism)

TS-7 (<Stack>)
   └─requires──> TS-2 (same reason)
   └─enables───> D-1, D-6

TS-8 (+not-found, +html)
   └─requires──> TS-1 (file discovery)
   └─reuses────> v1.0 loading/error sibling mechanism

TS-9 (RN primitives)
   └─independent of routing; required for every screen body
   └─enables───> TS-10 (Text-anchored text), TS-13 (style array on primitives), D-8 (FlatList)

TS-10 (Text content)
   └─requires──> TS-9

TS-11 (StyleSheet.create indexing)
   └─enables───> TS-13 (array merge resolution)

TS-12 (inline style)
   └─should already work from v1.0; verify only

TS-13 (style array merge)
   └─requires──> TS-11 AND TS-12
   └─enables───> D-7 (theme branches inside array elements)

TS-14 (NativeWind className)
   └─requires──> TS-9 (must fire on RN tags, not just HTML)
   └─reuses────> v1.0 Tailwind extractor with guard relaxation

TS-15 (auto-detect)
   └─gates──> TS-1 and the entire ExpoRouterAdapter path

D-1 (Screen options projection)
   └─requires──> TS-6 OR TS-7 (need navigator JSX walked)

D-2 (useLocalSearchParams)        ──depends only on TS-4 (dynamic routes exist)
D-3 (useRouter targets)           ──depends only on TS-1 (need route map to resolve targets)
D-4 (Link href harvesting)        ──same as D-3; shared extractor
D-5 (array-syntax groups)         ──extends TS-5
D-6 (modal flag)                  ──falls out of D-1
D-7 (theme/dark-mode)             ──extends TS-13
D-8 (FlatList renderItem)         ──requires TS-9
D-9 (.ios/.android variants)      ──resolver layer, independent

A-2 (Reanimated) ──conflicts──> any structural animation inference; we surface as notes only
A-5 (style merge) ──conflicts──> TS-13's "elements stay independent" stance
```

### Dependency notes

- **TS-2 is the keystone**: TS-6, TS-7, D-1, D-6 all walk the same `_layout.tsx` JSX. Implement TS-2's walker once, share it across all four.
- **TS-11 → TS-13 ordering is strict**: array-merge resolution depends on `StyleSheet.create` index already being built. Build the per-file `StyleSheet` index in the same pass that parses the file.
- **TS-15 must run before everything**: adapter auto-detect gates which discoverer runs; getting this wrong wastes parse work. Run during `Analyzer` construction, fail fast on conflict.
- **TS-9 has no internal dependencies but unlocks 4 downstream features** (TS-10, TS-13, TS-14, D-8) — prioritize building the allowlist + role tagging early.
- **A-5 is a tempting trap**: do not fold style-array elements into a "merged" object. The conflict is intentional; document it.

---

## MVP Definition (v1.2 launch)

### Launch With (v1.2)

The minimum that makes v1.2 useful for a real Expo Router app:

- [ ] **TS-15** Adapter auto-detect — gates everything else
- [ ] **TS-1** `app/` + `src/app/` discovery
- [ ] **TS-2** `_layout.tsx` chain composition (the keystone)
- [ ] **TS-3** `index.tsx` default routes
- [ ] **TS-4** Dynamic segments `[param]`, `[...rest]`, `[[...opt]]`
- [ ] **TS-5** Route groups `(group)`
- [ ] **TS-6** `<Tabs>` + `<Tabs.Screen>` recognition (with `name`/`options` literal-string attrs)
- [ ] **TS-7** `<Stack>` + `<Stack.Screen>` recognition (with `name`/`options` literal-string attrs)
- [ ] **TS-8** `+not-found.tsx` sibling; `+html.tsx` acknowledged-and-skipped; `+api.ts` skipped
- [ ] **TS-9** RN primitive allowlist + role tagging
- [ ] **TS-10** `<Text>`-anchored text content
- [ ] **TS-11** `StyleSheet.create` named-lookup resolution
- [ ] **TS-12** Inline `style={{...}}` confirmed working on RN JSX (regression test)
- [ ] **TS-13** Style array merge `style={[a, b, c]}`
- [ ] **TS-14** NativeWind `className` on RN primitives

### Add If Cheap (v1.2 stretch — only if implementation falls out of MVP work)

- [ ] **D-1** `Tabs.Screen` / `Stack.Screen` options projected onto the child screen (almost free once TS-6/TS-7 walker is built)
- [ ] **D-6** Modal-presentation flag (free if D-1 ships)
- [ ] **D-4** `<Link href=...>` static-href harvesting (small extractor)

### Defer to v1.3+

- [ ] **D-2** `useLocalSearchParams` param surface — useful but agent can read the file
- [ ] **D-3** `useRouter` navigation-target extraction — improves cross-screen reasoning; non-trivial walker
- [ ] **D-5** Array-syntax shared route groups `(a,b)` — niche; can fail loudly with a "not supported in v1.2" warning until then
- [ ] **D-7** Theme/dark-mode style signal — heuristic, false-positive risk; needs design
- [ ] **D-8** FlatList `renderItem` capture — high value, but adds a new traversal pattern
- [ ] **D-9** `.ios` / `.android` platform variants — resolver work; defer until users ask

### Future / v2 territory

- **A-1** React Navigation code-based fallback parser (separate adapter)
- **A-9** Type-aware param/generic resolution (needs ts-morph alongside Babel — STACK.md anti-pick)
- Drawer / Material Top Tabs / other navigator subclasses
- Server Components in Expo Router (currently experimental — out of scope this milestone)

---

## Feature Prioritization Matrix

| Feature | Agent Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| TS-15 auto-detect | HIGH | LOW | **P1** |
| TS-1 app/+src/app/ discovery | HIGH | LOW | **P1** |
| TS-2 layout chain | HIGH | MEDIUM | **P1** |
| TS-3 index.tsx | HIGH | LOW | **P1** |
| TS-4 dynamic segments | HIGH | LOW | **P1** |
| TS-5 route groups | HIGH | LOW | **P1** |
| TS-6 `<Tabs>` walker | HIGH | MEDIUM | **P1** |
| TS-7 `<Stack>` walker | HIGH | MEDIUM | **P1** |
| TS-8 `+not-found` / `+html` | MEDIUM | LOW | **P1** |
| TS-9 RN primitive allowlist | HIGH | MEDIUM | **P1** |
| TS-10 Text content | HIGH | LOW | **P1** |
| TS-11 StyleSheet.create index | HIGH | MEDIUM | **P1** |
| TS-12 inline style verify | MEDIUM | LOW | **P1** (regression-only) |
| TS-13 style array merge | HIGH | MEDIUM | **P1** |
| TS-14 NativeWind className | HIGH | LOW | **P1** |
| D-1 Screen options projection | HIGH | MEDIUM | **P2** |
| D-6 modal flag | MEDIUM | LOW | **P2** (free with D-1) |
| D-4 Link href harvesting | MEDIUM | LOW | **P2** |
| D-2 useLocalSearchParams | MEDIUM | LOW | **P3** |
| D-3 useRouter targets | MEDIUM | MEDIUM | **P3** |
| D-5 array-syntax groups | LOW | MEDIUM | **P3** |
| D-7 theme signal | MEDIUM | MEDIUM | **P3** |
| D-8 FlatList renderItem | MEDIUM | MEDIUM | **P3** |
| D-9 platform variants | LOW | MEDIUM | **P3** |

**Priority key:**
- **P1**: Must ship with v1.2 — these define "what `ExpoRouterAdapter` *means*"
- **P2**: Should ship if implementation is genuinely cheap — high agent value, low marginal cost
- **P3**: Defer to v1.3+ — useful but not foundational

---

## Mapping to v1.0 Architecture (port-vs-new breakdown)

Roughly two-thirds of v1.2's surface is **porting v1.0 logic with framework-specific tweaks**. The genuinely new work concentrates in the `_layout.tsx` JSX walker and `StyleSheet.create` indexing.

| v1.2 Feature | Reuses v1.0 | Genuinely New |
|--------------|-------------|---------------|
| TS-1 discovery | v1.0 `discover.ts` shape | `expo-router` directory probes + Expo path resolution |
| TS-2 layout chain | `RouteMatch.layoutChain` data shape | JSX-walked layout (Next.js is JSX-via-`{children}` already; same idea) |
| TS-3 index | v1.0 index naming | none |
| TS-4 dynamic segs | v1.0 `segments.ts` | none |
| TS-5 groups | v1.0 group erasure | none |
| TS-6 `<Tabs>` walker | none | **NEW**: Tabs/Stack/Screen JSX recognition |
| TS-7 `<Stack>` walker | none | **NEW**: shared with TS-6 |
| TS-8 `+not-found` | v1.0 sibling mechanism (`loading`/`error`/`not-found`) | `+` prefix recognition |
| TS-9 RN primitives | v1.0 component classification | **NEW**: RN primitive allowlist + roles |
| TS-10 Text content | v1.0 text walker + Levenshtein | `<Text>` anchoring rule |
| TS-11 StyleSheet.create | v1.0 style-signal sidecar | **NEW**: named-lookup index |
| TS-12 inline style | v1.0 inline style extractor | none (verify only) |
| TS-13 style array | none | **NEW**: array-element classifier sharing TS-11 + TS-12 |
| TS-14 NativeWind | v1.0 Tailwind extractor | guard relaxation only |
| TS-15 auto-detect | v1.0 adapter selection scaffold | `package.json` probe |

---

## Sources

- [Expo Router file-based routing conventions](https://github.com/expo/expo/blob/main/packages/expo-router/CLAUDE.md) — HIGH: canonical conventions for `[id]`, `[...rest]`, `(group)`, `+not-found`, `+api`
- [Expo Router modals — `presentation: 'modal'`](https://github.com/expo/expo/blob/main/docs/pages/router/advanced/modals.mdx) — HIGH: confirms `<Stack.Screen name="x" options={{ presentation: 'modal' }}/>` declarative pattern
- [Expo Router tabs — dynamic routes in tab bar](https://github.com/expo/expo/blob/main/docs/pages/router/advanced/tabs.mdx) — HIGH: `<Tabs.Screen name="[user]" options={{ href: ... }} />`
- [Expo Router shared routes — array group syntax `(home,search)`](https://github.com/expo/expo/blob/main/docs/pages/router/advanced/shared-routes.mdx) — HIGH: `unstable_settings`, `segment` prop
- [Expo Router navigation — useRouter, Link, router.navigate](https://github.com/expo/expo/blob/main/docs/pages/router/basics/navigation.mdx) — HIGH: literal href shapes available for static extraction
- [Expo Router typed routes v4](https://github.com/expo/expo/blob/main/docs/pages/router/reference/typed-routes.mdx) — HIGH: `experiments.typedRoutes: true` in `app.json`, `Href` type, `HrefObject { pathname, params }`
- [React Native core components index](https://github.com/facebook/react-native-website/blob/main/docs/components-and-apis.md) — HIGH: official allowlist (View, Text, Image, TextInput, Pressable, ScrollView, StyleSheet, Button, Switch, FlatList, SectionList, plus platform-specific)
- [React Native Pressable docs (style render-prop pattern)](https://github.com/facebook/react-native-website/blob/main/website/versioned_docs/version-0.86/pressable.md) — HIGH: confirms `style={({pressed}) => [...]}` array pattern in idiomatic RN
- [NativeWind v4 (Tailwind for RN, build-time className processing)](https://www.nativewind.dev/) via Context7 `/nativewind/nativewind` — HIGH: confirms `className=` is the canonical surface and processed at build-time (static-analyzable)
- Internal: `e:\ui-to-hierarch\.planning\PROJECT.md` — HIGH: v1.2 target features, attribute carve-outs, v1.0 constraints inherited
- Internal: `e:\ui-to-hierarch\.planning\milestones\v1.0-ROADMAP.md` — HIGH: Phase 4 NextJsAdapter structure (`detect.ts`, `discover.ts`, `segments.ts`, `route-map.ts`) is the porting template for `ExpoRouterAdapter`
- Internal: `e:\ui-to-hierarch\generate-component-hierarchy.ts` (prototype) — HIGH: already targets `apps/mobile/src` + `_layout.tsx` for RN/Expo; reference for traversal semantics

---

*Feature research for: v1.2 Expo Router + React Native adapter*
*Researched: 2026-05-12*
