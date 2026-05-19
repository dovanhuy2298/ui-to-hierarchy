/**
 * React Native primitive allowlist (Phase 12, ROUTE-05 / SPEC Req 9).
 *
 * Provides:
 * - `RN_PRIMITIVES`: exact Set of 13 React Native core component names.
 * - `isRNPrimitive(tagName, importSource)`: returns true ONLY when both
 *   the tag is in the allowlist AND importSource === "react-native".
 *   This disambiguation (SPEC Req 10) prevents false positives from
 *   user-defined components with the same name (e.g. @/components/Text).
 *
 * Island rule: this file MAY import from ../../core/import-bindings.js
 * (type-only). It MUST NOT be imported from src/core/.
 */

/**
 * Exact set of React Native core primitive component names.
 * SPEC Req 9 — exactly 13 members.
 */
export const RN_PRIMITIVES: Set<string> = new Set([
  "View",
  "Text",
  "ScrollView",
  "Image",
  "Pressable",
  "TouchableOpacity",
  "TouchableHighlight",
  "TouchableWithoutFeedback",
  "FlatList",
  "SectionList",
  "Modal",
  "KeyboardAvoidingView",
  "SafeAreaView",
]);

/**
 * Returns true when `tagName` is in the RN primitives allowlist AND
 * `importSource` is exactly "react-native" (SPEC Req 10 disambiguation).
 *
 * Case-sensitive: "text" !== "Text".
 */
export function isRNPrimitive(tagName: string, importSource: string): boolean {
  return RN_PRIMITIVES.has(tagName) && importSource === "react-native";
}
