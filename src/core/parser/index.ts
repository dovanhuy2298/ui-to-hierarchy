import { readFileSync } from "node:fs";
import { parse, type ParseError, type ParserPlugin } from "@babel/parser";
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

  const result: ParseResult = { kind: "ok", ast, source };
  ctx.astCache.set(norm, result);
  return result;
}
