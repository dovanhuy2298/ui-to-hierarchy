# Feature Research — v1.1 `--init` Agent Onboarding

**Domain:** CLI `--init` subcommand that injects MCP usage guidance into agent instruction files
**Researched:** 2026-05-11
**Confidence:** HIGH for behavioral patterns (multiple reference CLIs cross-verified); MEDIUM for multi-target content question (ecosystem is still converging)

---

## Reference Implementations Studied

Five CLIs with agent-file injection or init behaviors, used as evidence throughout this document:

| CLI                                         | What it does                                                                                                                                                  | Pattern                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npx shadcn@latest init` (CLI v4, Mar 2026) | Scaffolds config + injects component registry into project. Added `--dry-run`, `--diff`, `--view` in 2026. Prompts before overwrite.                          | Interactive-first; flags to suppress; no marker blocks (single owned file)                                              |
| `jcodemunch-mcp init`                       | One-command onboarding: auto-detects installed MCP clients, writes MCP config entries, injects policy into `.cursorrules` / `.windsurfrules`, installs hooks. | Idempotent, backup-aware, `--dry-run`, `--demo` (dry-run with narrative). Marker-based block injection for rules files. |
| `npx skills` (vercel-labs)                  | Package manager for SKILL.md-based agent skills. Writes skill directories into per-agent skills paths.                                                        | Append-to-directory model; no file mutation; re-run is idempotent (same directory, same file).                          |
| `ruflo/claude-flow init`                    | Creates CLAUDE.md from template. `--force` required to overwrite existing file — otherwise errors. No marker blocks.                                          | Fail-on-conflict pattern; no idempotency beyond "don't create if exists".                                               |
| Anthropic Claude Code `mcp add`             | Writes MCP server entry to `~/.claude.json` / `.mcp.json`. Idempotent by server name key.                                                                     | JSON-key idempotency; no agent-guide injection.                                                                         |

**Key insight from reference survey:** The `jcodemunch-mcp init` pattern is the closest analogue to what we are building and provides the strongest signal for behavior design. It is the only one in the survey that performs idempotent, marker-delimited content injection into an existing prose instruction file (vs. creating or overwriting it).

---

## Feature Landscape

### Table Stakes (Must Have for v1.1)

Features that developers expect from any CLI that injects into agent files. Missing these makes the command feel dangerous or one-shot-only.

| ID    | Feature                                                         | Why Expected (Evidence)                                                                                                                                                                                                                                                                                                                                                                                              | Complexity | Notes                                                                                                                                                                                                                   |
| ----- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| TS-01 | **Marker-delimited block injection**                            | Users have existing CLAUDE.md with project rules. The `--init` must not destroy that content. jcodemunch-mcp uses marker tags (`<!-- jcodemunch:start --> ... <!-- jcodemunch:end -->`). The deployhq/agentrulegen/sotaaz guides all assume additive injection into existing files. Without markers, every re-run risks losing user edits.                                                                           | S          | Use HTML comment markers: `<!-- ui-hierarchy-mcp:start -->` ... `<!-- ui-hierarchy-mcp:end -->`. These are invisible in rendered Markdown, survive copy-paste, and do not affect agent parsing of the surrounding file. |
| TS-02 | **Idempotent re-run**                                           | Re-running `--init` on a project that already has the block should detect the existing markers and replace only the block content (not the whole file). jcodemunch-mcp implements this. shadcn `--yes` mode re-runs without damage. The AGENTS.md ecosystem convention is "non-destructive, safe to re-run". If re-run is not idempotent, users cannot update their guide when the MCP ships new tool documentation. | S          | Algorithm: read file → find marker block → replace block if found, append if not found → write. If markers not found and file exists, append.                                                                           |
| TS-03 | **Default target: CLAUDE.md**                                   | Claude Code is the dominant stdio MCP client (it is the agent most likely to call our MCP). CLAUDE.md is the file Claude Code reads. Running `--init` with no flags should write to `CLAUDE.md` in cwd. All surveyed tools default to the most common agent's native format.                                                                                                                                         | XS         | Write to `./CLAUDE.md` by default. Create if missing. Append/replace block if existing.                                                                                                                                 |
| TS-04 | **Injected guide content: tool list with when-to-call rules**   | The Anthropic SKILL.md spec, jcodemunch-mcp AGENT_HOOKS.md, and vercel-labs SKILL.md all have a "when to use this skill" section as the critical trigger mechanism. Without it, agents will call the MCP randomly or not at all. For our 4 tools this means concrete sentences like "call `get_full_hierarchy` when the user references a route path, a page, or asks where a UI element lives in the Next.js app".  | S          | See Injected Guide Content section below for full template.                                                                                                                                                             |
| TS-05 | **Injected guide content: MCP server registration block**       | Users cannot call our tools unless the MCP server is registered. The guide must include the `mcpServers` JSON snippet (npx invocation) or a reference to the README install section. Every MCP server README surveyed (github-mcp-server, jcodemunch-mcp, agent-browser) includes the registration snippet.                                                                                                          | XS         | Include the `claude mcp add` command or the JSON snippet.                                                                                                                                                               |
| TS-06 | **Injected guide content: example invocations for all 4 tools** | jcodemunch-mcp SKILL.md, agent-browser SKILL.md, and the vercel skills find-skills SKILL.md all include concrete example calls with realistic parameter values. Without examples, agents hallucinate parameter names.                                                                                                                                                                                                | S          | One realistic example per tool: `get_full_hierarchy` with a route string, `focus_on` with scope, `find_by_text` with a UI-description query, `find_by_style` with a Tailwind class.                                     |
| TS-07 | **`--target` flag for additional agent files**                  | The ecosystem has fragmented into at least 5 instruction files (CLAUDE.md, AGENTS.md, .cursor/rules/\*.mdc, .github/copilot-instructions.md, GEMINI.md). Tools like `add-mcp` and `jcodemunch-mcp` support multi-target writes. The PROJECT.md explicitly calls out `--target claude,codex,cursor,copilot`. Users on teams with mixed clients expect to configure all targets in one command.                        | M          | Supported targets for v1.1: `claude` (CLAUDE.md), `codex` (AGENTS.md), `cursor` (.cursor/rules/ui-hierarchy.mdc), `copilot` (.github/copilot-instructions.md). Default: `claude` only.                                  |
| TS-08 | **Success + diff summary in stdout**                            | shadcn CLI v4 added `--diff` for transparency. jcodemunch-mcp prints "Had this NOT been a demo, I would have: [actions]". Users need to confirm what was written, especially for multi-target runs. Without this, `--init` feels like a black box.                                                                                                                                                                   | XS         | Print: for each file written — `[target] path/to/file — [created                                                                                                                                                        | updated] block (N lines added)`. |
| TS-09 | **Non-interactive by default (no prompts)**                     | MCP servers are often initialized via scripts or CI setup steps. shadcn added `-y/--yes` default. jcodemunch-mcp skips prompts when `--hooks` is provided. If `--init` requires interactive confirmation, it fails in non-TTY environments.                                                                                                                                                                          | XS         | Default: write without prompting. Reserve prompts for destructive cases (e.g., `--target` writes to a file that has no existing markers and is larger than N bytes, indicating significant existing content).           |

### Differentiators (Recommend for v1.1)

Features that raise the experience above a bare file-write.

| ID   | Feature                                                 | Value Proposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Complexity | Notes                                                                                                                                                                     |
| ---- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | **`--dry-run` flag**                                    | shadcn CLI v4 explicitly shipped `--dry-run` as a first-class feature (2026). jcodemunch-mcp's `--dry-run` and `--demo` flags are prominent in its docs. The AGENTS.md ecosystem guide lists `--dry-run` as a hallmark of "agent-friendly CLIs". Developers running `--init` for the first time in a project with a carefully maintained CLAUDE.md will want to preview changes before committing. **Recommendation: include in v1.1.** Without `--dry-run`, the first run of `--init` on any project with an existing instruction file requires the user to trust the tool blindly. The cost is LOW (print-only mode on the same codepath). | S          | Print diff-style output: `+++ CLAUDE.md` with `+` lines for added content, no write. Exit 0 if would succeed, exit 1 if would error.                                      |
| D-02 | **Auto-detect installed agents and suggest targets**    | jcodemunch-mcp and `add-mcp` both "find every agent on the machine" by scanning the filesystem (e.g., checking if `.cursor/` exists, if `~/.claude/` exists). This removes the need for users to know the `--target` flag syntax. If Cursor is installed, suggest adding `--target cursor`.                                                                                                                                                                                                                                                                                                                                                  | M          | Heuristic checks: does `~/.cursor/` or `.cursor/` exist? Does `.github/` exist (copilot)? Report suggestions but don't act without explicit flag. Avoids unwanted writes. |
| D-03 | **Versioned block with update detection**               | Embed a version comment inside the marker block: `<!-- ui-hierarchy-mcp:version:1.1.0 -->`. On re-run, if the embedded version matches the current CLI version, skip write and print "Already up to date." If version is older, update and print "Updated from 1.0.0 to 1.1.0."                                                                                                                                                                                                                                                                                                                                                              | S          | Prevents unnecessary file dirtying in git working trees.                                                                                                                  |
| D-04 | **`projectRoot` hint in injected guide**                | The MCP's `projectRoot` parameter is the most common source of user error. The injected guide should include a project-specific resolved value: "for this project, pass `projectRoot: /abs/path/to/project`." The `--init` CLI already runs from the project root; it can write the absolute path into the template.                                                                                                                                                                                                                                                                                                                         | XS         | Resolve `process.cwd()` at init time and embed it as a comment in the example invocations.                                                                                |
| D-05 | **`--output` flag to print injected content to stdout** | Useful for piping into other tools, reviewing in CI, or pasting manually. Composability is a hallmark of good CLI design.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | XS         | `npx ui-hierarchy-mcp --init --output` prints the block to stdout without writing any files.                                                                              |

### Anti-Features (Skip for v1.1 and Beyond)

| ID   | Anti-Feature                                                                | Why It Seems Good                                                                        | Why to Skip                                                                                                                                                                                                                                                                                                                                                                                                                                    | Alternative                                                                                                                                  |
| ---- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| A-01 | **Interactive wizard / questionnaire**                                      | Feels guided for new users. ESLint `--init` uses this pattern.                           | Our injection is not configurable — there is one MCP server with four fixed tools. A wizard that asks "which tools do you want to document?" has no good answer other than "all of them". Adds complexity, breaks non-TTY environments, and adds zero value over the default.                                                                                                                                                                  | Default non-interactive behavior.                                                                                                            |
| A-02 | **Backup files (CLAUDE.md.bak)**                                            | jcodemunch-mcp claims "backup-aware". Sounds safe.                                       | Backup files in repos create commit noise, confuse `.gitignore` maintenance, and are never cleaned up. The marker-block pattern (TS-01) already makes the operation non-destructive — the user's content outside the markers is never touched. Backups are belt-and-suspenders that add filesystem mess.                                                                                                                                       | Marker-delimited injection is the correct safety mechanism.                                                                                  |
| A-03 | **Tailored content per target (different guide text for cursor vs claude)** | Different agents have different capabilities; maybe Cursor needs different instructions. | The 4 tools are standard MCP tools callable from any agent. The usage guide (when to call, parameters, examples) is identical across agents. The only difference is the file format/location, not the content. Maintaining N versions of the same guide is a maintenance burden with no user benefit. The deployhq/sotaaz/agentrulegen community consensus is "90%+ of content is identical across formats — only format and location differ". | Same content block written to all targets. The marker syntax is the same HTML comment; it renders invisibly in all agents' Markdown readers. |
| A-04 | **Writing to `~/.claude/CLAUDE.md` (global scope) by default**              | Installs guide once, works in all projects.                                              | Silently modifying global agent config without the user explicitly opting in is a footgun. The guide includes a project-specific `projectRoot` hint (D-04) that would be wrong in every other project. Global writes are the pattern that creates "why is my agent doing X in all my projects?" bug reports.                                                                                                                                   | Default to project-local `./CLAUDE.md`. Document global install as `--global` opt-in only, defer to v1.2.                                    |
| A-05 | **Auto-registering the MCP server in `.mcp.json` / `~/.claude.json`**       | One command does everything.                                                             | MCP server registration involves path/env choices that vary by machine. Writing to `~/.claude.json` without confirmation is dangerous. The scope of `--init` is "inject usage guide into instruction files", not "configure the MCP client". The README already covers registration. Conflating the two violates single responsibility and makes `--init` risky.                                                                               | Inject a "how to register" snippet into the guide. Leave the actual registration to the user or to `claude mcp add`.                         |
| A-06 | **Watching for instruction file changes and auto-updating**                 | Keeps guide fresh as MCP updates.                                                        | Requires a background process, which is incompatible with the stdio MCP server model and `npx` invocation. Users don't expect a one-shot CLI to leave background processes.                                                                                                                                                                                                                                                                    | Re-run `--init` after version upgrades. Version detection (D-03) makes this fast.                                                            |
| A-07 | **Markdown comment visibility toggle (inline vs. hidden markers)**          | Some users want visible section headers in their instruction files.                      | The HTML comment syntax is universally invisible in rendered Markdown and does not affect agent parsing. Offering a "visible marker" option adds surface area for zero benefit.                                                                                                                                                                                                                                                                | HTML comments are the correct marker format.                                                                                                 |

---

## Injected Guide Content

What goes inside the marker block. This is the core value of `--init`.

### Content Sections (all required)

```
<!-- ui-hierarchy-mcp:start -->
<!-- ui-hierarchy-mcp:version:1.1.0 -->

