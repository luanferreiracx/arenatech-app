import { NextRequest } from "next/server";
import { Client } from "pg";
import { auth } from "@/server/auth";
import { withTenant } from "@/server/db";
import { logger } from "@/lib/logger";

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
 * -> esta rota (LISTEN) -> filtra pelo saleId -> emit 'paid' event no SSE.
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
  const owns = await withTenant(tenantId, async (tx) => {
    const s = await tx.sale.findUnique({ where: { id: saleId }, select: { id: true } });
    return !!s;
  });
  if (!owns) {
    return new Response("Forbidden", { status: 403 });
  }

  // Stream SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Conexao dedicada para LISTEN (nao pode usar pool do Prisma).
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) {
        controller.enqueue(encoder.encode("event: error\ndata: no database url\n\n"));
        controller.close();
        return;
      }
      const client = new Client({ connectionString: dbUrl });
      let heartbeat: NodeJS.Timeout | null = null;
      let aborted = false;

      const cleanup = async () => {
        if (aborted) return;
        aborted = true;
        if (heartbeat) clearInterval(heartbeat);
        try {
          await client.end();
        } catch {
          /* ignora erro no cleanup */
        }
        try {
          controller.close();
        } catch {
          /* controller ja fechado */
        }
      };

      req.signal.addEventListener("abort", () => {
        void cleanup();
      });

      try {
        await client.connect();
        await client.query("LISTEN depix_paid");

        // Hello inicial
        controller.enqueue(encoder.encode(`event: ready\ndata: ${saleId}\n\n`));

        // Heartbeat pra manter conexao viva (proxies costumam matar > 60s sem trafego)
        heartbeat = setInterval(() => {
          if (aborted) return;
          try {
            controller.enqueue(encoder.encode(":heartbeat\n\n"));
          } catch {
            void cleanup();
          }
        }, 25_000);

        client.on("notification", (msg) => {
          if (aborted || !msg.payload) return;
          try {
            const data = JSON.parse(msg.payload) as { kind: string; id: string; transactionId: string };
            // Filtra: so emitir se for desta venda.
            if (data.id !== saleId) return;
            controller.enqueue(encoder.encode(`event: paid\ndata: ${msg.payload}\n\n`));
          } catch (err) {
            logger.warn("SSE depix_paid: payload invalido", { err: String(err) });
          }
        });

        client.on("error", (err) => {
          logger.warn("SSE pg client error", { err: String(err) });
          void cleanup();
        });
      } catch (err) {
        logger.error("SSE setup failed", { err: String(err) });
        await cleanup();
      }
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
