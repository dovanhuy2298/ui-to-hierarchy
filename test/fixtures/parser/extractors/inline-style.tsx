const dyn = 12;
const rest = { color: "blue" };
export function InlineStyle() {
  return <div style={{ color: "red", padding: 8, fontSize: dyn, ...rest }}>x</div>;
}
