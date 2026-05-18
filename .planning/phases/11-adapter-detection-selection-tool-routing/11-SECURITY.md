---
phase: 11
slug: adapter-detection-selection-tool-routing
status: verified
threats_open: 0
asvs_level: 1
created: 2026-05-18
---

# Phase 11 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| MCP client → tool handlers | `projectRoot` string supplied by MCP client, must be validated before filesystem access | File path (user-controlled) |
| CLI argv → selectAdapter | `--framework` value must be allowlisted before reaching adapter selection singleton | Enum string (user-controlled) |
| selectAdapter → filesystem | Reads `package.json` at project root; malformed content must not crash tool handlers | JSON text (filesystem) |
| Test fixtures → parser | `package.json` content in fixtures is static; no runtime user input path | JSON text (static) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-11-01 | Tampering | fixture package.json content | accept | Static checked-in fixtures, no user-controlled path | closed |
| T-11-02 | Tampering | JSON.parse in detectExpoRouter | mitigate | `try/catch` in `src/adapters/expo/detect.ts:21-33`; malformed input emits no signal | closed |
| T-11-03 | DoS | fs.access loop for layout candidates | accept | 6-entry compile-time constant `layoutCandidates`, no unbounded loop | closed |
| T-11-04 | Tampering | JSON.parse in detectNextJs | mitigate | `try/catch` in `src/adapters/next/detect.ts:31-40`; same pattern as detectExpoRouter | closed |
| T-11-05 | Tampering | --framework argv value | mitigate | `VALID_FRAMEWORKS.includes()` allowlist + `process.exit(1)` at `src/cli.ts:75-83` before `startServer()` | closed |
| T-11-06 | Information Disclosure | conflict error message naming signal paths | accept | Paths are local filesystem paths already visible to user running the CLI | closed |
| T-11-07 | DoS | Promise.all both probes timeout | accept | `fs.access`/`readFile` only; `Promise.allSettled` degrades probe failures gracefully | closed |
| T-11-08 | Information Disclosure | isError response text with project root path | accept | `projectRoot` echoed back to the MCP client that supplied it | closed |
| T-11-09 | Tampering | projectRoot in tool call args | mitigate | `resolveRoot()` at `src/core/resolve-root.ts:23-32` rejects filesystem roots and `~/.ssh`; all 4 tool handlers call it before `selectAdapter()` | closed |
| T-11-SC | Tampering | npm/pip/cargo installs | accept | No new packages installed in Phase 11 | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-11-01 | T-11-01 | Test fixtures are static checked-in files with no user input path; tampering requires repo write access already | gsd-security-auditor | 2026-05-18 |
| AR-11-03 | T-11-03 | `layoutCandidates` is a compile-time 6-entry constant; no user input or unbounded iteration possible | gsd-security-auditor | 2026-05-18 |
| AR-11-06 | T-11-06 | Signal paths in conflict errors are local filesystem paths already visible to the user who invoked the CLI | gsd-security-auditor | 2026-05-18 |
| AR-11-07 | T-11-07 | `Promise.allSettled` over `fs.access`/`readFile` calls only; bounded by OS filesystem limits, no network surface | gsd-security-auditor | 2026-05-18 |
| AR-11-08 | T-11-08 | `projectRoot` in error text was supplied by the MCP client in the same request; no new information disclosed | gsd-security-auditor | 2026-05-18 |
| AR-11-SC | T-11-SC | No new packages were installed in Phase 11; supply-chain attack surface unchanged from prior phase | gsd-security-auditor | 2026-05-18 |

---

## Implementation Notes

**T-11-05 (framework override):** The original mitigation plan referenced a `setFrameworkOverride()` singleton. Code review CR-01 eliminated the singleton — the override is now threaded explicitly through `startServer(frameworkVal)` → `createServer(frameworkOverride)` → `tool.makeHandler(frameworkOverride)` → `selectAdapter(root, frameworkOverride)`. This per-request isolation is strictly stronger than the declared plan. The allowlist check (`VALID_FRAMEWORKS.includes()` + `process.exit(1)`) is confirmed present.

**T-11-09 (projectRoot path traversal):** Code review fix CR-03 added two explicit guards to `resolveRoot()`: filesystem root rejection and `~/.ssh` rejection. The declared mitigation ("normalizes and validates") understated what was implemented. All 4 tool handlers confirmed calling `resolveRoot()` before `selectAdapter()`.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-18 | 10 | 10 | 0 | gsd-security-auditor (State B — first audit) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-18
