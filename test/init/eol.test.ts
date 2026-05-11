import { describe, it, expect } from "vitest";
import { detectBom, detectEol, applyEolBom } from "../../src/init/eol.js";

describe("detectBom", () => {
  it("returns true for buffer starting with EF BB BF", () => {
    expect(detectBom(Buffer.from([0xef, 0xbb, 0xbf, 0x41]))).toBe(true);
  });

  it("returns false for non-BOM buffer", () => {
    expect(detectBom(Buffer.from("hello", "utf8"))).toBe(false);
  });

  it("returns false for buffer shorter than 3 bytes", () => {
    expect(detectBom(Buffer.from([0xef, 0xbb]))).toBe(false);
  });

  it("returns false when only two of three BOM bytes match", () => {
    expect(detectBom(Buffer.from([0xef, 0xbb, 0x00, 0x41]))).toBe(false);
  });
});

describe("detectEol", () => {
  it("returns 'CRLF' when content contains \\r\\n", () => {
    expect(detectEol("line\r\nfoo")).toBe("CRLF");
  });

  it("returns 'LF' when content has only \\n", () => {
    expect(detectEol("line\nfoo")).toBe("LF");
  });

  it("returns 'LF' for content with no newline (default)", () => {
    expect(detectEol("no newline")).toBe("LF");
  });

  it("returns 'CRLF' when any single CRLF is present in mixed content", () => {
    expect(detectEol("a\nb\r\nc")).toBe("CRLF");
  });
});

describe("applyEolBom", () => {
  it("converts CRLF input to LF when eol='LF'", () => {
    expect(applyEolBom("a\r\nb", "LF", false)).toBe("a\nb");
  });

  it("converts LF input to CRLF without producing \\r\\r\\n", () => {
    expect(applyEolBom("a\nb", "CRLF", false)).toBe("a\r\nb");
  });

  it("normalizes mixed/CRLF input to CRLF cleanly (no \\r\\r\\n)", () => {
    expect(applyEolBom("a\r\nb", "CRLF", false)).toBe("a\r\nb");
    expect(applyEolBom("a\r\nb\r\nc", "CRLF", false)).toBe("a\r\nb\r\nc");
  });

  it("prepends U+FEFF when hasBom=true", () => {
    const out = applyEolBom("a\r\nb", "CRLF", true);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.slice(1)).toBe("a\r\nb");
  });

  it("omits BOM when hasBom=false", () => {
    const out = applyEolBom("a\nb", "LF", false);
    expect(out.charCodeAt(0)).not.toBe(0xfeff);
    expect(out).toBe("a\nb");
  });

  it("round-trip CRLF→LF equals LF-normalized form", () => {
    const s = "line1\r\nline2\r\nline3";
    expect(applyEolBom(applyEolBom(s, "CRLF", false), "LF", false)).toBe("line1\nline2\nline3");
  });

  it("round-trip LF→CRLF→LF returns to LF form", () => {
    const s = "x\ny\nz";
    expect(applyEolBom(applyEolBom(s, "CRLF", false), "LF", false)).toBe(s);
  });
});
