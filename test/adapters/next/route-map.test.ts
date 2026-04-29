import path from "node:path";
import { describe, expect, it } from "vitest";
import { matchRoute } from "../../../src/adapters/next/route-map.js";
import { classifySegment, extractParam } from "../../../src/adapters/next/segments.js";

const ROOT = path.resolve("test/fixtures/next-app-router");

describe("classifySegment regex classifier", () => {
  it("classifies static segment", () => {
    expect(classifySegment("dashboard")).toEqual({ kind: "static", name: "dashboard" });
  });
  it("classifies [slug] as dynamic", () => {
    expect(classifySegment("[slug]")).toEqual({ kind: "dynamic", param: "slug" });
  });
  it("classifies [...rest] as catch-all", () => {
    expect(classifySegment("[...rest]")).toEqual({ kind: "catch-all", param: "rest" });
  });
  it("classifies [[...opt]] as optional-catch-all (NOT catch-all)", () => {
    expect(classifySegment("[[...opt]]")).toEqual({
      kind: "optional-catch-all",
      param: "opt",
    });
  });
  it("classifies (marketing) as group", () => {
    expect(classifySegment("(marketing)")).toEqual({ kind: "group", label: "marketing" });
  });
  it("classifies @modal as parallel slot", () => {
    expect(classifySegment("@modal")).toEqual({ kind: "parallel", slot: "modal" });
  });
  it("classifies _internal as private", () => {
    expect(classifySegment("_internal")).toEqual({ kind: "private", name: "internal" });
  });
  it("classifies (.)photo as intercepting level 0", () => {
    expect(classifySegment("(.)photo")).toEqual({
      kind: "intercepting",
      level: 0,
      targetSegment: "photo",
    });
  });
  it("classifies (..)x as intercepting level 1", () => {
    expect(classifySegment("(..)x")).toEqual({
      kind: "intercepting",
      level: 1,
      targetSegment: "x",
    });
  });
  it("classifies (..)(..)x as intercepting level 2", () => {
    expect(classifySegment("(..)(..)x")).toEqual({
      kind: "intercepting",
      level: 2,
      targetSegment: "x",
    });
  });
  it("classifies (...)x as intercepting level root (NOT a group)", () => {
    expect(classifySegment("(...)x")).toEqual({
      kind: "intercepting",
      level: "root",
      targetSegment: "x",
    });
  });
  it("extractParam returns null for non-dynamic folders", () => {
    expect(extractParam("dashboard")).toBeNull();
    expect(extractParam("(marketing)")).toBeNull();
  });
  it("extractParam returns kind 'optional-catch-all' for [[...opt]]", () => {
    expect(extractParam("[[...opt]]")).toEqual({ name: "opt", kind: "optional-catch-all" });
  });
});

describe("NEXT-01 layout chain (root-down with siblings)", () => {
  it("returns matched:true for /dashboard/settings", async () => {
    const m = await matchRoute(ROOT, "/dashboard/settings");
    expect(m.matched).toBe(true);
  });
  it("entries are root-down: app/layout first, app/dashboard/settings/page last", async () => {
    const m = await matchRoute(ROOT, "/dashboard/settings");
    expect(m.entries.length).toBeGreaterThan(0);
    expect(m.entries[0]).toMatch(/\/app\/layout\.(tsx|jsx|ts|js)$/);
    expect(m.entries.at(-1)).toMatch(/\/app\/dashboard\/settings\/page\.(tsx|jsx|ts|js)$/);
  });
  it("entries chain includes layouts at each segment level", async () => {
    const m = await matchRoute(ROOT, "/dashboard/settings");
    expect(m.entries.some((p) => /\/app\/dashboard\/layout\.tsx$/.test(p))).toBe(true);
    expect(m.entries.some((p) => /\/app\/dashboard\/settings\/layout\.tsx$/.test(p))).toBe(true);
  });
  it("entries include sibling specials when present (loading.tsx at settings)", async () => {
    const m = await matchRoute(ROOT, "/dashboard/settings");
    expect(m.entries.some((p) => /\/app\/dashboard\/settings\/loading\.tsx$/.test(p))).toBe(true);
  });
  it("all entries are forward-slash absolute paths", async () => {
    const m = await matchRoute(ROOT, "/dashboard/settings");
    expect(m.entries.every((p) => !p.includes("\\"))).toBe(true);
    expect(m.entries.every((p) => path.isAbsolute(p))).toBe(true);
  });
});

