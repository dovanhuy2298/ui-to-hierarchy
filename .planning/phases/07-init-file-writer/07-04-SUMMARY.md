---
phase: 07-init-file-writer
plan: 04
subsystem: init
tags: [orchestrator, integration-test, exit-code, stderr, fingerprint-preimage]
dependency_graph:
  requires:
    - src/init/argv.ts (Plan 01)
    - src/init/targets.ts (Plan 01)
    - src/init/markers.ts (Plan 02)
    - src/init/fingerprint.ts (Plan 02)
    - src/init/eol.ts (Plan 02)
    - src/init/writer.ts (Plan 03)
    - src/init/template.ts (Plan 03)
    - __INIT_MARKER_VERSION__ (ambient global from Plan 01)
  provides:
    - runInit(flags, {cwd}) -> Promise<number>
  affects:
    - Plan 05 (cli.ts wires --init dispatch to runInit and translates the
      return code into process.exit)
tech-stack:
  added: []
  patterns:
    - "Per-target pipeline composing seven leaf modules"
    - "LF-normalize-for-scan + preserve-original-EOL-on-write"
    - "Cursor frontmatter via literal prefix on create; replaceBlock slice
      arithmetic preserves it on update (no special-case branching)"
    - "vi.spyOn(process.stderr.write) capture pattern for stderr assertions
      without spawning a subprocess"
    - "Per-test mkdtemp + rm({recursive:true,force:true}) lifecycle
      (beforeEach/afterEach, no shared state)"
key-files:
  created:
    - src/init/index.ts
    - test/init/integration.test.ts
  modified: []
decisions:
  - "Stderr action vocabulary lives entirely in runInit; the writer and
    other leaf modules never emit user-facing output (preserves
    test-isolation of unit-tested leaf modules)"
  - "LF normalization is performed only on the scan input — the actual
    write content preserves the existing file's EOL via applyEolBom. This
    decouples 'regex matching independent of EOL flavor' from 'byte-stable
    round-trips on CRLF files' (INIT-09)"
  - "actionLabel('skip', false) emits 'skip (hand-edit)' (per D-12 literal)
    and adds 'would ' prefix only when dryRun=true; outcome='error' is
    handled on a separate branch with a dedicated [init] error <path>:
    <message> line"
  - "Comments avoid the literal tokens INIT-13 greps against (stdin,
    readline, isTTY) and the process.exit token used in the Task 1
    acceptance criteria, matching the established Plan 01/02/03 stylistic
    convention"
metrics:
  duration: "~10 min"
  completed: 2026-05-11
  tasks_completed: 2
  files_changed: 2
requirements: [INIT-01, INIT-04, INIT-05, INIT-07, INIT-09, INIT-10, INIT-11, INIT-13, INIT-14]
---

# Phase 7 Plan 4: runInit Orchestrator + Integration Tests Summary

Composed the seven leaf modules from Wave 1 into `runInit` — the single
behavioral entry point that Plan 05 will wire into `cli.ts`. Owns
per-target dispatch, the decision matrix (create / update / noop / skip),
EOL/BOM preservation, the cursor YAML frontmatter contract, the
stderr action vocabulary, and exit-code computation. Nine of fourteen INIT
requirements are now provable end-to-end against temp directories.

## Tasks Completed

| Task | Name                                          | Commit  | Files                                          |
| ---- | --------------------------------------------- | ------- | ---------------------------------------------- |
| 1    | runInit orchestrator (seven-module pipeline)  | 2ffff21 | src/init/index.ts                              |
| 2    | Integration tests (10 cases covering 9 INITs) | 97df202 | test/init/integration.test.ts                  |

## What Was Built

### `src/init/index.ts`

`async function runInit(flags: InitFlags, {cwd?}): Promise<number>` —
filters `TARGETS` by enabled ids (canonical order, not user-specified
order), and for each target runs the per-target pipeline:

1. Read existing file. ENOENT → null (new-file path); other read errors
   yield an `error` outcome with the message coerced from the thrown
   value.
2. Detect EOL + BOM from the existing buffer (defaults to LF + no BOM on
   new file).
3. Render `body = renderGuide({cwd, version: __INIT_MARKER_VERSION__})`
   and compute `fingerprint = computeFingerprint(body)`.
