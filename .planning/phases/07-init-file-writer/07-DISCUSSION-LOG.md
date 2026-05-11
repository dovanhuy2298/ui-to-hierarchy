# Phase 7: init-file-writer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-11
**Phase:** 07-init-file-writer
**Areas discussed:** Argv parsing approach, Guide template bundling, Fingerprint format & placement, src/init/ module split

---

## Argv parsing approach

| Option | Description | Selected |
|--------|-------------|----------|
| `node:util.parseArgs` | Built-in Node 20+. Declarative options schema, strict unknown-flag rejection, zero new deps. | ✓ |
| Hand-rolled argv scanner | ~30 LOC loop; every edge case (`--target=x` vs `--target x`, `--` separator) on us. | |
| Tiny external lib (mri / arg) | Adds a dep — violates SPEC zero-new-runtime-deps constraint. | |

**User's choice:** `node:util.parseArgs` with `{ strict: true }`.
**Notes:** Aligns with `engines.node: ">=20"`. Strict mode covers INIT-03 unknown-flag rejection at the parser layer; a secondary enum check inside `--target` value validates the comma-split tokens.

---

## Guide template bundling

| Option | Description | Selected |
|--------|-------------|----------|
| Inline TS template literal | `src/init/template.ts` exports `renderGuide({cwd, version})` using backtick literals. No tsup loader config. | ✓ |
| Separate .md file + tsup raw loader | Markdown highlighting in editor; requires tsup `loader` addition and `?raw` import. | |
| Builder function composing per-section helpers | Per-section helpers; more files for a relatively static payload. | |

**User's choice:** Inline TS template literal in `src/init/template.ts`.
**Notes:** Simplest bundling story; snapshot tests cover regression on the rendered output.

---

## Fingerprint format & placement

| Option | Description | Selected |
|--------|-------------|----------|
| Attribute on start marker, full SHA-256 hex (64 chars) | `<!-- ui-hierarchy-mcp:start version=X.Y fingerprint=<64-hex> -->`. Fingerprint outside hashed body. | ✓ |
| Separate comment line at top of block, full SHA-256 hex | Literal SPEC INIT-07 wording; two regexes to maintain. | |
| Attribute on start marker, truncated 16-char hex | 64 bits sufficient for non-adversarial tamper detection. | |

**User's choice:** Start-marker attribute, full SHA-256 hex.
**Notes:** Refinement vs SPEC INIT-07's illustrative phrasing — keeps the fingerprint bytes outside the hashed preimage (no chicken-and-egg). Acceptance criterion ("embedded fingerprint comment") still satisfied: the start marker IS a comment, and it is embedded in the block. Hash input is body normalized to LF so fingerprint is stable across LF/CRLF round-trips.

---

## src/init/ module split

| Option | Description | Selected |
|--------|-------------|----------|
| Fine split: 7 files | `index`, `argv`, `targets`, `markers`, `fingerprint`, `eol`, `writer`, `template`. Test-per-file natural. | ✓ |
| Medium split: 4 files | `index`+argv, `targets`, `markers`+fingerprint+EOL, `writer`+template. | |
| Flat: single `src/init.ts` | ~400 LOC in one file; conflicts with per-concern directory convention. | |

**User's choice:** Fine split (7 files inside `src/init/`).
**Notes:** Matches project's per-concern island convention (`adapters/`, `core/`, `ir/`, `mcp/`, `renderers/`). Plan tasks map cleanly to per-file units; unit-test scope per module is obvious.

---

## Claude's Discretion

- Exact wording of `--help` text — concise, list four flags + target enum, point at npm URL.
- Naming of internal types (`InitFlags`, `TargetSpec`, `BlockScanResult`, etc.) — follow project PascalCase, no `I`-prefix.
- Whether to export marker comment strings as constants vs inline regex literals — prefer constants in `markers.ts`.
- Test fixture layout under `test/init/` — mirror the per-target file matrix; one fixture per requirement is acceptable.

## Deferred Ideas

- `--uninstall` block-removal subcommand → v1.2 (per SPEC out-of-scope).
- `--template <path>` user-supplied templates → deferred (per SPEC out-of-scope).
- Agent-file auto-detection → out of scope per SPEC.
- Re-injection on `--patch` bumps → SPEC fixes trigger at `major.minor`.
- POLISH-01/02/03 → Phase 8.
