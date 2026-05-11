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
  /** Absolute path interpolated as a literal string into the projectRoot hint. */
  cwd: string;
  /** Marker version (e.g. "0.1") shown to the human reader near the top. */
  version: string;
}

export function renderGuide({ cwd, version }: RenderGuideOptions): string {
  return `# ui-hierarchy-mcp guide v${version}

This block is managed by \`ui-hierarchy-mcp --init\`. Hand-edits inside the
markers are detected via a SHA-256 fingerprint and surface as a skipped
update on subsequent \`--init\` runs (pass \`--force\` to overwrite).

## Tools

- **get_full_hierarchy** — Return the complete UI component tree for the
  project rooted at \`projectRoot\`. Call this first when you need a map of
  the whole app before planning an edit from a screenshot or vague
  description. Output is a markdown tree plus a JSON envelope keyed by
  file:line so you can locate any node precisely.
- **focus_on** — Return the subtree rooted at a specific component, file,
  or file:line anchor. Call this when you already know which area of the
  app the user is referring to (e.g. "the card next to the avatar") and
  you want a smaller, more focused tree to reason about.
- **find_by_text** — Locate components rendering a given text snippet
  (button label, heading, copy). Call this when the user references the
  UI by what they read on screen rather than by component name.
- **find_by_style** — Locate components matching a className or inline
  style substring. Call this when the user describes the UI by visual
  attributes (color, layout class, spacing) instead of by content.

## MCP registration

Add this to your MCP client's server config:

\`\`\`json
{
  "mcpServers": {
    "ui-hierarchy-mcp": {
      "command": ["npx", "-y", "ui-hierarchy-mcp"]
    }
  }
}
\`\`\`

## Example invocations

Get the full hierarchy for the current project:

\`\`\`json
{
  "tool": "get_full_hierarchy",
  "arguments": {
    "projectRoot": "${cwd}"
  }
}
\`\`\`

Focus on a specific component or file anchor:

\`\`\`json
{
  "tool": "focus_on",
  "arguments": {
    "projectRoot": "${cwd}",
    "anchor": "app/page.tsx:Card"
  }
}
\`\`\`

Find components by visible text:

\`\`\`json
{
  "tool": "find_by_text",
  "arguments": {
    "projectRoot": "${cwd}",
    "text": "Sign in"
  }
}
\`\`\`

Find components by className or inline style:

\`\`\`json
{
  "tool": "find_by_style",
  "arguments": {
    "projectRoot": "${cwd}",
    "style": "flex flex-col"
  }
}
\`\`\`

## projectRoot

When invoking any of the four tools above, pass the literal absolute path
to this project's root as \`projectRoot\`. For this checkout the value is:

    ${cwd}

If you run the agent from a different working directory, substitute the
correct absolute path — \`ui-hierarchy-mcp\` does not infer the root from
the calling agent's cwd.
`;
}
