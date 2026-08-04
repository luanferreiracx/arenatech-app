import type { Metadata } from "next";
import { PageHeader } from "@/components/domain/page-header";
import { WhatsappCloudForm } from "./_components/whatsapp-cloud-form";

export const metadata: Metadata = { title: "WhatsApp | Arena Tech" };

/**
 * Conexão do WhatsApp da loja com a API oficial da Meta (Cloud API).
 *
 * Server Component: o cabeçalho é estático e não precisa de JS no cliente. Só o
 * formulário — que tem estado, testa conexão e mostra resultado — é client.
 */
export default function WhatsappSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp"
        subtitle="Conecte o WhatsApp Business da sua loja para enviar mensagens aos clientes."
      />
      <WhatsappCloudForm />
    </div>
  );
}
