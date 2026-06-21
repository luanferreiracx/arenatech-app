import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/server/auth";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { withTenant } from "@/server/db";
import {
  abbreviateName,
  buildNiimbotWorkbook,
  formatBRL,
  type LabelRow,
} from "@/lib/labels/niimbot-export";

const MAX_PRODUCTS = 2000;

/**
 * GET /api/stock/labels?ids=...&search=...&active=true&qty=one|stock&expand=false
 *
 * Gera uma planilha .xlsx no formato de importação do Niimbot (B1) para etiquetas de
 * produto. Conteúdo da etiqueta: nome (reduzido), preço e código de barras. A coluna
 * Quantidade controla cópias; com `expand=true` as linhas são repetidas N vezes.
 *
 * No app mobile Niimbot a impressão é 1 etiqueta por linha — a coluna Quantidade não
 * multiplica cópias automaticamente (ajuste no app ou use expand=true).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = resolveActiveTenant(session, req.cookies.get("x-active-tenant")?.value)?.id;
  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const url = new URL(req.url);
  const ids = url.searchParams.get("ids")?.split(",").map((s) => s.trim()).filter(Boolean);
  const qtysRaw = url.searchParams.get("qtys")?.split(",").map((s) => Math.max(1, parseInt(s, 10) || 1));
  const search = url.searchParams.get("search")?.trim();
  const activeParam = url.searchParams.get("active");
  const qty = url.searchParams.get("qty") === "stock" ? "stock" : "one";
  const expand = url.searchParams.get("expand") === "true";
  // Mapa id→qty customizada (quando o dialog passa qtys individuais por produto)
  const perProductQty = ids && qtysRaw && ids.length === qtysRaw.length
    ? new Map(ids.map((id, i) => [id, qtysRaw[i]!]))
    : null;

  try {
    const products = await withTenant(tenantId, async (tx) => {
      const where: Prisma.ProductWhereInput = { deletedAt: null };

      if (ids && ids.length > 0) {
        where.id = { in: ids };
      } else {
        // Default: apenas produtos ativos, salvo active=false explícito.
        where.active = activeParam === "false" ? false : true;
        if (search) {
          where.OR = [
            { name: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { barcode: { contains: search, mode: "insensitive" } },
          ];
        }
      }

      return tx.product.findMany({
        where,
        orderBy: { name: "asc" },
        take: MAX_PRODUCTS,
        include: {
          variations: {
            where: { deletedAt: null, active: true },
            orderBy: { sku: "asc" },
          },
        },
      });
    });

    const rows: LabelRow[] = [];
    for (const product of products) {
      const activeVariations = product.hasVariations ? product.variations : [];

      const customQty = perProductQty?.get(product.id);

      if (activeVariations.length > 0) {
        for (const variation of activeVariations) {
          rows.push({
            nome: abbreviateName(product.name),
            preco: formatBRL(variation.salePrice ?? product.salePrice),
            barcode: variation.barcode ?? variation.sku ?? product.barcode ?? product.sku ?? "",
            quantidade: customQty ?? (qty === "stock" ? Math.max(1, variation.currentStock) : 1),
          });
        }
      } else {
        rows.push({
          nome: product.name,
          preco: formatBRL(product.salePrice),
          barcode: product.barcode ?? product.sku ?? "",
          quantidade: customQty ?? (qty === "stock" ? Math.max(1, product.currentStock) : 1),
        });
      }
    }

    const buffer = await buildNiimbotWorkbook(rows, { expand });
    const filename = `etiquetas-niimbot-${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