4. Assemble the marker block as
   ``<!-- ui-hierarchy-mcp:start version=${V} fingerprint=${hex} -->\n${body}\n<!-- ui-hierarchy-mcp:end -->``
   — the two literal `\n` outside the body capture group of Plan 02's
   `BLOCK_PATTERN` are the **fingerprint preimage contract**: round-trip
   scan returns `scan.body === renderGuide(...)` byte-for-byte.
5. LF-normalize the existing text for scanning. Decide:
   - no existing → `create`
   - existing but no marker → `create` via `appendBlock`
   - marker + version match + fingerprint OK → `noop`
   - marker + fingerprint mismatch + not `--force` → `skip`
   - marker + (version mismatch OR `--force`) → `update` via `replaceBlock`
6. Apply `applyEolBom` to the assembled content (preserves the detected
   EOL flavor + BOM on write) and call `writeAtomic` or
   `writeAtomicDryRun` accordingly. `noop` and `skip` perform no write.
7. Emit one `[init] <action> <relativePath>` stderr line per target;
   prefix with `would ` under `--dry-run`.

Return `0` iff every outcome is `create | update | noop`; `1` on any
`skip (hand-edit)` or `error`.

The cursor target (`hasFrontmatter: true`) receives the literal
`CURSOR_FRONTMATTER` block followed by `\n\n` on first create. On
subsequent updates, `replaceBlock`'s slice arithmetic preserves the
frontmatter bytes automatically — no special-case branching.

### `test/init/integration.test.ts`

10 `it(...)` cases driving `runInit` directly with a `cwd` override into
per-test `mkdtemp` directories. No CLI spawning; that contract is owned
by Plan 05's smoke test.

| Case | What it proves |
| --- | --- |
| INIT-01 | `runInit({targets:['claude']})` creates `CLAUDE.md` with markers; exit 0; stdout zero writes |
| INIT-05 | All four targets create files at canonical paths; `.cursor/rules/` and `.github/` auto-created |
| INIT-04 idempotency | Run 2 emits `[init] noop` (regression test for fingerprint-preimage BLOCKER), produces SHA-256-identical bytes, returns 0 |
| INIT-04 version replacement | Seeded `version=v9.9` marker with a valid fingerprint is replaced with `version=0.0-test`; pre-marker prose preserved byte-for-byte (SHA-256 prefix equality) |
| INIT-07 hand-edit guard | Tampered body → `skip (hand-edit)` + exit 1, file bytes unchanged; `--force` → `update` + exit 0; subsequent plain run → `noop` (fingerprint re-anchored) |
| INIT-09 CRLF+BOM | Seeded CRLF+BOM file: BOM bytes + CRLF EOL preserved; no `\r\r\n` anywhere; run 2 byte-identical to run 1 |
| INIT-10 dry-run | Empty tmpDir after `dryRun:true`; `[init] would ` lines emitted on stderr |
| INIT-11 stdout invariant | Across three scenario calls, `stdoutSpy.mock.calls.length === 0` |
| INIT-13 non-interactive | `process.stdin.listenerCount('data')` unchanged across a four-target run |
| INIT-14 cursor frontmatter | File starts with `---\ndescription:`; contains `alwaysApply: true`, the literal globs block, and trailing `---`; on a `--force` update, SHA-256 of the prefix-slice (bytes before `<!-- ui-hierarchy-mcp:start`) is unchanged |

## Verification

```
$ npx vitest run test/init/ --reporter=dot
 Test Files  8 passed (8)
      Tests  84 passed (84)
```

Per the SCOPE BOUNDARY rule, the pre-existing `npx tsc --noEmit` error in
`test/fixtures/phase-05/micro/parse-error/app/page.tsx` is an intentional
fixture from Phase 5 and is out of scope; no init-module files contribute
TypeScript errors.

### Task 1 acceptance gates (all pass)

```
$ grep -E "\b(stdin|readline|isTTY)\b" src/init/*.ts
(no matches — INIT-13 module-wide grep clean)

$ grep -n "process.stdout" src/init/index.ts
(no matches — INIT-11 stdout invariant)

$ grep -n "console\." src/init/index.ts
(no matches)

$ grep -n "process.stderr.write" src/init/index.ts
219, 224 (two emission sites)

$ grep -n "process.exit" src/init/index.ts
(no matches — runInit returns exit code, cli.ts terminates)

$ grep -n "__INIT_MARKER_VERSION__" src/init/index.ts
70, 130, 157 (block assembly + render + version comparison)

$ grep -E "from ['\"]\\./(argv|targets|markers|fingerprint|eol|writer|template)\\.js['\"]" src/init/index.ts | wc -l
7 (all seven leaf modules composed)

$ wc -l src/init/index.ts
234 (>= 80 lines)
```

