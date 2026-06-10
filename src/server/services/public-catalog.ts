import "server-only";

import { Prisma } from "@prisma/client";
import { withAdmin } from "@/server/db";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 48;
const PIX_DISCOUNT_PERCENT = 5;
const INSTALLMENTS = 6;
const LOW_STOCK_THRESHOLD = 3;

// Fallback usado apenas se o tenant ainda nao configurou um telefone em
// TenantSettings.phone. No futuro, cada tenant terá o seu proprio numero.
const FALLBACK_WHATSAPP_NUMBER = "5586995647443";

const SEARCH_SYNONYMS: Record<string, readonly string[]> = {
  iphone: ["iphone", "lightning", "apple"],
  ipad: ["ipad", "lightning", "apple"],
  macbook: ["macbook", "thunderbolt", "usb-c", "type-c"],
  samsung: ["samsung", "usb-c", "type-c", "galaxy"],
  xiaomi: ["xiaomi", "usb-c", "type-c"],
  android: ["android", "usb-c", "type-c", "micro"],
  fonte: ["fonte", "carregador", "charger"],
  carregador: ["carregador", "fonte", "charger"],
  turbo: ["turbo", "rapido", "rápido", "fast", "20w", "25w", "30w", "40w", "65w"],
  fast: ["fast", "turbo", "rapido", "rápido"],
  rapido: ["rapido", "rápido", "turbo", "fast"],
  rápido: ["rapido", "rápido", "turbo", "fast"],
  pelicula: ["pelicula", "película", "vidro", "protetor"],
  película: ["película", "pelicula", "vidro", "protetor"],
  fone: ["fone", "headphone", "headset", "earphone", "earbuds"],
  headphone: ["headphone", "fone", "headset"],
  headset: ["headset", "fone", "headphone"],
  bluetooth: ["bluetooth", "wireless", "sem fio"],
  wireless: ["wireless", "bluetooth", "sem fio"],
  mouse: ["mouse"],
  pendrive: ["pendrive", "pen drive", "flash drive"],
  hd: ["hd", "disco", "ssd", "armazenamento"],
  ssd: ["ssd", "hd", "disco", "armazenamento"],
  capa: ["capa", "case", "capinha", "cover"],
  capinha: ["capinha", "capa", "case", "cover"],
  case: ["case", "capa", "capinha"],
  cabo: ["cabo", "cable"],
  relogio: ["relogio", "relógio", "smartwatch", "watch"],
  relógio: ["relógio", "relogio", "smartwatch", "watch"],
  smartwatch: ["smartwatch", "relogio", "relógio", "watch"],
  pulseira: ["pulseira", "bracelete"],
  usb: ["usb", "usb-c", "usb-a", "type-c", "tipo-c"],
  "tipo-c": ["tipo-c", "type-c", "usb-c"],
  "type-c": ["type-c", "tipo-c", "usb-c"],
};

export type CatalogSort = "nome" | "preco_asc" | "preco_desc" | "recentes";

export type PublicCatalogParams = {
  search?: string;
  categoryId?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
};

export type CatalogCategory = {
  id: string;
  name: string;
  badgeColor: string;
  count: number;
};

export type CatalogImage = {
  id: string;
  url: string;
  thumbUrl: string | null;
  mediumUrl: string | null;
  isPrimary: boolean;
};

export type CatalogProduct = {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  imageUrl: string;
  mediumImageUrl: string;
  images: CatalogImage[];
  salePriceCents: number;
  promotionalPriceCents: number | null;
  currentPriceCents: number;
  pixPriceCents: number;
  installmentCents: number;
  discountPercent: number | null;
  availableQuantity: number;
  lowStock: boolean;
  inStock: boolean;
  createdAt: string;
};

export type CatalogContact = {
  storeName: string;
  whatsappNumber: string;
};

export type PublicCatalogResult = {
  products: CatalogProduct[];
  categories: CatalogCategory[];
  contact: CatalogContact;
  total: number;
  totalAvailable: number;
  page: number;
  pageSize: number;
  pageCount: number;
  sort: CatalogSort;
  search: string;
  categoryId: string;
};

export async function getPublicCatalog(params: PublicCatalogParams): Promise<PublicCatalogResult> {
  const page = Math.max(params.page ?? 1, 1);
  const pageSize = clampPageSize(params.pageSize);
  const search = params.search?.trim() ?? "";
  const categoryId = params.categoryId?.trim() ?? "";
  const sort = parseSort(params.sort);

  return withAdmin(async (tx) => {
    const tenantId = await resolveCatalogTenantId(tx);
    if (!tenantId) {
      return emptyCatalog({ page, pageSize, sort, search, categoryId });
    }

    const baseWhere = buildCatalogWhere({ tenantId, search, categoryId });
    const [categories, contact, rows] = await Promise.all([
      getCatalogCategories(tx, tenantId),
      getCatalogContact(tx, tenantId),
      tx.product.findMany({ where: baseWhere, include: catalogProductInclude }),
    ]);

    const products = rows.map(toCatalogProduct).sort((a, b) => compareCatalogProducts(a, b, sort));
    const start = (page - 1) * pageSize;
    const pagedProducts = products.slice(start, start + pageSize);

    return {
      products: pagedProducts,
      categories,
      contact,
      total: products.length,
      totalAvailable: await tx.product.count({ where: buildCatalogWhere({ tenantId }) }),
      page,
      pageSize,
      pageCount: Math.max(Math.ceil(products.length / pageSize), 1),
      sort,
      search,
      categoryId,
    };
  });
}

