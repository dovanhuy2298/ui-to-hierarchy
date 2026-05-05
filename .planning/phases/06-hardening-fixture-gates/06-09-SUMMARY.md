---
phase: 06-hardening-fixture-gates
plan: 09
subsystem: core/analyzer
tags: [resolver, ir-build, gap-closure, debug-2]
gap_closure: true
requires: [06-08]
provides: ["resolved-component-file-line", "ARCH-04 gap-2 closed"]
affects: [src/core/Analyzer.ts]
tech-stack:
  added: []
  patterns:
    - "post-pass tree walker for resolution overrides (avoids threading bindings through hot recursive renderNodeToTreeNode)"
    - "import-binding map keyed by JSX tag local name"
key-files:
  created: []
  modified:
    - src/core/Analyzer.ts
    - test/core/__snapshots__/analyzer-dashboard-settings.md
decisions:
  - "Resolver post-pass walks the built TreeNode tree rather than threading bindings into renderNodeToTreeNode — keeps the hot recursive translator clean"
  - "ResolveResult carries no declaration line; resolved-component nodes use line:1 (call-site line is replaced, not preserved, so consumers get an unambiguous file pointer)"
  - "ImportNamespaceSpecifier (`* as Ns`) intentionally skipped per 06-DEBUG v1 carve-out; namespaced JSX tags fall through to call-site file"
  - "External (node_modules) resolutions silently preserve call-site file:line (normal behavior); only ok:false failures append a warning"
metrics:
  duration: ~30m
  completed: 2026-05-05
requirements: [ARCH-04]
covers_spec_ids: [R1, R3]
---

# Phase 06 Plan 09: Wire adapter.resolveModule into Analyzer IR build — Summary

Closes 06-DEBUG gap #2: `kind:"component"` TreeNodes now point at the component's definition file, not the consumer call-site, by invoking `adapter.resolveModule` for every `isComponent` JSX callsite during IR build.

## What Changed

`Analyzer.buildTreeForEntry` now collects per-entry import bindings from the cached AST and runs a resolver post-pass over the body tree. For every `kind:"component"` node:

1. Look up the JSX tag in the entry's import-binding map (`localName → { source, importedName }`).
2. Call `this.adapter.resolveModule(ctx, fromFile, source, importedName)`.
3. On `{ ok: true, kind: "local", absolutePath }`, override `file = toForwardSlash(absolutePath)` and reset `line = 1`.
4. On `{ ok: false, ... }`, append a warning to `ctx.warnings` and preserve call-site file:line.
5. On `{ ok: true, kind: "external" }` (node_modules), preserve call-site silently.

The override does NOT cascade into children — a component's TreeNode children represent JSX expressions passed AS PROPS in the consumer file (e.g. `<Layout><Page/></Layout>`), so their file:line still belongs to the consumer.

## New Helpers (src/core/Analyzer.ts)

- `collectImportBindings(ast: t.File): Map<string, ImportBinding>` — single-traverse AST walker over `ImportDeclaration` covering named, aliased, and default imports. Skips `ImportNamespaceSpecifier` per 06-DEBUG v1 carve-out.
- `resolveComponentCallsites(tree, bindings, fromFile, adapter, ctx): TreeNode` — recursive cloning walker over all TreeNode kinds. Calls `adapter.resolveModule` only for `kind:"component"` nodes; recurses through `element`, `fragment`, `branch`, `list`. Wraps the resolver call in a `try/catch` to honor R8 (no-throw out of IR build).

## Threat Model Mitigations

- **T-06-09-01 (Tampering on resolved file path):** every override flows through `toForwardSlash` (R5). Resolver itself enforces project-root containment per Phase 3 ARCH-03 — we do not bypass it.
- **T-06-09-02 (DoS via cyclic barrels):** resolver's `chaseBarrel` already cycle-guards (Phase 3); our post-pass calls `resolveModule` once per component callsite per entry, bounded by tree size.

## Verification Results

- `pnpm build` — exits 0, ESM bundle 82.59 KB.
- `pnpm test` (unit, 34 files / 236 tests) — all passing. One snapshot updated (`analyzer-dashboard-settings.md`) to reflect the new R1-correct behavior: `<Sidebar>` and `<Card>` now show their definition files (`app/components/Sidebar.tsx:1`, `app/components/Card.tsx:1`) instead of the layout/page consumer paths. `<SubmitButton>` correctly retains its call-site file because it is locally declared in the page file (no import binding to resolve).
- `pnpm test:integration` — 19/20 (was 17/20 after wave 1).
  - PASS: shadcn-barrels — `Button.file` ends with `components/ui/button.tsx`, not `components/ui/index.ts`.
  - PASS: pnpm-monorepo apps/web — `Button.file` ends with `packages/ui/src/button.tsx`, not `packages/ui/src/index.ts`.
  - REMAINING (owned by Plan 06-10): pnpm-monorepo apps/admin assertion `'Manage users' must appear under apps/admin` — DEBUG #3 (TreeNode attributes field) is the planned fix.
- Acceptance greps:
  - `collectImportBindings` occurrences in Analyzer.ts: 2 (declaration + call site).
  - `resolveComponentCallsites` occurrences: 7 (declaration + 6 recursive/external call sites).
  - `resolveModule` occurrences: 2 (call + comment).

## Key Decisions

- **Post-pass over walker re-design.** Threading the binding map and adapter through `renderNodeToTreeNode` would add 2 args to a hot recursive function used by every render-flow translation. The post-pass is identical in effect because resolution is a leaf-level decision per `kind:"component"` node.
- **`line: 1` on resolved nodes.** `ResolveResult` exposes only `absolutePath`, no declaration line. We could pull the line via a one-shot `discoverComponents` pass on the resolved file (06-DEBUG offers this option), but for v1 the file pointer alone satisfies SPEC R1/R3 acceptance and keeps the change purely additive (no new resolver/discover calls per node).
- **No new resolver code, no schema change.** Pure wiring fix per 06-DEBUG §2 prescription.

## Deviations from Plan

None — plan executed as written. The single snapshot update is explicitly authorized by the plan acceptance criteria ("If a unit test is asserting the old 'call-site file' behavior on a component callsite, evaluate whether the new behavior is correct per SPEC R1 (it is); update that test").

## Files Touched

- `src/core/Analyzer.ts` — +146 lines (collectImportBindings + ImportBinding type + resolveComponentCallsites walker + post-pass call in buildTreeForEntry).
- `test/core/__snapshots__/analyzer-dashboard-settings.md` — 2-line update (Sidebar/Card now resolve to definition files).

## Commits

- `e98e050` — feat(06-09): wire adapter.resolveModule into IR build for component callsites

## Self-Check: PASSED

- `src/core/Analyzer.ts` modified (verified): grep confirms 3 new symbols present.
- Snapshot file updated (verified).
- Commit `e98e050` exists on main (verified).
- `pnpm build` exits 0 (verified).
- `pnpm test` 236/236 passing (verified).
- `pnpm test:integration` 19/20; the one remaining failure ('Manage users') is explicitly owned by Plan 06-10 (verified).
- 06-09 named integration assertions (shadcn-barrels Button + apps/web Button) PASS (verified).
