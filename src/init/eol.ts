/**
 * End-of-line and byte-order-mark detection + application.
 *
 * Pure-function module: no file I/O, no global state.
 *
 * Used by the Phase 7 init orchestrator (Plan 04) to preserve the
 * existing file's encoding convention when rewriting agent instruction
 * files. INIT-09 requires that a file detected as CRLF stays CRLF, and
 * a file with a UTF-8 BOM stays with the BOM, across the marker-block
 * round-trip.
 */

export type Eol = "LF" | "CRLF";

/**
 * True iff the first three bytes of `buf` are the UTF-8 BOM (EF BB BF).
 */
export function detectBom(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
}

/**
 * Returns `'CRLF'` iff `content` contains `\r\n`, otherwise `'LF'`. A
 * content string with no newline at all defaults to `'LF'`.
 */
export function detectEol(content: string): Eol {
  return content.includes("\r\n") ? "CRLF" : "LF";
}

/**
 * Re-encode `content` to the target `eol`, optionally prepending a
 * UTF-8 BOM character (U+FEFF).
 *
 * Implementation always normalizes to LF first then converts to the
 * target EOL. This avoids the `\r\r\n` pitfall a naive
 * `content.replace(/\n/g, '\r\n')` would produce on input that already
 * contains CRLF (RESEARCH Pitfall 1 / T-07-08).
 */
export function applyEolBom(content: string, eol: Eol, hasBom: boolean): string {
  const normalized = content.replace(/\r\n/g, "\n");
  const converted = eol === "CRLF" ? normalized.replace(/\n/g, "\r\n") : normalized;
  return hasBom ? "﻿" + converted : converted;
}
