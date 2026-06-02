import { Metadata } from "next";
import { withAdmin } from "@/server/db";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Recibo de Compra | Arena Tech",
};

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function PublicReceiptPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;

  // Recibo PUBLICO acessado por publicLink (token unico global, sem sessao de
  // tenant). O proprio token controla o acesso. Roda via withAdmin (BYPASSRLS)
  // porque nao ha tenant ativo; com o runtime como app_login (sujeito a RLS),
  // um findFirst por publicLink retornaria 0.
  const data = await withAdmin(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { publicLink: params.token },
    });
    if (!sale) return null;

    const items = await tx.saleItem.findMany({
      where: { saleId: sale.id },
    });

    const customer = sale.customerId
      ? await tx.customer.findUnique({
          where: { id: sale.customerId },
          select: { name: true, phone: true },
        })
      : null;

    return { sale, items, customer };
  });

  if (!data) {
    notFound();
  }

  const { sale, items, customer } = data;

  const subtotal = items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
  const discount = Number(sale.discountAmount ?? 0);
  const total = Number(sale.totalAmount);

  return (
    <div className="min-h-screen bg-neutral-100 p-4 md:p-8">
      <div className="max-w-xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary to-purple-600 text-white p-6 text-center">
            <h1 className="text-2xl font-bold mb-2">Recibo de Compra</h1>
            <p className="opacity-90 text-sm">Obrigado pela preferencia!</p>
            <div className="inline-block bg-white/20 px-4 py-2 rounded-full mt-3 font-bold">
              #{sale.number}
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Sale Info */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-neutral-400 font-semibold mb-3 border-b pb-2">
                Informacoes da Venda
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Data:</span>
                  <span className="font-medium">{formatDate(sale.createdAt)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Status:</span>
                  <span className={`text-xs font-medium px-3 py-1 rounded-full ${sale.status === "COMPLETED" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {sale.status === "COMPLETED" ? "Finalizada" : sale.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer */}
            {customer && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-neutral-400 font-semibold mb-3 border-b pb-2">
                  Cliente
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-500">Nome:</span>
                    <span className="font-medium">{customer.name}</span>
                  </div>
                  {customer.phone && (
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-500">Telefone:</span>
                      <span>{customer.phone}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Items */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-neutral-400 font-semibold mb-3 border-b pb-2">
                Itens ({items.length})
              </h3>
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.id} className="border-b border-neutral-100 pb-3 last:border-0">
                    <p className="font-medium text-sm">{item.description || "Produto"}</p>
                    <div className="flex justify-between text-sm text-neutral-500">
                      <span>{item.quantity}x {formatCurrency(Number(item.unitPrice))}</span>
                      <span>{formatCurrency(Number(item.unitPrice) * item.quantity)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="bg-neutral-50 rounded-lg p-4">
              <div className="flex justify-between text-sm py-1">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm py-1 text-green-600">
                  <span>Desconto</span>
                  <span>-{formatCurrency(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-3 mt-2 border-t-2 border-primary">
                <span>Total</span>
                <span className="text-primary">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          <div className="text-center p-5 bg-neutral-50 text-xs text-neutral-400">
            <p>Documento gerado em {formatDate(new Date())}</p>
            <p>Este documento serve como comprovante de compra.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
