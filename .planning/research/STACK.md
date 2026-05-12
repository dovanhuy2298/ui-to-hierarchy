# Stack Research — v1.2 React Native + Expo Router

**Domain:** MCP server static-analysis parser, adding a second `FrameworkAdapter` for Expo Router projects
**Researched:** 2026-05-12
**Confidence:** HIGH

## TL;DR — The existing stack is sufficient. No new runtime dependencies.

Everything v1.2 needs is already in the v1.0/v1.1 stack:

- `@babel/parser` / `@babel/traverse` / `@babel/types` already parse `.tsx` — the same parser handles React Native `.tsx` because **RN JSX is the same JSX as web JSX**. There is no separate RN AST shape, no RN-specific dialect.
- `tinyglobby` already enumerates files under `app/` — works identically for `app/_layout.tsx` (Expo Router) and `app/page.tsx` (Next.js).
- `get-tsconfig` already resolves tsconfig path aliases — Expo Router projects use the same `tsconfig.json` mechanism.
- `node:fs/promises` + `JSON.parse` is all we need to read the **target project's** `package.json` for adapter auto-detect (`dependencies["expo-router"]` vs `dependencies["next"]`).
- Test fixtures need **no installed Expo/RN runtime** — fixtures are static `.tsx` source trees the parser reads; nothing executes them. Same approach as the v1.0 Next.js fixtures (which never run `next build`).

The work in v1.2 is almost entirely **new TypeScript source code** (`ExpoRouterAdapter`, RN primitive list, RN style extractor, NativeWind className signal), not new packages.

**Things to add to `package.json` runtime deps:** zero. **Dev deps:** zero. Everything is source code + fixtures.

## Recommended Stack — Deltas from v1.1

