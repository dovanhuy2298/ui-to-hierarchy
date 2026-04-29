import type { ComponentDefinition, ParseContext, ResolveResult } from "./types.js";

/**
 * FrameworkAdapter — locked 5-method contract (ARCH-01, SPEC R7).
 *
 * v1 ships NextJsAdapter only. Phase 3 implements `resolveModule` and
 * `extractComponents`; Phase 4 fills in `detect`, `discoverEntries`,
 * `mapRouteToEntry` (Next.js routing semantics — layouts, route groups,
 * dynamic / parallel / intercepting routes).
 *
 * Adding a 6th method to this interface requires a milestone amendment.
 * The 5-key set is asserted at runtime by
 * `test/adapters/FrameworkAdapter.test.ts` to catch accidental additions.
 *
 * Island rule (D-11): nothing under src/core/, src/ir/, or src/renderers/
 * may import this file or any other file under src/adapters/. Enforced by
 * Biome `noRestrictedImports` (layer 1) and
 * `test/architecture/island.test.ts` (layer 2).
 */
export interface FrameworkAdapter {
  /** Test whether a project root looks like this framework's project (Phase 4). */
  detect(absRoot: string): Promise<boolean> | boolean;

  /** Enumerate parser entry points for the project (Phase 4). */
  discoverEntries(absRoot: string): Promise<string[]> | string[];

  /**
   * Resolve an import specifier from a file to an absolute path or external boundary (Phase 3).
   * Pure function over `ctx`; never throws — returns `ResolveResult` union (D-12).
   */
  resolveModule(
    ctx: ParseContext,
    fromFile: string,
    specifier: string,
    importedName: string,
  ): ResolveResult;

  /** Parse one or more entry files into `ComponentDefinition[]` (Phase 3). */
  extractComponents(
    ctx: ParseContext,
    entryFiles: string[],
    opts?: { fullClasses?: boolean },
  ): ComponentDefinition[];

  /** Map a route string to the entry file(s) responsible for rendering it (Phase 4). */
  mapRouteToEntry(absRoot: string, route: string): Promise<string[]> | string[];
}
