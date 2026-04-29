export function T({ ok }: { ok: boolean }) {
  return <div>{ok ? <span>yes</span> : <span>no</span>}</div>;
}
