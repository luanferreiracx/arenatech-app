import { PageHeader } from "@/components/domain/page-header";
import { SendMessageForm } from "../_components/send-message-form";

export const metadata = {
  title: "Enviar Mensagem | Arena Tech",
};

export default function SendMessagePage() {
  return (
    <div>
      <PageHeader title="Enviar Mensagem" subtitle="Envie mensagem via WhatsApp ou e-mail" />
      <SendMessageForm />
    </div>
  );
}
