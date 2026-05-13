import { PageHeader } from "@/components/domain/page-header";
import { AdminDashboard } from "./_components/admin-dashboard";

export const metadata = {
  title: "Admin Central | Arena Tech",
};

export default function AdminPage() {
  return (
    <div>
      <PageHeader title="Admin Central" subtitle="Painel de administracao da plataforma" />
      <AdminDashboard />
    </div>
  );
}
