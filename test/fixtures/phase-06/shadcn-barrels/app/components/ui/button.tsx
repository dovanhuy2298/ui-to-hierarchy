export function Button({ children }: { children: React.ReactNode }) {
  return <button className="flex items-center gap-2 px-4 py-2">{children}</button>;
}
