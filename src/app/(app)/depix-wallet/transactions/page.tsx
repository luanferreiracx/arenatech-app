import { PageHeader } from "@/components/domain/page-header";
import { TransactionsList } from "../_components/transactions-list";

export const metadata = {
  title: "Transações da carteira | Arena Tech",
};

/**
 * Histórico COMPLETO da carteira DePix.
 *
 * Antes desta tela, o "Ver tudo" do cartão de atividade recente apontava para
 * `/depix-wallet?view=all` — um parâmetro que nenhuma página lia. O clique
 * navegava para a mesma tela e nada mudava: dava para ver as 8 últimas
 * transações e mais nada. Medido em produção: **474 transações** (413 depósitos,
 * 61 saques) em dois meses. A loja enxergava 1,7% do próprio histórico e não
 * tinha caminho para o resto.
 *
 * A `depixTransaction.list` já aceitava `page`, `pageSize`, `kind`, `status` e
 * intervalo de datas, e já devolvia `total` — a paginação existia no backend
 * desde sempre. Faltava a tela.
 */
export default function WalletTransactionsPage() {
  return (
    <div>
      <PageHeader
        title="Transações"
        subtitle="Histórico completo de depósitos e saques da carteira"
      />
      <TransactionsList />
    </div>
  );
}
