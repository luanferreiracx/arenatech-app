import { withTenant, withAdmin } from "@/server/db";

/**
 * Dados do tenant usados nos cabecalhos de PDFs (recibo, termos).
 * Paridade visual com Laravel intranetpdv — loja em destaque, identidade dourada.
 */
export interface TenantHeaderData {
  storeName: string;
  cnpj: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  /** Logo embedded base64 (data URL). null se nao houver logo configurada. */
  logoDataUrl: string | null;
}

/**
 * Busca dados do header do tenant (nome, CNPJ, telefone, endereco, logo).
 * Logo e carregada do storage (MinIO) e embedada como data URL para o PDF.
 */
export async function loadTenantHeader(tenantId: string): Promise<TenantHeaderData> {
  const [tenant, settings] = await Promise.all([
    withAdmin(async (tx) =>
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, cnpj: true },
      }),
    ),
    withTenant(tenantId, async (tx) =>
      tx.tenantSettings.findUnique({
        where: { tenantId },
        select: {
          tradeName: true,
          cnpj: true,
          phone: true,
          email: true,
          address: true,
          logoUrl: true,
          street: true,
          streetNumber: true,
          neighborhood: true,
          city: true,
          state: true,
          zipCode: true,
        },
      }),
    ),
  ]);

  const storeName = settings?.tradeName ?? tenant?.name ?? "Arena Tech";
  const cnpj = settings?.cnpj ?? tenant?.cnpj ?? null;
  const phone = settings?.phone ?? null;
  const email = settings?.email ?? null;

  // Endereco em prioridade: campos estruturados > address json.
  let address: string | null = null;
  const parts: string[] = [];
  if (settings?.street) parts.push(settings.street);
  if (settings?.streetNumber) parts.push(settings.streetNumber);
  if (settings?.neighborhood) parts.push(settings.neighborhood);
  if (settings?.city) parts.push(settings.city);
  if (settings?.state) parts.push(settings.state);
  if (parts.length > 0) {
    address = parts.join(", ");
  } else if (settings?.address && typeof settings.address === "object") {
    const addr = settings.address as Record<string, unknown>;
    const a: string[] = [];
    if (addr.street) a.push(String(addr.street));
    if (addr.number) a.push(String(addr.number));
    if (addr.neighborhood) a.push(String(addr.neighborhood));
    if (addr.city) a.push(String(addr.city));
    if (addr.state) a.push(String(addr.state));
    if (a.length > 0) address = a.join(", ");
  }

  const logoDataUrl = settings?.logoUrl
    ? await loadLogoDataUrl(settings.logoUrl)
    : null;

  return { storeName, cnpj, phone, email, address, logoDataUrl };
}

/**
 * Baixa a logo e converte para data URL embedavel no PDF. Quando a URL
 * passa pelo proxy interno (`/api/storage/...`), busca direto do MinIO
 * sem fazer round-trip HTTP. Retorna null em qualquer falha — fallback
 * grafico ja existe no PDF.
 */
async function loadLogoDataUrl(url: string): Promise<string | null> {
  try {
    // Caminho rapido: se a URL aponta para o proxy `/api/storage/`, baixa
    // direto do MinIO interno (mais rapido + funciona em SSR sem rede externa).
    const proxyIdx = url.indexOf("/api/storage/");
    if (proxyIdx !== -1) {
      const key = url.slice(proxyIdx + "/api/storage/".length);
      return await loadFromMinio(key);
    }
    // Caminho legado: fetch HTTP padrao.
    let absoluteUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
      absoluteUrl = `${base.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
    }
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(absoluteUrl, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Baixa um objeto do MinIO direto (server-side, sem HTTP externo) e retorna
 * data URL. Usado por `loadLogoDataUrl` quando a URL passa pelo proxy interno.
 */
async function loadFromMinio(key: string): Promise<string | null> {
  try {
    const endpoint = process.env.S3_ENDPOINT || "http://localhost:9000";
    const bucket = process.env.S3_BUCKET || "arenatech";
    const accessKey = process.env.S3_ACCESS_KEY || "minioadmin";
    const secretKey = process.env.S3_SECRET_KEY || "minioadmin";
    const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: "us-east-1",
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) return null;
    const buffer = Buffer.from(await res.Body.transformToByteArray());
    const mime = res.ContentType?.split(";")[0]?.trim() || "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Formata CPF/CNPJ para exibicao (12.345.678/0001-90 ou 123.456.789-00).
 */
export function formatDoc(doc: string | null | undefined): string {
  if (!doc) return "";
  const digits = doc.replace(/\D/g, "");
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  return doc;
}

export function formatCurrency(value: number | string | { toNumber?: () => number }): string {
  let num: number;
  if (typeof value === "number") num = value;
  else if (typeof value === "string") num = Number(value);
  else if (value && typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    num = value.toNumber();
  } else num = Number(value);
  return "R$ " + num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDateBr(d: Date | string): string {
  return new Date(d).toLocaleDateString("pt-BR");
}

export function formatDateTimeBr(d: Date | string): string {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
