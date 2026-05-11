/**
 * Marker block scanning, replacement, and append utilities.
 *
 * Pure-function module: no file I/O, no global state. Composed by the
 * Phase 7 init orchestrator (Plan 04) to apply the hand-edit guard and
 * idempotent block-write contract on agent instruction files.
 *
 * Contracts:
 * - `scanBlock(content).body` is byte-identical to the string fed to
 *   `computeFingerprint(...)` at write time. This is the INIT-04
 *   idempotency contract: round-trip write+read must yield the same
 *   fingerprint when the body has not been hand-edited. The wrapping
 *   newlines around the body are consumed by the regex *outside* the
 *   body capture group so they never leak into the preimage.
 */

export const MARKER_START_PREFIX = "<!-- ui-hierarchy-mcp:start";
export const MARKER_END = "<!-- ui-hierarchy-mcp:end -->";

/**
 * Captures version (any non-whitespace token), fingerprint (exactly 64
 * lowercase hex characters), and body (any bytes between the wrapping
 * newlines). The two literal `\n` flanking group 3 are load-bearing —
 * they consume the wrapping newlines that block assembly adds in Plan 04
 * so that `body` is byte-identical to the `renderGuide(...)` output used
 * as the fingerprint preimage.
 *
 * Non-greedy `[\s\S]*?` plus the bounded `\n<!-- ui-hierarchy-mcp:end -->`
 * tail prevents catastrophic backtracking (T-07-07).
 */
export const BLOCK_PATTERN =
  /<!-- ui-hierarchy-mcp:start version=(\S+) fingerprint=([0-9a-f]{64}) -->\n([\s\S]*?)\n<!-- ui-hierarchy-mcp:end -->/;

export type BlockScanResult =
  | {
      found: true;
      version: string;
      fingerprint: string;
      body: string;
      fullMatch: string;
      startIndex: number;
      endIndex: number;
    }
  | { found: false };

/**
 * Find the first well-formed marker block in `content`. Returns
 * `{found:false}` for any malformed block (missing fingerprint, wrong hex
 * length, uppercase hex, missing end marker, missing wrapping newlines).
 */
export function scanBlock(content: string): BlockScanResult {
  // Use a fresh regex execution so callers cannot share lastIndex state
  // through the exported constant.
  const re = new RegExp(BLOCK_PATTERN.source);
  const m = re.exec(content);
  // RegExp.prototype.exec always returns a match object with `index` defined
  // when it returns non-null, so the prior `m.index === undefined` arm was
  // unreachable (IN-02).
  if (!m) return { found: false };
  return {
    found: true,
    version: m[1] as string,
    fingerprint: m[2] as string,
    body: m[3] as string,
    fullMatch: m[0],
    startIndex: m.index,
    endIndex: m.index + m[0].length,
  };
}

/**
 * Replace the matched block range with `newBlock`. Bytes outside
 * `[scan.startIndex, scan.endIndex)` are preserved byte-for-byte. The
 * caller is responsible for ensuring `newBlock` itself re-establishes
 * the start-newline-body-newline-end contract (see Plan 04).
 */
export function replaceBlock(
  content: string,
  newBlock: string,
  scan: Extract<BlockScanResult, { found: true }>,
): string {
  return content.slice(0, scan.startIndex) + newBlock + content.slice(scan.endIndex);
}

/**
 * Append `newBlock` to `existing` separated by exactly one blank line.
 * Collapses any number of trailing newlines (including zero) in
 * `existing` to a single `\n\n` separator. INIT-06.
 */
export function appendBlock(existing: string, newBlock: string): string {
  return existing.trimEnd() + "\n\n" + newBlock;
}
