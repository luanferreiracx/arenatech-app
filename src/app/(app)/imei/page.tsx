import { PageHeader } from "@/components/domain/page-header";
import { ImeiLookup } from "./_components/imei-lookup";

export default function ImeiPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Consulta IMEI"
        subtitle="Verifique informações de dispositivos pelo IMEI"
      />
      <ImeiLookup />
    </div>
  );
}
