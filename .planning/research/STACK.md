# Stack Research

**Domain:** Node.js-based MCP server for static analysis of Next.js App Router (TypeScript/TSX) codebases
**Researched:** 2026-04-20
**Overall confidence:** HIGH for core stack (MCP SDK, Babel, zod, vitest), MEDIUM for module resolution (multiple viable options), HIGH for packaging

---

## TL;DR — Prescriptive Picks

| Concern | Pick | Version | Confidence |
|---|---|---|---|
| MCP SDK | `@modelcontextprotocol/sdk` | `^1.29.0` | HIGH |
| MCP Transport | `StdioServerTransport` (from SDK) | — | HIGH |
| Tool input schema | `zod` v4 | `^4.1.4` | HIGH |
| AST parser | `@babel/parser` | `^7.29.2` | HIGH |
| AST traversal | `@babel/traverse` + `@babel/types` | `^7.29.0` | HIGH |
| tsconfig reader | `get-tsconfig` | `^4.14.0` | HIGH |
| File globbing | `tinyglobby` | `^0.2.16` | MEDIUM |
| Language | TypeScript | `^5.20.1` | HIGH |
| Module system | ESM (`"type": "module"`) | — | HIGH |
| Runtime target | Node.js `>=20` (LTS) | — | HIGH |
| Bundler | `tsup` (dual ESM+CJS disabled — ESM only) | `^8.5.1` | HIGH |
| Test runner | `vitest` | `^4.3.6` | HIGH |
| Dev runner | `tsx` | `^4.21.0` | HIGH |

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|---|---|---|---|
| `@modelcontextprotocol/sdk` | `^1.29.0` | Official MCP server/client SDK for TypeScript | Only maintained MCP SDK for JS/TS. Ships `McpServer`, `StdioServerTransport`, and built-in Standard-Schema validation. `engines.node: ">=18"`. Dual ESM/CJS exports. Actively shipped (1.29.0 released 2026-03-30). |
| `@babel/parser` | `^7.29.2` | Parse TS/TSX/JSX source → AST | Already used by the prototype; best JSX/TSX tolerance; accepts malformed/WIP code (key for live user repos); first-class TS + JSX combo via plugins. |
| `@babel/traverse` | `^7.29.0` | Visitor-pattern AST walker | Standard companion to `@babel/parser`. The prototype already encodes our traversal semantics (imports, bindings, render-flow) against this API — porting is near-mechanical. |
| `@babel/types` | `^7.29.0` | AST node type guards + builders | Type-safe `t.isJSXElement(...)` replaces the prototype's `node.type === "JSXElement"` strings and unblocks strict TS. |
| `zod` | `^4.1.4` | Tool input schema / runtime validation | Standard Schema compatible → MCP SDK auto-derives JSON Schema for the wire protocol. Single source of truth for TS types + runtime validation. |
| `typescript` | `^5.20.1` | Language | Our own source language. Required: `moduleResolution: "bundler"` + `module: "ESNext"` for the server code. |

### MCP SDK — Concrete Usage Pattern

The SDK's `package.json` confirms (verified from npm registry): `engines: { node: ">=18" }`, dependency range `"zod": "^3.25 || ^4.0"`, and subpath exports including `./server` with both `./dist/esm/*` and `./dist/cjs/*` entry points.

Recommended entry shape:

```ts
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "ui-to-hierarch", version: "0.1.0" });

server.registerTool(
  "get_full_hierarchy",
  {
    title: "Get full component hierarchy for a route",
    description: "Returns layout chain → page → subtree for a given Next.js route",
    inputSchema: { route: z.string().describe("Route path, e.g. /dashboard") },
  },
  async ({ route }) => ({ content: [{ type: "text", text: /* md tree */ "" }] }),
);

await server.connect(new StdioServerTransport());
```

**Key SDK notes:**
- Import paths must include the `.js` extension — the SDK ships explicit subpath exports.
- `registerTool` (not the lower-level `setRequestHandler`) is the 2026 idiomatic API. It accepts a Standard-Schema-compatible validator (zod v4 works out of the box) and auto-generates the JSON Schema exposed to clients.
- stdio is the only v1 transport. Do **not** import HTTP/SSE transports — they add deps (express, hono, cors, rate-limit) that will bloat the `npx` install footprint. The SDK's runtime deps include these for HTTP support, but they tree-shake out of your bundle if you only import the stdio subpath.

### AST Parsing & Traversal

