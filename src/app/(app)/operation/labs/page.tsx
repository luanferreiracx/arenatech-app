import { PageHeader } from "@/components/domain/page-header";
import { LabsTable } from "./_components/labs-table";

export default function LabsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Laboratórios Externos"
        subtitle="Gerencie os laboratórios parceiros"
      />
      <LabsTable />
    </div>
  );
}
