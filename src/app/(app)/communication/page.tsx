import Link from "next/link";
import { Send, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { MessageHistory } from "./_components/message-history";

export const metadata = {
  title: "Comunicacao | Arena Tech",
};

export default function CommunicationPage() {
  return (
    <div>
      <PageHeader
        title="Comunicacao"
        subtitle="Historico de mensagens WhatsApp e e-mail"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/communication/templates">
                <FileText className="mr-2 h-4 w-4" />
                Templates
              </Link>
            </Button>
            <Button asChild>
              <Link href="/communication/send">
                <Send className="mr-2 h-4 w-4" />
                Enviar Mensagem
              </Link>
            </Button>
          </div>
        }
      />
      <MessageHistory />
    </div>
  );
}
