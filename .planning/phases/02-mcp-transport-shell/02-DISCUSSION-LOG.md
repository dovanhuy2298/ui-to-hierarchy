# Phase 2: MCP Transport Shell - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 02-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 02-mcp-transport-shell
**Areas discussed:** Tool schema shapes, Error & logging contract, Server wiring & layout, Smoke test approach

---

## Tool Schema Shapes

### Q: Route validator strictness

| Option | Description | Selected |
|--------|-------------|----------|
| Regex chặt Next.js | Reject bad input early, clear message; mapping deferred to Phase 4 | ✓ |
| Chỉ starts-with `/` | Lightweight, delegate to adapter | |
| `z.string()` no regex | Loose | |

**User's choice:** Regex chặt Next.js (recommended).

### Q: Scope enum shape

| Option | Description | Selected |
|--------|-------------|----------|
| `z.enum(['up','full','down'])` + default 'full' | Matches TOOL-02, safe fallback | ✓ |
| Enum no default | Force explicit choice | |
| Enum + default 'down' | Lightest default | |

**User's choice:** enum + default 'full'.

### Q: Identifier regex for component names

| Option | Description | Selected |
|--------|-------------|----------|
| PascalCase JSX strict | `^[A-Z][A-Za-z0-9_]*$` — rejects lowercase/kebab | ✓ |
| Dot-namespaced allowed | Supports `Card.Header` | |
| String no regex | Loose; fails SC-2 spirit | |

**User's choice:** PascalCase strict. Namespaced form deferred.

### Q: Format param shape & default

| Option | Description | Selected |
|--------|-------------|----------|
| `z.enum(['markdown','json']).default('markdown')` | Matches OUT-01, extensible for v2 | ✓ |
| Optional no default | Handler infers markdown | |
| Boolean `asJson` | Simpler but not extensible | |

**User's choice:** enum with markdown default.

---

## Error & Logging Contract

### Q: Not-implemented response shape

| Option | Description | Selected |
|--------|-------------|----------|
| Text + next-step hint | Actionable per SC-3 | ✓ |
| Plain 'Not implemented' | Terse, not actionable | |
| Structured JSON payload | Machine-readable but over-engineered | |

**User's choice:** actionable text with phase pointer.

### Q: Error helper centralization

| Option | Description | Selected |
|--------|-------------|----------|
| Shared `errors.ts` module | `notImplemented/invalidInput/internalError` helpers | ✓ |
| Inline per tool | Less abstraction, drift risk | |

**User's choice:** shared module.

### Q: Logger for stderr

| Option | Description | Selected |
|--------|-------------|----------|
| Tiny in-house logger | No new dep, structured JSON lines, `MCP_DEBUG` gate | ✓ |
| `pino` | Production-grade, adds dep | |
| Raw `console.error` + allowlist | Simplest but unstructured | |

**User's choice:** tiny in-house logger.

### Q: Biome `noConsole` scope

| Option | Description | Selected |
|--------|-------------|----------|
| `src/mcp/**` + `src/cli.ts` | Matches SC-4 'server paths' | ✓ |
| All `src/**` | Stricter, friction in ir/renderers | |
| Whole repo except tests | Strictest | |

**User's choice:** scoped to server paths.

---

## Server Wiring & Layout

### Q: `src/mcp/` file layout

| Option | Description | Selected |
|--------|-------------|----------|
| server.ts + tools/{name}.ts + log.ts + errors.ts | Scales to Phase 5 | ✓ |
| server.ts + tools.ts (one file) | Compact now, refactor later | |
| Flat inline in server.ts | Fastest, wasteful | |

**User's choice:** split tools into per-file modules.

### Q: `cli.ts` vs `server.ts` split

| Option | Description | Selected |
|--------|-------------|----------|
| cli.ts thin, server.ts does work | Testable in-process | ✓ |
| Everything in cli.ts | Harder to test | |

**User's choice:** thin cli.ts.

### Q: `resolveRoot` call site

| Option | Description | Selected |
|--------|-------------|----------|
| Per-tool with `projectRoot` arg | Multi-repo without restart | ✓ |
| Once at startup | Simpler, locked to one root | |
| Both (startup default + override) | Flexible, more code | |

**User's choice:** per-tool.

---

## Smoke Test Approach

### Q: spawn vs in-process

| Option | Description | Selected |
|--------|-------------|----------|
| Both tiers | In-process fast suite + spawned post-build smoke | ✓ |
| Spawn only | Closest to real use, slow | |
| In-process only | Fast, misses shebang/bin | |

**User's choice:** two-tier strategy.

### Q: Stderr noise injection

| Option | Description | Selected |
|--------|-------------|----------|
| Natural logger emissions | Logger fires on startup + per call | ✓ |
| Send rubbish to stdin | Forces SDK error logging | |
| Both | Thorough, more code | |

**User's choice:** natural logger emissions only.

### Q: SC-5 Claude Code verification

| Option | Description | Selected |
|--------|-------------|----------|
| Manual verification step | Tester adds config, pastes output into VERIFICATION.md | ✓ |
| Automated script driving `claude` CLI | Flaky | |
| MCP Inspector automation | Doesn't satisfy 'Claude Code' in SC-5 | |

**User's choice:** manual verification captured in VERIFICATION.md.

---

## Claude's Discretion

- Per-field `.describe()` wording.
- Tool `title`/`description` text.
- Module export shape (class vs plain object vs factory).
- Test helper factoring for `PassThrough` plumbing.
- Biome include-path syntax details.
- Logger timestamp format.

## Deferred Ideas

- Namespaced component identifiers (`Card.Header`).
- Automated Claude-Code-driving tests (Phase 6).
- Rubbish-input fuzz for stdout cleanliness.
- Structured JSON error payloads.
