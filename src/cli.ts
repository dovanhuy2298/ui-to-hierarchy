import { parseArgs } from "node:util";

import { log } from "./mcp/log.js";
import { startServer } from "./mcp/server.js";
import { runInit } from "./init/index.js";
import { parseInitArgs } from "./init/argv.js";

// Note: shebang (#!/usr/bin/env node) is injected by tsup banner — do NOT add it here.

const HELP_TEXT = `Usage: npx ui-hierarchy-mcp [--init [--target <list>] [--dry-run] [--force]]

  (no args)            Start the MCP stdio server (default).
  --init               Write the ui-hierarchy-mcp usage guide into agent config files
                       in the current working directory.
    --target <list>    Comma-separated subset of: claude, codex, cursor, copilot
                       (default: all four).
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
  options: {
    init: { type: "boolean" },
    target: { type: "string" },
    "dry-run": { type: "boolean" },
    force: { type: "boolean" },
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" },
  },
  strict: false,
  allowPositionals: true,
});

if (meta.help) {
  process.stderr.write(HELP_TEXT);
  process.exit(0);
}
if (meta.version) {
  process.stderr.write(`${__TOOL_VERSION__}\n`);
  process.exit(0);
}

const parsed = parseInitArgs(process.argv.slice(2));
if (!parsed.ok) {
  process.stderr.write(`[init] error ${parsed.message}\n`);
  process.exit(1);
}

const flags = parsed.flags;

if (flags.init) {
  runInit(flags)
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
  startServer().catch((err: unknown) => {
    log.error("server error", {
      message: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