## ui-hierarchy-mcp — UI Component Hierarchy

This project uses the `ui-hierarchy-mcp` MCP server to navigate the Next.js
App Router component tree. Use these tools when the user references a UI
element by description, screenshot, route, or component name.

### Install (if not already registered)

\`\`\`bash
claude mcp add ui-hierarchy -- npx -y ui-hierarchy-mcp
\`\`\`

Or add to `.mcp.json`:
\`\`\`json
{
  "mcpServers": {
    "ui-hierarchy": { "command": "npx", "args": ["-y", "ui-hierarchy-mcp"] }
  }
}
\`\`\`

### When to Call

- `get_full_hierarchy` — when the user references a route, page, or wants to see the component tree for a URL (e.g., "/dashboard", "/products/[id]").
- `focus_on` — when the user names a specific component and you need its context (ancestors + subtree) without the full app tree.
- `find_by_text` — when the user describes UI by visible text (e.g., "the 'Sign in' button", "the Welcome banner").
- `find_by_style` — when the user describes UI by visual style (e.g., "the rounded card", "the flex row with gap-4").

### Example Calls

get_full_hierarchy: { "route": "/dashboard", "projectRoot": "<cwd>" }
focus_on: { "component": "Sidebar", "scope": "full", "projectRoot": "<cwd>" }
find_by_text: { "query": "Sign in", "projectRoot": "<cwd>" }
find_by_style: { "class_or_prop": "rounded-2xl", "projectRoot": "<cwd>" }

All tools accept `format: "markdown"` (default, LLM-friendly) or `format: "json"` (structured).
projectRoot defaults to the UI_TO_HIERARCH_ROOT env var or process.cwd() of the MCP process.

<!-- ui-hierarchy-mcp:end -->
```

