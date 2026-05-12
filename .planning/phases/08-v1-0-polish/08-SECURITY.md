---
phase: 8
slug: v1-0-polish
status: verified
threats_open: 0
asvs_level: 1
created: 2026-05-12
mode: retroactive-stride
---

# Phase 8 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> **Mode:** Retroactive STRIDE — no `<threat_model>` block existed in the four
> Phase 8 plans (`08-01-PLAN.md` through `08-04-PLAN.md`). Register built from
> implementation diffs post-merge, scoped strictly to Phase 8 surfaces:
> markdown warning emission, parser `declLines` map, resolver line propagation,
> and integration-test spawn helper.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| User repo → Parser | Developer-supplied `.ts/.tsx` source files read via `node:fs.readFileSync` in `parseFile` | Source text → AST + `declLines: Map<string, number>` |
| Parser → Resolver | `ParseResult.ok` consumed by `resolveSpecifierToFile` / `chaseBarrel` | `declLines.get(importedName)` numeric line |
| Resolver → Analyzer | `ResolveResult.local` consumes line | `{ kind: "local"; absolutePath; line }` |
| Analyzer → Markdown renderer | `Envelope.warnings: string[]` + `TreeNode` IR | Warning strings interpolated into `<!-- ... -->` lines |
| Markdown renderer → MCP stdio → Client | Final markdown string over stdio transport | UTF-8 markdown text |
| Test harness → Spawned CLI | `StdioClientTransport` spawns `node dist/cli.js` | argv (hard-coded path), stdio |

Project security context (unchanged from prior phases): local CLI/MCP dev tool,
no network listener, no auth, no DB, static analysis only (no eval / runtime
execution of user code). Single-user trust domain.

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-8-01 | Tampering | `src/renderers/markdown.ts:111` — warning string interpolated into `<!-- warning: ${msg} -->` without escaping the `-->` sentinel | accept | Warnings originate from this codebase (`parseFile.ts:167` recovered-errors message, `Analyzer.ts:297` resolver-threw wrapper) and Babel error messages. Output is consumed by an LLM agent reading markdown, not rendered as HTML in a browser. A crafted source path or Babel error containing `-->` would prematurely close the comment but cannot escalate beyond cosmetic output corruption in a single-user CLI dev tool. ASVS L1 scope. | closed |
| T-8-02 | Tampering | `src/renderers/markdown.ts` path emission on Windows | mitigate | Backslash-free output enforced two layers: (a) `toForwardSlash` applied at every emission site in resolver (`src/core/resolver/index.ts:76,98`, `src/core/Analyzer.ts:305`); (b) integration test `test/integration/mcp-markdown.test.ts:62` asserts `expect(out).not.toContain("\\")` for both Phase-05 fixtures. | closed |
| T-8-03 | Denial of Service | `collectDeclLines` in `src/core/parser/index.ts:40` | mitigate | Flat scan over `ast.program.body` only (no `@babel/traverse`, no recursion beyond `ExportNamedDeclaration` → single-level inner-declaration record). Bounded by parser input size already accepted by `parseFile`. No new fuel surface introduced relative to baseline parse pass (single-pass guarantee preserved per D-02 — verified in `08-02-SUMMARY.md` self-check). | closed |
| T-8-04 | Tampering (prototype pollution) | declLines name→line mapping populated from arbitrary user-source identifier names | mitigate | Implementation uses `new Map<string, number>()` (`parser/index.ts:41`), not a plain object. `Map.set("__proto__", n)` does not mutate `Object.prototype`. Lookup via `declLines.get(importedName)` (`resolver/index.ts:83,103`, `resolver/barrel.ts:91`) is likewise safe. | closed |
| T-8-05 | Spoofing / command injection | `spawnMcpClient` in `test/integration/_helpers.ts:40-55` | mitigate | `StdioClientTransport({ command: "node", args: [distCli] })` — `distCli` is `resolve(__dirname, "../../dist/cli.js")` (hard-coded relative to the test file, no user input), no `shell: true`, args passed as array (not interpolated string). MCP SDK transport invokes `child_process.spawn` without a shell. Test-only surface; never executed in published artifact. | closed |
| T-8-06 | Denial of Service | Resolver per-call cache keyed by `${fromFile}::${specifier}::${importedName}` (`src/core/resolver/index.ts:46`) | mitigate | Cache key widened to include `importedName` so different imports from the same barrel get distinct entries — but `parseFile` itself remains keyed only on the normalized absolute path (`parser/index.ts:135`). Same target file across many `importedName`s shares the same cached `ParseResult` (and its `declLines` `Map`). No per-importedName re-parse; O(1) `declLines.get` per resolution. D-02 single-parse invariant preserved (verified by full suite 353/353 and `08-03-SUMMARY.md` grep gates). | closed |
| T-8-07 | Integrity | Integration tests could run against a stale `dist/cli.js` | mitigate | `assertFreshBuild()` in `test/integration/_helpers.ts:17-30` checks `dist/cli.js` exists and `mtimeMs >= src/cli.ts mtimeMs`, throwing otherwise. Called unconditionally inside `spawnMcpClient` (`_helpers.ts:44`) so callers cannot forget it. | closed |
| T-8-08 | Information Disclosure | `assertFreshBuild` error message and resolver-threw warning (`Analyzer.ts:297`) include local filesystem paths in error output | accept | Local CLI dev tool, single-user trust domain. Path disclosure to the MCP client (running on the same machine) is by design — the entire purpose of this server is to return file:line locations. No remote attacker surface. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-8-01 | T-8-01 | Markdown HTML-comment escape of `-->` deferred — ASVS L1, single-user CLI, output consumed by LLM agent not a browser DOM. Worst case: a crafted source path or Babel error message containing the literal `-->` truncates the warning block; tree output remains intact. Revisit if/when an HTTP transport is added (PROJECT.md notes this is out of scope for v1). | gsd-security-auditor (retroactive) | 2026-05-12 |
| AR-8-02 | T-8-08 | Local file paths in stderr/warnings are inherent to the tool's contract (return file:line). No remote attacker. | gsd-security-auditor (retroactive) | 2026-05-12 |

---

## Unregistered Flags

None. SUMMARY files for `08-01` through `08-04` contain no `## Threat Flags`
section; no new attack surface was self-reported by the executor during
implementation. The retroactive STRIDE pass above is the canonical
enumeration for Phase 8.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-12 | 8 | 8 | 0 | gsd-security-auditor (retroactive STRIDE) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-12
