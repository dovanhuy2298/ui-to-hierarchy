import { parseArgs } from "node:util";

import { log } from "./mcp/log.js";
import { startServer } from "./mcp/server.js";
import { runInit } from "./init/index.js";
import { parseInitArgs, INIT_OPTION_SCHEMA } from "./init/argv.js";
import { VALID_FRAMEWORKS } from "./adapters/select.js";

// Note: shebang (#!/usr/bin/env node) is injected by tsup banner — do NOT add it here.

const HELP_TEXT = `Usage: npx ui-hierarchy-mcp [--init [--global] [--target <list>] [--dry-run] [--force]]

  (no args)            Start the MCP stdio server (default).
  --framework <name>   Force adapter selection. Valid values: nextjs, expo-router.
                       Skips auto-detection; use when the project root is ambiguous.
  --init               Write usage rules into agent config files.
    --global           Write to global config (~/.claude/CLAUDE.md, ~/.codex/AGENTS.md).
                       Default: write to ./CLAUDE.md in the current project.
    --target <list>    Comma-separated subset of: claude, codex, cursor, copilot
                       (default: claude). Ignored when --global is set.
    --dry-run          Print planned actions to stderr without touching disk.
    --force            Overwrite a hand-edited marker block instead of skipping it.
  -h, --help           Print this help text and exit.
  -v, --version        Print the tool version and exit.

Docs: https://www.npmjs.com/package/ui-hierarchy-mcp
`;

// Short-circuit on --help / --version BEFORE the strict --init validation so
// `--help` works even alongside (e.g.) an unknown flag. parseArgs here runs
// with `strict: false` for that reason — parseInitArgs below re-parses with
// strict mode to validate the full argv when the user did not ask for help.
const { values: meta } = parseArgs({
  args: process.argv.slice(2),
  options: INIT_OPTION_SCHEMA,
  strict: false,
  allowPositionals: true,
});

if (meta.help) {
  // --help / --version output is the explicit successful product of these
  // short-circuit paths, not a diagnostic — POSIX convention puts it on
  // stdout. The MCP stdio framing concern (INIT-11) does not apply here
  // because the server never starts on these branches (WR-04).
  process.stdout.write(HELP_TEXT);
  process.exit(0);
}
if (meta.version) {
  process.stdout.write(`${__TOOL_VERSION__}\n`);
  process.exit(0);
}

// Only validate argv with the strict init schema when --init was requested.
// Otherwise we'd reject any future server-mode flag / positional with a
// misleading "[init] error ..." even when the user never asked for init
// (WR-01).
if (meta.init) {
  const parsed = parseInitArgs(process.argv.slice(2));
  if (!parsed.ok) {
    process.stderr.write(`[init] error ${parsed.message}\n`);
    process.exit(1);
  }

  runInit(parsed.flags)
    .then((code) => {
      process.exit(code);
    })
    .catch((err: unknown) => {
      process.stderr.write(
        `[init] error ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(1);
    });
} else {
  const frameworkVal = meta.framework as string | undefined;
  if (frameworkVal !== undefined) {
    if (!(VALID_FRAMEWORKS as readonly string[]).includes(frameworkVal)) {
      process.stderr.write(
        `[framework] error: unknown value "${frameworkVal}". Valid values: ${VALID_FRAMEWORKS.join(", ")}\n`,
      );
      process.exit(1);
    }
  }

  startServer(frameworkVal).catch((err: unknown) => {
    log.error("server error", {
      message: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
