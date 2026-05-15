import { PageHeader } from "@/components/domain/page-header";
import { PendingReviewsList } from "./_components/pending-reviews-list";

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
      <PendingReviewsList />
    </div>
  );
}
