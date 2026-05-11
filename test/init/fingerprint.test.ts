import { describe, it, expect } from "vitest";
import { computeFingerprint, verifyFingerprint } from "../../src/init/fingerprint.js";

describe("computeFingerprint", () => {
  it("returns a 64-char lowercase hex string", () => {
    const fp = computeFingerprint("hello");
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is LF-normalized: 'a\\nb' and 'a\\r\\nb' produce the same hash", () => {
    expect(computeFingerprint("a\nb")).toBe(computeFingerprint("a\r\nb"));
  });

  it("is LF-normalized for multi-line bodies (INIT-09 cross-platform)", () => {
    const lf = "line1\nline2\nline3";
    const crlf = "line1\r\nline2\r\nline3";
    expect(computeFingerprint(lf)).toBe(computeFingerprint(crlf));
  });

  it("produces different hashes for different content", () => {
    expect(computeFingerprint("a\nb")).not.toBe(computeFingerprint("a\nc"));
  });

  it("produces stable known SHA-256 for 'hello' (LF body = 'hello')", () => {
    // SHA-256 of the bytes 'hello' (UTF-8, no normalization changes anything for ASCII).
    expect(computeFingerprint("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
});

describe("verifyFingerprint", () => {
  it("returns true for matching body+expected pair", () => {
    const body = "some body text\nwith two lines";
    expect(verifyFingerprint(body, computeFingerprint(body))).toBe(true);
  });

  it("returns false when expected does not match", () => {
    expect(verifyFingerprint("a body", "0".repeat(64))).toBe(false);
  });

  it("round-trip succeeds across LF/CRLF variants", () => {
    const lf = "x\ny\nz";
    const crlf = "x\r\ny\r\nz";
    const fp = computeFingerprint(lf);
    expect(verifyFingerprint(crlf, fp)).toBe(true);
  });
});
