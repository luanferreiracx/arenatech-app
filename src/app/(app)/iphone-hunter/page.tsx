import { PageHeader } from "@/components/domain/page-header";
import { IPhoneHunterSearch } from "./_components/iphone-hunter-search";

export const metadata = {
  title: "Buscador de iPhones nos Grupos | Arena Tech",
};

export default function IPhoneHunterPage() {
  return (
    <div>
      <PageHeader
        title="Buscador de iPhones nos Grupos"
        subtitle="iPhones com caixa anunciados nos grupos REVENDA nas últimas 48 horas"
      />
      <IPhoneHunterSearch />
    </div>
  );
}
