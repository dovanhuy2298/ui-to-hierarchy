import { View, Text, StyleSheet } from "react-native";
const styles = StyleSheet.create({ card: { padding: 8 }, bold: { fontWeight: "bold" } });
export default function HomeTab({ active }: { active?: boolean }) {
  return (
    <View style={[styles.card, active && styles.bold]}>
      <Text style={{ fontWeight: "bold" }} className="ios:p-4 android:p-2 text-lg">Home</Text>
    </View>
  );
}
