import { createHash } from "node:crypto";

/**
 * SHA-256 fingerprint over the LF-normalized UTF-8 bytes of `body`.
 *
 * INIT-07: the fingerprint stored as a start-marker attribute lets the
 * orchestrator detect hand-edits to the marker body before overwriting.
 *
 * INIT-09: LF normalization (`\r\n` → `\n`) before hashing makes the
 * fingerprint stable across Windows/macOS/Linux git autocrlf settings.
 * Without this, a checkout on Windows would silently invalidate the
 * guard on every run.
 *
 * Returns 64-char lowercase hex.
 */
export function computeFingerprint(body: string): string {
  const normalized = body.replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * True iff `computeFingerprint(body) === expected`. Thin wrapper for
 * call-site readability at the orchestrator level.
 */
export function verifyFingerprint(body: string, expected: string): boolean {
  return computeFingerprint(body) === expected;
}
