# Roadmap — ui-to-hierarchyMCP

## Milestones

- ✅ **v1.0 Next.js App Router Parser** — Phases 1–6, 37 plans (shipped 2026-05-05) — see [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Agent Onboarding & v1.0 Polish** — Phases 7–8, 9 plans (shipped 2026-05-12) — see [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)
- 🚧 **v1.2 React Native + Expo Router** — Phases 9–15 (active, scoped 2026-05-12)

## Phases

<details>
<summary>✅ v1.0 Next.js App Router Parser (Phases 1–6) — SHIPPED 2026-05-05</summary>

- [x] Phase 1: Scaffolding & IR Foundation (5/5 plans) — completed 2026-04-20
- [x] Phase 2: MCP Transport Shell (5/5 plans) — completed 2026-04-21
- [x] Phase 3: Parser Core (6/6 plans) — completed 2026-04-29
- [x] Phase 4: Next.js App Router Adapter (4/4 plans) — completed 2026-04-29
- [x] Phase 5: IR Queries & Tool Wire-up (5/5 plans) — completed 2026-04-29
- [x] Phase 6: Hardening & Fixture Gates (10/10 plans) — completed 2026-05-05

Full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.1 Agent Onboarding & v1.0 Polish (Phases 7–8) — SHIPPED 2026-05-12</summary>

- [x] Phase 7: `--init` File Writer (5/5 plans) — completed 2026-05-12
- [x] Phase 8: v1.0 Polish (4/4 plans) — completed 2026-05-12

Full details: [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)

</details>

### Next Milestone

**v1.2 React Native + Expo Router** — 7 phases (9–15), 28 requirements, 0/28 plans staged.

- [x] **Phase 9: Fixture Design & Stub Packages** — Commit two Expo Router fixtures with stubbed `react-native` / `expo-router` exports before any adapter code lands.
- [x] **Phase 10: Interface Widening & Analyzer De-Next-ification** — Widen `FrameworkAdapter` (3 new methods) and delegate Analyzer's 5 Next.js leak sites; NextJsAdapter migrated, full suite re-locked green. (completed 2026-05-13)
- [x] **Phase 11: Adapter Detection, Selection & Tool Routing** — Two-signal auto-detect, `--framework` override, conflict/zero-match errors with named paths; 4 MCP tools route through `selectAdapter`. (completed 2026-05-18)
- [x] **Phase 12: ExpoRouterAdapter Routing & RN Primitives** — Discover routes from `app/` (and `src/app/`), compose `_layout.tsx` chain via `<Slot/>`, dynamic segments, groups, `index`, `<Tabs>`/`<Stack>`, `+not-found`; RN primitive recognition by import source; `<Text>`-anchored text content. (completed 2026-05-19)
- [ ] **Phase 13: RN Style Signal Extraction** — `StyleSheet.create` named lookup (in-file + one-hop), inline `style={{}}`, `flattenStyleArray`, NativeWind `className` with variant strip; unsupported patterns degrade to `{ raw }` + warning.
- [ ] **Phase 14: Resolver Platform-Suffix Fallback** — `core/resolver/relative.ts` resolves `Button.tsx` from `Button.{ios,android,native,web}.tsx` with preference `no-suffix > .native > .ios > .android > .web`.
- [ ] **Phase 15: Integration Suite & --init Template** — Markdown + JSON integration coverage on both Expo fixtures; `init/template.ts` mentions multi-framework support; `__INIT_MARKER_VERSION__` bumped for clean re-injection.

## Phase Details

### Phase 9: Fixture Design & Stub Packages
**Goal**: A reviewer can inspect two Expo Router fixture projects that exercise every routing and styling shape v1.2 must handle, with stubbed `react-native` / `expo-router` packages so the existing resolver returns `kind: "external"`.
**Depends on**: Nothing (foundation phase; precedes all adapter/code work)
**Requirements**: INTEG-01, INTEG-02
**Success Criteria** (what must be TRUE):
  1. `test/fixtures/expo-basic/` exists with `app/_layout.tsx` containing `<Slot/>`, `app/index.tsx`, a screen using `StyleSheet.create`, and a stubbed `node_modules/react-native` + `node_modules/expo-router` with valid `package.json` + `index.d.ts`.
  2. `test/fixtures/expo-tabs-and-dynamic/` exists with `(tabs)/_layout.tsx`, `[id].tsx`, `+not-found.tsx`, a NativeWind `className` usage, and at least one `style={[a, b, cond && c]}` site.
  3. Both fixtures include a `Button.ios.tsx` / `Button.android.tsx` (or equivalent) pair so Phase 14 has a real probe target.
  4. Resolver, when run against either fixture, classifies `react-native` and `expo-router` imports as `kind: "external"` (not `unresolved`) — verified by a smoke test, not asserted via adapter code.
**Plans**: 3 plans
- [x] 09-01-PLAN.md — Author expo-basic fixture (stubs + tsconfig + app/ files + Button platform pair)
- [x] 09-02-PLAN.md — Author expo-tabs-and-dynamic fixture (stubs + tsconfig + tab group + dynamic + not-found + NativeWind + style array + Button platform pair)
- [x] 09-03-PLAN.md — Add resolver external-classification smoke test at test/core/resolver/expo-stubs.test.ts
**Scope**: IN — fixture file shapes, stub `package.json` + `index.d.ts`, tsconfig path aliases. OUT — any adapter logic, any parsing of Expo semantics; fixtures must be inert from the analyzer's perspective until Phase 12.

### Phase 10: Interface Widening & Analyzer De-Next-ification
**Goal**: An adapter author can describe a framework's entry classification, route enumeration, and children-slot marker without modifying `core/Analyzer.ts`, because the five cited Next.js leak sites have been routed through new `FrameworkAdapter` methods.
**Depends on**: Phase 9
**Requirements**: ADAPT-01, ADAPT-02
**Success Criteria** (what must be TRUE):
  1. `FrameworkAdapter` exposes `classifyEntry(absPath)`, `enumerateRoutes(absRoot)`, and `slotMarker(name, importSource)` alongside the existing surface; the 5-method locking test has been deliberately updated and passes against the new method set.
  2. `Analyzer.deriveRoutesFromEntries`, `isPageFile/isLayoutFile/isSpecialFile`, `attachParallelSlot`, the `runtime → layoutHint:"client"` propagation, and `collectChildrenSlotLines` all call the adapter rather than hard-coding Next.js conventions.
  3. `NextJsAdapter` implements every new method and produces byte-identical markdown + JSON snapshots after re-locking — full vitest suite stays ≥353/353 green.
  4. A grep for `_layout`, `page.`, `not-found`, `children` (as identifier) inside `src/core/Analyzer.ts` returns zero remaining Next-specific string literals.
**Plans**: 2 plans
- [x] 10-01-PLAN.md — Widen FrameworkAdapter interface (5→8 methods), update structural locking test, create NextJsAdapter unit tests (RED state)
- [x] 10-02-PLAN.md — Implement 3 new methods in NextJsAdapter, de-Next-ify Analyzer.ts (5 functions removed, adapter delegation wired), snapshot re-lock
**Scope**: IN — interface widening, Analyzer delegation, NextJsAdapter migration, snapshot re-lock. OUT — any Expo adapter logic, any RN style work.

### Phase 11: Adapter Detection, Selection & Tool Routing
**Goal**: An agent calling any of the 4 MCP tools against a project root gets routed to the right `FrameworkAdapter` automatically, with explicit named-paths errors on conflict/zero-match and a `--framework` CLI escape hatch.
**Depends on**: Phase 10
**Requirements**: ADAPT-03, ADAPT-04, ADAPT-05, ADAPT-06, INTEG-04
**Success Criteria** (what must be TRUE):
  1. `selectAdapter(projectRoot)` runs Next.js and Expo Router probes in parallel; each probe requires BOTH a deps-key match AND a config-file match (`next.config.*` for Next; `(src/)?app/_layout.tsx` for Expo); exactly one true → success.
  2. When both probes succeed, the tool returns `{ isError: true }` with a message naming both matched signal paths so the agent can disambiguate; when zero succeed, the error suggests `--framework nextjs|expo-router`.
  3. `--framework nextjs|expo-router` CLI flag short-circuits the probe and forces adapter selection; CI-friendly, documented in `--help`.
  4. All 4 tool handlers (`get_full_hierarchy`, `focus_on`, `find_by_text`, `find_by_style`) call `selectAdapter(projectRoot)` per request — no remaining direct `import { NextJsAdapter }` in `src/mcp/tools/*`.
  5. A `monorepo-mixed` integration fixture (Next.js in `apps/web/`, Expo Router in `apps/mobile/`) is parsed by one MCP session across consecutive calls and each `projectRoot` argument picks the matching adapter.
**Plans**: 5 plans

**Wave 0**
- [x] 11-01-PLAN.md — Fixture package.json gaps + monorepo-mixed fixture + RED test stubs

**Wave 1** *(blocked on Wave 0 completion)*
- [x] 11-02-PLAN.md — ExpoRouterAdapter stub class + detectExpoRouter two-signal probe
- [x] 11-03-PLAN.md — detectNextJs export added to next/detect.ts *(parallel with 11-02)*

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 11-04-PLAN.md — selectAdapter + setFrameworkOverride + --framework CLI flag

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 11-05-PLAN.md — Refactor all 4 tool handlers through selectAdapter + human checkpoint
**Scope**: IN — `expo/detect.ts`, `adapters/select.ts`, CLI flag plumbing, tool-handler refactor, monorepo fixture. OUT — actual Expo parsing logic (returns stub IR until Phase 12).

### Phase 12: ExpoRouterAdapter Routing & RN Primitives
**Goal**: An agent calling `get_full_hierarchy` on an Expo Router project gets a routing tree that mirrors the file-system layout — layouts composed via `<Slot/>`, dynamic segments and groups rendered correctly, `<Tabs>`/`<Stack>` children enumerated, RN primitives identified by their import source.
**Depends on**: Phase 11
**Requirements**: ROUTE-01, ROUTE-02, ROUTE-03, ROUTE-04, ROUTE-05, ROUTE-06, ROUTE-07, ROUTE-08, RN-01, RN-02, RN-03
**Success Criteria** (what must be TRUE):
  1. Calling `get_full_hierarchy(route)` on `expo-basic` produces a tree rooted at `app/_layout.tsx` injecting `app/index.tsx` via the recognized `<Slot/>` marker, with file:line on every node.
  2. Calling `get_full_hierarchy` on `expo-tabs-and-dynamic` returns a tree where `(tabs)` is transparent in the URL but its `_layout.tsx` participates in the chain; `[id]`, `[...rest]`, `[[...opt]]` segments are labeled by kind; `index.tsx` becomes the default route at its directory; `+not-found.tsx` appears as a special sibling; `+html.tsx` / `+native-intent.tsx` / `+api.ts` are skipped.
  3. `<Tabs>` / `<Tabs.Screen name="..." options={...}>` and `<Stack>` / `<Stack.Screen ...>` inside `_layout.tsx` are enumerated with `name` and a summarized `options` attribute set; non-literal screens emit a warning naming the detected screens rather than silently dropping.
  4. A user component named `<Text>` imported from `@/components/Text` keeps `kind: "component"`; `<Text>` imported from `react-native` is classified `kind: "element"` and its literal-string children populate the node's text content.
  5. When both `app/` and `src/app/` exist, `src/app/` wins and an envelope warning names both directories.
**Plans**: 4 plans
- [x] 12-01-PLAN.md — Extract collectImportBindings to src/core/import-bindings.ts + scaffold RED test stubs (D-04, D-05)
- [x] 12-02-PLAN.md — Implement routing infra: segments.ts, discover.ts, route-map.ts, rn-primitives.ts (ROUTE-01, ROUTE-03, ROUTE-04, ROUTE-05)
- [x] 12-03-PLAN.md — Replace all 5 ExpoRouterAdapter stubs + extend Analyzer.collectChildrenSlotLines with JSXOpeningElement visitor (ROUTE-01, ROUTE-02, RN-01, RN-02, RN-03)
- [x] 12-04-PLAN.md — Lock expo-basic and expo-tabs-and-dynamic markdown snapshots; verify full suite green
**Scope**: IN — `expo/discover.ts`, `segments.ts`, `route-map.ts`, `rn-primitives.ts`, `ExpoRouterAdapter.ts`, `<Slot>` / `<Tabs>` / `<Stack>` JSX walker. OUT — `StyleSheet.create` / style array / NativeWind extraction (Phase 13); platform-suffix resolution (Phase 14).
**UI hint**: yes

### Phase 13: RN Style Signal Extraction
**Goal**: Calling `find_by_style(key)` on an Expo Router project surfaces matches whether the style was declared via `StyleSheet.create`, inline `style={{}}`, a merged `style={[...]}` array, or a NativeWind `className` — and unsupported `StyleSheet.create` shapes degrade visibly rather than throw.
**Depends on**: Phase 12
**Requirements**: RN-04, RN-05, RN-06, RN-07, RN-08
**Success Criteria** (what must be TRUE):
  1. `StyleSheet.create({ card: {...} })` is indexed at parse time; `style={styles.card}` resolves to the literal property key `card` and is findable via `find_by_style("card")`; in-file literal objects AND one-hop imports both supported; the supported-pattern matrix is documented as a doc comment in `core/styles/rn/stylesheet-create.ts`.
  2. Inline `style={{ padding: 8 }}` on RN primitives extracts to the same key set the v1.0 web extractor produced (reused, not reimplemented).
  3. `style={[styles.a, styles.b, dynamic && styles.c]}` flattens via `flattenStyleArray`; conditional members contribute their keys to the union exposed to `find_by_style` (a search for `c` hits even though runtime resolution is unknown); ≥8 shape tests cover the matrix.
  4. NativeWind `className="ios:p-4 android:p-2 text-lg"` is recognized on RN primitives; platform variants are stripped via a regex audit (`ios:`, `android:`, `web:`, `native:`); a `tw\`...\`` tagged template emits an explicit warning instead of being silently dropped.
  5. Unsupported `StyleSheet.create` patterns (computed keys, factory functions, hook-returned styles, two-hop imports) emit a node with `{ raw: <source-text> }` plus an envelope warning — the tool returns success, not error.
**Plans**: 3 plans
- [x] 13-01-PLAN.md — Wave 0: scaffold src/core/styles/rn/ stubs + test it.todo files + verify EXPO-SLOT-01 at 494 tests
- [x] 13-02-PLAN.md — Wave 1: implement parseStyleSheetCreate, extractRNInlineStyle, extractNativeWindClassNames, flattenStyleArray + 18+ unit tests (RN-04/05/06/07/08)
- [ ] 13-03-PLAN.md — Wave 2: wire ExpoRouterAdapter (one-hop import resolution + globalStyleIndex) + NativeWind fixture + re-lock Expo snapshots
**Scope**: IN — `core/styles/rn/stylesheet-create.ts`, `core/styles/rn/style-prop.ts`, `core/styles/rn/index.ts`, NativeWind variant regex; wired post-processing into `ExpoRouterAdapter`. OUT — statically computing merged style results; type-aware resolution.

### Phase 14: Resolver Platform-Suffix Fallback
**Goal**: When an Expo Router project imports `./Button` and only `Button.ios.tsx` / `Button.android.tsx` / `Button.native.tsx` / `Button.web.tsx` exist, the resolver finds one deterministically and the tree shows the resolved file:line.
**Depends on**: Phase 13
**Requirements**: INTEG-05
**Success Criteria** (what must be TRUE):
  1. `core/resolver/relative.ts` extended with a platform-suffix fallback that probes `no-suffix > .native > .ios > .android > .web` in order; the first match wins.
  2. A `Button.{ios,android}.tsx` fixture pair (committed in Phase 9) resolves to `Button.ios.tsx` by preference when no suffixless file exists; resolution is deterministic across re-runs.
  3. Resolver cache shape (if changed) keeps Windows backslash-free path invariants; existing 353/353 resolver tests stay green.
  4. The `--platform` CLI flag is NOT shipped — only the mechanism — and this is recorded in the deferred-features list in `PROJECT.md`.
**Plans**: TBD
**Scope**: IN — `core/resolver/relative.ts` fallback logic, cache shape adjustments, platform-suffix tests. OUT — `--platform` flag exposure; multi-platform tree variants.

### Phase 15: Integration Suite & --init Template
**Goal**: A reviewer (and CI) can confirm v1.2 end-to-end: both Expo fixtures pass through the published binary in both output formats, and the `--init` guide tells users that Expo Router is now supported.
**Depends on**: Phase 14
**Requirements**: INTEG-03, INTEG-06
**Success Criteria** (what must be TRUE):
  1. Integration suite spawns the built `dist/cli.js` against `expo-basic` and `expo-tabs-and-dynamic`, asserts `format: "json"` AND `format: "markdown"`, and re-asserts tree glyphs, `@` file:line separator, and Windows backslash guard (`not.toContain('\\')`).
  2. Full vitest suite (including all v1.0/v1.1 cases) is green and total case count is ≥ v1.1's 353 baseline.
  3. `src/init/template.ts` content mentions "Next.js App Router + Expo Router (React Native)" as supported frameworks and references `--framework` for override.
  4. `__INIT_MARKER_VERSION__` bumped; running `npx ui-hierarchy-mcp --init` against an existing v1.1-injected `CLAUDE.md` / `AGENTS.md` / `.cursor/rules/*.mdc` / `.github/copilot-instructions.md` produces a clean diff (marker block replaced, surrounding bytes preserved).
**Plans**: TBD
**Scope**: IN — integration test suite expansion, template content edit, marker version bump, re-injection diff verification. OUT — new `--init` targets; auto-detect of installed agents (deferred to v1.3).

## Progress

| Phase                                          | Milestone | Plans Complete | Status      | Completed  |
| ---------------------------------------------- | --------- | -------------- | ----------- | ---------- |
| 1. Scaffolding & IR Foundation                 | v1.0      | 5/5            | Complete    | 2026-04-20 |
| 2. MCP Transport Shell                         | v1.0      | 5/5            | Complete    | 2026-04-21 |
| 3. Parser Core                                 | v1.0      | 6/6            | Complete    | 2026-04-29 |
| 4. Next.js App Router Adapter                  | v1.0      | 4/4            | Complete    | 2026-04-29 |
| 5. IR Queries & Tool Wire-up                   | v1.0      | 5/5            | Complete    | 2026-04-29 |
| 6. Hardening & Fixture Gates                   | v1.0      | 10/10          | Complete    | 2026-05-05 |
| 7. `--init` File Writer                        | v1.1      | 5/5            | Complete    | 2026-05-12 |
| 8. v1.0 Polish                                 | v1.1      | 4/4            | Complete    | 2026-05-12 |
| 9. Fixture Design & Stub Packages              | v1.2      | 3/3            | Complete    | 2026-05-13 |
| 10. Interface Widening & Analyzer De-Next-ification | v1.2 | 2/2 | Complete   | 2026-05-13 |
| 11. Adapter Detection, Selection & Tool Routing | v1.2     | 5/5 | Complete   | 2026-05-18 |
| 12. ExpoRouterAdapter Routing & RN Primitives  | v1.2      | 4/4 | Complete   | 2026-05-19 |
| 13. RN Style Signal Extraction                 | v1.2      | 2/3 | In Progress|  |
| 14. Resolver Platform-Suffix Fallback          | v1.2      | 0/?            | Not started | —          |
| 15. Integration Suite & --init Template        | v1.2      | 0/?            | Not started | —          |
### Phase 12: ExpoRouterAdapter Routing & RN Primitives
**Goal**: An agent calling `get_full_hierarchy` on an Expo Router project gets a routing tree that mirrors the file-system layout — layouts composed via `<Slot/>`, dynamic segments and groups rendered correctly, `<Tabs>`/`<Stack>` children enumerated, RN primitives identified by their import source.
**Depends on**: Phase 11
**Requirements**: ROUTE-01, ROUTE-02, ROUTE-03, ROUTE-04, ROUTE-05, ROUTE-06, ROUTE-07, ROUTE-08, RN-01, RN-02, RN-03
**Success Criteria** (what must be TRUE):
  1. Calling `get_full_hierarchy(route)` on `expo-basic` produces a tree rooted at `app/_layout.tsx` injecting `app/index.tsx` via the recognized `<Slot/>` marker, with file:line on every node.
  2. Calling `get_full_hierarchy` on `expo-tabs-and-dynamic` returns a tree where `(tabs)` is transparent in the URL but its `_layout.tsx` participates in the chain; `[id]`, `[...rest]`, `[[...opt]]` segments are labeled by kind; `index.tsx` becomes the default route at its directory; `+not-found.tsx` appears as a special sibling; `+html.tsx` / `+native-intent.tsx` / `+api.ts` are skipped.
  3. `<Tabs>` / `<Tabs.Screen name="..." options={...}>` and `<Stack>` / `<Stack.Screen ...>` inside `_layout.tsx` are enumerated with `name` and a summarized `options` attribute set; non-literal screens emit a warning naming the detected screens rather than silently dropping.
  4. A user component named `<Text>` imported from `@/components/Text` keeps `kind: "component"`; `<Text>` imported from `react-native` is classified `kind: "element"` and its literal-string children populate the node's text content.
  5. When both `app/` and `src/app/` exist, `src/app/` wins and an envelope warning names both directories.
**Plans**: 4 plans
- [x] 12-01-PLAN.md — Extract collectImportBindings to src/core/import-bindings.ts + scaffold RED test stubs for all 5 new test files (D-04, D-05)
- [x] 12-02-PLAN.md — Implement routing infra: segments.ts (parseSegment / ExpoSegment), discover.ts (resolveExpoRoot / detectDualRoots / discoverEntries), route-map.ts (enumerateRoutes / mapRouteToEntry), rn-primitives.ts (RN_PRIMITIVES + isRNPrimitive) (ROUTE-01, ROUTE-03, ROUTE-04, ROUTE-05)
- [x] 12-03-PLAN.md — Replace all 5 ExpoRouterAdapter stubs + extend Analyzer.collectChildrenSlotLines with JSXOpeningElement visitor (ROUTE-01, ROUTE-02, RN-01, RN-02, RN-03)
- [ ] 12-04-PLAN.md — Lock expo-basic and expo-tabs-and-dynamic markdown snapshots; verify full suite green
**Scope**: IN — `expo/discover.ts`, `segments.ts`, `route-map.ts`, `rn-primitives.ts`, `ExpoRouterAdapter.ts`, `<Slot>` / `<Tabs>` / `<Stack>` JSX walker. OUT — `StyleSheet.create` / style array / NativeWind extraction (Phase 13); platform-suffix resolution (Phase 14).
**UI hint**: yes

### Phase 13: RN Style Signal Extraction
**Goal**: Calling `find_by_style(key)` on an Expo Router project surfaces matches whether the style was declared via `StyleSheet.create`, inline `style={{}}`, a merged `style={[...]}` array, or a NativeWind `className` — and unsupported `StyleSheet.create` shapes degrade visibly rather than throw.
**Depends on**: Phase 12
**Requirements**: RN-04, RN-05, RN-06, RN-07, RN-08
**Success Criteria** (what must be TRUE):
  1. `StyleSheet.create({ card: {...} })` is indexed at parse time; `style={styles.card}` resolves to the literal property key `card` and is findable via `find_by_style("card")`; in-file literal objects AND one-hop imports both supported; the supported-pattern matrix is documented as a doc comment in `core/styles/rn/stylesheet-create.ts`.
  2. Inline `style={{ padding: 8 }}` on RN primitives extracts to the same key set the v1.0 web extractor produced (reused, not reimplemented).
  3. `style={[styles.a, styles.b, dynamic && styles.c]}` flattens via `flattenStyleArray`; conditional members contribute their keys to the union exposed to `find_by_style` (a search for `c` hits even though runtime resolution is unknown); ≥8 shape tests cover the matrix.
  4. NativeWind `className="ios:p-4 android:p-2 text-lg"` is recognized on RN primitives; platform variants are stripped via a regex audit (`ios:`, `android:`, `web:`, `native:`); a `tw\`...\`` tagged template emits an explicit warning instead of being silently dropped.
  5. Unsupported `StyleSheet.create` patterns (computed keys, factory functions, hook-returned styles, two-hop imports) emit a node with `{ raw: <source-text> }` plus an envelope warning — the tool returns success, not error.
**Plans**: TBD
**Scope**: IN — `core/styles/rn/stylesheet-create.ts`, `core/styles/rn/style-prop.ts`, `core/styles/rn/index.ts`, NativeWind variant regex; wired post-processing into `ExpoRouterAdapter`. OUT — statically computing merged style results; type-aware resolution.

### Phase 14: Resolver Platform-Suffix Fallback
**Goal**: When an Expo Router project imports `./Button` and only `Button.ios.tsx` / `Button.android.tsx` / `Button.native.tsx` / `Button.web.tsx` exist, the resolver finds one deterministically and the tree shows the resolved file:line.
**Depends on**: Phase 13
**Requirements**: INTEG-05
**Success Criteria** (what must be TRUE):
  1. `core/resolver/relative.ts` extended with a platform-suffix fallback that probes `no-suffix > .native > .ios > .android > .web` in order; the first match wins.
  2. A `Button.{ios,android}.tsx` fixture pair (committed in Phase 9) resolves to `Button.ios.tsx` by preference when no suffixless file exists; resolution is deterministic across re-runs.
  3. Resolver cache shape (if changed) keeps Windows backslash-free path invariants; existing 353/353 resolver tests stay green.
  4. The `--platform` CLI flag is NOT shipped — only the mechanism — and this is recorded in the deferred-features list in `PROJECT.md`.
**Plans**: TBD
**Scope**: IN — `core/resolver/relative.ts` fallback logic, cache shape adjustments, platform-suffix tests. OUT — `--platform` flag exposure; multi-platform tree variants.

### Phase 15: Integration Suite & --init Template
**Goal**: A reviewer (and CI) can confirm v1.2 end-to-end: both Expo fixtures pass through the published binary in both output formats, and the `--init` guide tells users that Expo Router is now supported.
**Depends on**: Phase 14
**Requirements**: INTEG-03, INTEG-06
**Success Criteria** (what must be TRUE):
  1. Integration suite spawns the built `dist/cli.js` against `expo-basic` and `expo-tabs-and-dynamic`, asserts `format: "json"` AND `format: "markdown"`, and re-asserts tree glyphs, `@` file:line separator, and Windows backslash guard (`not.toContain('\\')`).
  2. Full vitest suite (including all v1.0/v1.1 cases) is green and total case count is ≥ v1.1's 353 baseline.
  3. `src/init/template.ts` content mentions "Next.js App Router + Expo Router (React Native)" as supported frameworks and references `--framework` for override.
  4. `__INIT_MARKER_VERSION__` bumped; running `npx ui-hierarchy-mcp --init` against an existing v1.1-injected `CLAUDE.md` / `AGENTS.md` / `.cursor/rules/*.mdc` / `.github/copilot-instructions.md` produces a clean diff (marker block replaced, surrounding bytes preserved).
**Plans**: TBD
**Scope**: IN — integration test suite expansion, template content edit, marker version bump, re-injection diff verification. OUT — new `--init` targets; auto-detect of installed agents (deferred to v1.3).

## Progress

| Phase                                          | Milestone | Plans Complete | Status      | Completed  |
| ---------------------------------------------- | --------- | -------------- | ----------- | ---------- |
| 1. Scaffolding & IR Foundation                 | v1.0      | 5/5            | Complete    | 2026-04-20 |
| 2. MCP Transport Shell                         | v1.0      | 5/5            | Complete    | 2026-04-21 |
| 3. Parser Core                                 | v1.0      | 6/6            | Complete    | 2026-04-29 |
| 4. Next.js App Router Adapter                  | v1.0      | 4/4            | Complete    | 2026-04-29 |
| 5. IR Queries & Tool Wire-up                   | v1.0      | 5/5            | Complete    | 2026-04-29 |
| 6. Hardening & Fixture Gates                   | v1.0      | 10/10          | Complete    | 2026-05-05 |
| 7. `--init` File Writer                        | v1.1      | 5/5            | Complete    | 2026-05-12 |
| 8. v1.0 Polish                                 | v1.1      | 4/4            | Complete    | 2026-05-12 |
| 9. Fixture Design & Stub Packages              | v1.2      | 3/3            | Complete    | 2026-05-13 |
| 10. Interface Widening & Analyzer De-Next-ification | v1.2 | 2/2 | Complete   | 2026-05-13 |
| 11. Adapter Detection, Selection & Tool Routing | v1.2     | 5/5 | Complete   | 2026-05-18 |
| 12. ExpoRouterAdapter Routing & RN Primitives  | v1.2      | 0/?            | Not started | —          |
| 13. RN Style Signal Extraction                 | v1.2      | 0/?            | Not started | —          |
| 14. Resolver Platform-Suffix Fallback          | v1.2      | 0/?            | Not started | —          |
| 15. Integration Suite & --init Template        | v1.2      | 0/?            | Not started | —          |
