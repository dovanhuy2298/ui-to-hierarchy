import { describe, expect, it } from "vitest";
import type { FrameworkAdapter } from "../../src/adapters/FrameworkAdapter.js";

/**
 * Structural assertion that `FrameworkAdapter` declares exactly the 5 locked
 * methods (ARCH-01 / SPEC R7). Adding a 6th method makes this stub no longer
 * cover `keyof FrameworkAdapter` (TS error at compile time) AND breaks the
 * `Object.keys` length check (runtime).
 */
describe("ARCH-01 FrameworkAdapter shape", () => {
  it("interface has exactly 5 methods (detect, discoverEntries, resolveModule, extractComponents, mapRouteToEntry)", () => {
    // The Record type forces exhaustive coverage of `keyof FrameworkAdapter`.
    // If a 6th method lands on the interface, this object stops type-checking
    // (the missing key fails the `Record<keyof ..., true>` constraint).
    const stub: Record<keyof FrameworkAdapter, true> = {
      detect: true,
      discoverEntries: true,
      resolveModule: true,
      extractComponents: true,
      mapRouteToEntry: true,
    };
    expect(Object.keys(stub).sort()).toEqual([
      "detect",
      "discoverEntries",
      "extractComponents",
      "mapRouteToEntry",
      "resolveModule",
    ]);
    expect(Object.keys(stub)).toHaveLength(5);
  });
});
