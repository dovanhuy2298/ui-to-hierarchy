/**
 * Pure regex-driven segment classifier for Expo Router (Phase 12, ROUTE-03).
 *
 * Maps an Expo Router file/folder name to its ExpoSegment variant.
 * No I/O, no throws — every input maps to exactly one variant.
 *
 * Key differences from Next.js segments.ts:
 * - Uses `name` field throughout (NOT `param`) — locked by D-11.
 * - Adds `special` variant for Expo's `+not-found`, `+html`, etc.
 * - No intercepting, parallel, or private variants.
 */

// Order matters: more-specific patterns first (longest-first to avoid
// [[...opt]] matching the catch-all regex before optional-catch-all).
const RX_OPTIONAL_CATCH_ALL = /^\[\[\.\.\.([^\]]+)\]\]$/;
const RX_CATCH_ALL = /^\[\.\.\.([^\]]+)\]$/;
const RX_DYNAMIC = /^\[([^\]]+)\]$/;
const RX_GROUP = /^\(([^)]+)\)$/;
const RX_SPECIAL = /^\+/;

/**
 * Discriminated union for Expo Router segment kinds.
 * Field is `name` throughout — never `param` (D-11).
 */
export type ExpoSegment =
  | { kind: "static"; name: string }
  | { kind: "dynamic"; name: string }
  | { kind: "catch-all"; name: string }
  | { kind: "optional-catch-all"; name: string }
  | { kind: "group"; name: string }
  | { kind: "index" }
  | { kind: "special"; name: string };

/**
 * Classify an Expo Router file or folder name into its segment variant.
 * Extension (.tsx, .jsx, .ts, .js) is stripped before classification.
 * No I/O, no throws — every input maps to exactly one variant.
 */
export function parseSegment(dir: string): ExpoSegment {
  // Strip file extension before classifying.
  const bare = dir.replace(/\.(tsx|jsx|ts|js)$/, "");

  if (bare === "index") return { kind: "index" };

  let m: RegExpExecArray | null;

  // Optional-catch-all MUST run before catch-all (longest-first).
  if ((m = RX_OPTIONAL_CATCH_ALL.exec(bare))) return { kind: "optional-catch-all", name: m[1]! };
  if ((m = RX_CATCH_ALL.exec(bare))) return { kind: "catch-all", name: m[1]! };
  if ((m = RX_DYNAMIC.exec(bare))) return { kind: "dynamic", name: m[1]! };
  if ((m = RX_GROUP.exec(bare))) return { kind: "group", name: m[1]! };
  if (RX_SPECIAL.test(bare)) return { kind: "special", name: bare };

  return { kind: "static", name: bare };
}
