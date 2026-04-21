import { log } from "./mcp/log.js";
import { startServer } from "./mcp/server.js";

// Note: shebang (#!/usr/bin/env node) is injected by tsup banner — do NOT add it here.

startServer().catch((err: unknown) => {
  log.error("server error", {
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
