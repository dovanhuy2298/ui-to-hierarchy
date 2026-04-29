/**
 * Pure regex-driven segment classifier (Phase 4, NEXT-02/03).
 *
 * Maps a Next.js App Router folder name to its SegmentKind variant.
 * No I/O, no throws — every input maps to exactly one variant.
 */

export type SegmentKind =
  | { kind: "static"; name: string }
  | { kind: "dynamic"; param: string }
  | { kind: "catch-all"; param: string }
  | { kind: "optional-catch-all"; param: string }
  | { kind: "group"; label: string }
  | { kind: "parallel"; slot: string }
  | {
      kind: "intercepting";
      level: 0 | 1 | 2 | "root";
      targetSegment: string;
    }
  | { kind: "private"; name: string };

// Order matters: more-specific patterns first.
const RX_OPTIONAL_CATCH_ALL = /^\[\[\.\.\.([^\]]+)\]\]$/;
const RX_CATCH_ALL = /^\[\.\.\.([^\]]+)\]$/;
const RX_DYNAMIC = /^\[([^\]]+)\]$/;
const RX_INTERCEPT_ROOT = /^\(\.\.\.\)(.+)$/;
const RX_INTERCEPT_TWO = /^\(\.\.\)\(\.\.\)(.+)$/;
const RX_INTERCEPT_ONE = /^\(\.\.\)(.+)$/;
const RX_INTERCEPT_SAME = /^\(\.\)(.+)$/;
const RX_GROUP = /^\(([^)]+)\)$/;
const RX_PARALLEL = /^@(.+)$/;
const RX_PRIVATE = /^_(.+)$/;

export function classifySegment(folder: string): SegmentKind {
  let m: RegExpExecArray | null;

  if ((m = RX_OPTIONAL_CATCH_ALL.exec(folder)))
    return { kind: "optional-catch-all", param: m[1]! };
  if ((m = RX_CATCH_ALL.exec(folder))) return { kind: "catch-all", param: m[1]! };
  if ((m = RX_DYNAMIC.exec(folder))) return { kind: "dynamic", param: m[1]! };

  // Intercepting variants must be tested before plain group `(...)`
  // because (...)x and (..)x both start with paren-dot.
  if ((m = RX_INTERCEPT_ROOT.exec(folder)))
    return { kind: "intercepting", level: "root", targetSegment: m[1]! };
  if ((m = RX_INTERCEPT_TWO.exec(folder)))
    return { kind: "intercepting", level: 2, targetSegment: m[1]! };
  if ((m = RX_INTERCEPT_ONE.exec(folder)))
    return { kind: "intercepting", level: 1, targetSegment: m[1]! };
  if ((m = RX_INTERCEPT_SAME.exec(folder)))
    return { kind: "intercepting", level: 0, targetSegment: m[1]! };

  if ((m = RX_GROUP.exec(folder))) return { kind: "group", label: m[1]! };
  if ((m = RX_PARALLEL.exec(folder))) return { kind: "parallel", slot: m[1]! };
  if ((m = RX_PRIVATE.exec(folder))) return { kind: "private", name: m[1]! };

  return { kind: "static", name: folder };
}

export function extractParam(
  folderName: string,
): { name: string; kind: "single" | "catch-all" | "optional-catch-all" } | null {
  let m: RegExpExecArray | null;
  if ((m = RX_OPTIONAL_CATCH_ALL.exec(folderName)))
    return { name: m[1]!, kind: "optional-catch-all" };
  if ((m = RX_CATCH_ALL.exec(folderName))) return { name: m[1]!, kind: "catch-all" };
  if ((m = RX_DYNAMIC.exec(folderName))) return { name: m[1]!, kind: "single" };
  return null;
}
