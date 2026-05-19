import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  enumerateRoutes,
  mapRouteToEntry,
} from "../../../src/adapters/expo/route-map.js";

const EXPO_BASIC = path.resolve("test/fixtures/expo-basic");
const EXPO_TABS = path.resolve("test/fixtures/expo-tabs-and-dynamic");

describe("enumerateRoutes", () => {
  it("groups are transparent in URL — (tabs)/index.tsx produces route /", async () => {
    const routes = await enumerateRoutes(EXPO_TABS);
    expect(routes).toContain("/");
    // The route / comes from (tabs)/index.tsx — group is stripped
    expect(routes.some((r) => r.includes("(tabs)"))).toBe(false);
  });

  it("index collapsing — index.tsx at root produces route /", async () => {
    const routes = await enumerateRoutes(EXPO_BASIC);
    expect(routes).toContain("/");
  });

  it("[id] rendered as dynamic segment in route string", async () => {
    const routes = await enumerateRoutes(EXPO_TABS);
    expect(routes).toContain("/[id]");
  });

  it("+not-found is excluded from enumerated routes", async () => {
    const routes = await enumerateRoutes(EXPO_TABS);
    expect(routes.some((r) => r.includes("+not-found"))).toBe(false);
    expect(routes.some((r) => r.includes("+"))).toBe(false);
  });

  it("enumerateRoutes on expo-basic contains / but no layout routes", async () => {
    const routes = await enumerateRoutes(EXPO_BASIC);
    expect(routes).toContain("/");
    // _layout files must not appear as routes
    expect(routes.some((r) => r.includes("_layout"))).toBe(false);
  });

  it("returns [] when no app root exists", async () => {
    const routes = await enumerateRoutes(path.resolve("test/fixtures/__does_not_exist__"));
    expect(routes).toEqual([]);
  });

  it("routes are lex-sorted", async () => {
    const routes = await enumerateRoutes(EXPO_TABS);
    const sorted = [...routes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(routes).toEqual(sorted);
  });
});

describe("mapRouteToEntry", () => {
  it("returns root _layout, nested _layout, and page entries for a matched route (D-09)", async () => {
    const result = await mapRouteToEntry(EXPO_BASIC, "/");
    expect(result.matched).toBe(true);
    expect(result.entries.length).toBeGreaterThan(0);
    // Page is last (root→leaf→page ordering)
    expect(result.entries.at(-1)).toMatch(/\/index\.tsx$/);
    // Root _layout comes first
    expect(result.entries[0]).toMatch(/\/_layout\.tsx$/);
    // Forward slashes only
    expect(result.entries.every((e) => !e.includes("\\"))).toBe(true);
  });

  it("mapRouteToEntry on expo-basic for / — page is last (root→leaf→page)", async () => {
    const result = await mapRouteToEntry(EXPO_BASIC, "/");
    expect(result.matched).toBe(true);
    expect(result.entries.at(-1)).toMatch(/\/index\.tsx$/);
  });

  it("mapRouteToEntry on expo-tabs for /[id] — includes (tabs)/_layout.tsx in chain", async () => {
    const result = await mapRouteToEntry(EXPO_TABS, "/[id]");
    expect(result.matched).toBe(true);
    // Group _layout must appear even though group is URL-transparent
    expect(result.entries.some((e) => e.endsWith("/(tabs)/_layout.tsx"))).toBe(true);
    // Page file is last
    expect(result.entries.at(-1)).toMatch(/\/\[id\]\.tsx$/);
  });

  it("entries for /[id] in expo-tabs are in root→leaf→page order", async () => {
    const result = await mapRouteToEntry(EXPO_TABS, "/[id]");
    expect(result.matched).toBe(true);
    const entries = result.entries;
    // Root _layout before (tabs)/_layout before page
    const rootLayoutIdx = entries.findIndex(
      (e) => e.endsWith("/app/_layout.tsx") || /\/app\/_layout\.tsx$/.test(e),
    );
    const tabsLayoutIdx = entries.findIndex((e) => e.endsWith("/(tabs)/_layout.tsx"));
    const pageIdx = entries.findIndex((e) => e.endsWith("/[id].tsx"));
    expect(rootLayoutIdx).toBeGreaterThanOrEqual(0);
    expect(tabsLayoutIdx).toBeGreaterThan(rootLayoutIdx);
    expect(pageIdx).toBeGreaterThan(tabsLayoutIdx);
  });

  it("invalid input (non-string) returns { matched: false } without throwing", async () => {
    // @ts-expect-error testing invalid input
    const result = await mapRouteToEntry(EXPO_BASIC, 42);
    expect(result).toEqual({ matched: false, entries: [], params: {}, slots: {} });
  });

  it("invalid input (missing leading /) returns { matched: false } without throwing", async () => {
    const result = await mapRouteToEntry(EXPO_BASIC, "missing-slash");
    expect(result).toEqual({ matched: false, entries: [], params: {}, slots: {} });
  });

  it("unmatched valid route returns { matched: false } without throwing", async () => {
    const result = await mapRouteToEntry(EXPO_BASIC, "/nonexistent");
    expect(result).toEqual({ matched: false, entries: [], params: {}, slots: {} });
  });

  it("emitted entry paths use forward slashes", async () => {
    const result = await mapRouteToEntry(EXPO_TABS, "/[id]");
    expect(result.matched).toBe(true);
    expect(result.entries.every((e) => !e.includes("\\"))).toBe(true);
  });

  it("params and slots are empty objects in v1 (no param extraction)", async () => {
    const result = await mapRouteToEntry(EXPO_TABS, "/[id]");
    expect(result.matched).toBe(true);
    expect(result.params).toEqual({});
    expect(result.slots).toEqual({});
  });
});
