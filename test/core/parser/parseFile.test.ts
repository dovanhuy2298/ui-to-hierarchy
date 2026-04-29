import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ParseContext } from "../../../src/adapters/types.js";
import { parseFile } from "../../../src/core/parser/index.js";

const FIX = path.resolve("test/fixtures/parser/parse-errors");

function makeCtx(): ParseContext {
  return {
    resolvedRoot: path.resolve("."),
    tsconfig: null,
    astCache: new Map(),
    resolverCache: new Map(),
    warnings: [],
  };
}

describe("PARSE-01 parseFile", () => {
  it("returns kind:'ok' with ast for a valid file", () => {
    const ctx = makeCtx();
    const r = parseFile(ctx, path.join(FIX, "valid-baseline.tsx"));
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.ast.type).toBe("File");
  });

  it("returns kind:'error' with line number for unrecoverable syntax errors (no throw escapes)", () => {
    const ctx = makeCtx();
    const r = parseFile(ctx, path.join(FIX, "syntax-error.tsx"));
    expect(r.kind).toBe("error");
    if (r.kind === "error") {
      expect(typeof r.message).toBe("string");
      expect(r.message.length).toBeGreaterThan(0);
      expect(r.line).toBeGreaterThanOrEqual(1);
    }
  });

  it("returns kind:'error' with message+line=0 for unreadable file", () => {
    const ctx = makeCtx();
    const r = parseFile(ctx, path.join(FIX, "this-file-does-not-exist-xyz.tsx"));
    expect(r.kind).toBe("error");
    if (r.kind === "error") {
      expect(r.message).toMatch(/read failed/);
      expect(r.line).toBe(0);
    }
  });

  it("pushes a warning when errorRecovery recovers from a parse error", () => {
    const ctx = makeCtx();
    const r = parseFile(ctx, path.join(FIX, "recoverable.tsx"));
    // Either kind:'ok' with warnings (recoverable) or kind:'error' (Babel deems unrecoverable).
    // SPEC R1 acceptance allows both — both are valid PARSE-01 conformance.
    if (r.kind === "ok") {
      expect(ctx.warnings.some((w) => w.includes("parser recovered"))).toBe(true);
    } else {
      expect(r.kind).toBe("error");
    }
  });

  it("D-02: per-call cache returns the same object on re-entry (no re-parse)", () => {
    const ctx = makeCtx();
    const a = parseFile(ctx, path.join(FIX, "valid-baseline.tsx"));
    const b = parseFile(ctx, path.join(FIX, "valid-baseline.tsx"));
    expect(a).toBe(b); // identity, not just equality
    expect(ctx.astCache.size).toBe(1);
  });

  it("D-02: error result is also cached so re-entry doesn't re-throw", () => {
    const ctx = makeCtx();
    const a = parseFile(ctx, path.join(FIX, "syntax-error.tsx"));
    const b = parseFile(ctx, path.join(FIX, "syntax-error.tsx"));
    expect(a.kind).toBe("error");
    expect(a).toBe(b);
  });
});
