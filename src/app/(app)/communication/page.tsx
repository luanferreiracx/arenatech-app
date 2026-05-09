import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { MessagesTable } from "./_components/messages-table";

export default function CommunicationPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Comunicação"
        subtitle="Histórico de mensagens e notificações"
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href="/communication/templates">Templates</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/communication/send">Enviar Mensagem</Link>
            </Button>
          </div>
        }
      />
      <MessagesTable />
    </div>
  );
}
