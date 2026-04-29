# Phase 02 — MCP Transport Shell — Security Audit

**Phase:** 02 — mcp-transport-shell
**ASVS Level:** L1
**Audit Date:** 2026-04-29
**Threats Total:** 12 | **Closed:** 12 | **Open:** 0

## Verified Mitigations

| Threat ID | Category | Disposition | Evidence |
|-----------|----------|-------------|----------|
| T-02-01 | Information Disclosure | mitigate | biome.json:50-58 — override targets `src/mcp/**` and `src/cli.ts` with `suspicious.noConsole: "error"` |
| T-02-03 | Information Disclosure | mitigate | src/mcp/errors.ts:25-36 — `internalError()` derives `message` from `err instanceof Error ? err.message : String(err)`; `err.stack` never referenced |
| T-02-05 | Tampering | mitigate | src/mcp/tools/get-full-hierarchy.ts:14-17 — route regex anchors `^...$`, accepts only `/` or `/segment(/segment)*` where segments are `[\w-]+` or bracketed dynamic params; rejects whitespace, `?`, `#`, trailing slash (no `/$` alternative beyond root) |
| T-02-06 | Tampering | mitigate | src/mcp/tools/focus-on.ts:15 — `regex(/^[A-Z][A-Za-z0-9_]*$/)` enforces PascalCase; lowercase, kebab-case, special chars rejected |
| T-02-09 | Information Disclosure | mitigate | src/cli.ts:6-11 — top-level catch passes only `err.message` (or `String(err)`) to `log.error`; no stack reference |
| T-02-12 | Denial of Service | mitigate | test/mcp/smoke.spawn.test.ts:42-46 — `afterAll` awaits `client.close()` then `transport.close()`; beforeAll timeout 15000ms, afterAll timeout 10000ms |

## Accepted Risks

The following threats are explicitly accepted for Phase 02. Rationale documented in PLAN.md threat register.

| Threat ID | Category | Rationale |
|-----------|----------|-----------|
| T-02-02 | Tampering (package.json scripts) | Developer-facing only; not exposed to end-user runtime. |
| T-02-04 | Information Disclosure (log.ts stderr) | stderr is captured by the MCP host process, not surfaced to MCP clients over the JSON-RPC wire. |
| T-02-07 | Elevation of Privilege (projectRoot) | Path-traversal sandboxing deferred to Phase 3 parser sandbox; current handlers are stubs returning notImplemented before any FS access. |
| T-02-08 | Tampering (stdin) | `@modelcontextprotocol/sdk` StdioServerTransport handles malformed JSON-RPC framing internally. |
| T-02-10 | Denial of Service (startServer hanging) | By-design stdio behavior; the MCP host owns process lifecycle. |
| T-02-11 | Information Disclosure (smoke stderr assertion) | Log content checked in tests has no secrets; only structural assertions on `level` field. |

## Unregistered Flags

None. No `## Threat Flags` entries in any 02-0N-SUMMARY.md exceeded the registered threat set.

## Audit Method

- Verified each `mitigate` threat by locating the declared mitigation pattern in the cited implementation file.
- Implementation files were read-only; no patches applied.
- Skipped accepted threats per PLAN.md disposition; logged rationale above.
