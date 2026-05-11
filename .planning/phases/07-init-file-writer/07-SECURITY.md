---
phase: 7
slug: init-file-writer
status: verified
threats_open: 0
asvs_level: 1
created: 2026-05-11
---

# Phase 7 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Shell → CLI argv | User-supplied argv parsed by Node `parseArgs` in `src/init/argv.ts` | `--init`, `--target=<id>`, `--force` flags (strings) |
| CLI → Filesystem (read) | `runInit` reads existing target files (`CLAUDE.md`, `AGENTS.md`, `.cursor/rules/index.mdc`, `.codex/AGENTS.md`) under `cwd` | File contents (markdown/MDC text) |
| CLI → Filesystem (write) | `writeAtomic` writes through `<target>.tmp.<pid>.<rand>` then `rename` to final path | New/updated marker block bytes |
| Build-time → Bundle | `tsup` injects `__INIT_MARKER_VERSION__` from `package.json` at build | Version string literal |
| CLI → stderr | All operational/error output via `process.stderr.write` to preserve stdout for MCP framing | Status lines, error messages |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-07-01 | Tampering | `--target` argv value (`src/init/argv.ts`) | mitigate | `parseArgs({strict:true})` rejects unknown flags; secondary enum check against `VALID_TARGET_IDS` rejects unknown tokens before any file write. Verified in INIT-03 test. | closed |
| T-07-02 | Information Disclosure | Error messages echo invalid target token to stderr | accept | Echoing user-supplied token is required UX (INIT-03); not sensitive data. | closed |
| T-07-03 | Tampering | `pkg.version` substituted into `__INIT_MARKER_VERSION__` | accept | Source is local `package.json`, read at build time only via tsup `define`; not user-controlled at runtime. | closed |
| T-07-04 | Denial of Service | Unbounded `--target` string length | accept | Single argv string parsed by Node `parseArgs`; existing OS-level argv limits apply. | closed |
| T-07-05 | Tampering | Hand-edited marker body (`src/init/fingerprint.ts`) | mitigate | `verifyFingerprint` recomputes SHA-256 over hashed body region and compares against stored attribute before any overwrite. Unit-tested. | closed |
| T-07-06 | Spoofing | Attacker forges fingerprint attribute | accept | Integrity-only signal (content hash, not HMAC). If attacker has write access they already control the file; guard is for accidental hand-edits, not adversarial tampering. Documented in RESEARCH. | closed |
| T-07-07 | Information Disclosure | Regex backtracking on malicious input (`BLOCK_PATTERN` in `src/init/markers.ts`) | mitigate | Non-greedy `[\s\S]*?` bounded by required end-marker literal — no catastrophic backtracking. | closed |
| T-07-08 | Tampering | LF/CRLF round-trip producing `\r\r\n` | mitigate | `applyEolBom` normalizes to LF first, then converts to target EOL (RESEARCH Pitfall 1). Unit-tested. | closed |
| T-07-09 | Denial of Service | Extremely large body fed to `createHash` | accept | Linear-time hashing; size bounded by KB-scale agent instruction files. | closed |
| T-07-10 | Tampering | Symlink at `targetPath` (`src/init/writer.ts`) | accept | `rename(tmp, target)` follows the link and replaces target; atomic rename guarantees no torn write. Documented. | closed |
| T-07-11 | TOCTOU | Concurrent process writes to same target | accept | Single-shot CLI invocation; concurrent `--init` runs are a misuse case. Atomic rename ensures consistent state. | closed |
| T-07-12 | Denial of Service | Orphaned tmp files on crash | mitigate | Outer try/catch in `writeAtomic` calls `unlink(tmpPath).catch(() => {})` on any error path before rethrow (RESEARCH Pitfall 4). | closed |
| T-07-13 | EoP | Path traversal via `targetPath` containing `..` | accept | `targetPath` constructed via `join(cwd, target.relativePath)` from a closed enum (`TARGETS` constant in `src/init/targets.ts`). User cannot inject. Layered invariant documented. | closed |
| T-07-14 | Tampering | Template literal injection via `cwd` (`src/init/template.ts`) | mitigate | `cwd` interpolated into markdown string only; not eval'd, not used as a path inside template, not user-controlled outside the user's own shell. | closed |
| T-07-15 | Tampering | Hand-edited marker block (orchestrator `src/init/index.ts`) | mitigate | INIT-07: fingerprint mismatch → skip outcome → exit code 1; `--force` is the only override (INIT-13). Integration-tested. | closed |
| T-07-16 | Tampering | Path traversal via `target.relativePath` | mitigate | Target paths are constants in `targets.ts`; user cannot inject a custom path. Only the four canonical paths under `cwd` reachable. | closed |
| T-07-17 | Information Disclosure | Stdout contamination breaking MCP framing | mitigate | `runInit` and `cli.ts --init` branch use `process.stderr.write` exclusively; INIT-11 stdout-invariant test asserts zero stdout writes across three scenarios. | closed |
| T-07-18 | Tampering | TOCTOU between read and write | accept | Single-process CLI run; concurrent invocations are misuse. Atomic rename guarantees no torn-write state. | closed |
| T-07-19 | Spoofing | Cursor frontmatter corruption on re-run | mitigate | `replaceBlock` splices only the marker region via `scanBlock` indices, preserving all bytes before/after. INIT-14 SHA-256-asserts prefix-slice equality. | closed |
| T-07-20 | Denial of Service | Extremely large existing target file | accept | Agent instruction files are KB-scale; single `readFile` per target acceptable for v1. | closed |
| T-07-21 | EoP | Symlink at target path replaces a sensitive file | accept | `rename` follows the link; user already controls their own project. Standard editor-style tool behavior. Documented in RESEARCH. | closed |
| T-07-22 | Tampering | argv injection of unknown flags (CLI dispatch fork, `src/cli.ts`) | mitigate | `parseInitArgs` uses `parseArgs({strict:true})` which throws `ERR_PARSE_ARGS_UNKNOWN_OPTION`; cli.ts catches via `{ok:false, message}` envelope and exits 1 before any file write or server boot. | closed |
| T-07-23 | Spoofing | Stdout contamination from `--init` path | mitigate | All `cli.ts` output uses `process.stderr.write`; `grep -n "process.stdout" src/cli.ts` returns zero matches (INIT-11 entry-point gate). | closed |
| T-07-24 | EoP | `--init` path inadvertently boots MCP server | mitigate | `--init` branch calls `runInit().then(process.exit)`; `startServer()` lives in the unreachable `else` arm. INIT-02 smoke test verifies no-args branch; `--init` branch never produces MCP framing on stdout. | closed |
| T-07-25 | Denial of Service | Unhandled rejection from `runInit` orphans the process | mitigate | `.catch` on `runInit().then(...)` chain calls `process.exit(1)` after writing `[init] error ...` to stderr (RESEARCH Pitfall 7). | closed |
| T-07-26 | Tampering | Banner shebang stripped or mangled | accept | `tsup.config.ts:16` configures `banner.js: "#!/usr/bin/env node"`; existing v1.0 builds validate this. No new risk introduced. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-07-01 | T-07-02 | Echoing user-supplied invalid target token to stderr is required UX per INIT-03 acceptance; not sensitive data. | Plan 07-01 author | 2026-05-11 |
| AR-07-02 | T-07-03 | `pkg.version` originates from local `package.json`, injected at build time by tsup `define`; not user-controlled at runtime. | Plan 07-01 author | 2026-05-11 |
| AR-07-03 | T-07-04 | OS-level argv length limits provide sufficient bound for a single `--target` string. | Plan 07-01 author | 2026-05-11 |
| AR-07-04 | T-07-06 | Fingerprint is an integrity-only signal (SHA-256, not HMAC). Adversarial tampering by an actor with write access is out of scope; the guard is for accidental hand-edits. | Plan 07-02 author | 2026-05-11 |
| AR-07-05 | T-07-07 | `BLOCK_PATTERN` uses non-greedy `[\s\S]*?` with required end-marker literal — no catastrophic backtracking possible on Node v18+. | Plan 07-02 author | 2026-05-11 |
| AR-07-06 | T-07-09 | SHA-256 hashing is linear-time over KB-scale agent instruction files; no DoS surface. | Plan 07-02 author | 2026-05-11 |
| AR-07-07 | T-07-10, T-07-21 | `rename` follows symlinks. If the user places an adversarial symlink at a target path they already control their own project. Standard editor-style tool behavior. | Plan 07-03 / 07-04 authors | 2026-05-11 |
| AR-07-08 | T-07-11, T-07-18 | Single-shot CLI invocation; concurrent `--init` runs are a misuse case. Atomic rename guarantees one of two consistent states. | Plan 07-03 / 07-04 authors | 2026-05-11 |
| AR-07-09 | T-07-13 | `targetPath` is constructed by the orchestrator (Plan 07-04) via `join(cwd, target.relativePath)` from the closed `TARGETS` enum. The writer (Plan 07-03) treats path validation as a layered invariant. | Plan 07-03 author | 2026-05-11 |
| AR-07-10 | T-07-20 | Agent instruction files are KB-scale; single `readFile` per target is acceptable for v1. Streaming deferred. | Plan 07-04 author | 2026-05-11 |
| AR-07-11 | T-07-26 | `tsup.config.ts` banner injection has been validated by existing v1.0 builds; no new risk introduced by Phase 7. | Plan 07-05 author | 2026-05-11 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-11 | 26 | 26 | 0 | /gsd-secure-phase (plan-time register, summary-verified) |

**Verification basis:** All 26 threats were authored at plan time across plans 07-01 through 07-05 with explicit STRIDE category, component, disposition, and mitigation reference. Each plan's SUMMARY.md confirmed dispositions applied with file/test citations (INIT-03, INIT-07, INIT-11, INIT-13, INIT-14, fingerprint/applyEolBom/writeAtomic unit tests, runInit integration tests). `register_authored_at_plan_time: true` and zero residual open threats triggered the short-circuit path to direct closure.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-11
