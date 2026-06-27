import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicCharge } from "@/server/services/pay-public.service";
import { PublicPaymentForm } from "./_components/public-payment-form";
import { PayShell, StatusScreen } from "./_components/pay-shell";

export const metadata: Metadata = {
  title: "Pagamento DePix",
  description: "Pague com PIX e receba na rede Liquid",
};

// Sempre dinamico: o estado da cobranca muda (pago/expirado) e nao deve cachear.
export const dynamic = "force-dynamic";

export default async function PublicPaymentPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  const charge = await getPublicCharge(token);
  if (!charge) notFound();

  if (charge.status === "PAID") {
    return (
      <PayShell merchantName={charge.merchantName}>
        <StatusScreen
          tone="success"
          title="Pagamento confirmado"
          message={`O pagamento para ${charge.merchantName} foi concluído. Você já pode fechar esta página.`}
        />
      </PayShell>
    );
  }

  if (
    charge.status === "EXPIRED" ||
    charge.status === "CANCELLED" ||
    charge.status === "REFUNDED"
  ) {
    return (
      <PayShell merchantName={charge.merchantName}>
        <StatusScreen
          tone="neutral"
          title="Cobrança indisponível"
          message="Este link de pagamento expirou ou foi cancelado. Peça um novo ao comerciante."
        />
      </PayShell>
    );
  }

  return (
    <PayShell merchantName={charge.merchantName}>
      <PublicPaymentForm
        token={token}
        merchantName={charge.merchantName}
        productDescription={charge.productDescription}
        amountCents={charge.amountCents}
        amountOpen={charge.amountOpen}
      />
    </PayShell>
  );
}
