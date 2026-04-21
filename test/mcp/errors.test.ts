import { describe, expect, it } from "vitest";
import {
  internalError,
  invalidInput,
  notImplemented,
} from "../../src/mcp/errors.js";

describe("notImplemented", () => {
  it("returns isError: true", () => {
    const result = notImplemented("get_full_hierarchy");
    expect(result.isError).toBe(true);
  });

  it("contains tool name in message", () => {
    const result = notImplemented("get_full_hierarchy");
    expect(result.content[0].type).toBe("text");
    // biome-ignore lint/suspicious/noExplicitAny: test assertion on union type
    expect((result.content[0] as any).text).toContain("get_full_hierarchy");
  });

  it("references Phase 5 (IR Queries & Tool Wire-up)", () => {
    const result = notImplemented("get_full_hierarchy");
    // biome-ignore lint/suspicious/noExplicitAny: test assertion on union type
    expect((result.content[0] as any).text).toContain(
      "Phase 5 (IR Queries & Tool Wire-up)",
    );
  });

  it("references ROADMAP.md", () => {
    const result = notImplemented("get_full_hierarchy");
    // biome-ignore lint/suspicious/noExplicitAny: test assertion on union type
    expect((result.content[0] as any).text).toContain("ROADMAP.md");
  });

  it("returns content array with one text entry", () => {
    const result = notImplemented("foo");
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
  });
});

describe("internalError", () => {
  it("returns isError: true", () => {
    const result = internalError("foo", new Error("boom"));
    expect(result.isError).toBe(true);
  });

  it("includes tool name and error message in text", () => {
    const result = internalError("foo", new Error("boom"));
    // biome-ignore lint/suspicious/noExplicitAny: test assertion on union type
    const text = (result.content[0] as any).text as string;
    expect(text).toContain("foo");
    expect(text).toContain("boom");
  });

  it("does NOT include stack trace in text", () => {
    const err = new Error("boom");
    const result = internalError("foo", err);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion on union type
    const text = (result.content[0] as any).text as string;
    expect(text).not.toContain("at ");
    expect(text).not.toContain("Error: boom\n");
  });

  it("handles non-Error (string) gracefully", () => {
    const result = internalError("bar", "oops");
    expect(result.isError).toBe(true);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion on union type
    expect((result.content[0] as any).text).toContain("oops");
  });
});

describe("invalidInput", () => {
  it("returns isError: true", () => {
    const result = invalidInput("bar", new Error("bad field"));
    expect(result.isError).toBe(true);
  });

  it("includes tool name and error message in text", () => {
    const result = invalidInput("bar", new Error("bad field"));
    // biome-ignore lint/suspicious/noExplicitAny: test assertion on union type
    const text = (result.content[0] as any).text as string;
    expect(text).toContain("bar");
    expect(text).toContain("bad field");
  });

  it("handles non-Error gracefully", () => {
    const result = invalidInput("baz", "bad input");
    // biome-ignore lint/suspicious/noExplicitAny: test assertion on union type
    expect((result.content[0] as any).text).toContain("bad input");
  });
});
