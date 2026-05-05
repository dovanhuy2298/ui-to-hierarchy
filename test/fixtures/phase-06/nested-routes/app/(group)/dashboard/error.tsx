"use client";
export default function DashboardError({ error }: { error: Error }) {
  return <div>Error: {error.message}</div>;
}
