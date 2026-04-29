export default function StyledThing() {
  return (
    <div className="flex items-center">
      <span style={{ marginTop: 8, color: "red" }}>styled</span>
      <p className="flex" style={{ flex: 1 }}>dedup-target</p>
    </div>
  );
}
