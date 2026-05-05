export default function DashboardDetail({ params }: { params: { id: string } }) {
  return <main>Dashboard {params.id}</main>;
}
