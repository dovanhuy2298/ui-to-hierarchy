# Phase 7: init-file-writer — Pattern Map

**Mapped:** 2026-05-11
**Files analyzed:** 17 new/modified files
**Analogs found:** 14 / 17

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/cli.ts` (modify) | CLI entry / dispatcher | request-response | `src/cli.ts` itself | exact (in-place edit) |
| `src/global.d.ts` (modify) | config / ambient types | — | `src/global.d.ts` itself | exact (additive) |
| `tsup.config.ts` (modify) | config / build | — | `tsup.config.ts` itself | exact (additive) |
| `vitest.config.ts` (modify) | config / test | — | `vitest.config.ts` itself | exact (additive) |
| `src/init/index.ts` | orchestrator / service | request-response | `src/mcp/server.ts` | role-match |
| `src/init/argv.ts` | utility / validation | request-response | `src/mcp/errors.ts` | partial (validation pattern) |
| `src/init/targets.ts` | registry / config | — | `src/adapters/types.ts` | partial (type-registry pattern) |
| `src/init/markers.ts` | utility / transform | transform | `src/renderers/markdown.ts` | partial (pure-transform pattern) |
| `src/init/fingerprint.ts` | utility / transform | transform | `src/core/paths.ts` | role-match (pure-function utility) |
| `src/init/eol.ts` | utility / transform | transform | `src/core/paths.ts` | role-match (pure-function utility) |
| `src/init/writer.ts` | utility / file-I/O | file-I/O | `src/mcp/log.ts` | partial (stderr + side-effect pattern) |
| `src/init/template.ts` | utility / transform | transform | `src/renderers/markdown.ts` | role-match (pure render function) |
| `test/init/argv.test.ts` | test | — | `test/mcp/errors.test.ts` | exact (unit test pattern) |
| `test/init/markers.test.ts` | test | — | `test/core/paths.test.ts` | exact (pure-function unit test) |
| `test/init/fingerprint.test.ts` | test | — | `test/core/paths.test.ts` | exact (pure-function unit test) |
| `test/init/eol.test.ts` | test | — | `test/core/paths.test.ts` | exact (pure-function unit test) |
| `test/init/writer.test.ts` | test | file-I/O | `test/mcp/log.test.ts` | role-match (spy + side-effect test) |
| `test/init/template.test.ts` | test | — | `test/renderers/markdown.test.ts` | exact (snapshot test) |
| `test/init/integration.test.ts` | test / integration | file-I/O | `test/mcp/smoke.spawn.test.ts` | role-match (lifecycle + setup/teardown) |

---

## Pattern Assignments

### `src/cli.ts` (modify — dispatch fork)

**Analog:** `src/cli.ts` (current file, in-place modification)

**Current state** (lines 1–11):
```typescript
import { log } from "./mcp/log.js";
import { startServer } from "./mcp/server.js";

// Note: shebang (#!/usr/bin/env node) is injected by tsup banner — do NOT add it here.

