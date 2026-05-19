import { describe, it } from "vitest";
import { parseStyleSheetCreate } from "../../../../src/core/styles/rn/stylesheet-create.js";
import { parse } from "@babel/parser";

// Reference imports to satisfy the compiler — stubs are the target under test.
void parseStyleSheetCreate;
void parse;

describe("RN-04 + RN-08 parseStyleSheetCreate", () => {
  it.todo(
    "extracts literal keys from in-file StyleSheet.create({...}) into varName→keys map",
  );
  it.todo(
    "returns empty map and emits raw warning when argument is computed key {[k]:{}} — RN-08",
  );
  it.todo(
    "returns empty map and emits raw warning when argument is factory call StyleSheet.create(getStyles()) — RN-08",
  );
  it.todo(
    "resolves one-hop import when caller passes pre-parsed AST (D-03 contract)",
  );
  it.todo(
    "two-hop import returns empty and emits warning — RN-08 fallback",
  );
});
