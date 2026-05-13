import { PageHeader } from "@/components/domain/page-header";
import { SimulatorForm } from "./_components/simulator-form";

export const metadata = {
  title: "Simulador de Parcelamento | Arena Tech",
};

export default function SimulatorPage() {
  return (
    <div>
      <PageHeader
        title="Simulador de Parcelamento"
        subtitle="Calcule parcelas com taxas para seus clientes"
      />
      <SimulatorForm />
    </div>
  );
}
