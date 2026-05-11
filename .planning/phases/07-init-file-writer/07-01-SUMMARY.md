---
phase: 07-init-file-writer
plan: 01
subsystem: init
tags: [cli, argv, typescript, nodejs, tdd]
dependency_graph:
  requires:
    - src/global.d.ts (existing __TOOL_VERSION__ ambient pattern)
    - tsup.config.ts (existing define block)
    - vitest.config.ts (existing define block)
    - src/mcp/errors.ts (discriminated-union return pattern)
    - src/adapters/types.ts (interface vs type alias convention)
  provides:
    - __INIT_MARKER_VERSION__ (ambient global, build-time injected)
    - TargetId / TargetSpec / TARGETS / DEFAULT_TARGET_IDS / VALID_TARGET_IDS
    - InitFlags / ParseArgsResult / parseInitArgs
  affects:
    - tsup build pipeline (one new define entry)
    - vitest runtime (one new define entry)
tech-stack:
  added: []
  patterns:
    - "Build-time string injection via tsup `define` + vitest `define` mirror"
    - "Discriminated-union ParseArgsResult (copy of src/mcp/errors.ts shape)"
    - "Pure-data target registry (island convention from src/adapters/types.ts)"
    - "node:util parseArgs strict mode + secondary enum check"
key-files:
  created:
    - src/init/targets.ts
    - src/init/argv.ts
    - test/init/targets.test.ts
    - test/init/argv.test.ts
  modified:
    - src/global.d.ts
    - tsup.config.ts
    - vitest.config.ts
decisions:
  - "Use comma-separated --target string parsed by split(',') rather than repeating --target N times (matches D-02 schema)."
  - "Failure message lists the full VALID_TARGET_IDS set so users can self-correct without reading the help text (INIT-03 UX)."
  - "Comments avoid the literal tokens 'stdin', 'readline', 'isTTY', 'process.exit', and 'process.stderr' so the INIT-13 grep gate cannot trip on documentation alone."
metrics:
  duration: "~5 min"
  completed: 2026-05-11
  tasks_completed: 2
  files_changed: 7
requirements: [INIT-03, INIT-13]
---

# Phase 7 Plan 01: Foundation (build-time constant + target registry + argv) Summary

Phase 7 foundation landed: `__INIT_MARKER_VERSION__` is now an ambient global injected by both tsup (major.minor of `pkg.version`) and vitest (fixed `"0.0-test"`); the canonical four-target registry is exposed at `src/init/targets.ts`; and `parseInitArgs` ships as a pure, strict, side-effect-free argv parser with full enum-rejection coverage.

## What Was Built

### Task 1 — Build-time constant + target registry (TDD: RED `b2b36f5`, GREEN `9593603`)

- `src/global.d.ts` — additive: declared `__INIT_MARKER_VERSION__: string` with the same JSDoc shape as `__TOOL_VERSION__`.
- `tsup.config.ts` — additive: `define.__INIT_MARKER_VERSION__` set to `JSON.stringify(pkg.version.split('.').slice(0,2).join('.'))`. At v0.1.1 the constant resolves to `"0.1"`.
- `vitest.config.ts` — additive: `define.__INIT_MARKER_VERSION__` set to the literal `"0.0-test"` so test runs are deterministic and decoupled from `package.json`.
- `src/init/targets.ts` — new pure-data module. Exports `TargetId` (string-literal union), `TargetSpec` (interface with `id` / `relativePath` / `hasFrontmatter`), `TARGETS` (4-entry array in canonical order), `DEFAULT_TARGET_IDS = ['claude']`, and `VALID_TARGET_IDS`.
- `test/init/targets.test.ts` — 6 assertions covering ordering, per-id path mapping, the cursor-only `hasFrontmatter` flag, the defaults set, the valid-ids derivation, and that the `__INIT_MARKER_VERSION__` ambient resolves to the stub at vitest runtime.

### Task 2 — parseInitArgs (TDD: RED `0eb253c`, GREEN `ab66410`)