**Section rationale:**

- Registration snippet: table stakes — agent cannot call tools that are not registered
- When-to-call rules: the trigger text is what makes the Anthropic SKILL.md spec work (level-1 metadata for discovery)
- Example calls: prevents hallucinated parameter names; one per tool is sufficient
- `projectRoot` note: the single most common user error; a hint in the guide prevents a support question

### Content that does NOT go in the guide

- Full tool JSON schemas (already on the wire protocol; agent sees them via `list_tools`)
- Explanation of how Babel AST parsing works (internal implementation detail)
- Links to changelog (ages quickly, clutters the guide)
- Security warnings (belongs in README, not in agent instructions)

---

## Feature Dependencies

```
TS-01 (marker injection) ──required by──> TS-02 (idempotency)
TS-02 (idempotency)      ──required by──> TS-03 (default target), TS-07 (multi-target)
TS-04 + TS-05 + TS-06    ──compose──>     Injected block content (must all be present for guide to be useful)
TS-07 (--target flag)    ──requires──>    TS-01, TS-02 (same injection logic, multiple paths)
D-01 (--dry-run)         ──depends on──>  TS-01+TS-02 (same codepath, print-only mode)
D-03 (version detection) ──enhances──>    TS-02 (makes idempotency visible/auditable)
D-04 (projectRoot hint)  ──enhances──>    TS-06 (example invocations become project-specific)
```

