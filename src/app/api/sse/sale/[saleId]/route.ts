import { NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { withTenant } from "@/server/db";
import { subscribeDepixPaid } from "@/lib/sse/depix-notify-fanout";

export const runtime = "nodejs";
// SSE requer streaming sem buffering — desabilita cache do Next.
export const dynamic = "force-dynamic";

/**
 * GET /api/sse/sale/[saleId]
 *
 * Server-Sent Events: notifica o frontend em tempo real quando o pagamento
 * DePix da venda for confirmado. Substitui o polling 4s do DepixQrDialog
 * (que vira fallback de 30s).
 *
 * Fluxo: PixPay webhook -> route depix-payment -> pg_notify('depix_paid', json)
 * -> fanout compartilhado (subscribeDepixPaid) -> filtra pelo saleId
 * -> emit 'paid' event no SSE.
 *
 * Mudanca gap Sg20: NAO abrimos mais conexao Postgres dedicada por
 * cliente. Usamos o fanout LISTEN compartilhado em
 * src/lib/sse/depix-notify-fanout.ts.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ saleId: string }> },
) {
  const { saleId } = await params;
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Valida ownership: o saleId precisa pertencer ao tenant ativo.
  const tenantId = req.cookies.get("x-active-tenant")?.value ?? session.activeTenantId;
  if (!tenantId) {
    return new Response("No active tenant", { status: 403 });
  }
  // Defense-in-depth: o x-active-tenant vem de cookie. Re-valida membership
  // aqui tambem (nao so no proxy) — senao um cookie forjado apontando pra outro
  // tenant aplicaria RLS daquele tenant e vazaria o stream de pagamento.
  const isMember =
    session.user.isSuperAdmin === true ||
    session.availableTenants.some((t) => t.id === tenantId);
  if (!isMember) {
    return new Response("Forbidden", { status: 403 });
  }
  const owns = await withTenant(tenantId, async (tx) => {
    const s = await tx.sale.findUnique({ where: { id: saleId }, select: { id: true } });
    return !!s;
  });
  if (!owns) {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let heartbeat: NodeJS.Timeout | null = null;
      let aborted = false;
      let unsubscribe: (() => void) | null = null;

      const cleanup = () => {
        if (aborted) return;
        aborted = true;
        if (heartbeat) clearInterval(heartbeat);
        if (unsubscribe) unsubscribe();
        try {
          controller.close();
        } catch {
          /* controller ja fechado */
        }
      };

      req.signal.addEventListener("abort", cleanup);

      // Hello inicial
      controller.enqueue(encoder.encode(`event: ready\ndata: ${saleId}\n\n`));

      // Heartbeat pra manter conexao viva (proxies costumam matar > 60s sem trafego)
      heartbeat = setInterval(() => {
        if (aborted) return;
        try {
          controller.enqueue(encoder.encode(":heartbeat\n\n"));
        } catch {
          cleanup();
        }
      }, 25_000);

      unsubscribe = subscribeDepixPaid((payload, raw) => {
        if (aborted) return;
        // Filtra: so emitir se for desta venda. Aceita kind="sale" e
        // "sale_already_paid" (idempotente). Outras vendas e OS sao
        // ignoradas silenciosamente.
        if (payload.id !== saleId) return;
        try {
          controller.enqueue(encoder.encode(`event: paid\ndata: ${raw}\n\n`));
        } catch {
          cleanup();
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // nginx: desabilita buffering
    },
  });
}
