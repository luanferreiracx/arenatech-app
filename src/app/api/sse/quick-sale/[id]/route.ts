import { NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { withTenant } from "@/server/db";
import { subscribeDepixPaid } from "@/lib/sse/depix-notify-fanout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** SSE pra venda avulsa (quick_sale) — espelho de /api/sse/sale/[saleId].
 *
 * Usa o fanout LISTEN compartilhado (gap Sg20) ao inves de abrir uma
 * conexao Postgres dedicada por cliente.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const tenantId = req.cookies.get("x-active-tenant")?.value ?? session.activeTenantId;
  if (!tenantId) return new Response("No active tenant", { status: 403 });

  // Defense-in-depth: re-valida membership do tenant (cookie nao confiavel).
  const isMember =
    session.user.isSuperAdmin === true ||
    session.availableTenants.some((t) => t.id === tenantId);
  if (!isMember) return new Response("Forbidden", { status: 403 });

  const owns = await withTenant(tenantId, async (tx) => {
    const q = await tx.quickSale.findUnique({ where: { id }, select: { id: true } });
    return !!q;
  });
  if (!owns) return new Response("Forbidden", { status: 403 });

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
          /* ja fechado */
        }
      };

      req.signal.addEventListener("abort", cleanup);

      controller.enqueue(encoder.encode(`event: ready\ndata: ${id}\n\n`));

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
        // Filtra quick_sale especificamente. Aceita kind="quick_sale" e
        // "quick_sale_already_paid".
        if (!payload.kind.startsWith("quick_sale")) return;
        if (payload.id !== id) return;
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
      "X-Accel-Buffering": "no",
    },
  });
}