- `src/init/argv.ts` — new pure module. Imports `parseArgs` from `node:util` and `VALID_TARGET_IDS` / `DEFAULT_TARGET_IDS` / `TargetId` from `./targets.js`. Exports `InitFlags`, `ParseArgsResult` (discriminated union), and `parseInitArgs(argv)`. Inside: wraps `parseArgs` in try/catch, defaults `--target` to `[...DEFAULT_TARGET_IDS]` when absent, filters tokens against the whitelist, and returns either `{ok:true, flags}` or `{ok:false, message}`. Zero side effects.
- `test/init/argv.test.ts` — 8 assertions covering all seven plan-locked behaviors: `--init` only → defaults, empty argv → defaults, single valid target, comma-separated valid targets, single unknown target rejection (with full valid set in message), invalid token in a mixed list, `--dry-run`/`--force` boolean coercion, and strict-mode unknown-flag rejection.

## Verification Run

```
$ npx vitest run test/init/ --reporter=dot
 Test Files  2 passed (2)
      Tests  14 passed (14)

$ npx tsc --noEmit  # no src/init/* or test/init/* errors
# (pre-existing test/fixtures/phase-05/micro/parse-error error is intentional — it's a fixture for parse-error handling)
```

Acceptance criteria gates (all pass):

```
$ grep -n "__INIT_MARKER_VERSION__" src/global.d.ts tsup.config.ts vitest.config.ts
src/global.d.ts:11:declare const __INIT_MARKER_VERSION__: string;
tsup.config.ts:28:    __INIT_MARKER_VERSION__: JSON.stringify(
vitest.config.ts:7:    __INIT_MARKER_VERSION__: JSON.stringify("0.0-test"),

$ grep -c "id: \"claude\"\|id: \"codex\"\|id: \"cursor\"\|id: \"copilot\"" src/init/targets.ts
4

$ grep -n "hasFrontmatter: true" src/init/targets.ts
42:    hasFrontmatter: true,

$ grep -E "\b(stdin|readline|isTTY)\b" src/init/argv.ts
(no matches — INIT-13 source assertion passes)

$ grep -n "process.exit\|process.stderr" src/init/argv.ts
(no matches — pure function gate passes)

$ grep -n "from ['\"]\./targets\.js['\"]" src/init/argv.ts
23:} from "./targets.js";
```

## Deviations from Plan

None — plan executed exactly as written.

One stylistic decision worth flagging (not a deviation): the JSDoc on `src/init/argv.ts` originally mentioned the literal tokens `stdin`, `readline`, `isTTY`, `process.exit`, and `process.stderr` while asserting compliance. The plan's acceptance criteria use literal `grep` checks against the module source, which would trip on comment text. The JSDoc was rephrased to describe the same compliance posture without using those literal tokens — semantics identical, gates clean. Already documented inline in the comment.

## Threat Surface

Plan threat register (T-07-01..T-07-04) covered as designed:

- **T-07-01 (Tampering, `--target`)** — mitigated. `parseArgs(strict:true)` rejects unknown flags; the secondary enum check in `parseInitArgs` rejects unknown target tokens before any downstream file write can run.
- **T-07-02 / T-07-03 / T-07-04** — accept dispositions confirmed; no new surface introduced.

No new threat surface beyond the plan's `<threat_model>` was introduced.

## Downstream Readiness

Plans 02 and 03 can now import from `./targets.js` and `./argv.js` without any further wiring:

- `import { TARGETS, DEFAULT_TARGET_IDS, type TargetId, type TargetSpec } from './targets.js';`
- `import { parseInitArgs, type InitFlags } from './argv.js';`
- `__INIT_MARKER_VERSION__` is globally available to any `src/**/*.ts` file via `src/global.d.ts`.

## Self-Check: PASSED

Files exist:
- FOUND: src/global.d.ts (modified)
- FOUND: tsup.config.ts (modified)
- FOUND: vitest.config.ts (modified)
- FOUND: src/init/targets.ts
- FOUND: src/init/argv.ts
- FOUND: test/init/targets.test.ts
- FOUND: test/init/argv.test.ts

Commits exist:
- FOUND: b2b36f5 (test RED — targets)
- FOUND: 9593603 (feat GREEN — targets + version constant)
- FOUND: 0eb253c (test RED — argv)
- FOUND: ab66410 (feat GREEN — argv)
