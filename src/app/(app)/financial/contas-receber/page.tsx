import { redirect } from "next/navigation";

export const metadata = {
  title: "Contas a Receber | Arena Tech",
};

/**
 * Redirect provisorio para a pagina inglesa de contas a receber.
 * Quando a UI dedicada PT-BR for criada (paridade Laravel
 * tenant/financeiro/contas-receber/index.blade.php), substituir.
 */
export default function ContasReceberPage() {
  redirect("/financial?type=RECEIVABLE");
}
