import type { Metadata } from "next";
import { resolveLegalBrand } from "../brand";
import { LegalShell } from "../legal-shell";

export const metadata: Metadata = { title: "Política de Privacidade" };

const UPDATED_AT = "07 de julho de 2026";

export default async function PrivacyPage() {
  const brand = await resolveLegalBrand();
  return (
    <LegalShell brand={brand} title="Política de Privacidade" updatedAt={UPDATED_AT}>
      <p>
        Esta Política descreve como {brand.legalEntity}, operadora da plataforma {brand.name} ({brand.domain}),
        trata dados pessoais, em conformidade com a Lei nº 13.709/2018 (LGPD).
      </p>

      <h2>1. Dados que coletamos</h2>
      <ul>
        <li><strong>Cadastro:</strong> nome, e-mail, telefone, CPF/CNPJ e credenciais de acesso;</li>
        <li><strong>Operacionais:</strong> dados de vendas, ordens de serviço, estoque e transações financeiras registradas por você na Plataforma;</li>
        <li><strong>Verificação (KYC):</strong> documentos e informações exigidos por lei ou por parceiros de pagamento, quando aplicável;</li>
        <li><strong>Técnicos:</strong> registros de acesso, endereço IP, dispositivo e cookies necessários ao funcionamento.</li>
      </ul>

      <h2>2. Finalidades do tratamento</h2>
      <ul>
        <li>Prestar e operar os serviços da Plataforma;</li>
        <li>Processar pagamentos, recebimentos e conversões, incluindo prevenção a fraudes e cumprimento de obrigações legais e regulatórias (inclusive prevenção à lavagem de dinheiro);</li>
        <li>Comunicar-se com você sobre a conta, suporte e atualizações;</li>
        <li>Melhorar a segurança e a experiência da Plataforma.</li>
      </ul>

      <h2>3. Bases legais</h2>
      <p>
        Tratamos dados com fundamento na execução de contrato, no cumprimento de obrigação legal ou
        regulatória, no legítimo interesse (com salvaguardas) e no consentimento, quando exigido.
      </p>

      <h2>4. Compartilhamento</h2>
      <p>
        Compartilhamos dados apenas quando necessário: com provedores de infraestrutura, parceiros
        de pagamento e verificação de identidade, e com autoridades quando exigido por lei. Não
        vendemos dados pessoais.
      </p>

      <h2>5. Armazenamento e segurança</h2>
      <p>
        Adotamos medidas técnicas e organizacionais para proteger os dados, como criptografia de
        credenciais e controle de acesso. Retemos dados pelo período necessário às finalidades e ao
        cumprimento de obrigações legais.
      </p>

      <h2>6. Seus direitos (LGPD)</h2>
      <p>
        Você pode solicitar confirmação de tratamento, acesso, correção, anonimização, portabilidade,
        eliminação e informações sobre compartilhamento, além de revogar consentimento, nos termos da
        LGPD. Para exercê-los, contate {brand.contactEmail}.
      </p>

      <h2>7. Cookies</h2>
      <p>
        Utilizamos cookies essenciais ao funcionamento (por exemplo, sessão e segurança). Cookies não
        essenciais, quando houver, dependem de consentimento.
      </p>

      <h2>8. Transferências e terceiros</h2>
      <p>
        Serviços de terceiros (infraestrutura, pagamento, verificação) podem tratar dados conforme
        suas próprias políticas. Buscamos parceiros que ofereçam garantias adequadas de proteção.
      </p>

      <h2>9. Encarregado (DPO) e contato</h2>
      <p>Solicitações e dúvidas sobre privacidade: {brand.contactEmail}.</p>

      <h2>10. Alterações</h2>
      <p>Esta Política pode ser atualizada; mudanças relevantes serão comunicadas por meios razoáveis.</p>

      <p className="mt-8 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
        Documento-base fornecido para fins de estruturação. Recomenda-se revisão por assessoria
        jurídica/DPO antes da publicação, especialmente quanto a bases legais, retenção e KYC.
      </p>
    </LegalShell>
  );
}
