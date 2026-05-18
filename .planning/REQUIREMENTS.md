# Milestone v1.2 Requirements — ui-to-hierarchyMCP

**Milestone:** v1.2 React Native + Expo Router
**Defined:** 2026-05-12

---

## v1.2 Requirements

### ADAPT — Framework adapter widening & selection

- [x] **ADAPT-01**: `FrameworkAdapter` interface widened with `classifyEntry(absPath)` (returns `"page" | "layout" | "special" | "other"`), `enumerateRoutes(absRoot)`, and `slotMarker(name, importSource)` — Analyzer's 5 Next.js-specific leak sites (`deriveRoutesFromEntries`, `isPageFile`/`isLayoutFile`/`isSpecialFile`, `attachParallelSlot`, `runtime → layoutHint:"client"` propagation, `collectChildrenSlotLines`) delegate to these adapter methods.
- [x] **ADAPT-02**: `NextJsAdapter` migrated to the widened interface; the existing 5-method locking test is deliberately updated to assert the new method set; all v1.0 markdown + JSON snapshots re-locked rather than blindly preserved; full vitest suite stays green (≥353/353).
- [ ] **ADAPT-03**: `selectAdapter(projectRoot)` auto-detects the framework using a two-signal pattern per adapter: NextJs needs `next` in deps AND a `next.config.*` file; ExpoRouter needs `expo-router` in deps AND `app/_layout.tsx` (or `src/app/_layout.tsx`). Detection runs in parallel and requires exactly one true.
- [ ] **ADAPT-04**: When both adapters detect true (e.g., monorepo with mixed apps at one root), `selectAdapter` returns an MCP `{isError: true}` error message that names both matched signal paths so the agent knows what conflicted; when zero detect, the error suggests `--framework` override.
- [ ] **ADAPT-05**: `--framework nextjs|expo-router` CLI flag overrides auto-detect for CI/monorepo contexts; flag value is forwarded to `selectAdapter` and skips the two-signal probe.
- [x] **ADAPT-06**: All 4 MCP tool handlers (`get_full_hierarchy`, `focus_on`, `find_by_text`, `find_by_style`) route through `selectAdapter` per call instead of importing `NextJsAdapter` directly; existing Next.js E2E flows continue to pass.

### ROUTE — Expo Router routing semantics

- [ ] **ROUTE-01**: ExpoRouterAdapter discovers routes from `app/` and `src/app/`; when both exist, `src/app/` wins and a warning is emitted naming both directories.
- [ ] **ROUTE-02**: `_layout.tsx` files compose a root → leaf layout chain; the JSX walker recognizes `<Slot/>` (imported from `expo-router`) as the children injection point — analogous to Next.js's `{children}` identifier.
- [ ] **ROUTE-03**: Dynamic segments parsed and surfaced in the route: `[param]`, `[...rest]`, `[[...opt]]`; each segment kind reflected in the rendered tree's route label.
- [ ] **ROUTE-04**: Route groups `(group)/` are transparent — they do not contribute a URL segment but their `_layout.tsx` still participates in the layout chain.
- [ ] **ROUTE-05**: `index.tsx` becomes the default route at its directory's URL (e.g., `app/index.tsx` → `/`, `app/settings/index.tsx` → `/settings`).
- [ ] **ROUTE-06**: `<Tabs>` from `expo-router` recognized in `_layout.tsx`; literal-string `<Tabs.Screen name="..." options={...}>` children enumerated by name with their `options` summarized as attributes on the tab node.
- [ ] **ROUTE-07**: `<Stack>` from `expo-router` recognized in `_layout.tsx`; `<Stack.Screen name="..." options={...}>` enumerated analogously to Tabs.Screen.
- [ ] **ROUTE-08**: Expo-prefixed specials handled by convention: `+not-found.tsx` registered as a special sibling (not URL-mapped); `+html.tsx` and `+native-intent.tsx` skipped; `+api.ts` skipped (server route, no UI).

### RN — React Native primitives & style signals

