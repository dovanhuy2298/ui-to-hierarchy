---
phase: 06-hardening-fixture-gates
plan: 08
subsystem: mcp/tools
tags: [gap-closure, mcp, envelope, format-symmetry, integration-test]
gap_closure: true
covers_spec_ids: [D-15, R4]
requirements: [ARCH-04]
dependency_graph:
  requires:
    - src/mcp/tools/get-full-hierarchy.ts (precedent for format param)
    - src/renderers/json.ts (renderJson)
    - src/renderers/markdown.ts (renderMarkdown)
    - src/renderers/envelope-builder.ts (buildEnvelope)
  provides:
    - format-symmetric MCP tool surface (4 of 4 tools accept format: markdown|json)
    - integration suite unblocked for tool-level assertions (12 prior JSON.parse SyntaxErrors eliminated)
  affects:
    - test/integration/mcp-e2e.test.ts (now JSON-parses 16 of 16 tool responses successfully)
    - Plans 06-09 / 06-10 (failures #2 and #3 from 06-DEBUG.md now observable)
tech-stack:
  added: []
  patterns:
    - "MCP tool format-param pattern: z.enum(['markdown','json']).default('markdown') + ternary on args.format"
key-files:
  created: []
  modified:
    - src/mcp/tools/find-by-style.ts
    - src/mcp/tools/find-by-text.ts
    - src/mcp/tools/focus-on.ts
    - test/integration/mcp-e2e.test.ts
decisions:
  - Inline format schema field per tool (not shared in tools/common.ts) — preserves wire-protocol self-description, matches get_full_hierarchy precedent
  - Default value 'markdown' chosen to guarantee zero behavioral change for existing markdown-only callers
metrics:
  duration_minutes: ~10
  completed: 2026-05-05
  tasks: 2
  files: 4
  commits: 2
---

# Phase 06 Plan 08: Format Symmetry Across MCP Tools Summary

Restored the D-15 envelope contract symmetry across all four MCP tools by porting the `format: "markdown" | "json"` pattern from `get_full_hierarchy` to `find_by_style`, `find_by_text`, and `focus_on`, and updated the integration suite's `argsFor` to opt in to JSON for the previously markdown-only invocations.

## Tasks Completed

| Task | Name                                                       | Commit  | Files                                                                                                |
| ---- | ---------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| 1    | Add format param + json branch to three tool handlers     | 953f48b | src/mcp/tools/find-by-style.ts, src/mcp/tools/find-by-text.ts, src/mcp/tools/focus-on.ts             |
| 2    | Update integration test argsFor to opt in to format:"json" | 4e7f5a6 | test/integration/mcp-e2e.test.ts                                                                     |

## What Changed

For each of the three previously markdown-only tool files, three minimal edits — mirroring `get-full-hierarchy.ts`:

1. New import: `import { renderJson } from "../../renderers/json.js";`
2. New schema field on `inputSchema` (placed before `projectRoot`):
   ```ts
   format: z.enum(["markdown", "json"]).default("markdown").describe(...),
   ```
3. The handler's text assignment branches on `args.format`:
   ```ts
   const text =
     args.format === "json"
       ? JSON.stringify(renderJson(tree, envelope), null, 2)
       : renderMarkdown(tree, envelope);
   ```

In the integration test, all four `argsFor` blocks (shadcn / nested / web / admin) now pass `format: "json"` for `focus_on`, `find_by_text`, and `find_by_style`. Count of `format: "json"` literals: 4 → 16 (verified via grep).

## must_haves Verification

- [x] All three tool handlers accept the `format` parameter and emit JSON when requested.
- [x] Integration test's `argsFor` passes `format: "json"` for all 16 tool invocations (4 fixtures × 4 tools).
- [x] Default `"markdown"` preserved — existing unit tests that omit `format` still pass (253/253 unit tests passing; baseline ≥241).
- [x] Zero `SyntaxError: Unexpected token '<'` failures in `pnpm test:integration` (was 12, now 0).
- [x] D-15 envelope contract (`schemaVersion: "1"`) honored end-to-end across all four MCP tools — symmetry restored.

## Verification

- `pnpm build` → success.
- `pnpm test:integration` → 17/20 passing. The 3 remaining failures are EXPECTED and explicitly owned by downstream plans (cited in 06-DEBUG.md and the plan's success criteria):
  - shadcn `Button.file` resolves to `app/page.tsx` instead of `components/ui/button.tsx` → owned by Plan 06-09 (resolver wiring / barrel chase).
  - apps/web `Button.file` resolves to `app/page.tsx` instead of `packages/ui/src/button.tsx` → owned by Plan 06-09 (cross-package resolution).
  - apps/admin `'Manage users'` text absent from envelope → owned by Plan 06-10 (TreeNode.attributes / text propagation).
- `pnpm test` (full suite) → 253 passed, 3 failed (the same expected integration failures). No new failure modes introduced.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: src/mcp/tools/find-by-style.ts (modified)
- FOUND: src/mcp/tools/find-by-text.ts (modified)
- FOUND: src/mcp/tools/focus-on.ts (modified)
- FOUND: test/integration/mcp-e2e.test.ts (modified)
- FOUND: commit 953f48b (Task 1)
- FOUND: commit 4e7f5a6 (Task 2)
- VERIFIED: `grep -c 'format: "json"' test/integration/mcp-e2e.test.ts` returns 16
- VERIFIED: `grep -c 'renderJson' src/mcp/tools/{find-by-style,find-by-text,focus-on}.ts` each ≥ 2
