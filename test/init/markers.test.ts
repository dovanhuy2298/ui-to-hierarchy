import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  MARKER_START_PREFIX,
  MARKER_END,
  BLOCK_PATTERN,
  scanBlock,
  replaceBlock,
  appendBlock,
} from "../../src/init/markers.js";

const FAKE_FP = "a".repeat(64);

function buildBlock(version: string, fingerprint: string, body: string): string {
  return `<!-- ui-hierarchy-mcp:start version=${version} fingerprint=${fingerprint} -->\n${body}\n<!-- ui-hierarchy-mcp:end -->`;
}

function sha(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

describe("marker constants", () => {
  it("MARKER_START_PREFIX is the literal start prefix", () => {
    expect(MARKER_START_PREFIX).toBe("<!-- ui-hierarchy-mcp:start");
  });
  it("MARKER_END is the literal end marker", () => {
    expect(MARKER_END).toBe("<!-- ui-hierarchy-mcp:end -->");
  });
  it("BLOCK_PATTERN is a RegExp", () => {
    expect(BLOCK_PATTERN).toBeInstanceOf(RegExp);
  });
});

describe("scanBlock", () => {
  it("returns {found:false} when no marker pair exists", () => {
    expect(scanBlock("# Title\nsome content")).toEqual({ found: false });
  });

  it("returns {found:false} when only start marker present", () => {
    expect(
      scanBlock(`<!-- ui-hierarchy-mcp:start version=v1 fingerprint=${FAKE_FP} -->\nbody\n`),
    ).toEqual({ found: false });
  });

  it("returns {found:false} when fingerprint is not 64 hex chars", () => {
    const bad = `<!-- ui-hierarchy-mcp:start version=v1 fingerprint=deadbeef -->\nbody\n<!-- ui-hierarchy-mcp:end -->`;
    expect(scanBlock(bad)).toEqual({ found: false });
  });

  it("returns {found:false} when fingerprint contains uppercase hex", () => {
    const bad = `<!-- ui-hierarchy-mcp:start version=v1 fingerprint=${"A".repeat(64)} -->\nbody\n<!-- ui-hierarchy-mcp:end -->`;
    expect(scanBlock(bad)).toEqual({ found: false });
  });

  it("captures version, fingerprint, body for well-formed block", () => {
    const block = buildBlock("v1", FAKE_FP, "hello world");
    const result = scanBlock(block);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.version).toBe("v1");
      expect(result.fingerprint).toBe(FAKE_FP);
      expect(result.body).toBe("hello world");
      expect(result.startIndex).toBe(0);
      expect(result.endIndex).toBe(block.length);
    }
  });

  it("fingerprint preimage equivalence (regex contract) — single-line body", () => {
    const bodyText = "single line body";
    const block = buildBlock("v1", FAKE_FP, bodyText);
    const r = scanBlock(block);
    expect(r.found).toBe(true);
    if (r.found) expect(r.body).toBe(bodyText);
  });

  it("fingerprint preimage equivalence (regex contract) — multi-line body", () => {
    const bodyText = "line one\nline two\nline three";
    const block = buildBlock("v1", FAKE_FP, bodyText);
    const r = scanBlock(block);
    expect(r.found).toBe(true);
    if (r.found) expect(r.body).toBe(bodyText);
  });

  it("fingerprint preimage equivalence (regex contract) — body with internal blank line", () => {
    const bodyText = "para one\n\npara two";
    const block = buildBlock("v1", FAKE_FP, bodyText);
    const r = scanBlock(block);
    expect(r.found).toBe(true);
    if (r.found) expect(r.body).toBe(bodyText);
  });

  it("locates block inside surrounding content with correct indices", () => {
    const prefix = "# Title\n\nIntro text.\n\n";
    const suffix = "\n\nMore content after.";
    const block = buildBlock("v2", FAKE_FP, "body here");
    const content = prefix + block + suffix;
    const r = scanBlock(content);
    expect(r.found).toBe(true);
    if (r.found) {
      expect(r.startIndex).toBe(prefix.length);
      expect(r.endIndex).toBe(prefix.length + block.length);
      expect(content.slice(r.startIndex, r.endIndex)).toBe(block);
    }
  });
});

describe("replaceBlock", () => {
  it("returns content with newBlock substituted at scan range", () => {
    const prefix = "# Title\n\n";
    const oldBlock = buildBlock("v1", FAKE_FP, "old body");
    const suffix = "\n\nfooter";
    const content = prefix + oldBlock + suffix;
    const scan = scanBlock(content);
    expect(scan.found).toBe(true);
    if (!scan.found) return;
    const newBlock = buildBlock("v2", "b".repeat(64), "new body");
    const result = replaceBlock(content, newBlock, scan);
    expect(result).toBe(prefix + newBlock + suffix);
  });

  it("preserves prefix and suffix bytes byte-for-byte (SHA-256 equality)", () => {
    const prefix = "# Title\n\n\nsome\tweird  spacing\r\nthat must survive\n";
    const oldBlock = buildBlock("v1", FAKE_FP, "old body");
    const suffix = "\n\nfooter line\n";
    const content = prefix + oldBlock + suffix;
    const prefixHash = sha(prefix);
    const suffixHash = sha(suffix);

    const scan = scanBlock(content);
    expect(scan.found).toBe(true);
    if (!scan.found) return;
    const newBlock = buildBlock("v2", "c".repeat(64), "new body content");
    const result = replaceBlock(content, newBlock, scan);

    const resultPrefix = result.slice(0, scan.startIndex);
    const resultSuffix = result.slice(scan.startIndex + newBlock.length);
    expect(sha(resultPrefix)).toBe(prefixHash);
    expect(sha(resultSuffix)).toBe(suffixHash);
  });
});

describe("appendBlock", () => {
  const NEW_BLOCK = "<!-- start -->X<!-- end -->";

  it("appends with single blank line after trimmed existing content", () => {
    expect(appendBlock("# Notes\n", NEW_BLOCK)).toBe("# Notes\n\n" + NEW_BLOCK);
  });

  it("collapses many trailing newlines to exactly one blank line", () => {
    expect(appendBlock("# Notes\n\n\n", NEW_BLOCK)).toBe("# Notes\n\n" + NEW_BLOCK);
  });

  it("collapses zero trailing newlines to exactly one blank line", () => {
    expect(appendBlock("# Notes", NEW_BLOCK)).toBe("# Notes\n\n" + NEW_BLOCK);
  });

  it("on empty existing string returns newBlock without leading blank lines (IN-03)", () => {
    expect(appendBlock("", NEW_BLOCK)).toBe(NEW_BLOCK);
  });

  it("on whitespace-only existing string returns newBlock without leading blank lines (IN-03)", () => {
    expect(appendBlock("   \n\n", NEW_BLOCK)).toBe(NEW_BLOCK);
  });
});
