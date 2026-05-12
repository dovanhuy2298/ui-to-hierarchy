# ui-hierarchy-mcp

[![npm version](https://img.shields.io/npm/v/ui-hierarchy-mcp.svg)](https://www.npmjs.com/package/ui-hierarchy-mcp)

MCP (Model Context Protocol) server that parses a Next.js App Router project and returns its UI component hierarchy as structured output (markdown tree + JSON), so AI coding agents can ground image/description-based UI edits in exact file/component locations.

When an AI agent cannot confidently act on a screenshot or vague description ("make the card next to the avatar wider"), it can call this MCP to get a precise, structured map of the live component tree — with file:line, layout hints, text content, and conditional branches — so the agent edits the right component in the right file instead of guessing.

## Status

V1 targets **Next.js App Router**. Static analysis only — no runtime execution, no DOM, no rendering.

**v1.1** adds one-command agent onboarding (`--init`) plus polish: `format: "markdown"` now surfaces analyzer warnings (no longer silently dropped), and resolved component nodes carry true source declaration line numbers instead of `line: 1`.

## Install

No install needed when used as an MCP server — clients spawn it via `npx`. To try the binary directly:

```bash
npx -y ui-hierarchy-mcp
```

(The server speaks JSON-RPC on stdio. Running it directly will sit idle waiting for an MCP client. Use [MCP Inspector](https://github.com/modelcontextprotocol/inspector) for interactive debugging.)

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

### MCP Inspector (interactive debugging)

```bash
npx @modelcontextprotocol/inspector npx -y ui-hierarchy-mcp
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

## Roadmap

V1 covers Next.js App Router. Internal architecture is pluggable so additional framework parsers (React Native, Vue, Svelte) can be added later without rewriting the core. Caching, watch mode, and HTTP transport are explicitly deferred.

## License

[MIT](./LICENSE) © huydv98
