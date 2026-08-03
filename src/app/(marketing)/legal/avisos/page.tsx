import type { Metadata } from "next";
import { resolveLegalBrand } from "../brand";
import { LegalShell } from "../legal-shell";
import { CURRENT_TERMS_LABEL } from "@/lib/legal/terms-version";

export const metadata: Metadata = { title: "Avisos e Disclaimers" };

// Fonte única da versão: o aceite do cadastro grava ESTA data (ADR 0065).
// Editou o texto? Mude `CURRENT_TERMS_VERSION` — um teste confere que as duas
// batem, para não existir documento novo com aceite carimbado como antigo.
const UPDATED_AT = CURRENT_TERMS_LABEL;

export default async function DisclosuresPage() {
  const brand = await resolveLegalBrand();
  return (
    <LegalShell brand={brand} title="Avisos e Disclaimers" updatedAt={UPDATED_AT}>
      <p>
        Estes Avisos complementam os Termos de Uso da plataforma {brand.name} ({brand.domain}),
        operada por {brand.legalEntity}, e esclarecem a natureza dos serviços.
      </p>

      <h2>1. Natureza do serviço</h2>
      <p>
        {brand.name} é uma plataforma de software para gestão comercial e recebimento/conversão de
        pagamentos. Não constitui instituição financeira, banco, corretora de valores mobiliários
        nem oferta de investimento, salvo quando expressamente indicado e nos limites da regulação.
      </p>

      <h2>2. Risco de ativos digitais</h2>
      <ul>
        <li>Ativos digitais (incluindo stablecoins e criptomoedas) têm preço volátil e risco de perda;</li>
        <li>Nenhuma informação na Plataforma constitui recomendação de investimento, consultoria financeira ou promessa de rentabilidade;</li>
        <li>Decisões de compra, venda ou conversão são de responsabilidade exclusiva do Usuário.</li>
      </ul>

      <h2>3. Aspectos tributários e cambiais</h2>
      <p>
        Operações com ativos digitais e conversões podem ter implicações tributárias e cambiais
        (inclusive IOF e normas do Banco Central). O Usuário é responsável por apurar e cumprir suas
        obrigações fiscais e regulatórias. As informações da Plataforma não substituem orientação
        contábil ou jurídica.
      </p>

      <h2>4. Serviços de terceiros</h2>
      <p>
        A Plataforma integra provedores terceiros de pagamento, verificação de identidade,
        infraestrutura e liquidez. Não nos responsabilizamos por indisponibilidade, taxas ou
        políticas próprias desses terceiros.
      </p>

      <h2>5. Prevenção a ilícitos</h2>
      <p>
        A Plataforma adota medidas de prevenção à lavagem de dinheiro e ao financiamento do
        terrorismo e pode solicitar informações, recusar operações ou reportar às autoridades
        conforme a legislação.
      </p>

      <h2>6. Contato</h2>
      <p>Dúvidas sobre estes Avisos: {brand.contactEmail}.</p>

      <p className="mt-8 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
        Documento-base fornecido para fins de estruturação. Recomenda-se revisão jurídica antes da
        publicação, especialmente quanto a enquadramento regulatório de ativos digitais e câmbio.
      </p>
    </LegalShell>
  );
}
