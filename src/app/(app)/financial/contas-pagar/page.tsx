import { redirect } from "next/navigation";

export const metadata = {
  title: "Contas a Pagar | Arena Tech",
};

/**
 * Redirect provisorio para o dashboard financeiro filtrado por PAYABLE.
 * Paridade Laravel tenant/financeiro/contas-pagar/index.blade.php — UI
 * dedicada pode ser criada quando houver necessidade especifica.
 */
export default function ContasPagarPage() {
  redirect("/financial?type=PAYABLE");
}
