import { describe, it } from "vitest";
import { flattenStyleArray } from "../../../../src/core/styles/rn/index.js";
import { parse } from "@babel/parser";

// Reference imports to satisfy the compiler — stubs are the target under test.
void flattenStyleArray;
void parse;

describe("RN-06 flattenStyleArray", () => {
  it.todo("resolves MemberExpression styles.card to fileStyleIndex keys");
  it.todo("unions keys from two MemberExpression members styles.a + styles.b");
  it.todo("includes right-side keys from LogicalExpression && conditional");
  it.todo("includes right-side keys from LogicalExpression || conditional");
  it.todo("passes StringLiteral element through as a key");
  it.todo("skips null sparse-array hole and BooleanLiteral false element");
  it.todo("warns on CallExpression element and skips it");
  it.todo("warns on nested ArrayExpression element and skips it");
  it.todo("warns when MemberExpression varName not present in fileStyleIndex");
});
