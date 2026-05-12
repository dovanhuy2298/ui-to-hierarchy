import { readFileSync } from "node:fs";
import { parse, type ParseError, type ParserPlugin } from "@babel/parser";
import type {
  ClassDeclaration,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  FunctionDeclaration,
  Statement,
  VariableDeclaration,
} from "@babel/types";
// Type-only import of parser-level contracts (ParseContext, ParseResult).
// The adapter island invariant (D-11) forbids runtime coupling; `import type`
// is erased at compile time and produces no runtime edge from src/core/ to
// src/adapters/. Plan 03-02 explicitly acknowledges this exception.
// biome-ignore lint/style/noRestrictedImports: type-only import; erased at compile time (D-11 island invariant unaffected)
import type { ParseContext, ParseResult } from "../../adapters/types.js";
import { toForwardSlash } from "../paths.js";
import { PARSER_PLUGINS } from "./plugins.js";

type BabelParseReturn = ReturnType<typeof parse>;

/**
 * collectDeclLines — Phase 8 / POLISH-03 D-01.
 *
 * Flat walk over `program.body` building a name→declaration-line map for
 * top-level bindings AI agents are likely to ask about. Component
 * declarations are top-level by convention, so a flat scan is sufficient —
 * no @babel/traverse required.
 *
 * Recorded:
 *   - Named `FunctionDeclaration`
 *   - `VariableDeclarator` with Identifier id and arrow/function init
 *   - Named `ClassDeclaration`
 *   - `ExportSpecifier` re-export names (`export { X as Y } from "..."`)
 *   - Named function/class wrapped in `ExportNamedDeclaration` / `ExportDefaultDeclaration`
 *
 * Not recorded: anonymous default exports (no binding name) — callers fall
 * back to `line: 1` per D-03.
 */
function collectDeclLines(body: Statement[]): Map<string, number> {
  const out = new Map<string, number>();

  const recordFunction = (node: FunctionDeclaration): void => {
    const id = node.id;
    if (id && id.name) {
      const line = id.loc?.start.line ?? node.loc?.start.line;
      if (line !== undefined) out.set(id.name, line);
    }
  };

  const recordClass = (node: ClassDeclaration): void => {
    const id = node.id;
    if (id && id.name) {
      const line = id.loc?.start.line ?? node.loc?.start.line;
      if (line !== undefined) out.set(id.name, line);
    }
  };

  const recordVariable = (node: VariableDeclaration): void => {
    for (const decl of node.declarations) {
      if (decl.id.type !== "Identifier") continue;
      const init = decl.init;
      if (!init) continue;
      if (init.type !== "ArrowFunctionExpression" && init.type !== "FunctionExpression") continue;
      const line = decl.id.loc?.start.line ?? decl.loc?.start.line;
      if (line !== undefined) out.set(decl.id.name, line);
    }
  };

  const recordNamedExport = (node: ExportNamedDeclaration): void => {
    const inner = node.declaration;
    if (inner) {
      if (inner.type === "FunctionDeclaration") recordFunction(inner);
      else if (inner.type === "ClassDeclaration") recordClass(inner);
      else if (inner.type === "VariableDeclaration") recordVariable(inner);
    }
    for (const spec of node.specifiers) {
      if (spec.type !== "ExportSpecifier") continue;
      const exported = spec.exported;
      // `exported` is Identifier | StringLiteral; only Identifier has `.name`.
      if (exported.type !== "Identifier") continue;
      const line = exported.loc?.start.line ?? spec.loc?.start.line;
      if (line !== undefined) out.set(exported.name, line);
    }
  };

  const recordDefaultExport = (node: ExportDefaultDeclaration): void => {
    const inner = node.declaration;
    // Only named declarations get an entry; anonymous arrow/function/class
    // defaults are intentionally skipped (D-03 fallback covers them).
    if (inner.type === "FunctionDeclaration" && inner.id) recordFunction(inner);
    else if (inner.type === "ClassDeclaration" && inner.id) recordClass(inner);
  };

  for (const stmt of body) {
    switch (stmt.type) {
      case "FunctionDeclaration":
        recordFunction(stmt);
        break;
      case "ClassDeclaration":
        recordClass(stmt);
        break;
      case "VariableDeclaration":
        recordVariable(stmt);
        break;
      case "ExportNamedDeclaration":
        recordNamedExport(stmt);
        break;
      case "ExportDefaultDeclaration":
        recordDefaultExport(stmt);
        break;
      default:
        // Skip imports, type-only statements, expression statements, etc.
        break;
    }
  }

  return out;
}

/**
 * parseFile — PARSE-01 + D-02 (per-call AST cache).
 *
 * Pure function over `ParseContext`. Reads `absPath`, parses with the locked
 * plugin set + `errorRecovery: true`, and returns a discriminated `ParseResult`
 * (no throws). Result is cached on the forward-slash absolute path so re-entry
 * (e.g. barrel chasing in the resolver) returns the same object via `===`.
 *
 * - Read failures and unrecoverable Babel ParseErrors map to `{ kind: "error" }`.
 * - Recoverable parse errors keep `{ kind: "ok" }` and append a warning to
 *   `ctx.warnings` so downstream layers can surface them via the MCP envelope.
 */
export function parseFile(ctx: ParseContext, absPath: string): ParseResult {
  const norm = toForwardSlash(absPath);
  const cached = ctx.astCache.get(norm);
  if (cached) return cached;

  let source: string;
  try {
    source = readFileSync(absPath, "utf8");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const result: ParseResult = { kind: "error", message: `read failed: ${message}`, line: 0 };
    ctx.astCache.set(norm, result);
    return result;
  }

  let ast: BabelParseReturn;
  try {
    ast = parse(source, {
      sourceType: "module",
      sourceFilename: absPath,
      plugins: PARSER_PLUGINS as ParserPlugin[],
      errorRecovery: true,
    });
  } catch (err: unknown) {
    const parseErr = err as ParseError | undefined;
    const line = parseErr?.loc?.line ?? 1;
    const message = err instanceof Error ? err.message : String(err);
    const result: ParseResult = { kind: "error", message, line };
    ctx.astCache.set(norm, result);
    return result;
  }

  const recovered = ast.errors?.length ?? 0;
  if (recovered > 0) {
    ctx.warnings.push(`parser recovered from ${recovered} error(s) in ${norm}`);
  }

  const declLines = collectDeclLines(ast.program.body);

  const result: ParseResult = { kind: "ok", ast, source, declLines };
  ctx.astCache.set(norm, result);
  return result;
}
