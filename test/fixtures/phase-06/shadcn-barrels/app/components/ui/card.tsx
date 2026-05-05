export function Card({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col rounded-lg border p-4">{children}</div>;
}
