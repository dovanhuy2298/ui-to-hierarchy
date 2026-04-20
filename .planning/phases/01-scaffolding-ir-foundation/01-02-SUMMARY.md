---
phase: 01-scaffolding-ir-foundation
plan: 02
subsystem: ir
tags: [ir, zod, schema, envelope]
requires: [zod@^4.1.4, vitest@^4.3.6]
provides:
  - TreeNode (9-kind discriminated union type alias)
  - TreeNodeSchema (z.ZodType<TreeNode>, recursive via z.lazy)
  - Envelope / EnvelopeSchema (D-15 response wrapper)
affects: [src/ir/, test/ir/]
tech-stack:
  added: [zod@^4.1.4]
  patterns: [recursive z.lazy discriminatedUnion, explicit type-alias annotation]
key-files:
  created:
    - src/ir/schema.ts
    - src/ir/envelope.ts
    - src/ir/index.ts
    - test/ir/schema.test.ts
  modified: []
decisions:
  - "Explicit TreeNode type alias + z.ZodType<TreeNode> annotation (D-04 concession) because Zod v4 cannot fully infer recursive discriminatedUnion types."
  - "branch.thenBranch/elseBranch modeled as z.union([TreeNodeSchema, z.null()]) to match the nullable interface contract rather than optional."
metrics:
  duration: ~5m
  completed: 2026-04-20
---

# Phase 01 Plan 02: IR Zod Schema Summary

One-liner: Implemented the 9-kind recursive `TreeNodeSchema` discriminated union and `EnvelopeSchema` (D-15) as the single Zod source-of-truth for IR validation consumed by later phases.

## What Was Built

- `src/ir/schema.ts` — `TreeNode` type alias (component | element | text | branch | list | slot | error | fragment | spread) and `TreeNodeSchema: z.ZodType<TreeNode>` wrapped in `z.lazy` so `children`, `item`, `thenBranch`, `elseBranch` recurse. Base fields (`file: z.string()`, `line: z.number().int().nonnegative()`, `layoutHint: z.string().optional()`) spread into every member.
- `src/ir/envelope.ts` — `EnvelopeSchema` with `schemaVersion: z.literal("1")`, `resolvedRoot`, `toolVersion`, `generatedAt: z.string().datetime()`, `warnings: z.array(z.string())`, `tree: TreeNodeSchema`. Exported inferred `Envelope` type.
- `src/ir/index.ts` — re-exports.
- `test/ir/schema.test.ts` — 9 cases covering all listed behaviors (positive kitchen-sink recursion, invalid discriminator, negative line, missing file, schemaVersion "2" rejection, non-ISO generatedAt rejection, valid envelope).

## Verification

- Files grep-verified to contain: `discriminatedUnion("kind"`, all 9 `z.literal("<kind>")` members, `z.lazy(`, `z.number().int().nonnegative()`, `z.literal("1")`, `z.string().datetime()`.
- `src/ir/index.ts` re-exports both schemas.
- No imports from `adapters/` or `mcp/`.

## Deferred Issues

- **Test run not executed.** `node_modules/` is empty — Plan 01-01 (which owns `package.json` + `pnpm install`) had not completed when this plan ran. Per instructions, I did not install deps. Once 01-01 lands, `pnpm vitest run test/ir/schema.test.ts` should pass all 9 cases. Likewise `pnpm typecheck` / `pnpm lint` cannot be executed here.

## Deviations from Plan

None. Plan executed as written; recursion for `branch.thenBranch/elseBranch` uses `z.union([TreeNodeSchema, z.null()])` which matches the `TreeNode | null` interface exactly.

## Self-Check: PASSED

- FOUND: src/ir/schema.ts
- FOUND: src/ir/envelope.ts
- FOUND: src/ir/index.ts
- FOUND: test/ir/schema.test.ts
- Git commits: N/A (not a git repo per task instructions)
