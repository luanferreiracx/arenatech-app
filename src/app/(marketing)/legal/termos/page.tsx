import type { Metadata } from "next";
import { resolveLegalBrand } from "../brand";
import { LegalShell } from "../legal-shell";

export const metadata: Metadata = { title: "Termos de Uso" };

const UPDATED_AT = "07 de julho de 2026";

export default async function TermsPage() {
  const brand = await resolveLegalBrand();
  return (
    <LegalShell brand={brand} title="Termos de Uso" updatedAt={UPDATED_AT}>
      <p>
        Estes Termos de Uso regem o acesso e o uso da plataforma {brand.name} ({brand.domain}),
        operada por {brand.legalEntity} (&quot;Plataforma&quot;, &quot;nós&quot;). Ao criar uma conta ou
        utilizar a Plataforma, você (&quot;Usuário&quot;) concorda com estes Termos. Se não concordar,
        não utilize a Plataforma.
      </p>

      <h2>1. Objeto da Plataforma</h2>
      <p>
        A Plataforma oferece um sistema de gestão para lojas e assistências técnicas, incluindo
        ponto de venda (PDV), ordens de serviço, controle de estoque, gestão financeira e uma
        carteira digital que permite receber pagamentos e converter valores entre reais (BRL) e
        ativos digitais, quando disponível. A Plataforma é uma ferramenta de software; não é
        instituição financeira, corretora de valores nem custodiante, salvo quando expressamente
        indicado e nos limites da regulação aplicável.
      </p>

      <h2>2. Cadastro e Conta</h2>
      <ul>
        <li>O Usuário deve fornecer informações verdadeiras, completas e atualizadas.</li>
        <li>O Usuário é responsável por manter a confidencialidade de suas credenciais e por toda atividade em sua conta.</li>
        <li>Contas podem exigir verificação de identidade (KYC) e podem ser recusadas, suspensas ou encerradas em caso de descumprimento destes Termos ou da legislação.</li>
        <li>O uso é destinado a maiores de 18 anos com capacidade civil.</li>
      </ul>

      <h2>3. Pagamentos e Conversão de Ativos</h2>
      <p>
        Quando a Plataforma intermedeia recebimento de pagamentos (por exemplo, PIX) ou conversão
        entre BRL e ativos digitais, tais operações podem envolver taxas, spreads de mercado e
        variação cambial, exibidos ao Usuário antes da confirmação sempre que aplicável. O Usuário
        reconhece que:
      </p>
      <ul>
        <li>Preços de ativos digitais são voláteis e podem variar entre a cotação e a liquidação;</li>
        <li>Operações podem estar sujeitas a tributos (inclusive IOF/câmbio) e a normas do Banco Central e demais órgãos reguladores, cujo recolhimento e conformidade são de responsabilidade das partes conforme a legislação;</li>
        <li>Prazos de liquidação e limites operacionais podem se aplicar.</li>
      </ul>

      <h2>4. Obrigações do Usuário</h2>
      <ul>
        <li>Utilizar a Plataforma de forma lícita e conforme estes Termos e a legislação vigente;</li>
        <li>Não utilizar a Plataforma para lavagem de dinheiro, financiamento ao terrorismo, fraude ou qualquer atividade ilícita;</li>
        <li>Não tentar burlar mecanismos de segurança, acesso não autorizado ou uso indevido de dados de terceiros.</li>
      </ul>

      <h2>5. Disponibilidade e Suporte</h2>
      <p>
        Empregamos esforços razoáveis para manter a Plataforma disponível, mas não garantimos
        operação ininterrupta ou livre de erros. Manutenções, atualizações e fatores externos
        (inclusive serviços de terceiros e redes) podem afetar a disponibilidade.
      </p>

      <h2>6. Limitação de Responsabilidade</h2>
      <p>
        Na máxima extensão permitida pela lei, a Plataforma não se responsabiliza por danos
        indiretos, lucros cessantes ou perdas decorrentes de variação de preço de ativos, falhas
        de serviços de terceiros, uso indevido de credenciais pelo Usuário ou indisponibilidade
        temporária. Nada nestes Termos exclui responsabilidades que não possam ser afastadas por lei.
      </p>

      <h2>7. Propriedade Intelectual</h2>
      <p>
        O software, marcas, layout e conteúdos da Plataforma pertencem a {brand.legalEntity} ou a
        seus licenciadores. O uso da Plataforma não transfere qualquer direito de propriedade
        intelectual ao Usuário.
      </p>

      <h2>8. Encerramento</h2>
      <p>
        O Usuário pode encerrar sua conta a qualquer momento. Podemos suspender ou encerrar o
        acesso em caso de violação destes Termos, exigência legal ou risco à segurança da Plataforma.
      </p>

      <h2>9. Alterações</h2>
      <p>
        Estes Termos podem ser atualizados. Mudanças relevantes serão comunicadas por meios
        razoáveis. O uso continuado após a atualização implica concordância com a nova versão.
      </p>

      <h2>10. Lei Aplicável e Foro</h2>
      <p>
        Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro
        do domicílio do consumidor para dirimir controvérsias, quando aplicável a legislação
        consumerista, ou o foro da sede da operadora nos demais casos.
      </p>

      <h2>11. Contato</h2>
      <p>Dúvidas sobre estes Termos: {brand.contactEmail}.</p>

      <p className="mt-8 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
        Documento-base fornecido para fins de estruturação. Recomenda-se revisão por assessoria
        jurídica antes da publicação definitiva, especialmente quanto a operações com ativos
        digitais, câmbio e proteção de dados.
      </p>
    </LegalShell>
  );
}
