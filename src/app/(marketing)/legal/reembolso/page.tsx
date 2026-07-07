import type { Metadata } from "next";
import { resolveLegalBrand } from "../brand";
import { LegalShell } from "../legal-shell";

export const metadata: Metadata = { title: "Política de Reembolso" };

const UPDATED_AT = "07 de julho de 2026";

export default async function RefundPage() {
  const brand = await resolveLegalBrand();
  return (
    <LegalShell brand={brand} title="Política de Reembolso" updatedAt={UPDATED_AT}>
      <p>
        Esta Política descreve as condições de reembolso aplicáveis aos serviços da plataforma
        {" "}{brand.name} ({brand.domain}), operada por {brand.legalEntity}.
      </p>

      <h2>1. Assinaturas e mensalidades da Plataforma</h2>
      <ul>
        <li>Assinaturas do software podem ser canceladas a qualquer momento; o cancelamento encerra a renovação seguinte.</li>
        <li>Nos termos do art. 49 do Código de Defesa do Consumidor, o direito de arrependimento em contratações à distância pode ser exercido em até 7 (sete) dias, quando aplicável.</li>
        <li>Valores proporcionais a período já usufruído podem não ser reembolsáveis, salvo disposição legal em contrário.</li>
      </ul>

      <h2>2. Operações com ativos digitais e conversão</h2>
      <p>
        Operações de compra, venda ou conversão entre reais (BRL) e ativos digitais são executadas a
        preço de mercado no momento da confirmação e, por sua natureza, <strong>não são reversíveis
        nem reembolsáveis</strong> após a liquidação. O Usuário confirma o valor, as taxas e o
        spread antes de concluir a operação. Variações de preço posteriores à liquidação não geram
        direito a reembolso.
      </p>

      <h2>3. Pagamentos recebidos de terceiros</h2>
      <p>
        Pagamentos recebidos por você de seus próprios clientes (por exemplo, vendas no PDV) seguem a
        relação entre você e o pagador. Estornos e devoluções desses valores são regidos pelas
        condições da respectiva venda e pelos meios de pagamento envolvidos.
      </p>

      <h2>4. Como solicitar</h2>
      <p>
        Solicitações de reembolso elegíveis devem ser feitas por {brand.contactEmail}, com os dados
        da operação. Analisaremos e responderemos em prazo razoável, podendo solicitar informações
        adicionais para verificação.
      </p>

      <h2>5. Prazos de processamento</h2>
      <p>
        Reembolsos aprovados são processados pelo mesmo meio de pagamento sempre que possível, em
        prazo compatível com o provedor de pagamento utilizado.
      </p>

      <p className="mt-8 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
        Documento-base fornecido para fins de estruturação. Recomenda-se revisão jurídica,
        especialmente quanto à irreversibilidade de operações com ativos digitais e ao CDC.
      </p>
    </LegalShell>
  );
}
