import path from "node:path";
import { describe, expect, it } from "vitest";
import { probeFile } from "../../../src/core/resolver/relative.js";

describe("D-13 probe extension order", () => {
  const root = path.resolve("test/fixtures/parser/resolver/shadcn-barrel/src/components/ui");

  it("finds button.tsx when probing 'button' base", () => {
    const hit = probeFile(path.join(root, "button"));
    expect(hit).not.toBeNull();
    expect(hit?.endsWith("button.tsx")).toBe(true);
    expect(hit?.includes("\\")).toBe(false); // forward-slash mandate
  });

  it("finds index.ts when probing the directory base", () => {
    const hit = probeFile(root);
    expect(hit).not.toBeNull();
    expect(hit?.endsWith("index.ts")).toBe(true);
    expect(hit?.includes("\\")).toBe(false);
  });

  it("returns null when no candidate exists", () => {
    expect(probeFile(path.join(root, "nope"))).toBeNull();
  });
});