startServer().catch((err: unknown) => {
  log.error("server error", {
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
```

**Target shape** — insert `parseArgs` dispatch above the existing `startServer()` call. The catch block pattern for MCP errors is already proven; init errors get their own catch that writes `[init]`-prefixed lines:

```typescript
import { parseArgs } from 'node:util';
import { log } from "./mcp/log.js";
import { startServer } from "./mcp/server.js";
import { runInit } from "./init/index.js";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'init':    { type: 'boolean' },
    'target':  { type: 'string' },
    'dry-run': { type: 'boolean' },
    'force':   { type: 'boolean' },
    'help':    { type: 'boolean', short: 'h' },
    'version': { type: 'boolean', short: 'v' },
  },
  strict: true,
  allowPositionals: false,
});

if (values.help)    { process.stderr.write(HELP_TEXT); process.exit(0); }
if (values.version) { process.stderr.write(`${__TOOL_VERSION__}\n`); process.exit(0); }

if (values.init) {
  runInit(values).then((code) => process.exit(code)).catch((err) => {
    process.stderr.write(`[init] error ${String(err)}\n`);
    process.exit(1);
  });
} else {
  // Preserve existing v1.0 path byte-for-byte (INIT-02)
  startServer().catch((err: unknown) => {
    log.error("server error", {
      message: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
```

**Key rules:**
- The MCP `.catch` block (lines 6-10 of original) MUST remain verbatim in the `else` branch.
- `parseArgs` is the only new import at the top of `cli.ts`.
- `runInit` and `argv.ts` validation live in `src/init/` — `cli.ts` only dispatches.

---

### `src/global.d.ts` (modify — additive)

**Analog:** `src/global.d.ts` (lines 1–5)

**Current state:**
```typescript
/**
 * Build-time constant injected by tsup `define` in tsup.config.ts.
 * Replaced with the package.json version string at bundle time.
 */
declare const __TOOL_VERSION__: string;
```

**Additive pattern** — copy the exact JSDoc + `declare const` form:
```typescript
/**
 * Build-time constant injected by tsup `define` in tsup.config.ts.
 * Replaced with the major.minor string (e.g. "0.1") at bundle time.
 */
declare const __INIT_MARKER_VERSION__: string;
```

---

### `tsup.config.ts` (modify — additive)

**Analog:** `tsup.config.ts` lines 26–28

**Existing `define` block** (lines 26-28):
```typescript
  define: {
    __TOOL_VERSION__: JSON.stringify(pkg.version),
  },
```

**Add alongside existing entry:**
```typescript
  define: {
    __TOOL_VERSION__: JSON.stringify(pkg.version),
    __INIT_MARKER_VERSION__: JSON.stringify(
      pkg.version.split('.').slice(0, 2).join('.')
    ),
  },
```

---

### `vitest.config.ts` (modify — additive)

**Analog:** `vitest.config.ts` lines 3–7

**Existing `define` block** (lines 4-6):
```typescript
  define: {
    __TOOL_VERSION__: JSON.stringify("0.0.0-test"),
  },
```

**Add alongside — use a fixed test value, never a computed value:**
```typescript
  define: {
    __TOOL_VERSION__: JSON.stringify("0.0.0-test"),
    __INIT_MARKER_VERSION__: JSON.stringify("0.0-test"),
  },
```

---

### `src/init/index.ts` (orchestrator / service)

**Analog:** `src/mcp/server.ts` — top-level async function called from `cli.ts`, returns a promise, writes to stderr, calls sub-modules.

**Import pattern** — ESM `.js` extensions on all local imports, `node:` prefix on all stdlib:
```typescript
import { join } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { parseTargetFlags } from './argv.js';
import { TARGETS, DEFAULT_TARGETS } from './targets.js';
import { scanBlock, appendBlock, replaceBlock } from './markers.js';
import { computeFingerprint, verifyFingerprint } from './fingerprint.js';
import { detectEol, detectBom, applyEolBom } from './eol.js';
import { writeAtomic } from './writer.js';
import { renderGuide } from './template.js';
```

**Function signature** — accepts the raw `values` object from `parseArgs` + optional cwd for testability (Open Question A4/A5 resolved here):
```typescript
export async function runInit(
  flags: ParsedInitFlags,
  { cwd = process.cwd() }: { cwd?: string } = {}
): Promise<number>  // returns exit code
```

**Stderr output pattern** — copy from `src/mcp/log.ts` line 21: use `process.stderr.write` exclusively, never `console.log`:
```typescript
process.stderr.write(`[init] ${action} ${relativePath}\n`);
```

**Exit code pattern** — collect per-target outcomes, compute once at the end (do not call `process.exit` inside `runInit`; let `cli.ts` handle that):
```typescript
const outcomes: Array<'create' | 'update' | 'noop' | 'skip'> = [];
// ... per-target loop ...
return outcomes.every(o => o !== 'skip') ? 0 : 1;
```

---

### `src/init/argv.ts` (utility / validation)

**Analog:** `src/mcp/errors.ts` — pure functions, no side effects, no class, named exports only.

**Import pattern** (no external deps, stdlib only):
```typescript
import { parseArgs } from 'node:util';
```

**Validation pattern** — copy the discriminated-union return style from `src/mcp/errors.ts`:
```typescript
export type ParseArgsResult =
  | { ok: true; flags: InitFlags }
  | { ok: false; message: string };

export function parseInitArgs(argv: string[]): ParseArgsResult {
  try {
    const { values } = parseArgs({ args: argv, options: { ... }, strict: true, allowPositionals: false });
    // secondary enum check for --target
    const rawTargets = values.target?.split(',') ?? DEFAULT_TARGETS_IDS;
    const invalid = rawTargets.filter(t => !VALID_TARGET_IDS.includes(t));
    if (invalid.length > 0) {
      return { ok: false, message: `Unknown target(s): ${invalid.join(', ')}. Valid: ${VALID_TARGET_IDS.join(', ')}` };
    }
    return { ok: true, flags: { ... } };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
```

**Type definition pattern** — copy PascalCase interface from `src/adapters/types.ts` (no `I`-prefix, no `type` alias for object shapes with stable fields):
```typescript
export interface InitFlags {
  targets: TargetId[];
  dryRun: boolean;
  force: boolean;
}
```

---

### `src/init/targets.ts` (registry / config)

**Analog:** `src/adapters/types.ts` — pure type definitions + exported constants. No imports from `src/core/`, `src/ir/`, or `src/renderers/`. Island convention.

**Pattern:**
```typescript
export type TargetId = 'claude' | 'codex' | 'cursor' | 'copilot';

export interface TargetSpec {
  id: TargetId;
  relativePath: string;
  hasFrontmatter: boolean;
}

export const TARGETS: TargetSpec[] = [
  { id: 'claude',  relativePath: 'CLAUDE.md',                            hasFrontmatter: false },
  { id: 'codex',   relativePath: 'AGENTS.md',                            hasFrontmatter: false },
  { id: 'cursor',  relativePath: '.cursor/rules/ui-hierarchy-mcp.mdc',   hasFrontmatter: true  },
  { id: 'copilot', relativePath: '.github/copilot-instructions.md',      hasFrontmatter: false },
];

export const DEFAULT_TARGET_IDS: TargetId[] = ['claude'];
export const VALID_TARGET_IDS: TargetId[] = TARGETS.map(t => t.id);
```

---

### `src/init/markers.ts` (utility / transform)

**Analog:** `src/core/paths.ts` — small pure-function module: exported constants + named pure functions, zero side effects, no filesystem access.

**Import pattern:**
```typescript
// No imports needed — operates on strings only
```

**Constants pattern** (prefer exported constants over inline regex for test-import clarity, per D-Claude's Discretion):
```typescript
declare const __INIT_MARKER_VERSION__: string;

export const MARKER_START_PREFIX = '<!-- ui-hierarchy-mcp:start';
export const MARKER_END = '<!-- ui-hierarchy-mcp:end -->';

// Captures: [1]=version [2]=fingerprint [3]=body
export const BLOCK_PATTERN =
  /<!-- ui-hierarchy-mcp:start version=(\S+) fingerprint=([0-9a-f]{64}) -->([\s\S]*?)<!-- ui-hierarchy-mcp:end -->/;
```

**Return type pattern** — discriminated union (copy from `src/adapters/types.ts`):
```typescript
export type BlockScanResult =
  | { found: true; version: string; fingerprint: string; body: string;
      fullMatch: string; startIndex: number; endIndex: number }
  | { found: false };
```

**Pure function pattern** (copy from `src/core/paths.ts` style):
```typescript
export function scanBlock(content: string): BlockScanResult { ... }
export function replaceBlock(content: string, newBlock: string, scan: BlockScanResult & { found: true }): string {
  return content.slice(0, scan.startIndex) + newBlock + content.slice(scan.endIndex);
}
export function appendBlock(existing: string, newBlock: string): string {
  return existing.trimEnd() + '\n\n' + newBlock;
}
```

---

### `src/init/fingerprint.ts` (utility / transform)

**Analog:** `src/core/paths.ts` — single-responsibility pure-function file, 2 exports, no imports except stdlib.

**Pattern:**
```typescript
import { createHash } from 'node:crypto';

export function computeFingerprint(body: string): string {
  const normalized = body.replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function verifyFingerprint(body: string, expected: string): boolean {
  return computeFingerprint(body) === expected;
}
```

---

### `src/init/eol.ts` (utility / transform)

**Analog:** `src/core/paths.ts` — pure utility, no imports except types.

**Pattern:**
```typescript
export type Eol = 'LF' | 'CRLF';

export function detectBom(buf: Buffer): boolean {
  return buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
}

export function detectEol(content: string): Eol {
  return content.includes('\r\n') ? 'CRLF' : 'LF';
}

export function applyEolBom(content: string, eol: Eol, hasBom: boolean): string {
  const lf = content.replace(/\r\n/g, '\n');                        // normalize first
  const converted = eol === 'CRLF' ? lf.replace(/\n/g, '\r\n') : lf;  // then convert
  return hasBom ? '﻿' + converted : converted;
}
```

---

### `src/init/writer.ts` (utility / file-I/O)

**Analog:** `src/mcp/log.ts` — small module with side effects, `process.stderr.write`, no class, exports a single function or object.

**Stderr write pattern** (copy from `src/mcp/log.ts` line 21):
```typescript
process.stderr.write(`${entry}\n`);
```

**File-I/O pattern** — atomic write using stdlib only:
```typescript
import { writeFile, rename, copyFile, unlink, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

export async function writeAtomic(targetPath: string, content: string): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  const tmpPath = join(
    dirname(targetPath),
    `.tmp-${process.pid}-${randomBytes(4).toString('hex')}`
  );
  try {
    await writeFile(tmpPath, content, 'utf8');
    try {
      await rename(tmpPath, targetPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
        await copyFile(tmpPath, targetPath);
        await unlink(tmpPath);
      } else {
        await unlink(tmpPath).catch(() => {});
        throw err;
      }
    }
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    throw err;
  }
}
```

**Dry-run variant** — no-op with same signature:
```typescript
export async function writeAtomicDryRun(targetPath: string, _content: string): Promise<void> {
  // Intentionally writes nothing — dry-run mode
}
```

---

### `src/init/template.ts` (utility / transform)

**Analog:** `src/renderers/markdown.ts` — pure render function, takes typed args, returns a string, no side effects, no file I/O.

**Import pattern** — none required (template literal only):
```typescript
declare const __INIT_MARKER_VERSION__: string;

export interface RenderGuideOptions {
  cwd: string;
  version: string;
}

export function renderGuide({ cwd, version }: RenderGuideOptions): string {
  return `...template body...`;
}
```

The function returns the body content only (text between markers). The orchestrator in `src/init/index.ts` wraps the body with markers and the fingerprint attribute.

---

## Test Pattern Assignments

### `test/init/argv.test.ts`

**Analog:** `test/mcp/errors.test.ts`

**Import pattern** (lines 1–6 of errors.test.ts):
```typescript
import { describe, expect, it } from "vitest";
import { parseInitArgs } from "../../src/init/argv.js";
```

**Test structure** — `describe` blocks per function, `it` per behavior, no `beforeEach`/`afterEach` needed (pure function):
```typescript
describe("parseInitArgs — unknown target rejection", () => {
  it("returns ok:false for unknown target", () => {
    const result = parseInitArgs(['--init', '--target', 'foo']);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; message: string }).message).toContain('foo');
  });
});
```

---

### `test/init/markers.test.ts`, `test/init/fingerprint.test.ts`, `test/init/eol.test.ts`

**Analog:** `test/core/paths.test.ts`

**Import pattern** (lines 1–2 of paths.test.ts):
```typescript
import { describe, it, expect } from "vitest";
import { computeFingerprint, verifyFingerprint } from "../../src/init/fingerprint.js";
```

**Test structure** — `describe` per exported function, `it` per behavior; no lifecycle hooks; pure assertions only. Pattern from `test/core/paths.test.ts`:
```typescript
describe("computeFingerprint", () => {
  it("returns 64-char lowercase hex", () => {
    const fp = computeFingerprint("hello");
    expect(fp).toHaveLength(64);
    expect(fp).toMatch(/^[0-9a-f]+$/);
  });
  it("is stable across LF/CRLF variants of same content", () => {
    expect(computeFingerprint("line\nend")).toBe(computeFingerprint("line\r\nend"));
  });
});
```

---

### `test/init/writer.test.ts`

**Analog:** `test/mcp/log.test.ts`

**Import pattern** (lines 1–2 of log.test.ts):
```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeAtomic } from "../../src/init/writer.js";
```

**Spy pattern for side effects** (lines 7–9 of log.test.ts):
```typescript
beforeEach(() => {
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});
afterEach(() => { stderrSpy.mockRestore(); });
```

**Temp-dir pattern for file I/O** — no analog in the current test suite (RESEARCH.md Pattern 7); use `mkdtemp` + `rm` lifecycle:
```typescript
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tmpDir: string;
beforeEach(async () => { tmpDir = await mkdtemp(join(tmpdir(), 'writer-test-')); });
afterEach(async () => { await rm(tmpDir, { recursive: true, force: true }); });
```

---

### `test/init/template.test.ts`

**Analog:** `test/renderers/markdown.test.ts`

**Snapshot pattern** (lines 14–18 of markdown.test.ts):
```typescript
it("matches snapshot for rendered guide", async () => {
  const out = renderGuide({ cwd: '/test/project', version: '0.1' });
  await expect(out).toMatchFileSnapshot('./__snapshots__/template-guide.md');
});
```

**Substring assertions pattern** (lines 22–43 of markdown.test.ts) — assert required substrings before committing a snapshot:
```typescript
it("guide payload contains all 4 tool names and required sections", () => {
  const out = renderGuide({ cwd: '/test/project', version: '0.1' });
  for (const name of ['get_full_hierarchy', 'focus_on', 'find_by_text', 'find_by_style']) {
    expect(out, `missing tool: ${name}`).toContain(name);
  }
  expect(out).toContain('"npx", "-y", "ui-hierarchy-mcp"');
  expect(out).toContain('/test/project');
});
```

---

### `test/init/integration.test.ts`

**Analog:** `test/mcp/smoke.spawn.test.ts` — `beforeAll`/`afterAll` lifecycle with shared test state. For init, use `beforeEach`/`afterEach` with fresh `tmpDir` per test instead:

**Import pattern** (lines 1–8 of smoke.spawn.test.ts):
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInit } from "../../src/init/index.js";
```

**Lifecycle pattern** — `mkdtemp` in `beforeEach`, `rm` in `afterEach` (no shared process):
```typescript
let tmpDir: string;
beforeEach(async () => { tmpDir = await mkdtemp(join(tmpdir(), 'init-int-')); });
afterEach(async () => { await rm(tmpDir, { recursive: true, force: true }); });
```

**Test structure** — one `it` per INIT requirement AC, keyed by ID in the test name:
```typescript
it("INIT-01: creates CLAUDE.md with both markers; exit 0; stdout empty", async () => {
  const code = await runInit({ targets: ['claude'], dryRun: false, force: false }, { cwd: tmpDir });
  expect(code).toBe(0);
  const content = await readFile(join(tmpDir, 'CLAUDE.md'), 'utf8');
  expect(content).toContain('<!-- ui-hierarchy-mcp:start');
  expect(content).toContain('<!-- ui-hierarchy-mcp:end -->');
});
```

---

## Shared Patterns

### Stderr-only output (applies to all `src/init/` files that emit output)

**Source:** `src/mcp/log.ts` lines 12–22

The codebase's stdout invariant is absolute: `process.stderr.write` for everything, never `console.log` or `console.error`. The existing `log.ts` module demonstrates this — every write goes through the same primitive.

```typescript
// COPY: the only output primitive allowed in src/init/
process.stderr.write(`[init] ${action} ${relativePath}\n`);

// NEVER in init code:
// console.log(...)     — writes to stdout
// console.error(...)   — writes to stderr but bypasses the format contract
```

### ESM import style (applies to all new files)

**Source:** all existing `src/` files

Every local import uses the `.js` extension (ESM rule). Every Node.js stdlib import uses the `node:` prefix. No `require()`. No `__dirname`.

```typescript
// CORRECT — copy this pattern
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { scanBlock } from './markers.js';

// WRONG
import { join } from 'path';         // missing node: prefix
import { scanBlock } from './markers'; // missing .js extension
const x = require('./markers');       // CommonJS
```

### `declare const` for build-time globals (applies to `src/init/markers.ts`, `src/init/template.ts`, any module using `__INIT_MARKER_VERSION__`)

**Source:** `src/global.d.ts` lines 1–5

Any module that references `__INIT_MARKER_VERSION__` must rely on the ambient declaration in `src/global.d.ts`. Do NOT redeclare per-file — the global declaration covers all source files.

```typescript
// In src/global.d.ts (additive):
declare const __INIT_MARKER_VERSION__: string;

// In consuming modules (src/init/markers.ts etc.) — no redeclaration needed,
// just use the identifier directly. TypeScript will resolve it via global.d.ts.
```

### Error handling pattern (applies to `src/init/index.ts` and `src/init/writer.ts`)

**Source:** `src/mcp/errors.ts` lines 25–35 + `src/cli.ts` lines 6–10

Per-operation errors are caught locally; error messages use `err instanceof Error ? err.message : String(err)` to safely coerce unknown `catch` values:

```typescript
// Shared coercion pattern — copy verbatim
const message = err instanceof Error ? err.message : String(err);
```

The orchestrator should never let an uncaught promise escape — `cli.ts` has a `.catch` wrapper, but `runInit` itself should handle per-target errors internally and surface them as `skip` outcomes rather than re-throwing.

### Pure-function module structure (applies to `src/init/markers.ts`, `fingerprint.ts`, `eol.ts`, `template.ts`)

**Source:** `src/core/paths.ts` (entire file)

Small pure-function utility modules follow this shape:
1. Only `node:` stdlib imports (or none at all)
2. Exported type aliases or interfaces first
3. Exported functions, no default exports
4. No class instances, no module-level state
5. Each function < 20 lines

```typescript
// Pattern from src/core/paths.ts:
import path from "node:path";

export function toForwardSlash(p: string): string {
  return p.split(path.sep).join("/").replaceAll("\\", "/");
}

export function relFromRoot(absFile: string, absRoot: string): string {
  return toForwardSlash(path.relative(absRoot, absFile));
}
```

### Type definition style (applies to `src/init/targets.ts`, `src/init/argv.ts`, `src/init/markers.ts`)

**Source:** `src/adapters/types.ts` lines 35–42

- Interfaces for shapes with stable fields (`interface`, not `type`)
- `type` aliases for discriminated unions and string literal unions
- PascalCase, no `I`-prefix
- JSDoc comment above each exported type

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `test/init/integration.test.ts` (temp-dir lifecycle variant) | integration test | file-I/O | No existing test uses `mkdtemp`/`rm` lifecycle — smoke test uses a long-lived spawned process instead. RESEARCH.md Pattern 7 provides the pattern. |

---

## Metadata

**Analog search scope:** `src/`, `test/`, `tsup.config.ts`, `vitest.config.ts`, `src/global.d.ts`
**Files scanned (Read):** 14
**Files searched (Glob):** 2
**Pattern extraction date:** 2026-05-11