### Core Technologies (no changes)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@babel/parser` | `^7.29.2` (already installed) | Parse `.tsx` from Expo Router projects | RN/Expo source files are TS+JSX. Same plugins `["jsx", "typescript"]` already configured for Next.js work unchanged. No RN-specific Babel plugin needed for parsing (Metro uses `@react-native/babel-preset` for **transform**; we don't transform). |
| `@babel/traverse` | `^7.29.0` (already installed) | Walk RN component trees | Identical JSX visitor pattern. `JSXElement` / `JSXIdentifier` nodes for `View`, `Text`, etc. are structurally identical to `div`, `span`. |
| `@babel/types` | `^7.29.0` (already installed) | Type guards for RN-specific patterns: `t.isMemberExpression` (for `styles.card`), `t.isArrayExpression` (for `style={[a, b]}`), `t.isObjectExpression` (for inline `style={{ ... }}`) | Already in use for JSX walking; the RN style array merge and `StyleSheet.create({...})` detection are new visitor cases over the same node types we already handle. |
| `get-tsconfig` | `^4.14.0` (already installed) | Resolve path aliases in Expo Router projects (`@/components/*`) | Identical mechanism; SDK 55+ Expo template uses `tsconfig.json` `paths` the same way Next.js does. |
| `tinyglobby` | `^0.2.16` (already installed) | Walk `app/**` and `src/app/**` for Expo Router | Expo Router supports both root layouts: `app/` and `src/app/` ([Expo: src directory](https://docs.expo.dev/router/reference/src-directory/)). Probing both paths is a 2-line change in the adapter's route-discovery step. |
| `zod` | `^4.1.4` (already installed) | MCP tool input schemas | Tool surface (`get_full_hierarchy`, `focus_on`, `find_by_text`, `find_by_style`) is **unchanged** by v1.2 — same 4 tools, same schemas, framework-agnostic. |

### Supporting Libraries — Optional Fixture Helpers

Both are **dev-only** and **optional**. Skip both if existing fixture tooling suffices.

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| _(none required)_ | — | Reading target project's `package.json` for adapter auto-detect | Use `node:fs/promises` + `JSON.parse`. A `package.json` is plain JSON. The dynamic `app.config.ts` is **not** needed (it configures app metadata: bundle ID, splash screen, EAS settings — nothing about UI hierarchy). |
| _(none required)_ | — | Parsing `tailwind.config.{js,ts,cjs}` for NativeWind preset detection | **Don't parse it.** NativeWind detection is a one-shot boolean — `package.json` dependencies include `"nativewind"` → emit `className` signals on RN nodes the same way `NextJsAdapter` does for Tailwind. The `tailwind.config.*` file's `presets: [require("nativewind/preset")]` ([NativeWind installation](https://www.nativewind.dev/docs/getting-started/installation)) is not needed for static signal extraction. |

### Development Tools — Fixture Authoring Only

| Tool | Purpose | Notes |
|------|---------|-------|
| _(no new dev deps)_ | Fixtures are static `.tsx` files committed to `test/fixtures/expo-router-basic/` and `test/fixtures/expo-router-tabs/` | Same pattern as v1.0 fixtures: no `node_modules` installed in the fixture, no Metro bundler, no Expo CLI. The fixture's `package.json` lists `expo-router` only so the adapter auto-detect (which reads `dependencies` from the fixture's `package.json`) returns `ExpoRouterAdapter`. Version strings in the fixture `package.json` are **never installed** — they only flip detection. |
| `vitest@^4.3.6` (already installed) | Snapshot tests for markdown + JSON output of Expo Router fixtures | `toMatchFileSnapshot` for markdown trees, `toMatchInlineSnapshot` for focused single-route cases. Identical to v1.0 test pattern. |

## Installation

```bash
# Nothing to install for the server. v1.2 is purely additive source code.
# The only "installation" is fixture authoring:

mkdir -p test/fixtures/expo-router-basic/app
mkdir -p "test/fixtures/expo-router-tabs/app/(tabs)"
# Then write static .tsx files + a minimal package.json with "expo-router" in deps.
```

For reference, the **target user project's** versions our parser will encounter in the wild (as of 2026-05-12):

| Package (in user projects, not ours) | Current Version | Notes |
|--------------------------------------|----------------|-------|
| `expo-router` | `~55.0.13` | [npm](https://www.npmjs.com/package/expo-router). Aligned with Expo SDK 55. v3+ supports both `app/` and `src/app/` out of the box. |
| `react-native` | `0.85.3` (latest stable May 2026; SDK 55 pins a specific minor) | [Versions schedule](https://reactnative.dev/versions). Adapter is RN-version-agnostic. |
| `nativewind` | `4.x` (stable) and `5.x` (beta with Tailwind v4 support) | [v4→v5 migration](https://www.nativewind.dev/v5/guides/migrate-from-v4). For v1.2 we treat **either** as "NativeWind present"; both expose `className` props the same way to the parser. |

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Same Babel pipeline (`@babel/parser` with `["jsx", "typescript"]`) | `@react-native/babel-preset` | **Never for our use case.** That preset is a transform stack for Metro bundling — flattens Flow types, applies Hermes optimizations. We **read** source, we don't transform it. Pulling it in would add ~30 transitive deps for zero benefit. |
| Same Babel pipeline | `@swc/core` w/ Expo plugin | Same answer as v1.0: SWC is faster but less forgiving of partial code, and we'd duplicate the visitor logic. Revisit if v1.x parse latency becomes a measured bottleneck. |
| Read user `package.json` with `fs.readFile + JSON.parse` | `read-pkg` / `pkg-up` npm packages | Two extra deps to do what 4 lines of stdlib does. Reject. |
| Don't parse `tailwind.config.*` | Parse it with Babel to extract `presets: [...]` | Adds parse cost on every analyze call for **one boolean** ("is NativeWind used?"). The `package.json` dependency check is faster, deterministic, and immune to dynamic `require()` patterns inside `tailwind.config.js`. |
| Don't parse `app.config.ts` | Parse / evaluate it for path overrides | `app.config.ts` configures **app metadata** (bundle ID, icon, splash, EAS settings) — not routing. Expo Router routing is **filesystem-only** by design ([core concepts](https://docs.expo.dev/router/basics/core-concepts/)). There is no equivalent of Next.js's `next.config.js` `basePath` for Expo Router that affects file→route mapping. |
| Filesystem detection for `app/` vs `src/app/` | A new config flag on the MCP server | Probe both. Expo's own runtime auto-detects ([Expo: src directory](https://docs.expo.dev/router/reference/src-directory/)) — we should match that behavior so no user has to tell us where their app dir is. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Installing `expo`, `expo-router`, `react-native`, `react-native-web`, or `nativewind` as dependencies of `ui-hierarchy-mcp` | We perform **static analysis only**. We never `import` from these packages; we recognize their **identifiers** in user code as plain strings during AST walking (e.g., `t.isJSXIdentifier(node.name) && node.name.name === "View"`). Installing them would bloat `npx ui-hierarchy-mcp` cold-fetch by 100+ MB and pull native binaries our server never needs. | A hard-coded RN primitive **identifier list** inside `src/adapters/expo-router/rnPrimitives.ts`: `View`, `Text`, `ScrollView`, `Image`, `ImageBackground`, `TextInput`, `Touchable*` (TouchableOpacity / TouchableHighlight / TouchableWithoutFeedback / TouchableNativeFeedback), `Pressable`, `FlatList`, `SectionList`, `VirtualizedList`, `Modal`, `SafeAreaView`, `KeyboardAvoidingView`, `ActivityIndicator`, `Switch`, `RefreshControl`, `StatusBar`. Verify against the imports in user code via the same import-resolver the v1.0 NextJsAdapter already uses. |
| `@react-native/babel-preset` | Transform-time dep meant for Metro. We don't transform. | The bare `@babel/parser` we already use. |
| `expo-modules-autolinking`, `metro`, `metro-resolver` | Runtime/bundler concerns, not parse-time. | Filesystem-only routing inference: directory layout is the contract. |
| Parsing `app.config.{ts,js}` dynamically (via `tsx`, `jiti`, etc.) | Requires evaluating user code — violates the "static analysis only" constraint baked into PROJECT.md. Also opens code-execution attack surface. | Don't read these files at all. They don't carry routing info. |
| Parsing `tailwind.config.{js,ts,cjs}` | Same code-evaluation problem; not needed for the boolean we care about. | `package.json` dependencies / devDependencies containing `"nativewind"` → set `signals.nativeWind = true` on the adapter context. Signal flips on `className` extraction for RN primitive nodes — mirrors how the Next.js adapter handles Tailwind `className`. |
| `read-pkg`, `pkg-up`, `find-up`, `pkg-dir` | Single-purpose micro-deps for things stdlib already does. | `node:fs/promises` + `node:path` + `JSON.parse`. The project-root resolver (`arg > env > cwd`) from v1.0 already handles "find the project". |
| Adding new MCP tools for RN-specific features | The v1.0 4-tool contract is the wire surface. RN support is a new **adapter**, not a new tool. | Keep `get_full_hierarchy` / `focus_on` / `find_by_text` / `find_by_style` unchanged; the active adapter owns the semantics of "what's a layout?" / "what's a route?". |
| Adding `@react-navigation/*` parsing to v1.2 | Out of scope per milestone framing; navigation-style stack/tab inference requires a different traversal (call-site analysis of `<Stack.Screen>`-style declarations) that doesn't share code with file-system routing. | Defer to v1.3 as planned. |

## Adapter Auto-Detect — Concrete Algorithm

No new dependency. Detection lives in a new `src/core/detectAdapter.ts`:

```ts
// Pseudocode — actual implementation goes in v1.2 source
async function detectAdapter(projectRoot: string): Promise<FrameworkAdapter> {
  const pkgPath = path.join(projectRoot, "package.json");
  const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  const hasExpoRouter = "expo-router" in deps;
  const hasNext = "next" in deps;

  if (hasExpoRouter && hasNext) {
    throw new Error("Both expo-router and next detected; cannot auto-detect adapter.");
  }
  if (hasExpoRouter) return new ExpoRouterAdapter(projectRoot);
  if (hasNext) return new NextJsAdapter(projectRoot);
  throw new Error("Neither expo-router nor next found in package.json dependencies.");
}
```

Then `ExpoRouterAdapter.findRouteRoot()` probes `app/` first, then `src/app/`, falling back to an error.

## Stack Patterns by Variant

**If the target project uses NativeWind:**
- Detect via `"nativewind" in deps` (catches both v4 and v5)
- Emit `className` attribute on RN primitive nodes — same renderer code path as Next.js Tailwind
- No need to read `tailwind.config.*`

**If the target project uses `StyleSheet.create` only (no NativeWind):**
- Walk the file for `StyleSheet.create({ ... })` calls; bind the receiver name (typically `styles`) to its object literal in the `Bindings` map (the v1.0 binding pass already supports this pattern; just register a new style-source kind)
- When visiting JSX, resolve `style={styles.card}` → look up `card` key in the bound object literal → emit style signal using the property keys themselves (`padding`, `marginTop`, `flexDirection: "row"`, etc. — RN style values, not Tailwind class strings)

**If the target uses inline `style={{ padding: 8 }}`:**
- Already handled by the v1.0 inline-style signal extractor; only the host-node identifier changes from `div` to `View`

**If the target uses array merge `style={[styles.a, styles.b, cond && styles.c]}`:**
- New visitor case: `t.isArrayExpression(attr.value.expression)` → walk each element, resolving named references and inlining conditionals as branches (same conditional-branch machinery from v1.0 OUT-04)

**If the target project has `src/app/` instead of `app/`:**
- Filesystem probe order: `src/app/_layout.tsx` first, then `app/_layout.tsx`. Match Expo's own auto-detect.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@babel/parser@7.29` | Any TS+JSX source from Expo SDK 50+ / RN 0.73+ | No syntactic features in modern RN/Expo source that Babel 7.29 doesn't parse. Hermes-specific transforms run **after** parsing; the input source is plain TSX. |
| Our `engines.node: ">=20"` | Unchanged for v1.2 | RN/Expo target projects run on their own toolchains; our server runs on user's Node, not on Hermes. |
| MCP SDK `^1.29` | Unchanged | Tool surface unchanged. |
| Fixture-only `expo-router` in `test/fixtures/*/package.json` | `~55.0.13` (latest as of 2026-05-12, [npm](https://www.npmjs.com/package/expo-router)) | Fixtures don't install. The version string only exists so adapter auto-detect picks `ExpoRouterAdapter`. Set to `"*"` if you want to be totally version-agnostic in fixtures. |
| Fixture-only `nativewind` (one fixture for NW path) | `^4.0.0` is enough | We only check **presence**, not version. |

## Peer-Dep Traps

| Trap | Status for us | Action |
|------|---------------|--------|
| Babel ESM/CJS interop on `@babel/traverse` (`traverse.default ?? traverse`) | Already mitigated in v1.0; same shim covers v1.2 | None. |
| MCP SDK ↔ Zod v4 peer (`^3.25 \|\| ^4.0`) | Unchanged | None. |
| RN's own Babel preset transitive deps when users have `@react-native/babel-preset` in their `node_modules` | We never **import** or **execute** their Babel config — we only `parse` text. Their preset is irrelevant to our process. | None. |
| Mixing `expo` SDK versions in the user's project (50 / 51 / 52 / 55) | Our parser is SDK-agnostic; we read filesystem layout, not SDK metadata. | None. |
| `react` peer dep mismatch in user project | Doesn't affect parse. | None. |
| `expo-router` SDK 52 quirk where `src/app` is sometimes not detected by Expo itself ([expo/expo#32587](https://github.com/expo/expo/issues/32587)) | A user-project bug, not ours. Our auto-detect probes both `app/` and `src/app/` and uses whichever exists. | If both exist (rare), prefer `src/app/` (matches Expo SDK 55+ default template) and emit a warning. |

## Integration Points with Existing Pipeline

| Existing v1.0/v1.1 component | v1.2 change |
|------------------------------|-------------|
| `FrameworkAdapter` 5-method interface | **No change.** Implemented by new `ExpoRouterAdapter` class. |
| `src/adapters/next-js/` | **No change.** Untouched by v1.2. |
| `src/adapters/expo-router/` | **New.** Mirror layout of `next-js/`: `index.ts` (adapter class), `routeMap.ts` (filesystem → route tree), `primitives.ts` (RN identifier list), `styles.ts` (StyleSheet + inline + array-merge extractor). |
| `src/core/detectAdapter.ts` | **New.** Reads target `package.json`; returns `ExpoRouterAdapter \| NextJsAdapter`. |
| `src/core/Analyzer.ts` | Minimal change: ask `detectAdapter` instead of hard-instantiating `NextJsAdapter`. |
| `src/ir/*` (IR types) | **No change.** RN nodes use the same `TreeNode` shape; the `tag` field carries `"View"` / `"Text"` instead of `"div"` / `"span"`. |
| `src/renderers/markdown.ts`, `src/renderers/json.ts` | **No change.** Tag string is opaque to renderers. |
| `src/mcp/tools/*` | **No change.** Tool schemas and handlers framework-agnostic. |
| `--init` guide template | **Small text change** to mention both Next.js App Router and Expo Router are supported (1–2 sentences); no code change. |
| Test infrastructure (`test/fixtures/`, `vitest.config.ts`) | **Add** two fixture directories. No config change. |

## Sources

- [Expo Router — File-based routing core concepts](https://docs.expo.dev/router/basics/core-concepts/) — HIGH: confirms `app/`, `_layout.tsx`, route groups `(group)/`, dynamic `[param]`, catch-all `[...slug]`, optional catch-all `[...slug?]`. Filesystem-only; no runtime config affects route mapping.
- [Expo Router — Notation reference](https://docs.expo.dev/router/basics/notation/) — HIGH: full filename convention table.
- [Expo Router — `src/app` directory](https://docs.expo.dev/router/reference/src-directory/) — HIGH: confirms auto-detect of `src/app/` for SDK 55+; justifies our probe order.
- [expo-router on npm](https://www.npmjs.com/package/expo-router) — HIGH: latest `~55.0.13` as of 2026-05-12. Fixture-version reference only; our parser never installs it.
- [Configure with app config — Expo Documentation](https://docs.expo.dev/workflow/configuration/) — HIGH: confirms `app.config.ts` is for app metadata (icon, bundle ID, plugins) — **not** for routing. Justifies our decision to not parse it.
- [NativeWind v4 installation](https://www.nativewind.dev/docs/getting-started/installation) — HIGH: `tailwind.config.js` with `presets: [require("nativewind/preset")]` is the v4 contract; v5 uses Tailwind v4 auto-detection ([v4→v5 migration](https://www.nativewind.dev/v5/guides/migrate-from-v4)). For our purposes, presence in `package.json` is sufficient signal.
- [React Native versions schedule](https://reactnative.dev/versions) — HIGH: current stable 0.85.x; release train through 0.89 in 2026. Confirms target-project versions our parser will encounter; our parser is RN-version-agnostic.
- [Expo SDK 52 `src/app` issue #32587](https://github.com/expo/expo/issues/32587) — MEDIUM: known SDK 52 quirk; not present in SDK 55+. Informs our probe-order policy.
- Existing `.planning/PROJECT.md` constraints (static-analysis-only, npx-distributable, stdio MCP) — HIGH: rules out any runtime evaluation of `app.config.ts` or `tailwind.config.*`.
- Existing v1.0/v1.1 `STACK` (this repo `CLAUDE.md`) — HIGH: confirms which deps are already in place and so excluded from v1.2 additions.

---
*Stack research for: ui-to-hierarchyMCP v1.2 — Expo Router + React Native adapter*
*Researched: 2026-05-12*