### Task 2 acceptance gates (all pass)

- `it(` count: 10 (>= 10 required).
- Explicit `[init] noop` regression assertion exists inside the INIT-04
  idempotency case (`grep -i noop` returns matches inside that test).
- Three explicit `stdoutSpy.mock.calls.length).toBe(0)` assertions across
  three different scenarios.
- `mkdtemp` + `rm({recursive:true, force:true})` lifecycle (beforeEach /
  afterEach), no shared state between cases.

## Deviations from Plan

**1. [Rule 1 — Test infrastructure] Initial path-separator-tolerant regex
helper had a bracket-escaping bug.**

- **Found during:** Task 2 first vitest run (INIT-01 failed with a
  malformed regex: `CLAUDE[\\/].md/].md`).
- **Issue:** `makePathPattern` chained `replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`
  with a second `replace(/[\\/]/g, '[\\\\/]')`. The first pass escaped the
  literal `.` in `CLAUDE.md` to `\.`, then the second pass mangled the
  escape into `CLAUDE[\\/].md` plus a trailing `]`. The intent
  (cross-platform `/` vs `\` tolerance per RESEARCH Open Question 2) was
  sound; the implementation was over-engineered.
- **Fix:** Removed the helper and used a single inline regex
  `/\[init\] create .*CLAUDE\.md/`. The orchestrator emits the
  `target.relativePath` literal (`CLAUDE.md`), which is already
  POSIX-style by virtue of the constants in `targets.ts` — there is no
  path-separator divergence to defend against in this assertion. Removed
  the unused `sep` and `mkdir` imports as well.
- **Files modified:** test/init/integration.test.ts
- **Commit:** (folded into 97df202; bug surfaced and was fixed before
  Task 2 was committed)

**2. [Rule 2 — INIT-13 documentation hygiene] Comment sanitation for
grep-gate compliance.**

- **Found during:** Task 1 acceptance-gate run.
- **Issue:** Initial JSDoc on `src/init/index.ts` mentioned the literal
  tokens `stdin`, `readline`, `isTTY`, and `process.exit` while
  describing the module's non-interactive contract. The Task 1
  acceptance criteria use literal `grep` checks against the module
  source, which trip on documentation text alone — same stylistic gotcha
  the Plan 01 summary already flagged.
- **Fix:** Rephrased the JSDoc to describe the same compliance posture
  without naming the forbidden tokens (e.g. "no input-stream APIs
  anywhere", "translates the returned code into a process status").
  Semantics identical; gates clean.
- **Files modified:** src/init/index.ts
- **Commit:** (folded into 2ffff21; sanitation done before commit)

## Threat Mitigations Applied

| Threat ID | Status | Where |
| --- | --- | --- |
| T-07-15 (hand-edited body) | mitigated | INIT-07 hand-edit guard test asserts skip + exit 1; --force overrides |
| T-07-16 (path traversal via target) | mitigated | target paths sourced from constant `TARGETS`; user cannot inject; absPath = join(cwd, t.relativePath) only |
| T-07-17 (stdout contamination) | mitigated | INIT-11 stdout invariant test asserts zero stdout writes across three scenarios |
| T-07-18 (TOCTOU read/write) | accepted | single-process CLI; atomic rename in writer.ts guarantees no torn-write state regardless |
| T-07-19 (cursor frontmatter corruption) | mitigated | INIT-14 test SHA-256-asserts prefix-slice equality across a forced update |
| T-07-20 (huge target file) | accepted | KB-scale agent files; single readFile per target acceptable for v1 |
| T-07-21 (symlink at target path) | accepted | rename follows the link; documented in RESEARCH/Plan 03 |

No new threat surface introduced beyond the plan's `<threat_model>`.

## Known Stubs

None. `runInit` is fully implemented; Plan 05 only needs to import it from
`./init/index.js`, dispatch when `--init` is present, and translate the
returned number into `process.exit(code)`.

## Threat Flags

None.

## Self-Check: PASSED

Files exist:
- FOUND: src/init/index.ts
- FOUND: test/init/integration.test.ts
- FOUND: .planning/phases/07-init-file-writer/07-04-SUMMARY.md (this file)

Commits exist:
- FOUND: 2ffff21 (feat — runInit orchestrator)
- FOUND: 97df202 (test — integration tests)
