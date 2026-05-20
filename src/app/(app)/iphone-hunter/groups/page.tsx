import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { IPhoneHunterGroups } from "../_components/iphone-hunter-groups";

export const metadata = {
  title: "Grupos monitorados | Arena Tech",
};

export default function IPhoneHunterGroupsPage() {
  return (
    <div>
      <PageHeader
        title="Grupos monitorados"
        subtitle="Selecione quais grupos WhatsApp serão escaneados em busca de iPhones"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/iphone-hunter">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        }
      />
      <IPhoneHunterGroups />
    </div>
  );
}
