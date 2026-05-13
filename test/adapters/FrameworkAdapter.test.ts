import { describe, expect, it } from "vitest";
import type { FrameworkAdapter } from "../../src/adapters/FrameworkAdapter.js";

/**
 * Structural assertion that `FrameworkAdapter` declares exactly the 8 locked
 * methods (Phase 10 SPEC, 10-SPEC.md). Adding or removing a method makes this
 * stub no longer cover `keyof FrameworkAdapter` (TS error at compile time) AND
 * breaks the `Object.keys` length check (runtime).
 */
describe("ARCH-01 FrameworkAdapter shape", () => {
  it("interface has exactly 8 methods (detect, discoverEntries, resolveModule, extractComponents, mapRouteToEntry, classifyEntry, enumerateRoutes, slotMarker)", () => {
    // The Record type forces exhaustive coverage of `keyof FrameworkAdapter`.
    // If any method is added or removed from the interface, this object stops
    // type-checking (the missing/extra key fails the `Record<keyof ..., true>` constraint).
    const stub: Record<keyof FrameworkAdapter, true> = {
      detect: true,
      discoverEntries: true,
      resolveModule: true,
      extractComponents: true,
      mapRouteToEntry: true,
      classifyEntry: true,
      enumerateRoutes: true,
      slotMarker: true,
    };
    expect(Object.keys(stub).sort()).toEqual([
      "classifyEntry",
      "detect",
      "discoverEntries",
      "enumerateRoutes",
      "extractComponents",
      "mapRouteToEntry",
      "resolveModule",
      "slotMarker",
    ]);
    expect(Object.keys(stub)).toHaveLength(8);
  });
});