### Dependency Notes

- **TS-01 is the foundational primitive**: all other behaviors (idempotency, multi-target, dry-run) are built on top of the marker-block read/replace/append algorithm. Ship this first, test thoroughly.
- **TS-04 + TS-05 + TS-06 are all-or-nothing**: a guide with tool names but no examples, or examples but no registration snippet, is worse than no guide (it misleads the agent). All three content sections must ship together.
- **D-01 (`--dry-run`) is a cheap add-on to TS-01's codepath**: the file-write is the only difference. Implement it in the same pass as TS-01 at zero additional design cost.
- **D-02 (auto-detect agents) is independent** of the injection logic and can be added later without touching TS-01–TS-03.

---

## MVP Definition — v1.1 Launch

### Launch With (v1.1)

These are non-negotiable for the `--init` command to be trustworthy and usable:

- [ ] TS-01 Marker-delimited block injection — safety foundation
- [ ] TS-02 Idempotent re-run (detect markers, replace block only) — required for upgrade story
- [ ] TS-03 Default target: CLAUDE.md — covers the primary user
- [ ] TS-04 Injected guide: when-to-call rules for all 4 tools — core value
- [ ] TS-05 Injected guide: MCP registration snippet — agents can't call unregistered tools
- [ ] TS-06 Injected guide: one example per tool — prevents parameter hallucination
- [ ] TS-07 `--target` flag (claude, codex, cursor, copilot) — multi-client teams
- [ ] TS-08 Stdout summary of what was written — transparency
- [ ] TS-09 Non-interactive by default — script/CI safe
- [ ] D-01 `--dry-run` flag — low-cost, high-trust; include in v1.1

