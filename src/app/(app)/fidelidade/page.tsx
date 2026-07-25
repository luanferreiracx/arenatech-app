import { PageHeader } from "@/components/domain/page-header";
import { FidelidadeTabs } from "./_components/fidelidade-tabs";

export default function FidelidadePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Fidelidade"
        subtitle="Campanhas de recompensa — o cliente publica (story/reel/post) e ganha desconto, cashback ou brinde"
      />
      <FidelidadeTabs />
    </div>
  );
}
