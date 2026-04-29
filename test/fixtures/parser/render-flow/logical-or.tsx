export function O({ a }: { a?: any }) {
  return <div>{a || <span>fallback</span>}</div>;
}