### Add After Validation (v1.2)

These add polish but the command works without them:

- [ ] D-02 Auto-detect installed agents — reduces need to know `--target` syntax; add when users ask "why didn't it write to Cursor?"
- [ ] D-03 Versioned block with update detection — add once users start upgrading from v1.1 to v1.2
- [ ] D-04 `projectRoot` hint in injected examples — low effort; include in v1.1 if `--init` already resolves cwd (it will)
- [ ] D-05 `--output` flag — add when a user asks to pipe the content somewhere

**Note:** D-04 is listed under v1.2 for planning conservatism but is nearly free to implement alongside TS-06. The roadmap builder should treat it as a v1.1 add-on.

### Future Consideration (v2+)

- [ ] `--global` flag to write to `~/.claude/CLAUDE.md` — needs clear UX for the projectRoot problem
- [ ] Watch mode / auto-update on MCP version change — incompatible with stdio model; revisit if MCP gets a persistent daemon
- [ ] Skill-format output (`SKILL.md` + YAML frontmatter) for Claude Code's skill system — requires separate discovery mechanism; valuable but out of scope for this milestone

---

## Feature Prioritization Matrix

| ID    | Feature                       | User Value | Implementation Cost | Priority               |
| ----- | ----------------------------- | ---------- | ------------------- | ---------------------- |
| TS-01 | Marker injection              | HIGH       | S                   | P1                     |
| TS-02 | Idempotent re-run             | HIGH       | S                   | P1                     |
| TS-03 | Default to CLAUDE.md          | HIGH       | XS                  | P1                     |
| TS-04 | When-to-call guide content    | HIGH       | S                   | P1                     |
| TS-05 | Registration snippet in guide | HIGH       | XS                  | P1                     |
| TS-06 | Example invocations in guide  | HIGH       | S                   | P1                     |
| TS-07 | `--target` multi-file flag    | HIGH       | M                   | P1                     |
| TS-08 | Stdout write summary          | MEDIUM     | XS                  | P1                     |
| TS-09 | Non-interactive default       | HIGH       | XS                  | P1                     |
| D-01  | `--dry-run`                   | HIGH       | S                   | P1                     |
| D-04  | projectRoot in examples       | MEDIUM     | XS                  | P1 (bundle with TS-06) |
| D-02  | Auto-detect agents            | MEDIUM     | M                   | P2                     |
| D-03  | Versioned block               | MEDIUM     | S                   | P2                     |
| D-05  | `--output` stdout             | LOW        | XS                  | P3                     |

