import { PageHeader } from "@/components/domain/page-header";
import { SendMessageForm } from "../_components/send-message-form";

export default function SendMessagePage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Enviar Mensagem"
        subtitle="Envio manual de mensagem via WhatsApp ou E-mail"
      />
      <SendMessageForm />
    </div>
  );
}
