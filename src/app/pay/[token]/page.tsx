import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicCharge } from "@/server/services/pay-public.service";
import { parsePayAmountCents, PAY_AMOUNT_PARAM } from "@/lib/payment-link/pay-url";
import { PublicPaymentForm } from "./_components/public-payment-form";
import { PayShell, StatusScreen } from "./_components/pay-shell";

export const metadata: Metadata = {
  title: "Pagamento DePix",
  description: "Pague com PIX e receba na rede Liquid",
};

// Sempre dinamico: o link pode ser desligado a qualquer momento e a pagina nao
// deve servir versao cacheada de um recebimento suspenso.
export const dynamic = "force-dynamic";

export default async function PublicPaymentPage(props: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await props.params;
  const search = await props.searchParams;
  const charge = await getPublicCharge(token);
  if (!charge) notFound();

  if (!charge.active) {
    return (
      <PayShell merchantName={charge.merchantName}>
        <StatusScreen
          tone="neutral"
          title="Pagamento indisponível"
          message={`${charge.merchantName} não está recebendo por este link no momento.`}
        />
      </PayShell>
    );
  }

  // Valor vindo da URL (`?valor=150.50`): o operador já definiu quanto cobrar.
  // Quando presente, a tela mostra o valor travado — o cliente não altera, para
  // não pagar por engano um valor diferente do combinado.
  const rawAmount = search[PAY_AMOUNT_PARAM];
  const presetAmountCents = parsePayAmountCents(
    Array.isArray(rawAmount) ? rawAmount[0] : rawAmount,
  );

  return (
    <PayShell merchantName={charge.merchantName}>
      <PublicPaymentForm
        token={token}
        merchantName={charge.merchantName}
        description={charge.description}
        amountCents={presetAmountCents}
        amountOpen={presetAmountCents == null}
      />
    </PayShell>
  );
}
