# Phase 7: init-file-writer - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a `--init` CLI mode to `ui-hierarchy-mcp` that injects a marker-delimited MCP usage guide into agent instruction files (`CLAUDE.md`, `AGENTS.md`, `.cursor/rules/ui-hierarchy-mcp.mdc`, `.github/copilot-instructions.md`). The injection is idempotent, atomic (tmpfile + rename with EXDEV fallback), EOL/BOM-preserving, non-interactive, zero-new-runtime-deps, and exits without booting the MCP server. The bare `npx ui-hierarchy-mcp` invocation (no `--init`) must continue starting the stdio server byte-for-byte as in v1.0.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**14 requirements are locked.** See `07-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `07-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- New CLI entry-mode dispatch in `src/cli.ts` — argv parsing for `--init`, `--target`, `--dry-run`, `--force`, plus `--help`/`--version` standard flags
- New `src/init/` module: target registry, marker scanner, fingerprint hasher, atomic writer, EOL/BOM detector, dry-run reporter
- Built-in guide template (bundled, not loaded from disk at runtime)
- Marker version derived from `package.json` `version` field (`major.minor`) at build time
- Unit tests + integration tests covering all 14 requirements (per existing `test/` conventions)

**Out of scope (from SPEC.md):**
- `--uninstall` / block-removal subcommand — deferred to v1.2
- Auto-detection of which agent files exist — user explicitly chooses targets
- Custom user templates (`--template <path>`)
- Interactive prompts of any kind — `--force` is the sole override
- Updating REQUIREMENTS.md, README, or marker version on a `--patch` package release
- MCP server runtime changes — `startServer()` and tool implementations untouched
- Phase 8 polish items (POLISH-01/02/03)

</spec_lock>

<decisions>
## Implementation Decisions

### Argv parsing
- **D-01:** Use `node:util.parseArgs` (Node 20+ built-in) with `{ strict: true, allowPositionals: false }`. Zero new deps, declarative schema, native unknown-flag rejection (satisfies INIT-03 unknown-target rejection at the parser layer plus a secondary value-level check for `--target` enum membership).
- **D-02:** Flag schema: `init: { type: 'boolean' }`, `target: { type: 'string' }` (comma-split downstream), `'dry-run': { type: 'boolean' }`, `force: { type: 'boolean' }`, `help: { type: 'boolean', short: 'h' }`, `version: { type: 'boolean', short: 'v' }`. `--target` is a single string parsed by `.split(',')` and validated against the allowed enum `claude|codex|cursor|copilot`; unknown tokens exit 1 with stderr error before any file write.
- **D-03:** Dispatch lives in `src/cli.ts`: if `parseArgs` returns `values.init === true` → call `runInit(values)` then `process.exit`. Otherwise fall through to the existing `startServer()` path unchanged. The dispatch fork is the only edit to `cli.ts` semantics — `--help`/`--version` short-circuit before either branch.

### Guide template bundling
- **D-04:** Inline TS template literal in `src/init/template.ts`, exporting `renderGuide({ cwd, version }): string`. Backtick template literals compose the four ordered sections (INIT-12): tool descriptions, MCP registration JSON snippet, one example invocation per tool, `projectRoot` hint with `cwd` substituted as a literal absolute path. No tsup loader changes required.
- **D-05:** The template module is the single source of truth for the guide payload. Tool list updates are made in this file; downstream tests snapshot the rendered output for regression protection.

