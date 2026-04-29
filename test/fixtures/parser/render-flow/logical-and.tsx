export function A({ ok }: { ok: boolean }) {
  return <div>{ok && <span>yes</span>}</div>;
}
