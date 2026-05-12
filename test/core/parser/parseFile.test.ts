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

// ──────────────────────────────────────────────────────────────────
// Phase 8 / POLISH-03 D-01 — declLines population
// Fixture: test/fixtures/parser/parse-errors/decl-lines.tsx
//   Line  5: export function Foo
//   Line  9: export const Bar = () => ...
//   Line 13: export class Baz
//   Line 19: export { Renamed as Outer } from "./renamed-source.js"
//   Line 21: export default () => null   (anonymous — NOT recorded)
// ──────────────────────────────────────────────────────────────────
describe("POLISH-03 D-01 parseFile.declLines", () => {
  it("records FunctionDeclaration name at its declaration line", () => {
    const ctx = makeCtx();
    const r = parseFile(ctx, path.join(FIX, "decl-lines.tsx"));
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.declLines.get("Foo")).toBe(5);
  });

  it("records VariableDeclarator with arrow init at its declaration line", () => {
    const ctx = makeCtx();
    const r = parseFile(ctx, path.join(FIX, "decl-lines.tsx"));
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.declLines.get("Bar")).toBe(9);
  });

  it("records ClassDeclaration name at its declaration line", () => {
    const ctx = makeCtx();
    const r = parseFile(ctx, path.join(FIX, "decl-lines.tsx"));
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.declLines.get("Baz")).toBe(13);
  });

  it("records ExportSpecifier re-export name with line > 0", () => {
    const ctx = makeCtx();
    const r = parseFile(ctx, path.join(FIX, "decl-lines.tsx"));
    if (r.kind !== "ok") throw new Error("expected ok");
    const outerLine = r.declLines.get("Outer");
    expect(outerLine).toBeGreaterThan(0);
    expect(outerLine).toBe(19);
  });

  it("does NOT record anonymous default exports", () => {
    const ctx = makeCtx();
    const r = parseFile(ctx, path.join(FIX, "decl-lines.tsx"));
    if (r.kind !== "ok") throw new Error("expected ok");
    // Anonymous `export default () => null` has no binding name to record.
    expect(r.declLines.has("default")).toBe(false);
  });

  it("declLines is present on the ok variant for the baseline fixture", () => {
    const ctx = makeCtx();
    const r = parseFile(ctx, path.join(FIX, "valid-baseline.tsx"));
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.declLines).toBeInstanceOf(Map);
    // valid-baseline.tsx declares `export function Hello() { ... }` on line 1.
    expect(r.declLines.get("Hello")).toBe(1);
  });

  it("D-02 cache identity holds — same result object on re-entry (no re-parse)", () => {
    const ctx = makeCtx();
    const a = parseFile(ctx, path.join(FIX, "decl-lines.tsx"));
    const b = parseFile(ctx, path.join(FIX, "decl-lines.tsx"));
    expect(a).toBe(b);
  });

  // ──────────────────────────────────────────────────────────────
  // WR-02 — forwardRef / memo / styled wrapping should record the
  // binding's declaration line, not fall back to 1. Fixture lines:
  //   Line 12: export const Button = forwardRef<...>(...)
  //   Line 16: export const Card = memo(function Card(...) { ... })
  //   Line 20: export const Box = styled.div`...`
  // ──────────────────────────────────────────────────────────────
  it("records VariableDeclarator with forwardRef CallExpression init at its declaration line", () => {
    const ctx = makeCtx();
    const r = parseFile(ctx, path.join(FIX, "forwardref-component.tsx"));
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.declLines.get("Button")).toBe(12);
  });

  it("records VariableDeclarator with memo CallExpression init at its declaration line", () => {
    const ctx = makeCtx();
    const r = parseFile(ctx, path.join(FIX, "forwardref-component.tsx"));
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.declLines.get("Card")).toBe(16);
  });

  it("records VariableDeclarator with styled TaggedTemplateExpression init at its declaration line", () => {
    const ctx = makeCtx();
    const r = parseFile(ctx, path.join(FIX, "forwardref-component.tsx"));
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.declLines.get("Box")).toBe(20);
  });
});
