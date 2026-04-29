export function Nested({ items, ok }: { items: { id: string }[]; ok: boolean }) {
  return (
    <>
      {ok ? items.map((it) => <span key={it.id}>{it.id}</span>) : <em>empty</em>}
    </>
  );
}