**Priority key:** P1 = v1.1 launch | P2 = v1.2 | P3 = nice-to-have

---

## Answered Design Questions

### Q1: `--dry-run` — table stakes or differentiator?

**Decisive answer: Differentiator, but include in v1.1.**

It is not table stakes in the sense that users will accept the command without it — a non-destructive marker-block approach (TS-01) means `--init` is already safe to run without preview. However, the cost of adding `--dry-run` on top of the same codepath is a single boolean flag check before the file-write call. The value is high (developers with carefully maintained instruction files will reach for it immediately) and the cost is near-zero. The shadcn CLI v4 and jcodemunch-mcp both treated `--dry-run` as worth shipping. Do not defer it.

### Q2: Per-target tailored content or identical content?

**Decisive answer: Identical content, different file paths.**

The 4 MCP tools have the same name, same parameters, and same semantics regardless of which agent calls them. The registration JSON snippet is the same structure across all targets. The when-to-call rules are not agent-specific. The community consensus (deployhq, sotaaz, agentrulegen guides all agree) is that 90%+ of content is identical across CLAUDE.md, AGENTS.md, .cursorrules, and copilot-instructions.md. The only differences are:

- File path (handled by `--target` routing)
- File format for Cursor (`.mdc` frontmatter wrapper instead of plain Markdown)

The Cursor `.mdc` format requires a YAML frontmatter block (`description:`, `globs:`, `alwaysApply:`). That is a formatting difference, not a content difference. The guide text itself stays identical. Ship one content template, render it with a format adapter per target.

### Q3: Behavior on existing files?

**Prevailing pattern (from jcodemunch-mcp, AGENTS.md ecosystem):**

1. File does not exist → create it, write block inside markers
2. File exists, markers present → replace block content between markers, preserve everything outside
3. File exists, no markers, file is small (< 500 bytes) → append block at end with blank line separator
4. File exists, no markers, file is large → print warning, append at end, print "Review your instruction file to relocate the block if needed"

Do NOT fail or prompt in case 3 or 4. Appending is always safe; the user can move the block. Failing silently or requiring a `--force` flag (ruflo/claude-flow pattern) is the wrong default because it leaves the user with nothing written.

---

## Competitor / Comparable Tool Analysis

