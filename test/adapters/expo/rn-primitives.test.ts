import { describe, expect, it } from "vitest";
import { RN_PRIMITIVES, isRNPrimitive } from "../../../src/adapters/expo/rn-primitives.js";

describe("RN_PRIMITIVES allowlist", () => {
  it("allowlist contains exactly 13 members (SPEC Req 9)", () => {
    expect(RN_PRIMITIVES.size).toBe(13);
  });

  it("allowlist contains View", () => {
    expect(RN_PRIMITIVES.has("View")).toBe(true);
  });

  it("allowlist contains Text", () => {
    expect(RN_PRIMITIVES.has("Text")).toBe(true);
  });

  it("allowlist contains ScrollView", () => {
    expect(RN_PRIMITIVES.has("ScrollView")).toBe(true);
  });

  it("allowlist contains Image", () => {
    expect(RN_PRIMITIVES.has("Image")).toBe(true);
  });

  it("allowlist contains Pressable", () => {
    expect(RN_PRIMITIVES.has("Pressable")).toBe(true);
  });

  it("allowlist contains TouchableOpacity", () => {
    expect(RN_PRIMITIVES.has("TouchableOpacity")).toBe(true);
  });

  it("allowlist contains TouchableHighlight", () => {
    expect(RN_PRIMITIVES.has("TouchableHighlight")).toBe(true);
  });

  it("allowlist contains TouchableWithoutFeedback", () => {
    expect(RN_PRIMITIVES.has("TouchableWithoutFeedback")).toBe(true);
  });

  it("allowlist contains FlatList", () => {
    expect(RN_PRIMITIVES.has("FlatList")).toBe(true);
  });

  it("allowlist contains SectionList", () => {
    expect(RN_PRIMITIVES.has("SectionList")).toBe(true);
  });

  it("allowlist contains Modal", () => {
    expect(RN_PRIMITIVES.has("Modal")).toBe(true);
  });

  it("allowlist contains KeyboardAvoidingView", () => {
    expect(RN_PRIMITIVES.has("KeyboardAvoidingView")).toBe(true);
  });

  it("allowlist contains SafeAreaView", () => {
    expect(RN_PRIMITIVES.has("SafeAreaView")).toBe(true);
  });
});

describe("isRNPrimitive", () => {
  it("isRNPrimitive('Text', 'react-native') returns true", () => {
    expect(isRNPrimitive("Text", "react-native")).toBe(true);
  });

  it("isRNPrimitive('View', 'react-native') returns true", () => {
    expect(isRNPrimitive("View", "react-native")).toBe(true);
  });

  it("isRNPrimitive('Text', '@/components/Text') returns false — wrong source (SPEC Req 10)", () => {
    expect(isRNPrimitive("Text", "@/components/Text")).toBe(false);
  });

  it("isRNPrimitive('Text', '') returns false — empty importSource", () => {
    expect(isRNPrimitive("Text", "")).toBe(false);
  });

  it("isRNPrimitive('Unknown', 'react-native') returns false — not in allowlist", () => {
    expect(isRNPrimitive("Unknown", "react-native")).toBe(false);
  });

  it("isRNPrimitive('text', 'react-native') returns false — case-sensitive (lowercase not allowed)", () => {
    expect(isRNPrimitive("text", "react-native")).toBe(false);
  });

  it("isRNPrimitive('view', 'react-native') returns false — case-sensitive", () => {
    expect(isRNPrimitive("view", "react-native")).toBe(false);
  });

  it("isRNPrimitive('ScrollView', 'react-native-safe-area-context') returns false — must be exactly react-native", () => {
    expect(isRNPrimitive("ScrollView", "react-native-safe-area-context")).toBe(false);
  });

  it("requires BOTH allowlist membership AND exact importSource", () => {
    // In allowlist, wrong source → false
    expect(isRNPrimitive("FlatList", "react-native-components")).toBe(false);
    // Not in allowlist, correct source → false
    expect(isRNPrimitive("Button", "react-native")).toBe(false);
    // Both correct → true
    expect(isRNPrimitive("FlatList", "react-native")).toBe(true);
  });
});
