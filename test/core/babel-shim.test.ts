import { describe, expect, it } from "vitest";
import { traverse } from "../../src/core/babel-shim.js";

describe("babel-shim", () => {
  it("resolves traverse as a callable function regardless of ESM/CJS interop", () => {
    expect(typeof traverse).toBe("function");
  });

  it("accepts a minimal File AST and a visitor without throwing", () => {
    const programAst = {
      type: "File",
      program: {
        type: "Program",
        body: [],
        directives: [],
        sourceType: "module",
      },
    } as any;

    expect(() => traverse(programAst, { enter() {} })).not.toThrow();
  });
});
