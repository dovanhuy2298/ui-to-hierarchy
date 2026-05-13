import type { ComponentDefinition, ParseContext, ResolveResult, RouteMatch } from "./types.js";

/**
 * FrameworkAdapter — locked 5-method contract (ARCH-01, SPEC R7).
 *
 * v1 ships NextJsAdapter only. Phase 3 implements `resolveModule` and
 * `extractComponents`; Phase 4 fills in `detect`, `discoverEntries`,
 * `mapRouteToEntry` (Next.js routing semantics — layouts, route groups,
 * dynamic / parallel / intercepting routes).
 *
 * 8-method set locked by Phase 10 SPEC (10-SPEC.md).
 * Asserted at runtime by `test/adapters/FrameworkAdapter.test.ts`.
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

  /** Map a route string to entries + params + slots (Phase 4, NEXT-01..03). */
  mapRouteToEntry(absRoot: string, route: string): Promise<RouteMatch> | RouteMatch;

  /** Classify an entry file by its role in the framework's routing model. */
  classifyEntry(absPath: string): "page" | "layout" | "special" | "other";

  /** Enumerate all route strings for the project root. */
  enumerateRoutes(absRoot: string): string[] | Promise<string[]>;

  /**
   * Return true if the identifier `name` (from source `importSource`) is a
   * slot injection point for this framework.
   * Next.js: name === "children" (importSource ignored).
   * Expo Router: name === "Slot" && importSource === "expo-router".
   */
  slotMarker(name: string, importSource: string): boolean;
}
