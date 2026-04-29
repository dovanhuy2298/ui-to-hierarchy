import Card from "../../../components/Card";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-layout">
      <Sidebar>
        <Card />
      </Sidebar>
      <main>{children}</main>
    </div>
  );
}