| Capability                      | ruflo/claude-flow init  | jcodemunch-mcp init         | npx skills           | shadcn init         | **ui-hierarchy --init (us)**         |
| ------------------------------- | ----------------------- | --------------------------- | -------------------- | ------------------- | ------------------------------------ |
| Marker-delimited injection      | No (whole-file own)     | Yes                         | N/A (dir)            | No (whole-file own) | **Yes**                              |
| Idempotent re-run               | No (errors on conflict) | Yes                         | Yes (dir)            | Partial (--yes)     | **Yes**                              |
| `--dry-run`                     | No                      | Yes                         | N/A                  | Yes (v4, 2026)      | **Yes**                              |
| Multi-target (AGENTS.md etc.)   | No                      | Yes (rules files)           | Yes (per-agent dirs) | No                  | **Yes (`--target`)**                 |
| Non-interactive default         | Yes                     | Yes                         | Yes                  | Yes (`-y` default)  | **Yes**                              |
| Agent-specific tailored content | N/A                     | No (same policy, diff path) | No (same SKILL.md)   | N/A                 | **No (correct answer)**              |
| Backup files                    | No                      | Claims "backup-aware"       | No                   | No                  | **No (markers make it unnecessary)** |

---

## Sources

- [shadcn CLI v4 changelog (March 2026)](https://ui.shadcn.com/docs/changelog/2026-03-cli-v4) — `--dry-run`, `--diff`, `--view` flags added; HIGH confidence
- [shadcn init overwrite behavior — GitHub Issue #2030](https://github.com/shadcn-ui/ui/issues/2030) — confirms interactive-by-default on conflict; MEDIUM
- [jcodemunch-mcp AGENT_HOOKS.md](https://github.com/jgravelle/jcodemunch-mcp/blob/main/AGENT_HOOKS.md) — marker injection, idempotent, backup-aware, `--dry-run`, `--demo`; HIGH (closest analogue)
- [add-mcp by Neon — blog post](https://neon.com/blog/add-mcp) — multi-target agent detection, 9 supported clients; HIGH
- [Anthropic Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) — SKILL.md format, YAML frontmatter, when-to-use trigger mechanism; HIGH
- [MCP Build with Agent Skills](https://modelcontextprotocol.io/docs/develop/build-with-agent-skills) — SKILL.md + references/ pattern for MCP servers; HIGH
- [vercel-labs/skills agent-browser SKILL.md](https://github.com/vercel-labs/agent-browser/blob/main/skills/agent-browser/SKILL.md) — example invocation pattern in skill files; MEDIUM
- [ruflo/claude-flow Init Commands](https://github.com/ruvnet/ruflo/wiki/Init-Commands) — `--force` pattern, no idempotency; HIGH (shows anti-pattern to avoid)
- [CLAUDE.md, AGENTS.md & Copilot Instructions guide — deployhq](https://www.deployhq.com/blog/ai-coding-config-files-guide) — shared content, different file paths; MEDIUM
- [Cursor Rules vs CLAUDE.md vs Copilot Instructions — agentrulegen](https://www.agentrulegen.com/guides/cursorrules-vs-claude-md) — 90%+ content identical across formats; MEDIUM
- [AGENTS.md format — OpenAI Codex docs](https://developers.openai.com/codex/guides/agents-md) — hierarchical discovery, what Codex reads; HIGH
- [Build your own /init command like Claude Code — kau.sh](https://kau.sh/blog/build-ai-init-command/) — update-or-create pattern, codebase scanning for context; MEDIUM
- [Nobody Reads Your Setup Docs — hanzilla.co](https://hanzilla.co/blog/mcp-onboarding-ten-agents-one-command/) — auto-detect installed agents by filesystem scan; MEDIUM
- [AGENTS.md ecosystem — agents.md](https://agents.md/) — universal standard, Markdown format, heading-based; HIGH

---

_Feature research for: ui-to-hierarchyMCP v1.1 `--init` agent onboarding subcommand_
_Researched: 2026-05-11_
