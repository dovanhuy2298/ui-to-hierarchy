# Project Research Summary

**Project:** ui-to-hierarchyMCP — v1.2 React Native + Expo Router milestone
**Domain:** MCP server static-analysis parser — adding a second `FrameworkAdapter` (Expo Router + RN) parallel to the v1.0/v1.1 `NextJsAdapter`
**Researched:** 2026-05-12
**Confidence:** HIGH on stack, features, and code-archaeology pitfalls; MEDIUM on RN/Expo ecosystem specifics

## Executive Summary

v1.2 is mostly new TypeScript source code, not new dependencies. The Babel + tinyglobby + get-tsconfig + zod pipeline already handles every parse shape an Expo Router + RN project throws at it — `.tsx` is `.tsx`. Roughly two-thirds of the surface (dynamic segments, groups, `index.tsx`, layout-chain composition, NativeWind `className`, inline `style={{}}`) is a port of v1.0 logic with framework-specific tweaks. The genuinely new work concentrates in three places: the `_layout.tsx` JSX walker (recognizing `<Slot/>`, `<Tabs>`, `<Stack>`), `StyleSheet.create` named-lookup indexing, and the array-merge `style={[a, b, cond && c]}` extractor.

The single biggest architectural decision is whether to widen the `FrameworkAdapter` interface before writing `ExpoRouterAdapter` or to port-and-patch. STACK.md and ARCHITECTURE.md assume the locked 5-method contract is sufficient and propose a clean adapter port with framework semantics hidden inside `extractComponents` post-processing (the "rewrite style attribute at RenderNode level" trick). PITFALLS.md (Pitfall 1) argues this is wrong and cites five concrete leaks in `Analyzer.ts`: `deriveRoutesFromEntries` @1194-1233, `isPageFile`/`isLayoutFile`/`isSpecialFile` @663-677, `attachParallelSlot` @396-429, `runtime → layoutHint:"client"` @178-196, and `collectChildrenSlotLines` @495-507 (which searches for the identifier `children` rather than Expo's `<Slot/>` JSX element). **We side with PITFALLS.md.** A short, deliberate interface-widening phase up front (adding `classifyEntry`, `enumerateRoutes`, and a slot-marker predicate) is cheaper than chasing leaked Next.js assumptions across the rest of the milestone.

**Top three risks the roadmapper must not scope away:** (1) **fixtures-first** — without an Expo fixture containing `<Slot/>`, `StyleSheet.create`, and platform-suffix files committed *before* any adapter code, the new adapter will pass unit tests while silently failing on real projects (Pitfall 9, highest recovery cost); (2) **interface widening with explicit acceptance** that v1.0 NextJsAdapter snapshots get re-locked, not preserved blindly — the 5-method locking test is the forcing function for deliberate amendment; (3) a **documented, scope-bounded support matrix** for `StyleSheet.create` resolution (in-file literal + one-hop import only; computed/factory/hook → `{ raw }` + warning) published as a doc comment in `core/styles/rn/stylesheet-create.ts`.

## Key Findings

### Recommended Stack

Zero new runtime dependencies. Zero new dev dependencies. v1.2 is purely additive source code over the v1.0/v1.1 stack.

- `@babel/parser@^7.29` + `@babel/traverse@^7.29` + `@babel/types@^7.29` — same `["jsx", "typescript"]` plugins parse RN/Expo `.tsx` unchanged.
- `tinyglobby@^0.2.16` — enumerate `app/**` and `src/app/**` (probe both, match Expo's own auto-detect).
- `get-tsconfig@^4.14` — Expo projects use identical `tsconfig.json` `paths`.
- `node:fs/promises` + `JSON.parse` — sufficient for adapter auto-detect from target `package.json`. Do **not** parse `app.config.{ts,js}` or `tailwind.config.*` (code-evaluation risk; neither carries routing info; NativeWind detection is a dep-presence boolean).
- Hard-coded `RN_PRIMITIVES` identifier set inside the adapter. Never install `react-native` itself — recognition is by identifier + import-source.

### Expected Features

**Must have (P1 / table stakes — TS-1..TS-15 from FEATURES.md):**

- TS-15 adapter auto-detect from `package.json`; conflict → explicit error naming matched paths.
- TS-1 `app/` + `src/app/` route discovery (probe in that order).
- TS-2 `_layout.tsx` chain composition with `<Slot/>` injection — the keystone.
- TS-3..TS-5 `index.tsx` default routes; dynamic `[param]`/`[...rest]`/`[[...opt]]`; transparent groups `(group)` — ports of v1.0.
- TS-6/TS-7 `<Tabs>` + `<Tabs.Screen>` and `<Stack>` + `<Stack.Screen>` recognition with literal-string `name`/`options`.
- TS-8 `+not-found.tsx` registered as special sibling; `+html.tsx` acknowledged/skipped; `+api.ts` skipped.
- TS-9..TS-14 RN primitive allowlist + role tagging; `<Text>`-anchored text content; `StyleSheet.create` named-lookup; inline `style={{}}` regression; style array merge; NativeWind `className` on RN primitives.

**Should have (P2 — ship if cheap):** D-1 Screen options projected onto child screens; D-6 modal-presentation flag (free with D-1); D-4 `<Link href=...>` static-href harvesting.

**Defer to v1.3+ (P3):** D-2 `useLocalSearchParams`, D-3 `useRouter`, D-5 array-syntax shared groups, D-7 theme/dark-mode, D-8 `FlatList renderItem`. Drawer navigator deferred. React Navigation code-based config, Reanimated worklets, type-aware analysis (ts-morph) — out of scope.

### Architecture Approach

ARCHITECTURE.md's clean structure is the right end-state, amended with Phase 10 interface widening per Pitfall 1.

1. **`src/adapters/expo/`** — `ExpoRouterAdapter`, `detect.ts`, `discover.ts` (with platform-suffix dedup), `route-map.ts`, `segments.ts`, `rn-primitives.ts`.
2. **`src/adapters/select.ts`** — `selectAdapter(root)`; two-signal pattern mirroring `next/detect.ts` (deps AND `_layout.tsx`); `--framework` CLI override; parallel detect with exactly-one-true.
3. **`src/core/styles/rn/`** (generic — not under `adapters/`) — `stylesheet-create.ts`, `style-prop.ts`, `index.ts` façade.
4. **`src/adapters/FrameworkAdapter.ts`** — widened with `classifyEntry`, `enumerateRoutes`, `slotMarker`. 5-key locking test flips deliberately.
5. **`src/core/Analyzer.ts`** — five cited leak sites delegate to adapter.
6. **`src/ir/schema.ts`** — `layoutHint` stays Next-specific (`"client"` only); RN nodes leave unset.
7. **MCP tool handlers (4) + `init/template.ts`** — 3-line edits; INIT_MARKER_VERSION bump.

### Critical Pitfalls (top from PITFALLS.md)

1. **Next.js assumptions in Analyzer** — 5 cited leaks. Prevention: Phase 10 interface widening.
2. **Auto-detect false positives** — monorepo + dep-but-unused. Prevention: two-signal detect + parallel + exactly-one-true + `--framework` override.
3. **`StyleSheet.create` cross-file/computed/factory** — Prevention: published support matrix; everything else `{ raw }` + warning.
4. **Style array `[a, b, cond && c]`** — Prevention: `flattenStyleArray` with ≥8 shape tests; conditional union.
5. **NativeWind as web Tailwind blindly** — Prevention: variant-strip regex audit; `tw\`...\`` warning-only.
6. **`<Tabs>`/`<Stack>` JSX introspection** — Prevention: warning naming detected screens beats silence.
7. **Platform-suffix files** — Prevention: dedup with preference `no-suffix > .native > .ios > .android > .web`.
8. **RN primitive vs user-defined `<Text>`** — Prevention: classify by **import source**, not tag name.
9. **Fixtures that don't exercise divergent semantics** — Prevention: Phase 9 fixtures-first with stubbed `react-native`/`expo-router`.

### Adjudicated Open Questions

- **Q1 — Widen interface vs clean port:** WIDEN UP FRONT. Five line-cited leaks; locking test is the forcing function.
- **Q2 — `StyleSheet.create` one-hop cross-file:** IN SCOPE, single-hop only. Publish support matrix as doc comment.
- **Q3 — `--platform` CLI flag:** DEFER the flag, include the mechanism (dedup + resolver fallback).
- **Q4 — `layoutHint` for RN primitives:** LEAVE UNSET in v1.2; reserve field for proper design later.
- **Q5 — Drawer navigator:** DEFER to v1.3; extension-point comment only.

## Implications for Roadmap

Continue phase numbering from v1.1 (last phase was 8). Seven phases (9–15). Strict dependency order. Phase 9 non-negotiable.

### Phase 9: Fixture Design + Stub Package Shape (P0)

Two committed fixtures (`expo-basic`, `expo-tabs-and-dynamic`) covering `<Slot/>`, `StyleSheet.create`, `style={[...]}`, NativeWind + platform variant, `<Tabs>` + `<Tabs.Screen>`, platform-suffix files, `+not-found.tsx`, tsconfig path aliases. Stubbed `react-native` and `expo-router` exports per fixture. **Non-negotiable, before any adapter code.**

### Phase 10: Interface Widening & Analyzer De-Next-ification (P1)

Add `classifyEntry`, `enumerateRoutes`, `slotMarker` to `FrameworkAdapter`. Delegate Analyzer's 5 cited leak sites. Migrate NextJsAdapter; re-lock v1.0 snapshots. Full 353/353 stays green.

### Phase 11: Adapter Detection & Selection (P2)

`expo/detect.ts` (deps + `_layout.tsx`), `adapters/select.ts` (parallel detect, exactly-one-true, `--framework` override, named-paths errors). 4 tool handlers updated.

### Phase 12: ExpoRouterAdapter Routing (P3)

`expo/discover.ts` (platform-suffix dedup), `segments.ts`, `route-map.ts`, `rn-primitives.ts`, `ExpoRouterAdapter.ts`. `<Tabs>`/`<Stack>` walker emits warning naming screens.

### Phase 13: RN Style Signal Extraction (P4)

`core/styles/rn/stylesheet-create.ts` (in-file + one-hop), `style-prop.ts` (`flattenStyleArray`), `index.ts` façade. NativeWind variant regex audit. Wire post-processing into adapter.

### Phase 14: RN Primitive Recognition (P5)

Resolver-driven classification by import source. User `<Text>` from `@/components/Text` stays `kind:"component"`. `<Text>`-anchored text content.

### Phase 15: Resolver Platform-Suffix + Integration & --init (P6)

`core/resolver/relative.ts` extended with platform-suffix fallback. Integration suite covers both fixtures (markdown + JSON). `init/template.ts` mentions multi-framework; `INIT_MARKER_VERSION` bumped.

### Research Flags

- **Phase 10** — Analyzer.ts leak audit (6th leak?).
- **Phase 13** — `StyleSheet.create` one-hop contract design.
- **Phase 15** — platform-suffix caching strategy.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new deps; verified via npm + Expo + NativeWind docs. |
| Features | HIGH | TS-1..TS-15 grounded in Expo Router conventions doc + react-native-website + NativeWind. |
| Architecture | HIGH on structure; MEDIUM on wiring | Synthesis adjudicates in favor of interface widening over attribute-rewrite trick. |
| Pitfalls | HIGH on code-archaeology; MEDIUM on RN/Expo ecosystem. |

**Overall:** HIGH on shipping v1.2; MEDIUM on min-scope boundary (StyleSheet one-hop, `<Tabs>` introspection depth).

## Sources

- `.planning/research/{STACK,FEATURES,ARCHITECTURE,PITFALLS}.md` — research bodies condensed here.
- Repo: `src/adapters/FrameworkAdapter.ts`, `src/core/Analyzer.ts` (line-cited leaks), `src/adapters/next/*.ts`, `src/core/extractors/*.ts`.
- `.planning/PROJECT.md`, `.planning/MILESTONES.md`.
- Expo Router docs (https://docs.expo.dev/router/), React Native docs, NativeWind v4 docs.

---

*Research completed: 2026-05-12*
*Ready for roadmap: yes*
