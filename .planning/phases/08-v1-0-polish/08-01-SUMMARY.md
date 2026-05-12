---
phase: 08-v1-0-polish
plan: 01
subsystem: rendering

tags: [markdown, renderer, envelope, warnings, mcp]

requires:
  - phase: 04-renderers-md-json
    provides: renderMarkdown tree walker, envelope-aware renderer signature
  - phase: 03-ir-and-types
    provides: EnvelopeSchema with warnings: string[]
provides:
  - Markdown output now surfaces envelope.warnings as `<!-- warning: ... -->` prefix lines
  - Byte-parity guarantee for empty-warnings case (no schema, no snapshot drift)
affects: [08-02-integration-coverage, future markdown consumers]

tech-stack:
  added: []
  patterns:
    - "HTML-comment prefix as a non-tree-glyph metadata channel in markdown output"

key-files:
  created: []
  modified:
    - src/renderers/markdown.ts
    - test/renderers/markdown.test.ts

key-decisions:
  - "Prefix block only emitted when warnings.length > 0 — preserves v1.0 byte-identity for the empty case"
  - "Single blank separator line between warning block and tree (locked by SPEC §1)"
  - "No schema change — EnvelopeSchema and schemaVersion: '1' untouched"
  - "Inline string assertions for new tests (no new snapshot files)"

patterns-established:
  - "Renderer metadata channel: HTML comments above the tree body for envelope-level signals that have no tree-node home"

requirements-completed: [POLISH-01]

duration: 7min
completed: 2026-05-12
---

# Phase 8 Plan 01: POLISH-01 Markdown Warning Surfacing Summary

**`renderMarkdown` now prefixes output with `<!-- warning: {msg} -->` lines + blank separator when `envelope.warnings` is non-empty, reaching parity with JSON without changing the envelope schema or any existing snapshot.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-12T09:34:30Z
- **Completed:** 2026-05-12T09:36:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `renderMarkdown(tree, envelope)` reads `envelope.warnings` and emits one `<!-- warning: {msg} -->` line per warning in array order, followed by a single blank line, before the existing tree walk.
- Empty-warnings path is byte-identical to v1.0 — all four existing markdown snapshots (`kitchen-sink`, `empty`, `single-leaf`, `deep-branch`) pass without `--update`.
- Two new test cases lock the contract in `test/renderers/markdown.test.ts` under a `describe("warnings prefix")` block: one positive (`["a","b"]`) and one negative (`[]`).
- POLISH-01 acceptance from `08-SPEC.md §Requirements 1` satisfied end-to-end.

## Task Commits

Each task was committed atomically:

1. **Task 1: renderMarkdown emits warning prefix block** — `3b58142` (feat)
2. **Task 2: Add unit test for non-empty warnings prefix** — `dda9630` (test)

_Note: Plan ordered source-then-test (per plan file). `tdd_mode: false` at the project level, so plan-level RED→GREEN gating did not apply. Both commits independently verifiable; the source change passed all four pre-existing snapshots before the new tests were added, confirming byte-identity._

## Files Created/Modified

- `src/renderers/markdown.ts` — Renamed `_envelope` → `envelope`; prepended warning block + blank separator when `envelope.warnings.length > 0`. No changes to `walk`, `lineFor`, `labelFor`, or `childrenOf`.
- `test/renderers/markdown.test.ts` — Added `describe("warnings prefix")` with two cases asserting the exact prefix shape and the empty-warnings no-leading-content invariant.

## Decisions Made

- **Single blank separator, not double.** Plan locked `lines[0..2]` to `<!-- warning: a -->`, `<!-- warning: b -->`, `""` then root at `lines[3]` — implemented by pushing one empty string into the `lines: string[]` buffer and relying on `lines.join("\n")` to produce exactly one `\n\n` boundary.
- **Push-style implementation, no helper extraction.** The warning block is six lines of straight-line code; extracting a helper would obscure the byte-identity invariant.
- **Inline assertions over snapshots for new tests.** Self-documenting and impossible to "update away" accidentally; existing snapshot files remain frozen as proof of the empty-warnings invariant.

## Deviations from Plan

None — plan executed exactly as written. Out-of-scope file `src/adapters/types.ts` was found modified in the working tree at the start of execution (pre-existing concurrent work from POLISH-03); per scope boundary, it was deliberately left unstaged and untouched.

## Issues Encountered

None.

## Verification

- `pnpm vitest run test/renderers/markdown.test.ts` → 7/7 pass (was 5; +2 new cases)
- `pnpm vitest run test/renderers` → 17/17 pass
- `grep -c "envelope.warnings" src/renderers/markdown.ts` → 2 (≥1 required)
- `grep -c "_envelope" src/renderers/markdown.ts` → 0 (required)
- Snapshot files under `test/renderers/__snapshots__/markdown-*.md` unchanged (no entries in `git status`)
- `src/ir/envelope.ts` untouched (schema frozen)

## Next Phase Readiness

- POLISH-01 closed; integration coverage for the new behavior is owned by POLISH-02 (Plan 08-02) which adds `format: "markdown"` end-to-end cases.
- No carry-forward blockers.

## Self-Check: PASSED

- FOUND: `src/renderers/markdown.ts` (modified, warning prefix block present)
- FOUND: `test/renderers/markdown.test.ts` (modified, `describe("warnings prefix")` present)
- FOUND: commit `3b58142` in git log
- FOUND: commit `dda9630` in git log

---
*Phase: 08-v1-0-polish*
*Completed: 2026-05-12*
