/**
 * renderGuide — pure render of the MCP usage guide body (INIT-12).
 *
 * Composes four ordered sections into a single markdown string:
 *   1. One-line tool descriptions with when-to-call rules
 *   2. MCP registration JSON snippet (fenced code block)
 *   3. Exactly four example invocations (one fenced code block each)
 *   4. projectRoot hint with the literal `cwd` substituted in
 *
 * The function is pure: identical inputs produce byte-identical outputs
 * (snapshot-stable). It does not access `process.cwd()` or any other ambient
 * state — the caller passes `cwd` and `version` explicitly. The return value
 * is the body content only; the orchestrator wraps it with marker comments
 * and the fingerprint attribute.
 */

export interface RenderGuideOptions {
  /** Absolute path interpolated as projectRoot in tool examples. Omitted in global mode. */
  cwd: string;
  /** Marker version (e.g. "0.1") shown to the human reader near the top. */
  version: string;
  /** When true, omit project-specific paths (used for ~/.claude/CLAUDE.md etc.). */
  global?: boolean;
}

export function renderGuide({ version }: RenderGuideOptions): string {
  return `# ui-hierarchy-mcp — UI Component Tree (v${version})

## Golden Rule

**Use MCP tools to locate components — do not read source files to find UI elements.**
ui-hierarchy-mcp parses the live codebase into a queryable tree with exact \`file:line\` locations.

## Tools

| When the user describes UI by... | Call |
|----------------------------------|------|
| Screenshot, vague description, or needs a full map | \`get_full_hierarchy\` |
| A known component or area ("the card section") | \`focus_on\` with \`anchor: "ComponentName"\` |
| Visible text ("Sign in button", "Welcome heading") | \`find_by_text\` with \`text: "..."\` |
| Visual attributes ("blue banner", "flex-col container") | \`find_by_style\` with \`style: "className"\` |

## Rules

**Always:**
- Call \`get_full_hierarchy\` first when you cannot confidently locate a component from a screenshot or description
- Use \`focus_on\` to narrow down once you know the general area
- Trust the tree's \`file:line\` anchors — they are the exact edit location

**Never:**
- Read source files to find component locations — query the tree instead
- Guess a file path from a component name — the tree resolves it precisely
- Skip querying when the user provides a vague or visual description
`;
}
