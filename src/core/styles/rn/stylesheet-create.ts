/**
 * RN StyleSheet.create() index builder (D-03 / RN-04 / RN-08).
 *
 * For a parsed module, traverse the AST and locate every
 * `StyleSheet.create({ ... })` call-expression assigned to a local variable.
 * Return a map: varName → string[] of top-level keys defined in that object.
 *
 * Supported:
 *   - In-file literal object: `const styles = StyleSheet.create({ card: {...}, text: {...} })`
 *   - One-hop import: caller resolves the imported file's AST and passes it in (D-03 contract).
 *
 * Unsupported (degrade to empty map + raw warning — RN-08):
 *   - Computed keys:    `StyleSheet.create({ [k]: { ... } })`
 *   - Factory call:     `StyleSheet.create(getStyles())`
 *   - Hook return:      `StyleSheet.create(useStyles())`
 *   - Two-hop import:   caller cannot follow more than one hop.
 *
 * Island rule: ZERO imports from src/adapters/ — this file is a core utility.
 * traverse must be imported from "../../babel-shim.js" (never directly from @babel/traverse).
 */

import * as t from "@babel/types";
import { traverse } from "../../babel-shim.js";

export function parseStyleSheetCreate(
  ast: t.File,
  source: string,
  warnings: string[],
  file: string,
): Map<string, string[]> {
  // Wave 1: implement per RESEARCH Pattern 1
  void traverse; // imported for Wave 1 use; suppress unused-import lint
  void source;
  void warnings;
  void file;
  return new Map();
}
