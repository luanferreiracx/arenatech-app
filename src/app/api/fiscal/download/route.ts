import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { logger } from "@/lib/logger";

/**
 * Proxy endpoint for downloading fiscal documents (PDF/XML) from Nuvem Fiscal.
 *
 * The Nuvem Fiscal API requires OAuth2 authentication, so we cannot expose
 * their URLs directly to the browser. This endpoint proxies the download
 * with the server-side access token.
 *
 * Usage: GET /api/fiscal/download?ref=<providerRef>&type=pdf|xml
 */

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.NUVEM_FISCAL_CLIENT_ID;
  const clientSecret = process.env.NUVEM_FISCAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const response = await fetch("https://auth.nuvemfiscal.com.br/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "empresa nfe nfce nfse",
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    logger.error("Fiscal download: auth failed", { status: response.status });
    return null;
  }

  const data = (await response.json()) as Record<string, unknown>;
  const token = String(data["access_token"] ?? "");
  const expiresIn = Number(data["expires_in"] ?? 3600);

  cachedToken = {
    token,
    expiresAt: Date.now() + (expiresIn - 60) * 1000,
  };

  return token;
}

export async function GET(request: NextRequest) {
  // Auth check
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const ref = searchParams.get("ref");
  const type = searchParams.get("type"); // "pdf" or "xml"

  if (!ref || !type || !["pdf", "xml"].includes(type)) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  const token = await getAccessToken();

  if (!token) {
    // Mock mode: return a placeholder
    if (type === "pdf") {
      return new NextResponse("PDF not available in dev mode", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new NextResponse("<xml>Mock XML</xml>", {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });
  }

  try {
    const baseUrl = "https://api.nuvemfiscal.com.br";
    const url = `${baseUrl}/nfe/${ref}/${type}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: type === "pdf" ? "application/pdf" : "application/xml",
      },
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      logger.error("Fiscal download: provider error", {
        status: response.status,
        ref,
        type,
      });
      return NextResponse.json(
        { error: `Erro ao baixar ${type.toUpperCase()}: ${response.statusText}` },
        { status: response.status },
      );
    }

    const contentType = type === "pdf" ? "application/pdf" : "application/xml";
    const extension = type === "pdf" ? "pdf" : "xml";
    const filename = `nfe_${ref}.${extension}`;

    const body = await response.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    logger.error("Fiscal download: error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Erro ao baixar documento fiscal" },
      { status: 500 },
    );
  }
}
