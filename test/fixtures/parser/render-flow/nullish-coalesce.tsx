export function N({ a }: { a?: any }) {
  return <div>{a ?? <span>fallback</span>}</div>;
}
