# ui-hierarchy-mcp

[![npm version](https://img.shields.io/npm/v/ui-hierarchy-mcp.svg)](https://www.npmjs.com/package/ui-hierarchy-mcp)

MCP (Model Context Protocol) server that parses a Next.js App Router project and returns its UI component hierarchy as structured output (markdown tree + JSON), so AI coding agents can ground image/description-based UI edits in exact file/component locations.

When an AI agent cannot confidently act on a screenshot or vague description ("make the card next to the avatar wider"), it can call this MCP to get a precise, structured map of the live component tree — with file:line, layout hints, text content, and conditional branches — so the agent edits the right component in the right file instead of guessing.

## Status

Targets **Next.js App Router**. Static analysis only — no runtime execution, no DOM, no rendering.

## Requirements

- Node.js `>=20`
- An MCP-capable client (Claude Code, Claude Desktop, Cursor, or MCP Inspector)

## Run

No install step is needed when used as an MCP server — clients spawn the binary on demand via `npx`. The three common ways to run it:

### 1. Via an MCP client (normal usage)

Add the server to your client config (see [Use with an MCP client](#use-with-an-mcp-client) below). The client launches `npx -y ui-hierarchy-mcp` for you and speaks JSON-RPC over stdio.

### 2. Standalone for debugging

```bash
npx -y ui-hierarchy-mcp
```

The process speaks JSON-RPC on stdio, so it will sit idle waiting for a client. Useful only to confirm the binary downloads and launches; press `Ctrl+C` to exit.

### 3. Interactive UI (MCP Inspector)

```bash
npx @modelcontextprotocol/inspector npx -y ui-hierarchy-mcp
```

Opens a local web UI where you can list and invoke each tool against a real project — the fastest way to explore the output format without wiring up an AI client.

### Pointing at a project

Every tool accepts a `projectRoot` argument (absolute path). To set a default for all calls, export `UI_TO_HIERARCH_ROOT` before launching the client:

```bash
export UI_TO_HIERARCH_ROOT=/abs/path/to/your/nextjs/project
```

If neither is set, the server falls back to `process.cwd()` — usually the directory the MCP client was launched from.

## Use with an MCP client

### Claude Code / Claude Desktop

Add to `~/.claude.json` (or per-project `.mcp.json`):

```json
{
  "mcpServers": {
    "ui-hierarchy": {
      "command": "npx",
      "args": ["-y", "ui-hierarchy-mcp"]
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json` (or `.cursor/mcp.json` per project):

```json
{
  "mcpServers": {
    "ui-hierarchy": {
      "command": "npx",
      "args": ["-y", "ui-hierarchy-mcp"]
    }
  }
}
```

## Onboard your agent (`--init`)

Inject a usage guide for `ui-hierarchy-mcp` into your project's agent instruction files in one command:

```bash
npx -y ui-hierarchy-mcp --init
```

By default this writes a marker block into `CLAUDE.md` (created if absent) containing the four tool descriptions, a registration snippet, and example calls. Re-running the command is a no-op when the block is already current — safe to wire into CI or repo bootstrap scripts.

### Targets

Pick one or more agent instruction surfaces via `--target` (comma-separated):

| Target | File written |
|---|---|
| `claude` *(default)* | `CLAUDE.md` |
| `codex` | `AGENTS.md` |
| `cursor` | `.cursor/rules/ui-hierarchy-mcp.mdc` (with YAML frontmatter) |
| `copilot` | `.github/copilot-instructions.md` |

```bash
# Onboard all four agents at once
npx -y ui-hierarchy-mcp --init --target claude,codex,cursor,copilot
```

Missing parent directories are created automatically.

### Flags

- `--dry-run` — print a per-target plan (`would create` / `would update` / `would skip`) to stderr, write nothing.
- `--force` — overwrite the marker block even if it has been hand-edited (otherwise the target is skipped with a warning).

`--init` is fully argv-driven (no prompts) and safe in CI. Running `npx ui-hierarchy-mcp` without `--init` still starts the MCP stdio server unchanged.

## Tools

All tools accept an optional `projectRoot` (absolute path) — defaults to `UI_TO_HIERARCH_ROOT` env var, then `process.cwd()`.

| Tool | Purpose |
|---|---|
| `get_full_hierarchy` | Returns the ordered layout chain and page component subtree for a Next.js App Router route. |
| `focus_on` | Returns the component subtree rooted at a named JSX component, optionally including ancestors. |
| `find_by_text` | Finds component nodes whose rendered text content matches a query string. Returns nodes with `file:line` location. |
| `find_by_style` | Finds component nodes that use a given CSS class name or style prop. Returns nodes with `file:line` location. |

### Example — `get_full_hierarchy`

```json
{
  "route": "/dashboard/123",
  "format": "json",
  "projectRoot": "/abs/path/to/your/nextjs/project"
}
```

`route` must be a valid Next.js App Router path (start with `/`, no trailing slash except root). Dynamic segments like `[slug]`, `[...rest]`, `[[...optional]]` are supported.

### Example — `focus_on`

```json
{
  "component": "DashboardDetail",
  "scope": "full",
  "projectRoot": "/abs/path/to/your/nextjs/project"
}
```

`scope`: `"up"` (ancestors only), `"full"` (ancestors + subtree, default), or `"down"` (subtree only).

### Example — `find_by_text`

```json
{
  "query": "Sidebar slot",
  "projectRoot": "/abs/path/to/your/nextjs/project"
}
```

### Example — `find_by_style`

```json
{
  "class_or_prop": "grid-cols-3",
  "projectRoot": "/abs/path/to/your/nextjs/project"
}
```

## Tech

- TypeScript + `@modelcontextprotocol/sdk` v1.29
- `@babel/parser` + `@babel/traverse` for JSX/TSX AST analysis
- `get-tsconfig` for tsconfig path-alias resolution
- `tinyglobby` for file discovery
- ESM-only, Node `>=20`

## Development

Clone and work on the server itself:

```bash
git clone https://github.com/dovanhuy2298/ui-to-hierarchy.git
cd ui-to-hierarchy
pnpm install
```

Common scripts:

| Script | Purpose |
|---|---|
| `pnpm dev` | Run the CLI directly from TypeScript source (`tsx src/cli.ts`). Pass args after `--`, e.g. `pnpm dev -- --init --dry-run`. |
| `pnpm build` | Bundle to `dist/` via `tsup` (ESM, with shebang). |
| `pnpm test` | Run the full Vitest suite. |
| `pnpm test:watch` | Watch mode. |
| `pnpm test:smoke` | Spawn-the-binary smoke test against the MCP stdio contract. |
| `pnpm test:integration` | Integration suite against fixture Next.js projects. |
| `pnpm typecheck` | `tsc --noEmit`. |
| `pnpm lint` | `biome check .`. |

To test a local build against an MCP client, point its `command` at the built binary:

```json
{
  "mcpServers": {
    "ui-hierarchy": {
      "command": "node",
      "args": ["/abs/path/to/ui-to-hierarchy/dist/cli.js"]
    }
  }
}
```

## Roadmap

V1 covers Next.js App Router. Internal architecture is pluggable so additional framework parsers (React Native, Vue, Svelte) can be added later without rewriting the core. Caching, watch mode, and HTTP transport are explicitly deferred.

## License

[MIT](./LICENSE) © huydv98