### Fingerprint format & placement
- **D-06:** Fingerprint lives as an **attribute on the start marker**, not a separate comment line. Final start-marker shape: `<!-- ui-hierarchy-mcp:start version=X.Y fingerprint=<64-hex> -->`. This places the fingerprint **outside** the hashed body region (which is the bytes strictly between the two marker comments), so the fingerprint byte sequence never appears inside its own preimage — no chicken-and-egg.
- **D-07:** Hash algorithm: SHA-256 via `node:crypto.createHash('sha256')`, output as full 64-char lowercase hex. Hand-edit guard hashes the body bytes between markers (post-EOL normalization to LF for the hash input, regardless of the file's actual EOL — keeps the fingerprint stable across LF/CRLF round-trips on Windows).
- **D-08:** Marker scanner regex captures both `version` and `fingerprint` from the start marker in a single match. End marker remains attribute-free: `<!-- ui-hierarchy-mcp:end -->`. INIT-04's "matching content fingerprint" check uses the captured `fingerprint` attribute; INIT-07's hand-edit guard uses the same value.

### `src/init/` module split
- **D-09:** Fine-grained split (7 files inside `src/init/`):
  - `index.ts` — orchestrator: parse argv flags → iterate enabled targets → call per-target pipeline → emit stderr summary → compute exit code
  - `argv.ts` — `parseArgs` wrapper + `InitFlags` type + target-enum validation; also owns `--help`/`--version` text emission
  - `targets.ts` — registry of the 4 targets (id → relative path, frontmatter requirement, default for `--init` with no flag); single source mapping target id to its file structure (esp. the cursor frontmatter contract, INIT-14)
  - `markers.ts` — marker regex constants, `scanBlock(content)`, `replaceBlock(content, newBlock)`, `appendBlock(content, newBlock)` (handles the single-blank-line rule from INIT-06)
  - `fingerprint.ts` — `computeFingerprint(bodyBytes)` returning hex; `verifyFingerprint(body, expected)` returning boolean
  - `eol.ts` — `detectEol(content)` returning `'LF' | 'CRLF'`, `detectBom(content)` returning boolean, `applyEolBom(content, eol, bom)` for emission
  - `writer.ts` — `writeAtomic(path, content)` with `tmpfile + rename`, `EXDEV` → `copyFile + unlink` fallback, tmp cleanup on any pre-rename error; `--dry-run` mode is a no-op variant that only logs intended action
  - `template.ts` — `renderGuide({ cwd, version })` returning the body string (no markers; markers are added by the orchestrator)
- **D-10:** Each module is unit-testable in isolation; integration tests in `test/init/` drive the orchestrator with temp-dir fixtures (empty dir, pre-existing no-marker file, marker-with-old-version, marker-with-matching-fingerprint, hand-edited marker, CRLF+BOM, EXDEV simulation).

### Build-time version injection
- **D-11:** Reuse the existing `tsup` `define` pattern from [tsup.config.ts:24-26](tsup.config.ts#L24-L26). Add `__INIT_MARKER_VERSION__: JSON.stringify(pkg.version.split('.').slice(0, 2).join('.'))` (e.g. `"0.1"` for `0.1.1`). Referenced as a global in `markers.ts` via `declare const __INIT_MARKER_VERSION__: string` in `src/global.d.ts` (same module that already declares `__TOOL_VERSION__`).

### Stderr & exit code contract
- **D-12:** Per-target outcome lines via `process.stderr.write` only — never `console.log` (which writes to stdout). Line format: `[init] <action> <relative-path>` where `<action>` is one of `create | update | noop | skip (hand-edit) | would create | would update | would noop | would skip (hand-edit)`. Exit code: 0 iff every enabled target ended in `create | update | noop` (or the `would *` equivalent under `--dry-run`); 1 otherwise.

### Claude's Discretion
- Exact wording of `--help` text — keep concise, list all four flags + target enum, point at the npm package URL for fuller docs.
- Naming of internal types (`InitFlags`, `TargetSpec`, `BlockScanResult`, etc.) — pick consistent with existing project type-naming conventions (PascalCase, no `I`-prefix).
- Whether to extract the marker comment strings as exported constants vs inline regex literals — prefer constants in `markers.ts` for test-import clarity.
- Test fixture layout under `test/init/` — mirror the per-target file matrix; one fixture per requirement is fine.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked requirements
- `.planning/phases/07-init-file-writer/07-SPEC.md` — **MUST read before planning.** 14 locked requirements (INIT-01..14), boundaries, constraints, acceptance criteria, ambiguity report.

### Project state
- `.planning/PROJECT.md` — current milestone (v1.1), shipped v1.0 surface, key decisions log
- `.planning/ROADMAP.md` §"Phase 7" — phase success criteria + dependency on Phase 6
- `.planning/REQUIREMENTS.md` — milestone-level requirements INIT-01..14 source
- `.planning/milestones/v1.0-ROADMAP.md` — historical context (Phases 1–6 shipped surface; what the bare `npx` invocation must keep doing byte-for-byte)

### Code references (must preserve behavior of)
- `src/cli.ts` — current 10-line entry; the `--init` dispatch fork lands here; INIT-02 demands byte-for-byte v1.0 behavior on no-args invocation
- `src/mcp/server.ts` — `startServer()` callee; MUST NOT be invoked when `--init` is present
- `tsup.config.ts:24-26` — existing `define` block; the `__INIT_MARKER_VERSION__` constant joins this pattern
- `src/global.d.ts` — already declares `__TOOL_VERSION__`; add `__INIT_MARKER_VERSION__` declaration here
- `package.json` — `version` field is the source of `major.minor` injection; `engines.node: ">=20"` confirms `parseArgs` availability
- `test/mcp/smoke.spawn.test.ts` — existing smoke test that asserts the v1.0 stdio handshake; must remain green after Phase 7 lands

### External (Node stdlib only — zero new deps)
- `node:util.parseArgs` — argv parser
- `node:fs/promises` — read/write/rename/unlink/mkdir
- `node:path` — target path composition + parent dir resolution
- `node:crypto` — `createHash('sha256')` for fingerprint
- `node:os` — only if needed for tmpdir pid; pid available via `process.pid`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`tsup` `define` mechanism** ([tsup.config.ts:24-26](tsup.config.ts#L24-L26)) — already proven to inject a build-time constant (`__TOOL_VERSION__`) from `package.json`. The new `__INIT_MARKER_VERSION__` joins the same block; no new build infra.
- **Per-concern source layout** (`src/adapters/`, `src/core/`, `src/ir/`, `src/mcp/`, `src/renderers/`) — `src/init/` follows the established island convention.
- **`src/global.d.ts`** — existing ambient declarations file for tsup-injected globals; one-line addition handles `__INIT_MARKER_VERSION__`.

### Established Patterns
- **stdout invariant** — v1.0 already enforces "stdout reserved for MCP JSON-RPC framing" via `src/mcp/log.ts` (logs to stderr as JSON lines). The `--init` mode extends this: ALL init output (`[init] <action> …`) goes to stderr via `process.stderr.write`. Never `console.log`.
- **ESM-only, Node ≥ 20** — no `require()`, no `__dirname` tricks; top-level imports only. Aligns with `parseArgs` availability and `node:fs/promises` async API.
- **`vitest` snapshot pattern** — template rendering, marker scanner output, and per-target file emission are natural fits for `toMatchInlineSnapshot` (small JSON outcomes) and `toMatchFileSnapshot` (rendered guide block).

### Integration Points
- **`src/cli.ts` dispatch fork** — the only edit point in existing v1.0 code. Add `parseArgs` call at the top; branch on `values.init`. Everything else lives under `src/init/`.
- **`tsup.config.ts` `define` block** — add `__INIT_MARKER_VERSION__` alongside `__TOOL_VERSION__`. No other build changes.
- **`test/` directory** — new `test/init/` peer to existing `test/mcp/` and `test/integration/`. Existing `test/mcp/smoke.spawn.test.ts` is the regression gate for INIT-02.

</code_context>

<specifics>
## Specific Ideas

- Fingerprint goes on the start marker as an `attribute` (not a separate comment line as SPEC INIT-07 illustrates) — refinement that keeps fingerprint bytes outside the hashed body region. SPEC's binding language is "embedded fingerprint comment"; this placement satisfies that intent while being structurally cleaner.
- Fingerprint hash input is the body **normalized to LF** before hashing, so a file's EOL flavor (LF on Unix, CRLF on Windows) does not change its fingerprint. Avoids spurious "hand-edit detected" warnings on cross-platform checkouts.
- Stderr line action vocabulary is unified: `create | update | noop | skip (hand-edit)` for the live mode; same words prefixed with `would ` for `--dry-run`. One word per outcome — easy for CI grep, matches SPEC INIT-10/11 literal strings.

</specifics>

<deferred>
## Deferred Ideas

- `--uninstall` / block-removal subcommand — out of scope per SPEC; deferred to v1.2.
- `--template <path>` for user-supplied templates — out of scope per SPEC; deferred.
- Agent-file auto-detection (scan for which targets exist before writing) — out of scope per SPEC; user explicitly opts in via `--target`.
- Re-injection on `--patch` package bumps — SPEC fixes the trigger at `major.minor` only.
- POLISH-01/02/03 (markdown warnings surface, markdown integration tests, true component line numbers) — these are Phase 8.

</deferred>

---

*Phase: 07-init-file-writer*
*Context gathered: 2026-05-11*
