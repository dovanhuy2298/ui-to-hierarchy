/**
 * Tiny stderr-only logger (D-08).
 *
 * Writes JSON lines to process.stderr exclusively — never touches process.stdout,
 * which is reserved for the SDK's StdioServerTransport JSON-RPC frames.
 *
 * log.debug is a no-op unless MCP_DEBUG=1.
 */

type Level = "info" | "warn" | "error" | "debug";

function emit(level: Level, msg: string, meta?: Record<string, unknown>): void {
  // Spread meta first so canonical fields (level, msg, ts) cannot be overwritten
  // by a buggy caller passing { level: "error" } in meta.
  const entry = JSON.stringify({
    ...(meta ?? {}),
    level,
    msg,
    ts: new Date().toISOString(),
  });
  process.stderr.write(`${entry}\n`);
}

export const log = {
  info(msg: string, meta?: Record<string, unknown>): void {
    emit("info", msg, meta);
  },
  warn(msg: string, meta?: Record<string, unknown>): void {
    emit("warn", msg, meta);
  },
  error(msg: string, meta?: Record<string, unknown>): void {
    emit("error", msg, meta);
  },
  debug(msg: string, meta?: Record<string, unknown>): void {
    if (process.env.MCP_DEBUG === "1") emit("debug", msg, meta);
  },
};