| Library | Version | Purpose | When to Use |
|---|---|---|---|
| `@babel/parser` | `^7.29.2` | Parse single file to AST | Every `.ts/.tsx/.js/.jsx` file we analyze. Use plugins `["jsx", "typescript"]` (as the prototype already does). |
| `@babel/traverse` | `^7.29.0` | Walk AST with visitor pattern | All traversals the prototype performs — collecting imports, bindings, render flows, JSX children. |
| `@babel/types` | `^7.29.0` | Type guards + assertions | Replace stringly-typed checks with `t.isJSXElement(node)` for type safety. |

**ESM interop gotcha (critical — the prototype already shows this):**
`@babel/traverse` is CJS-only; under native Node ESM `import traverse from "@babel/traverse"` lands the wrong binding. Use the defensive pattern:

```ts
import _traverse from "@babel/traverse";
// Handle both dual-module and direct-CJS import shapes
const traverse = (_traverse as unknown as { default: typeof _traverse }).default ?? _traverse;
```

This is a well-documented Babel issue that persists through 7.x. Same applies to `@babel/generator` if we ever need it.

### Module Resolution (tsconfig `paths`, relative imports, index files)

**Recommended: `get-tsconfig@^4.14.0`** — by privatenumber (author of `tsx`). Zero runtime deps beyond `resolve-pkg-maps`. Reads `tsconfig.json` including `extends` chains and returns a resolver for `paths`.

```ts
import { getTsconfig, createPathsMatcher } from "get-tsconfig";

const tsconfig = getTsconfig(projectRoot);
const matchPath = tsconfig ? createPathsMatcher(tsconfig) : null;
// matchPath("@/components/Card") → ["/abs/path/src/components/Card", ...]
```

Why not the alternatives:

| Alternative | Status | Why we don't pick it |
|---|---|---|
| `tsconfig-paths` | Maintained but legacy | Designed for runtime `require` hooks, not project static analysis. Heavier (bundles a loader). 2026 community consensus flags ESM compatibility pain. |
| `enhanced-resolve` | Webpack's resolver | Powerful but huge, multi-purpose, and designed around Webpack's callback-style async resolver. Overkill — we only need to resolve file-to-file inside the target project. |
| Raw `tsc` compiler API | — | Requires loading the whole TS compiler for a single `resolveModuleName` call. Slow startup, ~60 MB extra on disk, misaligned with our Babel-based pipeline. |
| Hand-rolled (prototype's `resolveAliasImport`) | Works | OK for v1, but forces users to pass `--alias` flags. Auto-reading their tsconfig is a strictly better UX and removes a footgun. |

The prototype's custom alias map works, but the MCP version should default to auto-detecting the target project's `tsconfig.json` via `get-tsconfig` and only fall back to explicit aliases if none is found.

### Packaging (npm CLI via `npx`)

| Concern | Pick | Notes |
|---|---|---|
| `package.json` `"type"` | `"module"` | ESM-first. MCP SDK supports both, but ESM gives us top-level await for `server.connect()` and cleaner imports. |
| `package.json` `"bin"` | `{ "ui-to-hierarch": "./dist/cli.js" }` | Single binary entry. Shebang `#!/usr/bin/env node` on line 1 of emitted `cli.js`. |
| `package.json` `"engines"` | `{ "node": ">=20" }` | Node 20 is LTS through April 2026 (maintenance through April 2027). Node 18 EOL April 2025. Node 22 is current LTS. Picking `>=20` gets us native `fetch`, stable `node:test`, `--import=tsx`, and aligns with MCP SDK floor (`>=18`) while being strict enough that we get modern APIs. |
| Bundler | `tsup@^8.5.1` | Zero-config esbuild wrapper. Handles shebang preservation, ESM output, `.d.ts` emission, external deps. |
| `tsup.config.ts` shape | `{ entry: ["src/cli.ts"], format: ["esm"], target: "node20", shims: false, clean: true, banner: { js: "#!/usr/bin/env node" }, external: ["@modelcontextprotocol/sdk"] }` | Mark MCP SDK + Babel packages as external so `npx` pulls them from npm (smaller install-time-cached tarball, easier debugging). |
| Publish chmod | Ensure executable bit on `dist/cli.js` | Either `"prepublishOnly": "chmod +x dist/cli.js"` (Unix-only) or `tsup` + `"files": ["dist"]` — npm preserves shebangs and generates `.cmd` shims on Windows automatically. |
| `npx` UX | `npx ui-to-hierarch` | Once published, MCP clients spawn via the stdio `command: "npx", args: ["-y", "ui-to-hierarch"]` pattern. |

**Output format: ESM only (do not dual-build).** The binary is only ever invoked by Node via `npx`; there are no library consumers importing us. Dual ESM+CJS doubles build output for no benefit.

### Testing

| Library | Version | Purpose |
|---|---|---|
| `vitest` | `^4.3.6` | Test runner, assertion, snapshots, coverage |
| `@vitest/coverage-v8` | match `vitest` | Coverage via V8 (native, fast) |

**Fixture + snapshot strategy for this project:**
- Create a `test/fixtures/` directory with minimal Next.js App Router project shapes (`app/layout.tsx`, `app/page.tsx`, client boundary cases, dynamic route, nested layouts).
- Use **file snapshots** (`toMatchFileSnapshot`) for the markdown tree output — easier to review diffs on the rendered tree than inline strings.
- Use **inline snapshots** (`toMatchInlineSnapshot`) for JSON output of small focused cases (single-component, single-branch).
- Drive tests by invoking the parser/builder directly (not by spawning the MCP server) — faster, deterministic, no stdio overhead. Keep a separate small suite that does spawn the binary with a stdio client to assert the MCP contract.

### Validation (MCP tool inputs)

**Pick: `zod@^4.1.4`.**

Confirmed via the MCP SDK 1.29.0 `package.json` dependencies: `"zod": "^3.25 || ^4.0"`. The SDK adopted Standard Schema in mid-2025, meaning any Standard-Schema-compatible library works — but `zod` is the de-facto norm in every MCP example in circulation, and the SDK's own test suite targets zod.

**Don't mix versions.** If any transitive dep pulls zod v3, `zod@^4.1` must win via `"overrides"` in package.json, because v4 is the Standard-Schema-native line.

Alternatives (valibot, ArkType) are viable per the Standard Schema contract, but give up the path-of-least-resistance: every published MCP tutorial assumes zod.

### Development Tools

| Tool | Version | Purpose | Notes |
|---|---|---|---|
| `tsx` | `^4.21.0` | Run TS source directly during dev | `tsx src/cli.ts` for iteration. Reads the project's tsconfig paths natively. |
| `@modelcontextprotocol/inspector` | `^0.21.2` | Interactive MCP debugging UI | Spawn our server: `npx @modelcontextprotocol/inspector node dist/cli.js`. Inspects tool calls, responses, stderr. Essential during tool-design iteration. |
| `@biomejs/biome` or `eslint@^9` + `@typescript-eslint` | latest | Lint + format | Biome is faster and single-tool; either is fine. Prototype has no linting, so a greenfield choice. |
| `tinyglobby` | `^0.2.16` | File globbing | Drop-in replacement for `fast-glob` with ~10x smaller install. Replaces the prototype's `Bun.Glob`. |
| `fs-extra` | *not recommended* | — | Use node:fs/promises; fs-extra's JSON helpers aren't worth the dep. |

---

## Installation

```bash
# Core runtime deps
npm install @modelcontextprotocol/sdk zod \
            @babel/parser @babel/traverse @babel/types \
            get-tsconfig tinyglobby

# Dev deps
npm install -D typescript tsx tsup vitest @vitest/coverage-v8 \
               @modelcontextprotocol/inspector \
               @types/node @types/babel__traverse \
               @biomejs/biome
```

**`@types/babel__traverse`** is separate from the runtime package (the Babel project ships types out of tree for traverse) — don't forget it.

---

## `package.json` skeleton (verified fields)

```json
{
  "name": "ui-to-hierarch",
  "version": "0.1.0",
  "type": "module",
  "bin": { "ui-to-hierarch": "./dist/cli.js" },
  "files": ["dist"],
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "inspect": "npx @modelcontextprotocol/inspector node dist/cli.js",
    "prepublishOnly": "npm run build && npm test"
  }
}
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|---|---|---|
| `@babel/parser` | `@swc/core` | If raw parse throughput becomes a real bottleneck (thousands of files per query). SWC is 3–5x faster. Tradeoff: smaller API surface, less forgiving of partial/incorrect user code, and the traversal API (`@swc/visitor`) is less mature than Babel's. For v1 (parse-on-demand, no cache), parse speed is not the bottleneck — resolution + tree-walking is. |
| `@babel/parser` | `oxc-parser` | Fastest parser available (3x SWC, per Oxc benchmarks). Use if SWC's speed still isn't enough and you're willing to own more brittle AST-walking code. Oxc's AST deviates from ESTree and the JS-side bindings are thinner. Not recommended for v1. |
| `@babel/parser` | `ts-morph` | Use if we needed full type-aware analysis (symbol resolution, "what does this generic resolve to?"). We don't — we're doing syntactic JSX walking. ts-morph loads the full TS compiler (~60MB cold start), which is orthogonal to our needs. |
| `@babel/parser` | TypeScript Compiler API directly | Same reason as ts-morph — heavy, and the API is notoriously awkward. |
| `get-tsconfig` | `tsconfig-paths` | If we ever need a runtime `require`-hook-style resolver (we don't — this is static analysis). |
| `get-tsconfig` | `enhanced-resolve` | If we needed to replicate webpack/bundler semantics across `exports`, `imports`, conditions, etc. Overkill for resolving imports inside a single user project. |
| `tsup` | `unbuild` / raw `esbuild` | `unbuild` is fine; `tsup` wins on zero-config shebang preservation and dual-format flexibility. Raw esbuild requires ~30 lines of config for the same result. |
| `vitest` | `node:test` | Native test runner is leaner (no deps) and ships with Node 20. Lacks snapshot ergonomics, and our tree-output testing leans heavily on snapshots. Revisit for v2 if we want zero-dep tests. |
| `zod` v4 | `valibot`, `arktype` | Valid Standard-Schema options. Valibot is smaller bundle; ArkType has the best type inference. Only switch if bundle size on the server becomes a concern (it won't — we're a CLI, not a browser app). |
| stdio transport | Streamable HTTP transport | V1 is stdio-only per PROJECT.md. HTTP makes sense only if we later host the server remotely. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|---|---|---|
| `@modelcontextprotocol/sdk` pre-1.0 (`^0.x`) | Pre-1.0 had a different API (`Server` class, manual `setRequestHandler`, no `registerTool`, no Standard Schema). Any tutorial using `Server` from `server/index.js` is outdated. | `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`, version `^1.29.0`. |
| `@babel/core` (just for parsing) | Heavy — pulls the whole transform pipeline, plugins, presets. We're not transforming, only reading. | `@babel/parser` + `@babel/traverse` + `@babel/types` directly, nothing else. |
| HTTP / SSE transports in v1 | Out of scope (PROJECT.md), and importing them pulls `express`, `hono`, `cors`, `express-rate-limit` into the dependency tree of every `npx` install. | `StdioServerTransport` only. |
| `zod` v3 (`^3.x` alone) | MCP SDK peer range is `^3.25 || ^4.0`, so v3.25+ works, but v4 is Standard-Schema-native and is where new features land. Pinning v3 wastes the migration headroom the SDK just paid for. | `zod@^4.1`. |
| `ts-node` | Effectively abandoned for ESM/modern TS; ships broken ESM loaders. | `tsx` for running TS directly. |
| `tsc` as the bundler | Doesn't emit shebangs, doesn't bundle deps, won't produce a single-file `dist/cli.js`. Fine for emitting `.d.ts`, but not for the CLI artifact. | `tsup` for the CLI output; `tsc --emitDeclarationOnly` alongside if a types-only consumer ever matters (unlikely). |
| `fast-glob` | Heavier install (~160 files, multiple deps). | `tinyglobby` — same API surface for the 95% case, tiny footprint. |
| Bun (for the published package) | Prototype runs on Bun. MCP clients spawn Node subprocesses; requiring Bun on end-user machines is a non-starter for zero-friction `npx`. | Node 20+. Keep Bun only as a local dev accelerator if desired — never in the shipped path. |
| Parse caching / watch mode in v1 | Explicitly out of scope. Will bring correctness bugs (stale trees) faster than it brings perf wins. | Parse-on-demand, as in the prototype. Revisit when a real perf SLA exists. |
| `import traverse from "@babel/traverse"` (naive ESM) | Known CJS/ESM interop footgun — `traverse` will be an object, not a function, depending on the interop shim. Prototype already hits this (see line 6). | Defensive `(traverse as any).default ?? traverse` shim, or `createRequire` to load it as CJS explicitly. |

---

## Version Compatibility

| Package A | Compatible With | Notes |
|---|---|---|
| `@modelcontextprotocol/sdk@1.29.0` | `zod@^3.25 \|\| ^4.0` | Verified from npm registry metadata. Prefer `zod@^4.1`. |
| `@modelcontextprotocol/sdk@1.29.0` | `node >=18` | Engines field. We raise our own floor to `>=20` for our CLI. |
| `@babel/parser@7.29` | `@babel/traverse@7.29` / `@babel/types@7.29` | Keep all three on the same 7.x minor to avoid subtle AST shape drift. |
| `vitest@4.3` | `node >=18.17` | Node 20+ recommended for stable coverage v8 integration. |
| `tsup@8.5` | `node >=18.14` | Shebang banner support stable. |
| `zod@4.1` | Standard Schema `1.x` | Direct native implementation; MCP SDK consumes via Standard Schema. |
| `get-tsconfig@4.14` | All Node 18+ | Zero runtime deps beyond `resolve-pkg-maps`. |

---

## Stack Patterns by Variant

**If we later add the HTTP transport (v2):**
- Add `StreamableHTTPServerTransport` from the same SDK, `/server/streamableHttp.js`.
- The SDK already pulls `hono` + `express` as runtime deps — no new install, but bundle externals need updating.

**If user projects are massive (10k+ files) and parse-on-demand becomes too slow:**
- Introduce a file-content hash cache (not an AST cache — hashes are cheap, ASTs are memory-heavy).
- Only then consider swapping `@babel/parser` for `@swc/core` on the hot path.

**If we need type-level info (symbol resolution, "what does `typeof x` mean?"):**
- Add `ts-morph` alongside Babel — use Babel for JSX structure, ts-morph only for type questions.
- Not required for v1 (we're matching on syntax + textual className/style signals only).

---

## Sources

- [npm registry: `@modelcontextprotocol/sdk@1.29.0`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — HIGH: verified `engines.node >=18`, zod peer range `^3.25 || ^4.0`, dual ESM/CJS exports, stdio subpath at `./dist/esm/server/stdio.js`.
- [MCP TypeScript SDK GitHub — server docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) — HIGH: `McpServer` + `registerTool` + `StdioServerTransport` is the current canonical pattern.
- [MCP TypeScript SDK Releases](https://github.com/modelcontextprotocol/typescript-sdk/releases) — HIGH: 1.29.0 latest stable (2026-03-30), Standard Schema support since mid-2025.
- [MCP SDK v1.17.5 Incompatible with Zod v4 — Issue #1429](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1429) — HIGH: Confirms the v3→v4 migration landed and why `zod@^4` is now the right choice.
- [Babel traverse ESM interop — Issue #13855](https://github.com/babel/babel/issues/13855) — HIGH: Confirms the `traverse.default` vs `traverse` interop bug the prototype already works around.
- [Babel ESM default interop — Issue #15269](https://github.com/babel/babel/issues/15269) — HIGH: Same class of issue applies to `@babel/generator`.
- [OXC Benchmarks — oxc.rs](https://oxc.rs/docs/guide/benchmarks) — HIGH: Oxc 3x faster than SWC; not picked for v1 on ecosystem-maturity grounds.
- [SWC Benchmarks — swc.rs](https://swc.rs/docs/benchmarks) — HIGH: SWC 3–5x Babel parse throughput; not the bottleneck for us in v1.
- [Vitest Snapshot Guide](https://vitest.dev/guide/snapshot) — HIGH: `toMatchFileSnapshot` / `toMatchInlineSnapshot` API for tree output testing.
- [tsconfig-paths vs module-alias vs pathsify 2026 — PkgPulse](https://www.pkgpulse.com/blog/tsconfig-paths-vs-module-alias-vs-pathsify-typescript-path-aliases-2026) — MEDIUM: confirms tsconfig-paths is legacy-oriented; static-analysis consumers should read tsconfig and resolve themselves.
- [npm registry: `get-tsconfig`](https://www.npmjs.com/package/get-tsconfig) — HIGH: by `privatenumber` (tsx author), 4.14.0, one runtime dep (`resolve-pkg-maps`).
- [npm registry: `tsup`](https://www.npmjs.com/package/tsup) — HIGH: 8.5.1, shebang banner + ESM target stable.
- [Mixing shebang and esbuild plugin — tsup Issue #684](https://github.com/egoist/tsup/issues/684) — MEDIUM: known pitfall; use `banner.js` rather than source-level shebang to avoid esbuild-plugin interactions.
- [Node.js Release Schedule](https://nodejs.org/en/about/previous-releases) — HIGH: Node 18 EOL April 2025, Node 20 maintenance through April 2027, Node 22 current LTS. Justifies `engines.node: ">=20"`.
- Existing prototype `generate-component-hierarchy.ts` (`E:\ui-to-hierarch\generate-component-hierarchy.ts`) — HIGH: Ground truth for the Babel + traverse + alias-resolution pipeline shape we are porting.

---
*Stack research for: MCP server for Next.js App Router component-hierarchy extraction*
*Researched: 2026-04-20*
