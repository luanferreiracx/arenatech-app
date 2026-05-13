import { PageHeader } from "@/components/domain/page-header";
import { ImeiConsult } from "./_components/imei-consult";

export const metadata = {
  title: "Consulta IMEI | Arena Tech",
};

export default function ImeiPage() {
  return (
    <div>
      <PageHeader title="Consulta IMEI" subtitle="Consulte informacoes de dispositivos por IMEI" />
      <ImeiConsult />
    </div>
  );
}