- [ ] **RN-01**: RN primitive allowlist (`View`, `Text`, `ScrollView`, `Image`, `Touchable*`, `Pressable`, `FlatList`, `SectionList`, `Modal`, `KeyboardAvoidingView`, `SafeAreaView` when from `react-native`, etc.) is recognized as `kind: "element"` when imported from `react-native`.
- [ ] **RN-02**: A user-defined component sharing a primitive name (e.g., `<Text>` imported from `@/components/Text`) stays `kind: "component"` — disambiguation is by **import source**, not by tag name alone. Namespace imports (`import * as RN from "react-native"`) handled or documented.
- [ ] **RN-03**: Text content extraction is anchored on `<Text>` children: literal strings inside `<Text>` populate the node's text content (parallel to v1.0 text extraction on web).
- [ ] **RN-04**: `StyleSheet.create({card: {...}})` calls are indexed at parse time and exposed via `ParseResult`; `style={styles.card}` references resolve to the property name keys. Supports in-file literal object + one-hop import (lookup-only); behavior documented in a doc-comment support matrix in `core/styles/rn/stylesheet-create.ts`.
- [ ] **RN-05**: Inline `style={{ padding: 8 }}` extracted on RN primitives (parity with v1.0 web inline-style extractor); existing v1.0 extractor reused where possible.
- [ ] **RN-06**: Style array merging `style={[a, b, dynamic && c]}` flattened by a dedicated `flattenStyleArray` utility; conditional members contribute as a union to `find_by_style` recall (so `dynamic && styles.c` makes `c`'s keys findable even though the runtime evaluation is unknown).
- [ ] **RN-07**: NativeWind `className` extracted on RN primitives; platform variants stripped via regex audit (`ios:`, `android:`, `web:`, `native:`); unsupported `tw\`...\`` tagged template is acknowledged with a warning, not silently dropped.
- [ ] **RN-08**: Unsupported `StyleSheet.create` patterns (computed keys, factory functions, hook-returned styles, two-hop imports) emit `{ raw: <source-text> }` plus an envelope warning rather than throw — degrades gracefully.

### INTEG — Fixtures, integration tests, --init guide

- [x] **INTEG-01**: Two Expo Router fixtures committed under `test/fixtures/`: `expo-basic` (single `app/_layout.tsx` + `<Slot/>` + `app/index.tsx` + a screen using `StyleSheet.create`) and `expo-tabs-and-dynamic` (`(tabs)` group + `[id].tsx` dynamic + `+not-found.tsx` + NativeWind class + style array).
- [x] **INTEG-02**: Both fixtures ship stubbed `react-native` and `expo-router` `package.json` + minimal `index.d.ts` exports so the resolver returns `kind: "external"` rather than `unresolved`.
- [ ] **INTEG-03**: Integration suite exercises `format: "json"` AND `format: "markdown"` against both new fixtures; tree glyphs, `@` file:line separator, and Windows backslash guard (`not.toContain('\\')`) re-asserted.
- [ ] **INTEG-04**: A monorepo fixture (Next.js in `apps/web/`, Expo Router in `apps/mobile/`) verifies `selectAdapter` picks the right adapter per `projectRoot` argument across calls within a single MCP session.
- [ ] **INTEG-05**: `core/resolver/relative.ts` extended with platform-suffix fallback preference order `no-suffix > .native > .ios > .android > .web`; resolver cache shape updated if needed; behavior tested with a `Button.{ios,android}.tsx` fixture pair.
- [ ] **INTEG-06**: `src/init/template.ts` updated to mention multi-framework support (Next.js App Router + Expo Router); `__INIT_MARKER_VERSION__` bumped so existing CLAUDE.md / AGENTS.md / `.cursor/rules/*.mdc` / `.github/copilot-instructions.md` re-injection produces a clean diff.

---

## Future Requirements (deferred to v1.3+)

- React Navigation (non-Expo Router, `@react-navigation/native` + `Stack.Navigator` code-based) support
- Drawer navigator (`<Drawer>` from `expo-router/drawer`) — structurally similar to Tabs but defers fixture churn
- `useLocalSearchParams`, `useRouter` navigation target harvesting
- `<Link href={...}>` static-href extraction (when `href` is a literal string)
- `FlatList renderItem` introspection
- Theme / dark-mode heuristic surface
- `--platform ios|android|web|native` CLI flag (mechanism shipped in INTEG-05; flag exposure deferred)
- Sister-package RN primitives: `SafeAreaView` from `react-native-safe-area-context`, `expo-image`, `expo-status-bar`
- F-01: live Claude Code transcript export (carry-forward from v1.0/v1.1)
- Cleanup orphan exports in `src/mcp/errors.ts` (`notImplemented`, `invalidInput`)

## Out of Scope (v1.2)

- **React Navigation code-based navigation** — defer to v1.3; Expo Router is the modern default
- **Vue / Svelte / Pages Router** — still deferred from v1.0
- **Reanimated worklets / native modules / safe-area runtime values** — runtime concerns, not structural
- **Type-aware analysis (`ts-morph` / TypeScript compiler API)** — Babel-only, syntactic only
- **Caching / watch mode** — still deferred from v1.0; parse-on-demand stays
- **Parsing `app.config.{ts,js}` or `tailwind.config.*`** — code-evaluation risk; not needed for routing or NativeWind detection
- **Computing merged style results statically (e.g., `[styles.a, styles.b]` → final flat object)** — `find_by_style` works on union of keys, not resolved values
- **`<Tabs>` / `<Stack>` introspection deeper than literal-string `name`/`options`** — non-literal-named screens beyond v1.2 scope

## Traceability

| Requirement | Phase    | Status  |
| ----------- | -------- | ------- |
| ADAPT-01    | Phase 10 | Planned |
| ADAPT-02    | Phase 10 | Planned |
| ADAPT-03    | Phase 11 | Planned |
| ADAPT-04    | Phase 11 | Planned |
| ADAPT-05    | Phase 11 | Planned |
| ADAPT-06    | Phase 11 | Planned |
| ROUTE-01    | Phase 12 | Planned |
| ROUTE-02    | Phase 12 | Planned |
| ROUTE-03    | Phase 12 | Planned |
| ROUTE-04    | Phase 12 | Planned |
| ROUTE-05    | Phase 12 | Planned |
| ROUTE-06    | Phase 12 | Planned |
| ROUTE-07    | Phase 12 | Planned |
| ROUTE-08    | Phase 12 | Planned |
| RN-01       | Phase 12 | Planned |
| RN-02       | Phase 12 | Planned |
| RN-03       | Phase 12 | Planned |
| RN-04       | Phase 13 | Planned |
| RN-05       | Phase 13 | Planned |
| RN-06       | Phase 13 | Planned |
| RN-07       | Phase 13 | Planned |
| RN-08       | Phase 13 | Planned |
| INTEG-01    | Phase 9  | Complete |
| INTEG-02    | Phase 9  | Complete |
| INTEG-03    | Phase 15 | Planned |
| INTEG-04    | Phase 11 | Planned |
| INTEG-05    | Phase 14 | Planned |
| INTEG-06    | Phase 15 | Planned |

**Coverage:** 28/28 requirements mapped (6 ADAPT + 8 ROUTE + 8 RN + 6 INTEG); every requirement assigned to exactly one phase.

---

_Last updated: 2026-05-12 — roadmap traceability populated by gsd-roadmapper_