export async function getPublicCatalogProduct(id: string): Promise<CatalogProduct | null> {
  return withAdmin(async (tx) => {
    const tenantId = await resolveCatalogTenantId(tx);
    if (!tenantId) return null;

    const product = await tx.product.findFirst({
      where: { ...buildCatalogWhere({ tenantId }), id },
      include: catalogProductInclude,
    });

    if (!product) return null;
    return toCatalogProduct(product);
  });
}

export async function getPublicCatalogContact(): Promise<CatalogContact> {
  return withAdmin(async (tx) => {
    const tenantId = await resolveCatalogTenantId(tx);
    if (!tenantId) return fallbackContact();
    return getCatalogContact(tx, tenantId);
  });
}

export async function getRelatedCatalogProducts(product: CatalogProduct): Promise<CatalogProduct[]> {
  return withAdmin(async (tx) => {
    const tenantId = await resolveCatalogTenantId(tx);
    if (!tenantId) return [];

    const where = buildCatalogWhere({ tenantId, categoryId: product.categoryId ?? undefined });
    const rows = await tx.product.findMany({
      where: { ...where, id: { not: product.id } },
      include: catalogProductInclude,
      orderBy: { createdAt: "desc" },
      take: 8,
    });

    return rows.map(toCatalogProduct);
  });
}

const catalogProductInclude = {
  category: { select: { id: true, name: true } },
  categories: { include: { category: true } },
  photos: { orderBy: [{ isPrimary: "desc" }, { order: "asc" }], select: { id: true, url: true, thumbUrl: true, mediumUrl: true, isPrimary: true } },
  variations: { where: { active: true, deletedAt: null }, select: { currentStock: true } },
  stockItems: { where: { status: "AVAILABLE", deletedAt: null }, select: { id: true } },
} satisfies Prisma.ProductInclude;

type CatalogProductRow = Prisma.ProductGetPayload<{ include: typeof catalogProductInclude }>;
type AdminTx = Parameters<Parameters<typeof withAdmin>[0]>[0];

function buildCatalogWhere(input: { tenantId: string; search?: string; categoryId?: string }): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [
    { tenantId: input.tenantId },
    { active: true },
    { deletedAt: null },
    { isDevice: false },
    {
      OR: [
        { photos: { some: {} } },
        { AND: [{ imageUrl: { not: null } }, { imageUrl: { not: "" } }] },
      ],
    },
    {
      OR: [
        { isSerialized: true, stockItems: { some: { status: "AVAILABLE", deletedAt: null } } },
        { hasVariations: true, variations: { some: { active: true, deletedAt: null, currentStock: { gt: 0 } } } },
        { isSerialized: false, hasVariations: false, currentStock: { gt: 0 } },
      ],
    },
  ];

  if (input.categoryId) {
    and.push({ OR: [{ categoryId: input.categoryId }, { categories: { some: { categoryId: input.categoryId } } }] });
  }

  const searchGroups = buildSearchGroups(input.search);
  and.push(...searchGroups);

  return { AND: and };
}

function buildSearchGroups(search: string | undefined): Prisma.ProductWhereInput[] {
  const words = (search ?? "")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length >= 2);

  return words.map((word) => {
    const synonyms = SEARCH_SYNONYMS[word.toLowerCase()] ?? [word];
    return {
      OR: synonyms.flatMap((synonym): Prisma.ProductWhereInput[] => [
        { name: { contains: synonym, mode: "insensitive" } },
        { brand: { contains: synonym, mode: "insensitive" } },
        { sku: { contains: synonym, mode: "insensitive" } },
        { barcode: { contains: synonym, mode: "insensitive" } },
      ]),
    };
  });
}

