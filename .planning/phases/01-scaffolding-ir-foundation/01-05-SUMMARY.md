---
phase: 01-scaffolding-ir-foundation
plan: 05
subsystem: renderers
tags: [renderers, markdown, json, envelope, fixtures, snapshots]
requires:
  - src/ir/schema.ts
  - src/ir/envelope.ts
  - src/core/resolve-root.ts
provides:
  - renderMarkdown(tree, envelope) -> string
  - renderJson(tree, envelope) -> Envelope
  - buildEnvelope(tree, opts?) -> Envelope
  - test/fixtures/ir/{kitchen-sink,empty,single-leaf,deep-branch}
affects: []
tech-stack:
  added: []
  patterns:
    - Unicode tree glyphs (├── / └── / │) with ancestor-stack continuation columns
    - Per-kind label formatter (D-10) driven by discriminated union
    - Deterministic fixture envelopes (fixed resolvedRoot/toolVersion/generatedAt) for stable snapshots
    - Dual-path __TOOL_VERSION__ resolution (tsup define at build time, runtime fallback for tsx/vitest)
key-files:
  created:
    - src/renderers/markdown.ts
    - src/renderers/json.ts
    - src/renderers/envelope-builder.ts
    - src/renderers/index.ts
    - test/fixtures/ir/kitchen-sink.ts
    - test/fixtures/ir/empty.ts
    - test/fixtures/ir/single-leaf.ts
    - test/fixtures/ir/deep-branch.ts
    - test/fixtures/ir/index.ts
    - test/renderers/markdown.test.ts
    - test/renderers/json.test.ts
    - test/renderers/__snapshots__/markdown-kitchen-sink.md
    - test/renderers/__snapshots__/markdown-empty.md
    - test/renderers/__snapshots__/markdown-single-leaf.md
    - test/renderers/__snapshots__/markdown-deep-branch.md
  modified: []
decisions:
  - Text values truncated to 60 chars with ellipsis (Claude's Discretion per plan)
  - Branch renders thenBranch+elseBranch as ordered regular children (nulls filtered)
  - buildEnvelope uses try/catch on bare `__TOOL_VERSION__` identifier with "0.0.0-dev" fallback
metrics:
  duration: ~10 min
  completed: 2026-04-20
  tasks: 2
  test-count: 34 (was 19; +15)
---

# Phase 01 Plan 05: Renderers + Envelope Builder Summary

Markdown + JSON renderers, envelope builder, and four hand-written IR fixtures locked behind vitest snapshots. Proves the IR → output layer is correct independent of any parser and completes SC-2/SC-3/SC-5/OUT-01/ARCH-03 for Phase 1.

## Renderer Contract

**`renderMarkdown(tree, envelope)`** — walks the IR emitting one line per node. Root line has no glyph; descendants use `├── ` / `└── ` with `│   ` / `    ` continuation columns per ancestor. Each line: `{label}{layoutHint?} @ {file}:{line}`. Per-kind labels follow D-10 exactly:

| Kind      | Label                                  |
| --------- | -------------------------------------- |
| component | `<Name>`                               |
| element   | `tag` (lowercase)                      |
| text      | `"value"` (truncated to 60 + `…`)      |
| branch    | `? condition` (then/else as children)  |
| list      | `.map` (item as single child)          |
| slot      | `{children}` or `@name`                |
| error     | `! message`                            |
| fragment  | `<>`                                   |
| spread    | `{...expression}`                      |

**`renderJson(tree, envelope)`** — `{ ...envelope, tree }`. Trivial combiner with stable named signature for Phase 2 MCP handlers.

**`buildEnvelope(tree, opts?)`** — produces `{ schemaVersion: "1", resolvedRoot: opts?.resolvedRootOverride ?? resolveRoot(), toolVersion, generatedAt: (opts?.now ?? new Date)().toISOString(), warnings: [], tree }`. `toolVersion` resolves via tsup `define` at build time, falling back to `"0.0.0-dev"` under tsx/vitest.

## Fixture Inventory

| Fixture       | Shape                                                               |
| ------------- | ------------------------------------------------------------------- |
| empty         | Empty fragment                                                      |
| single-leaf   | One text node                                                       |
| deep-branch   | branch → branch → component → text (recursive indentation test)     |
| kitchen-sink  | All 9 IR kinds with 2 layoutHint nodes; locks per-kind label output |

Fixtures are pure data with a fixed deterministic envelope (`resolvedRoot: "/fixture/root"`, `toolVersion: "0.1.0-test"`, `generatedAt: "2026-04-20T12:34:56.000Z"`) so snapshots stay stable across machines.

## Kitchen-sink Snapshot (excerpt)

```
<App> flex flex-col @ app/page.tsx:1
├── div p-6 @ app/page.tsx:3
│   └── "Welcome" @ app/page.tsx:5
├── ? user @ app/page.tsx:8
│   ├── <Card> rounded-xl @ app/page.tsx:9
│   │   ├── <> @ app/page.tsx:10
│   │   │   └── span @ app/page.tsx:11
│   │   │       └── "Hi" @ app/page.tsx:11
│   │   └── {...props} @ app/page.tsx:12
│   └── "Login required" @ app/page.tsx:14
├── .map @ app/page.tsx:18
│   └── <Row> @ app/page.tsx:19
├── {children} @ app/page.tsx:25
├── @sidebar @ app/page.tsx:26
└── ! parse failure: unexpected token @ app/page.tsx:30
```

## Envelope Shape

`{ schemaVersion: "1", resolvedRoot, toolVersion, generatedAt, warnings, tree }` — `EnvelopeSchema.parse` green on all four fixtures and on buildEnvelope output.

## Validation Results

- `pnpm test` — 6 files / 34 tests passing (was 19; +15)
- `pnpm typecheck` — green
- `pnpm lint` (biome) — green
- `pnpm build` — dist/cli.js emitted with shebang on line 1

## Deviations from Plan

None. D-10 label conventions implemented verbatim.

## Self-Check: PASSED

- All 15 planned files exist on disk (renderers × 4, fixtures × 5, tests × 2, snapshots × 4)
- `renderMarkdown` output contains all 14 required substrings on kitchen-sink
- `EnvelopeSchema.parse` passes on all four fixtures
- Build artifact `dist/cli.js` has shebang