describe("NEXT-02 conventions: groups / parallel / intercepting / private", () => {
  it("group (marketing) contributes layout but NOT a URL segment — /about matches", async () => {
    const m = await matchRoute(ROOT, "/about");
    expect(m.matched).toBe(true);
    expect(m.entries.some((p) => /\/\(marketing\)\/layout\.tsx$/.test(p))).toBe(true);
    expect(m.entries.some((p) => /\/\(marketing\)\/about\/page\.tsx$/.test(p))).toBe(true);
  });
  it("@modal/login appears in slots.modal, NEVER in entries", async () => {
    const m = await matchRoute(ROOT, "/login");
    expect(Array.isArray(m.slots.modal)).toBe(true);
    if (m.slots.modal && m.slots.modal.length > 0) {
      expect(m.slots.modal.some((p) => /\/@modal\/login\/page\.tsx$/.test(p))).toBe(true);
    }
    expect(m.entries.some((p) => p.includes("/@modal/"))).toBe(false);
  });
  it("_internal is excluded from any RouteMatch (entries AND slots)", async () => {
    const routes = [
      "/dashboard/settings",
      "/about",
      "/blog/x",
      "/files/a/b",
      "/maybe",
      "/maybe/x",
    ];
    for (const r of routes) {
      const m = await matchRoute(ROOT, r);
      expect(m.entries.some((p) => p.includes("/_internal/"))).toBe(false);
      for (const slot of Object.values(m.slots)) {
        expect(slot.some((p) => p.includes("/_internal/"))).toBe(false);
      }
    }
  });
  it("intercepting (.)photo is parsed (smoke: file is part of the discoverable tree)", async () => {
    const m = await matchRoute(ROOT, "/photo/123");
    expect(m.matched).toBe(true);
  });
});

describe("NEXT-03 dynamic segment params", () => {
  it("[slug] populates params.slug as string", async () => {
    const m = await matchRoute(ROOT, "/blog/hello");
    expect(m.matched).toBe(true);
    expect(m.params).toEqual({ slug: "hello" });
  });
  it("[...rest] populates params.rest as string[]", async () => {
    const m = await matchRoute(ROOT, "/files/a/b/c");
    expect(m.matched).toBe(true);
    expect(m.params).toEqual({ rest: ["a", "b", "c"] });
  });
  it("[[...opt]] matches /maybe with params.opt = []", async () => {
    const m = await matchRoute(ROOT, "/maybe");
    expect(m.matched).toBe(true);
    expect(m.params).toEqual({ opt: [] });
  });
  it("[[...opt]] matches /maybe/x with params.opt = ['x']", async () => {
    const m = await matchRoute(ROOT, "/maybe/x");
    expect(m.matched).toBe(true);
    expect(m.params).toEqual({ opt: ["x"] });
  });
  it("[[...opt]] matches /maybe/x/y with params.opt = ['x','y']", async () => {
    const m = await matchRoute(ROOT, "/maybe/x/y");
    expect(m.matched).toBe(true);
    expect(m.params).toEqual({ opt: ["x", "y"] });
  });
});

describe("D-12 no-throw on malformed input", () => {
  it("returns matched:false on route not starting with /", async () => {
    const m = await matchRoute(ROOT, "hello");
    expect(m).toEqual({ matched: false, entries: [], params: {}, slots: {} });
  });
  it("returns matched:false on empty string", async () => {
    const m = await matchRoute(ROOT, "");
    expect(m.matched).toBe(false);
  });
  it("returns matched:false on path-traversal route /../etc", async () => {
    const m = await matchRoute(ROOT, "/../etc");
    expect(m.matched).toBe(false);
  });
  it("returns matched:false when app/ is missing", async () => {
    const m = await matchRoute(
      path.resolve("test/fixtures/next-detect-pages-only"),
      "/foo",
    );
    expect(m).toEqual({ matched: false, entries: [], params: {}, slots: {} });
  });
  it("returns matched:false when root does not exist (no throw)", async () => {
    const m = await matchRoute(path.resolve("test/fixtures/__does_not_exist__"), "/foo");
    expect(m.matched).toBe(false);
  });
  it("does not throw on any malformed input", async () => {
    await expect(matchRoute(ROOT, "" as string)).resolves.toBeDefined();
    await expect(matchRoute(ROOT, "//double//slash")).resolves.toBeDefined();
  });
});

describe("Per-call cache discipline (ARCH-02)", () => {
  it("two consecutive calls return independent objects (no shared state)", async () => {
    const a = await matchRoute(ROOT, "/blog/x");
    const b = await matchRoute(ROOT, "/blog/y");
    expect(a.params).toEqual({ slug: "x" });
    expect(b.params).toEqual({ slug: "y" });
    a.entries.push("MUTATED");
    const c = await matchRoute(ROOT, "/blog/x");
    expect(c.entries).not.toContain("MUTATED");
  });
});
