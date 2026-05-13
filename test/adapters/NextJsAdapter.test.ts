import path from "node:path";
import { describe, expect, it } from "vitest";
import { NextJsAdapter } from "../../src/adapters/next/NextJsAdapter.js";

// NOTE: All tests in this file FAIL in RED state.
// NextJsAdapter does not yet implement classifyEntry, enumerateRoutes, or slotMarker.
// Implementations land in Plan 02.

describe("NextJsAdapter.classifyEntry", () => {
  it("returns 'page' for page.tsx", () => {
    expect(NextJsAdapter.classifyEntry("app/page.tsx")).toBe("page");
  });

  it("returns 'layout' for layout.tsx", () => {
    expect(NextJsAdapter.classifyEntry("app/layout.tsx")).toBe("layout");
  });

  it("returns 'special' for loading.tsx", () => {
    expect(NextJsAdapter.classifyEntry("app/loading.tsx")).toBe("special");
  });

  it("returns 'special' for not-found.tsx", () => {
    expect(NextJsAdapter.classifyEntry("app/not-found.tsx")).toBe("special");
  });

  it("does NOT return 'special' for layout.tsx — Pitfall 1 regression guard", () => {
    // layout.tsx must be classified as "layout", not "special",
    // even though the isSpecialFile regex also matches layout.* files.
    expect(NextJsAdapter.classifyEntry("app/layout.tsx")).not.toBe("special");
  });

  it("returns 'other' for a generic component file", () => {
    expect(NextJsAdapter.classifyEntry("src/components/Card.tsx")).toBe("other");
  });
});

describe("NextJsAdapter.slotMarker", () => {
  it("returns true for name 'children' (Next.js slot pattern)", () => {
    expect(NextJsAdapter.slotMarker("children", "react")).toBe(true);
  });

  it("returns false for name 'Slot' from expo-router", () => {
    // Next.js slotMarker only recognises 'children'; Expo Router's Slot is not a Next.js slot.
    expect(NextJsAdapter.slotMarker("Slot", "expo-router")).toBe(false);
  });

  it("returns true for 'children' regardless of importSource (importSource is ignored per D-05)", () => {
    expect(NextJsAdapter.slotMarker("children", "")).toBe(true);
    expect(NextJsAdapter.slotMarker("children", "anything")).toBe(true);
  });

  it("returns false for any name that is not 'children'", () => {
    expect(NextJsAdapter.slotMarker("Header", "")).toBe(false);
  });
});

describe("NextJsAdapter.enumerateRoutes", () => {
  it("returns sorted routes from next-app-router fixture", async () => {
    // next-app-router has: app/page.tsx → route "/"
    // Also has parallel-route (@modal) and private-folder (_internal) entries
    // that must be excluded from the enumerated routes.
    const root = path.join(process.cwd(), "test/fixtures/next-app-router");
    const routes = await NextJsAdapter.enumerateRoutes(root);

    expect(Array.isArray(routes)).toBe(true);
    // Must include the root route — non-vacuous assertion
    expect(routes).toContain("/");
    // Result must be sorted
    const sorted = [...routes].sort();
    expect(routes).toEqual(sorted);
    // No parallel-route (@...) entries
    expect(routes.every((r) => !r.includes("@"))).toBe(true);
    // No private-folder (_...) entries
    expect(routes.every((r) => !r.startsWith("/_"))).toBe(true);
  });
});
