import { PageHeader } from "@/components/domain/page-header";
import { EmptyState } from "@/components/domain/empty-state";
import { Heart } from "lucide-react";

export const metadata = {
  title: "Interesses | Arena Tech",
};

export default function InterestsPage() {
  return (
    <div>
      <PageHeader title="Interesses" subtitle="Gerencie interesses dos clientes" />
      <EmptyState
        icon={Heart}
        title="Em breve"
        description="Modulo de interesses sera implementado em uma proxima fase."
      />
    </div>
  );
}
