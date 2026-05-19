import { describe, expect, it } from "vitest";
import { parseSegment } from "../../../src/adapters/expo/segments.js";

describe("parseSegment", () => {
  it("classifies static segment correctly", () => {
    expect(parseSegment("settings")).toEqual({ kind: "static", name: "settings" });
  });

  it("classifies index file (index.tsx) as kind: index", () => {
    expect(parseSegment("index.tsx")).toEqual({ kind: "index" });
  });

  it("classifies bare 'index' string as kind: index", () => {
    expect(parseSegment("index")).toEqual({ kind: "index" });
  });

  it("classifies [id] as dynamic — returns name field not param", () => {
    const result = parseSegment("[id]");
    expect(result).toEqual({ kind: "dynamic", name: "id" });
    // Regression: field must be `name`, never `param`
    expect(Object.prototype.hasOwnProperty.call(result, "name")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(result, "param")).toBe(false);
  });

  it("classifies [...rest] as catch-all", () => {
    expect(parseSegment("[...rest]")).toEqual({ kind: "catch-all", name: "rest" });
  });

  it("classifies [[...opt]] as optional-catch-all (tested before catch-all)", () => {
    expect(parseSegment("[[...opt]]")).toEqual({ kind: "optional-catch-all", name: "opt" });
  });

  it("classifies (tabs) group — kind: group, name: tabs", () => {
    expect(parseSegment("(tabs)")).toEqual({ kind: "group", name: "tabs" });
  });

  it("classifies +not-found as special", () => {
    expect(parseSegment("+not-found")).toEqual({ kind: "special", name: "+not-found" });
  });

  it("strips extension before classifying (+not-found.tsx → special)", () => {
    expect(parseSegment("+not-found.tsx")).toEqual({ kind: "special", name: "+not-found" });
  });

  it("fallback to static for arbitrary strings", () => {
    expect(parseSegment("anything-weird")).toEqual({ kind: "static", name: "anything-weird" });
  });

  it("[[...opt]] does NOT match catch-all regex (optional-catch-all wins)", () => {
    // If catch-all ran first, [[...opt]] would incorrectly be { kind: "catch-all", name: "[...opt]" }
    const result = parseSegment("[[...opt]]");
    expect(result.kind).toBe("optional-catch-all");
    expect(result.kind).not.toBe("catch-all");
  });
});
