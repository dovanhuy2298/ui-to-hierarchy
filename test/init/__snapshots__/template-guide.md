# ui-hierarchy-mcp — UI Component Tree (v0.1)

## Golden Rule

**Use MCP tools to locate components — do not read source files to find UI elements.**
ui-hierarchy-mcp parses the live codebase into a queryable tree with exact `file:line` locations.
**projectRoot for this checkout:** `/test/project`

## Tools

| When the user describes UI by... | Call |
|----------------------------------|------|
| Screenshot, vague description, or needs a full map | `get_full_hierarchy({projectRoot: "/test/project"})` |
| A known component or area ("the card section") | `focus_on({..., anchor: "ComponentName"})` |
| Visible text ("Sign in button", "Welcome heading") | `find_by_text({..., text: "text"})` |
| Visual attributes ("blue banner", "flex-col container") | `find_by_style({..., style: "className"})` |

## Rules

**Always:**
- Call `get_full_hierarchy` first when you cannot confidently locate a component from a screenshot or description
- Use `focus_on` to narrow down once you know the general area
- Trust the tree's `file:line` anchors — they are the exact edit location

**Never:**
- Read source files to find component locations — query the tree instead
- Guess a file path from a component name — the tree resolves it precisely
- Skip querying when the user provides a vague or visual description