async function getCatalogCategories(tx: AdminTx, tenantId: string): Promise<CatalogCategory[]> {
  const categories = await tx.productCategory.findMany({
    where: { tenantId, active: true, deletedAt: null },
    include: {
      pivots: {
        where: { product: buildCatalogWhere({ tenantId }) },
        select: { productId: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return categories
    .map((category) => ({
      id: category.id,
      name: category.name,
      badgeColor: category.badgeColor,
      count: category.pivots.length,
    }))
    .filter((category) => category.count > 0);
}

async function getCatalogContact(tx: AdminTx, tenantId: string): Promise<CatalogContact> {
  const [settings, tenant] = await Promise.all([
    tx.tenantSettings.findUnique({
      where: { tenantId },
      select: { phone: true, tradeName: true, legalName: true },
    }),
    tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);

  return {
    storeName: settings?.tradeName?.trim() || settings?.legalName?.trim() || tenant?.name?.trim() || "Arena Tech",
    whatsappNumber: normalizeWhatsappNumber(settings?.phone) ?? FALLBACK_WHATSAPP_NUMBER,
  };
}

function fallbackContact(): CatalogContact {
  return { storeName: "Arena Tech", whatsappNumber: FALLBACK_WHATSAPP_NUMBER };
}

/**
 * Normaliza um telefone para o formato aceito pelo wa.me (apenas digitos, com
 * DDI). Numeros brasileiros sem DDI (10-11 digitos) recebem o prefixo 55.
 * Retorna null se nao houver digitos suficientes para um numero valido.
 */
function normalizeWhatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

async function resolveCatalogTenantId(tx: AdminTx): Promise<string | null> {
  if (process.env.DEFAULT_TENANT_ID) return process.env.DEFAULT_TENANT_ID;

  const slug = process.env.DEFAULT_TENANT_SLUG ?? "arena-tech";
  const tenant = await tx.tenant.findUnique({ where: { slug }, select: { id: true } });
  return tenant?.id ?? null;
}

function toCatalogProduct(product: CatalogProductRow): CatalogProduct {
  const photos = product.photos.map((photo) => ({
    id: photo.id,
    url: photo.url,
    thumbUrl: photo.thumbUrl,
    mediumUrl: photo.mediumUrl,
    isPrimary: photo.isPrimary,
  }));
  const primaryPhoto = photos[0];
  const legacyImage = product.imageUrl && product.imageUrl.trim() ? product.imageUrl : null;
  const imageUrl = primaryPhoto?.thumbUrl ?? primaryPhoto?.mediumUrl ?? primaryPhoto?.url ?? legacyImage ?? "";
  const mediumImageUrl = primaryPhoto?.mediumUrl ?? primaryPhoto?.url ?? legacyImage ?? imageUrl;
  const salePriceCents = toCents(product.salePrice);
  const promotionalPriceCents = product.promotionalPrice ? toCents(product.promotionalPrice) : null;
  const currentPriceCents = promotionalPriceCents && promotionalPriceCents < salePriceCents ? promotionalPriceCents : salePriceCents;
  const availableQuantity = getAvailableQuantity(product);

  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    brand: product.brand,
    description: product.description,
    categoryId: product.category?.id ?? product.categoryId,
    categoryName: product.category?.name ?? product.categories[0]?.category.name ?? null,
    imageUrl,
    mediumImageUrl,
    images: photos.length > 0 ? photos : legacyImage ? [{ id: product.id, url: legacyImage, thumbUrl: legacyImage, mediumUrl: legacyImage, isPrimary: true }] : [],
    salePriceCents,
    promotionalPriceCents,
    currentPriceCents,
    pixPriceCents: Math.round(currentPriceCents * (1 - PIX_DISCOUNT_PERCENT / 100)),
    installmentCents: Math.round(currentPriceCents / INSTALLMENTS),
    discountPercent: promotionalPriceCents && promotionalPriceCents < salePriceCents
      ? Math.round((1 - promotionalPriceCents / salePriceCents) * 100)
      : null,
    availableQuantity,
    lowStock: availableQuantity > 0 && availableQuantity <= LOW_STOCK_THRESHOLD,
    inStock: availableQuantity > 0,
    createdAt: product.createdAt.toISOString(),
  };
}

function getAvailableQuantity(product: CatalogProductRow): number {
  if (product.isSerialized) return product.stockItems.length;
  if (product.hasVariations) return product.variations.reduce((sum, variation) => sum + variation.currentStock, 0);
  return product.currentStock;
}

function compareCatalogProducts(a: CatalogProduct, b: CatalogProduct, sort: CatalogSort): number {
  if (sort === "preco_asc") return a.currentPriceCents - b.currentPriceCents || a.name.localeCompare(b.name, "pt-BR");
  if (sort === "preco_desc") return b.currentPriceCents - a.currentPriceCents || a.name.localeCompare(b.name, "pt-BR");
  if (sort === "recentes") return b.createdAt.localeCompare(a.createdAt);
  return a.name.localeCompare(b.name, "pt-BR");
}

function parseSort(sort: string | undefined): CatalogSort {
  if (sort === "preco_asc" || sort === "preco_desc" || sort === "recentes") return sort;
  return "nome";
}

function clampPageSize(pageSize: number | undefined): number {
  if (!pageSize) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
}

function toCents(value: Prisma.Decimal | number | string): number {
  return Math.round(Number(value) * 100);
}

function emptyCatalog(input: { page: number; pageSize: number; sort: CatalogSort; search: string; categoryId: string }): PublicCatalogResult {
  return {
    products: [],
    categories: [],
    contact: fallbackContact(),
    total: 0,
    totalAvailable: 0,
    page: input.page,
    pageSize: input.pageSize,
    pageCount: 1,
    sort: input.sort,
    search: input.search,
    categoryId: input.categoryId,
  };
}
