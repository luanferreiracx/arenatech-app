import { NextRequest, NextResponse } from "next/server";
import { getPublicCatalog } from "@/server/services/public-catalog";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const catalog = await getPublicCatalog({
      search: searchParams.get("q") ?? searchParams.get("search") ?? undefined,
      categoryId: searchParams.get("categoria") ?? searchParams.get("category") ?? undefined,
      sort: searchParams.get("ordem") ?? searchParams.get("sort") ?? undefined,
      page: parsePositiveInt(searchParams.get("page")),
      pageSize: parsePositiveInt(searchParams.get("pageSize")),
    });

    return NextResponse.json(catalog);
  } catch (error) {
    logger.error("Public catalog error", { error: String(error) });
    return NextResponse.json(
      { products: [], categories: [], total: 0, totalAvailable: 0, error: "Erro ao carregar catalogo" },
      { status: 500 },
    );
  }
}

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
