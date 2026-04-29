export function Neg({ ok }: { ok: boolean }) {
  return (
    <div>
      {!ok && <span>nope</span>}
      {!!ok && <span>yep</span>}
    </div>
  );
}
