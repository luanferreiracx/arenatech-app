import { PageHeader } from "@/components/domain/page-header";
import { PendingReviewsList } from "./_components/pending-reviews-list";
import { OpenSessionsManager } from "./_components/open-sessions-manager";

export const metadata = {
  title: "Conferencias Pendentes | Arena Tech",
};

export default function CashierReviewsPage() {
  return (
    <div>
      <PageHeader
        title="Conferencias Pendentes"
        subtitle="Caixas fechados que aguardam conferencia de gerente/admin"
      />
      <OpenSessionsManager />
      <PendingReviewsList />
    </div>
  );
}
