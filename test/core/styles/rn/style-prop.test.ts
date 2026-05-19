import { describe, it } from "vitest";
import {
  extractRNInlineStyle,
  extractNativeWindClassNames,
} from "../../../../src/core/styles/rn/style-prop.js";
import { parse } from "@babel/parser";

// Reference imports to satisfy the compiler — stubs are the target under test.
void extractRNInlineStyle;
void extractNativeWindClassNames;
void parse;

describe("RN-05 extractRNInlineStyle", () => {
  it.todo("delegates to v1.0 extractInlineStyle for style={{fontWeight:'bold'}}");
  it.todo("returns __raw__ sentinel for computed expr style={x}");
});

describe("RN-07 extractNativeWindClassNames", () => {
  it.todo(
    "strips ios:/android:/web:/native: variants from className string and tokenizes on whitespace — yields p-4 p-2 text-lg",
  );
  it.todo(
    "returns [] and pushes warning when className={tw`text-lg`} tagged template",
  );
  it.todo("returns [] for missing className attribute");
});
