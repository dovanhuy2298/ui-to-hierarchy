import { createPathsMatcher, getTsconfig, type TsConfigResult } from "get-tsconfig";
// Type-only import of parser-level contracts (ParseContext).
// `import type` is erased at compile time and produces no runtime edge,
// so the D-11 island invariant is preserved. Mirrors Plan 03-02 pattern.
// biome-ignore lint/style/noRestrictedImports: type-only import; erased at compile time (D-11 island invariant unaffected)
import type { ParseContext } from "../../adapters/types.js";

/**
 * tsconfig + paths matcher (PARSE-03).
 *
 * Wraps `get-tsconfig` (^4.14, by privatenumber). T-3-04 disposition: trust
 * the dependency for safe extends-chain traversal — no v1 audit beyond
 * version-pinning. Two cached primitives:
 *
 *   1. `loadTsconfigOnce(ctx)` — finds + loads tsconfig once per ParseContext.
 *      Caller (NextJsAdapter, Plan 06) may pre-populate ctx.tsconfig; if not,
 *      we walk from `ctx.resolvedRoot`. The result (including null = "not
 *      found") is stored on the ctx so subsequent calls hit the cached value.
 *   2. `getPathsMatcher(ctx)` — returns the matcher built from the loaded
 *      tsconfig, cached in a WeakMap keyed by ParseContext (so the matcher
 *      is GC'd with the ctx).
 *
 * The matcher's return value is an array of absolute candidate base paths
 * in priority order — multi-target paths (`{ "@/*": ["src/*", "lib/*"] }`)
 * surface as multiple entries. `resolveModule` iterates them first-wins
 * per D-13.
 */

/**
 * Load the tsconfig once per ParseContext. `getTsconfig` walks the
 * `extends` chain transparently. Returns null if no tsconfig is found
 * starting from `ctx.resolvedRoot`.
 *
 * Sentinel semantics: ctx.tsconfig may legitimately be null ("loaded and
 * none found"). To avoid re-loading on every call, we use the
 * `loadedFlag` WeakSet to mark "we have already attempted load".
 */
const loadedFlag = new WeakSet<ParseContext>();

export function loadTsconfigOnce(ctx: ParseContext): TsConfigResult | null {
  if (loadedFlag.has(ctx)) return ctx.tsconfig;
  if (ctx.tsconfig !== null) {
    // Caller pre-populated; treat as loaded.
    loadedFlag.add(ctx);
    return ctx.tsconfig;
  }
  const tsconfig = getTsconfig(ctx.resolvedRoot);
  ctx.tsconfig = tsconfig;
  loadedFlag.add(ctx);
  return tsconfig;
}

/**
 * Build the paths matcher once per ParseContext. Returns null if the
 * tsconfig has no `paths` config (createPathsMatcher returns null in
 * that case) or if no tsconfig was found at all.
 */
const matcherCache = new WeakMap<ParseContext, ((spec: string) => string[]) | null>();

export function getPathsMatcher(ctx: ParseContext): ((specifier: string) => string[]) | null {
  if (matcherCache.has(ctx)) {
    const cached = matcherCache.get(ctx);
    return cached ?? null;
  }
  const tsconfig = loadTsconfigOnce(ctx);
  const matcher = tsconfig ? createPathsMatcher(tsconfig) : null;
  matcherCache.set(ctx, matcher);
  return matcher;
}
