import { PageHeader } from "@/components/domain/page-header";
import { RewardCampaignsManager } from "./_components/reward-campaigns-manager";

export default function FidelidadePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Fidelidade"
        subtitle="Campanhas de recompensa — o cliente publica (story/reel/post) e ganha desconto, cashback ou brinde"
      />
      <RewardCampaignsManager />
    </div>
  );
}
