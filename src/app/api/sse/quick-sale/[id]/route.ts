import { NextRequest } from "next/server";
import { Client } from "pg";
import { auth } from "@/server/auth";
import { withTenant } from "@/server/db";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** SSE pra venda avulsa (quick_sale) — espelho de /api/sse/sale/[saleId]. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const tenantId = req.cookies.get("x-active-tenant")?.value ?? session.activeTenantId;
  if (!tenantId) return new Response("No active tenant", { status: 403 });

  const owns = await withTenant(tenantId, async (tx) => {
    const q = await tx.quickSale.findUnique({ where: { id }, select: { id: true } });
    return !!q;
  });
  if (!owns) return new Response("Forbidden", { status: 403 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
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
        } catch { /* ignora */ }
        try {
          controller.close();
        } catch { /* ja fechado */ }
      };

      req.signal.addEventListener("abort", () => {
        void cleanup();
      });

      try {
        await client.connect();
        await client.query("LISTEN depix_paid");
        controller.enqueue(encoder.encode(`event: ready\ndata: ${id}\n\n`));
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
            const data = JSON.parse(msg.payload) as { kind: string; id: string };
            if (data.kind !== "quick_sale" || data.id !== id) return;
            controller.enqueue(encoder.encode(`event: paid\ndata: ${msg.payload}\n\n`));
          } catch (err) {
            logger.warn("SSE quick_sale depix_paid: payload invalido", { err: String(err) });
          }
        });

        client.on("error", (err) => {
          logger.warn("SSE quick_sale pg client error", { err: String(err) });
          void cleanup();
        });
      } catch (err) {
        logger.error("SSE quick_sale setup failed", { err: String(err) });
        await cleanup();
      }
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
