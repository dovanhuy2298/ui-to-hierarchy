/**
 * ExpoRouterAdapter — stub implementation of FrameworkAdapter for Expo Router.
 *
 * Phase 11 Plan 02: skeleton stub. All 8 methods return safe no-op values.
 * Wave 2 plans will fill in real logic (discoverEntries, extractComponents,
 * mapRouteToEntry, classifyEntry, enumerateRoutes).
 *
 * D-11 island rule: this file may import from src/core/ but src/core/ must
 * never import from src/adapters/.
 */

import type { FrameworkAdapter } from "../FrameworkAdapter.js";
import type {
  ComponentDefinition,
  ParseContext,
  ResolveResult,
  RouteMatch,
} from "../types.js";
import { resolveModule as coreResolveModule } from "../../core/resolver/index.js";

export class ExpoRouterAdapter implements FrameworkAdapter {
  /**
   * Always returns false — real detection is in src/adapters/expo/detect.ts.
   *
   * TODO(Wave 2): implement real detection here.
   * Do NOT call this method on an already-selected ExpoRouterAdapter instance
   * for post-selection verification — it will always report no match (IN-01).
   */
  async detect(_absRoot: string): Promise<boolean> {
    return false;
  }

  /** Returns empty entry list — stub for Wave 2. */
  async discoverEntries(_absRoot: string): Promise<string[]> {
    return [];
  }

  /** Delegates to the shared core resolver (same as NextJsAdapter). */
  resolveModule(
    ctx: ParseContext,
    fromFile: string,
    specifier: string,
    importedName: string,
  ): ResolveResult {
    return coreResolveModule(ctx, fromFile, specifier, importedName);
  }

  /** Returns empty component list — stub for Wave 2. */
  extractComponents(
    _ctx: ParseContext,
    _entryFiles: string[],
    _opts?: { fullClasses?: boolean },
  ): ComponentDefinition[] {
    return [];
  }

  /** Returns no-match — stub for Wave 2. */
  async mapRouteToEntry(
    _absRoot: string,
    _route: string,
  ): Promise<RouteMatch> {
    return { matched: false, entries: [], params: {}, slots: {} };
  }

  /** All entries are "other" until classifyEntry is implemented in Wave 2. */
  classifyEntry(_absPath: string): "page" | "layout" | "special" | "other" {
    return "other";
  }

  /** Returns empty route list — stub for Wave 2. */
  async enumerateRoutes(_absRoot: string): Promise<string[]> {
    return [];
  }

  /**
   * Returns true only for the Expo Router slot injection point.
   * Expo Router uses `<Slot />` imported from "expo-router".
   */
  slotMarker(name: string, importSource: string): boolean {
    return name === "Slot" && importSource === "expo-router";
  }
}
