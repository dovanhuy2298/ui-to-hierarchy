---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: React Native + Expo Router
status: in_progress
last_updated: "2026-05-19T02:30:00.000Z"
last_activity: 2026-05-19
progress:
  total_phases: 7
  completed_phases: 4
  total_plans: 14
  completed_plans: 14
  percent: 57
---

# STATE — ui-to-hierarchyMCP

**Last updated:** 2026-05-19 — Phase 12 Plan 04 complete; snapshot lock for expo-basic and expo-tabs-and-dynamic; EXPO-SLOT-01 bug surfaced (Slot injection not working for kind:component); 3 new tests (491→494)

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-12)

- **Core value:** When an AI agent can't confidently act on a screenshot or vague UI description, call this MCP for a precise file/component map — edit the right component, not guess.
- **Current focus:** v1.2 React Native + Expo Router — Phase 11 complete; ready for Phase 12.
- **Mode:** yolo
- **Granularity:** standard

## Current Position

Phase: 12 — ExpoRouterAdapter Routing & RN Primitives
Plan: 4 of 4 (Plan 04 complete — Wave 3 done, Phase 12 COMPLETE)
Status: Phase complete
Last activity: 2026-05-19

## Progress Bar

```
v1.0   Phases 1–6 [##########] 100% (shipped 2026-05-05)
v1.1   Phases 7–8 [##########] 100% (shipped 2026-05-12)
v1.2   Phase 9   [##########] 100% (3/3 plans complete 2026-05-13)
v1.2   Phase 10  [##########] 100% (2/2 plans complete 2026-05-13)
v1.2   Phase 11  [##########] 100% (5/5 plans complete 2026-05-18)
v1.2   Phase 12  [##########] 100% (4/4 plans complete 2026-05-19)
v1.2   Phase 13  [..........]   0%
v1.2   Phase 14  [..........]   0%
v1.2   Phase 15  [..........]   0%
```

## Accumulated Context

### Decisions

Captured in PROJECT.md Key Decisions table. v1.2-specific decisions to log as phases land:

- Widen `FrameworkAdapter` interface (3 new methods) rather than port-and-patch — adjudicated from PITFALLS.md Pitfall 1.
- Plan 01 delivered: FrameworkAdapter widened 5→8 methods (classifyEntry, enumerateRoutes, slotMarker); locking test updated atomically; RED unit tests for all 3 methods created in NextJsAdapter.test.ts.
- Two-signal adapter auto-detect: deps key + config file; parallel; exactly-one-true; `--framework` override.
- `StyleSheet.create` support matrix: in-file literal + one-hop import only; everything else `{ raw }` + warning.
- Platform-suffix mechanism ships in v1.2 (INTEG-05); `--platform` CLI flag exposure deferred to v1.3.
- `layoutHint` field stays Next-specific in v1.2; RN nodes leave it unset.
- ExpoSegment uses `name` field everywhere (not `param`) — locked by D-11, regression-tested.
- resolveExpoRoot checks src/app FIRST, then app/ — D-08 priority reversal vs Next.js.
- detectDualRoots returns booleans only; warning emission delegated to Wave 2 (ExpoRouterAdapter).
- mapRouteToEntry uses linear layout chain walk — simpler than Next.js tree, no parallel slots in v1.
- isRNPrimitive gates on both allowlist AND importSource === "react-native" — SPEC Req 10.
- RN text extraction injects __rnText synthetic attribute on RenderNode (avoids R8 schema change).
- pendingWarnings pattern: queue in adapter.discoverEntries, flush+clear at start of extractComponents.
- Analyzer JSXOpeningElement visitor added inside existing traverse call (same closure, same lines Set).
- Tabs/Stack.Screen literal-only options serialization silently drops expression values (D-03).

### Open Todos

- Phase 12 ALL PLANS COMPLETE. ExpoRouterAdapter fully implemented (Plans 01-03) + snapshot baselines locked (Plan 04).
- EXPO-SLOT-01: Slot injection does not work for kind:component nodes in injectChildrenSlots. Expo layouts show <Slot> component node instead of substituted page tree. Fix needed in Phase 13.
- Snapshot baselines at test/adapters/expo/__snapshots__/ reflect current limited output; will improve when EXPO-SLOT-01 is fixed.
- RN text extraction uses __rnText synthetic attribute on RenderNode — future plan can promote to TreeNode text field.

### Blockers

- None.

### Carry-forward to v1.2 (now in scope or deferred)

- F-01: live Claude Code transcript export — deferred again, methodology footnote remains.
- Two orphan exports in `src/mcp/errors.ts` (`notImplemented`, `invalidInput`) — opportunistic cleanup if a phase touches the file.
- ~~Cosmetic: redundant `base.warnings ?? []` fallback in 4 tool handlers~~ — **DONE in Phase 11 Plan 05 (D-09).**
- Cosmetic: `__INIT_MARKER_VERSION__` `typeof` guard in `src/init/index.ts` — opportunistic during Phase 15.

## Session Continuity

- Last session: 2026-05-19 — Phase 12 Plan 04 executed: locked expo-basic and expo-tabs-and-dynamic snapshots; EXPO-SLOT-01 bug surfaced. Test count 491 → 494 (+3 tests). Commit: 8d0dbdd.
- Next command: `/gsd:execute-phase 13` (Phase 13: fix EXPO-SLOT-01 and further Expo Router work)
- Released artifact: `ui-hierarchy-mcp` v0.2.0 on npm (v1.1).

## Quick Tasks Completed

| Date       | Slug                  | Summary                                                                |
| ---------- | --------------------- | ---------------------------------------------------------------------- |
| 2026-05-12 | update-readme-v1-1    | README: documented `--init` onboarding + v1.1 polish (warnings, lines) |

## Operator Next Steps

- Phase 12 complete. Fix EXPO-SLOT-01 (Slot injection for kind:component nodes) before Phase 13.
- `/gsd:execute-phase 13` — start Phase 13.
