import type { ParserPlugin } from "@babel/parser";

/**
 * PARSE-01 plugin set — locked by SPEC.md and CLAUDE.md.
 *
 * Adds 4 plugins beyond the prototype's set (classPrivateProperties,
 * classPrivateMethods, importAssertions, explicitResourceManagement)
 * so we accept current TC39 syntax without surprise parse errors.
 */
export const PARSER_PLUGINS: readonly ParserPlugin[] = [
  "jsx",
  "typescript",
  "decorators-legacy",
  "classProperties",
  "classPrivateProperties",
  "classPrivateMethods",
  "dynamicImport",
  "topLevelAwait",
  "importAssertions",
  "explicitResourceManagement",
];
