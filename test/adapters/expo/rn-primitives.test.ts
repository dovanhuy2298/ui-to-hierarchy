import { describe, it } from "vitest";

describe("RN_PRIMITIVES allowlist", () => {
  it.todo("allowlist contains View");
  it.todo("allowlist contains Text");
  it.todo("allowlist contains ScrollView");
  it.todo("allowlist contains Image");
  it.todo("allowlist contains Pressable");
  it.todo("allowlist contains TouchableOpacity");
  it.todo("allowlist contains TouchableHighlight");
  it.todo("allowlist contains TouchableWithoutFeedback");
  it.todo("allowlist contains FlatList");
  it.todo("allowlist contains SectionList");
  it.todo("allowlist contains Modal");
  it.todo("allowlist contains KeyboardAvoidingView");
  it.todo("allowlist contains SafeAreaView");
});

describe("isRNPrimitive", () => {
  it.todo("isRNPrimitive('Text', 'react-native') returns true");
  it.todo("isRNPrimitive('Text', '@/components/Text') returns false — wrong source");
  it.todo("isRNPrimitive('Unknown', 'react-native') returns false — not in allowlist");
});
