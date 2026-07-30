/**
 * Harness de navegação da auditoria de finalização.
 *
 * Percorre TODAS as telas de um módulo num navegador real, como ADMIN e como
 * OPERADOR, em desktop (1440) e mobile (390), e registra o que só aparece
 * clicando: erro de console, request 4xx/5xx, tela que não renderiza, overflow
 * horizontal no mobile e redirect inesperado (gating/RBAC).
 *
 * Existe porque as auditorias anteriores acharam os bugs de dinheiro lendo
 * código e erraram os de uso — a última registrou isso como área de baixa
 * confiança ("os achados de frontend saíram de leitura de código, não de sessão
 * real").
 *
 * Uso:
 *   pnpm tsx scripts/audit/crawl-module.ts caixa
 *   pnpm tsx scripts/audit/crawl-module.ts caixa --role=admin --viewport=mobile
 *
 * Requer o app rodando (`pnpm dev`) apontando para a cópia local do banco.
 * Saída: /tmp/audit/<modulo>/report.json + screenshots.
 */
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { mkdir, writeFile } from "node:fs/promises";
import { AUDIT_MODULES, findModule, type AuditRoute } from "./module-routes";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://localhost:3000";
const OUT_ROOT = process.env.AUDIT_OUT ?? "/tmp/audit";
const TENANT_SLUG = process.env.AUDIT_TENANT_SLUG ?? "arena-tech";

/** Mesmas credenciais criadas por `prepare-audit-db.ts`. */
const ROLES = {
  admin: { cpf: "86288366757", password: "Admin@2026" },
  operator: { cpf: "52998224725", password: "Arena@2026" },
} as const;
type RoleKey = keyof typeof ROLES;

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;
type ViewportKey = keyof typeof VIEWPORTS;

/**
 * Ruído de terceiro/ambiente que não é achado. Mantenha a lista curta e
 * justificada — filtro largo demais é como se perde bug de verdade.
 */
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /Sentry Logger/i,
  // O loggerLink do tRPC em dev imprime cada query/mutation com formatação
  // `%c`. Quando a query falha ele repete o erro aqui — e a mesma falha já
  // entra em `failedRequests` com URL e status, que é o registro útil.
  /^%c/,
  // Ruído do próprio Next em dev ao buscar chunk/source map.
  /Failed to load resource.*_next/i,
];

const IGNORED_REQUESTS = [
  /\/_next\/static\//,
  /\/__nextjs/,
  /favicon\.ico/,
  // MinIO/Cloudinary local sem os binários da produção: 404 de imagem não é
  // bug da tela, é ausência de arquivo na cópia.
  /\/api\/storage\//,
];

type RouteFinding = {
  path: string;
  requestedUrl: string;
  finalUrl: string;
  /**
   * `broken` = quebrou (erro de JS, 5xx, tela vazia). `warn` = merece olho
   * humano (4xx de negócio, erro de console): pode ser estado tratado ou pode
   * ser a tela mentindo. `redirect` = gating/RBAC mandou para outro lugar.
   */
  status: "ok" | "skip" | "redirect" | "warn" | "broken";
  httpStatus: number | null;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: Array<{ url: string; status: number; body?: string }>;
  horizontalOverflow: boolean;
  emptyMain: boolean;
  screenshot: string | null;
  note?: string;
};

type PassReport = {
  role: RoleKey;
  viewport: ViewportKey;
  routes: RouteFinding[];
};

function parseArgs(argv: string[]) {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const flag = (name: string) =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? undefined;
  return {
    moduleKey: positional[0],
    role: flag("role") as RoleKey | undefined,
    viewport: flag("viewport") as ViewportKey | undefined,
  };
}

async function login(page: Page, role: RoleKey): Promise<void> {
  const { cpf, password } = ROLES[role];
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  const cpfInput = page.getByLabel("CPF");
  await cpfInput.waitFor({ state: "visible", timeout: 20_000 });
  await cpfInput.fill(cpf);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  // O login sai por Server Action + navegação do router. `waitForURL` espera o
  // evento `load`, que não dispara nessa navegação suave — o wait estourava com
  // a sessão já criada. Basta observar a URL mudar.
  await page.waitForFunction(() => !location.pathname.startsWith("/login"), undefined, {
    timeout: 45_000,
  });

  // Usuário multi-tenant cai em /select-tenant; escolhe o tenant da auditoria.
  if (page.url().includes("/select-tenant")) {
    await page.getByRole("button").first().click();
    await page.waitForFunction(() => !location.pathname.includes("/select-tenant"), undefined, {
      timeout: 30_000,
    });
  }
}

async function resolveRoutes(
  routes: AuditRoute[],
  prisma: PrismaClient,
  tenantId: string,
): Promise<Array<{ route: AuditRoute; url: string | null }>> {
  const resolved: Array<{ route: AuditRoute; url: string | null }> = [];
  for (const route of routes) {
    if (!route.resolve) {
      resolved.push({ route, url: route.path });
      continue;
    }
    const id = await route.resolve(prisma, tenantId);
    resolved.push({ route, url: id ? route.path.replace(":id", id) : null });
  }
  return resolved;
}

async function visit(
  page: Page,
  path: string,
  outDir: string,
  label: string,
): Promise<RouteFinding> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: Array<{ url: string; status: number; body?: string }> = [];

  const onConsole = (msg: { type(): string; text(): string }) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    consoleErrors.push(text);
  };
  const onPageError = (err: Error) => pageErrors.push(err.message);
  const onResponse = (res: {
    status(): number;
    url(): string;
    text(): Promise<string>;
  }) => {
    if (res.status() < 400) return;
    if (IGNORED_REQUESTS.some((re) => re.test(res.url()))) return;
    const entry: { url: string; status: number; body?: string } = {
      url: res.url(),
      status: res.status(),
    };
    failedRequests.push(entry);
    // Sem o corpo, um 404 de batch tRPC não diz QUAL procedure falhou nem por
    // quê — foi o que travou a leitura da primeira varredura do PDV.
    res
      .text()
      .then((body) => {
        entry.body = body.slice(0, 400);
      })
      .catch(() => undefined);
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  const requestedUrl = `${BASE_URL}${path}`;
  let httpStatus: number | null = null;
  let note: string | undefined;

  try {
    const response = await page.goto(requestedUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    httpStatus = response?.status() ?? null;
    // RSC streaming: o layout renderiza antes do conteúdo (ADR 0038).
    await page
      .waitForSelector(
        "main h1, main form, main table, main [role='table'], main [role='region'], main [data-slot='card'], main [data-slot='alert']",
        { timeout: 20_000 },
      )
      .catch(() => {
        note = "conteúdo do <main> não apareceu em 20s";
      });
    // Deixa queries client-side (tRPC) resolverem antes do veredito.
    await page.waitForTimeout(1_500);
  } catch (error) {
    note = error instanceof Error ? error.message : String(error);
  }

  const finalUrl = page.url();
  const { horizontalOverflow, emptyMain } = await page
    .evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      emptyMain: (document.querySelector("main")?.textContent ?? "").trim().length < 20,
    }))
    .catch(() => ({ horizontalOverflow: false, emptyMain: false }));

  const screenshot = `${outDir}/${label}.png`;
  // Viewport, não `fullPage`. Com `fullPage`, o Chromium compõe os elementos
  // fixos sobre o canvas inteiro: a gaveta lateral do mobile — presente no DOM e
  // escondida por transform — aparecia por cima do conteúdo em TODA captura de
  // desktop, e o layout parecia quebrado sem estar. A auditoria quer o que o
  // usuário vê.
  await page.screenshot({ path: screenshot }).catch(() => undefined);

  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  page.off("response", onResponse);

  const redirected = new URL(finalUrl).pathname !== path.split("?")[0];
  const serverErrors = failedRequests.filter((r) => r.status >= 500);
  const broken =
    pageErrors.length > 0 || serverErrors.length > 0 || emptyMain || note !== undefined;
  const warn = consoleErrors.length > 0 || failedRequests.length > 0 || horizontalOverflow;

  return {
    path,
    requestedUrl,
    finalUrl,
    status: broken ? "broken" : redirected ? "redirect" : warn ? "warn" : "ok",
    httpStatus,
    consoleErrors,
    pageErrors,
    failedRequests,
    horizontalOverflow,
    emptyMain,
    screenshot,
    note,
  };
}

/**
 * Faz UM login e devolve o estado de sessão para reuso entre viewports.
 *
 * Antes eram 4 logins por módulo (papel × viewport). Em módulo grande — as 18
 * telas de configuração — varreduras seguidas esgotavam o limitador de tentativas
 * do login e o harness passava a se bloquear sozinho, três vezes. O estado fica
 * em memória, não em disco: nada de cookie de produção sobrando em arquivo.
 */
async function captureAuthState(
  browser: Browser,
  role: RoleKey,
): Promise<Awaited<ReturnType<BrowserContext["storageState"]>>> {
  const context = await browser.newContext({
    viewport: VIEWPORTS.desktop,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  });
  const page = await context.newPage();
  await login(page, role);
  const state = await context.storageState();
  await context.close();
  return state;
}

async function runPass(
  browser: Browser,
  role: RoleKey,
  viewport: ViewportKey,
  urls: Array<{ route: AuditRoute; url: string | null }>,
  outDir: string,
  warmup: boolean,
  authState: Awaited<ReturnType<BrowserContext["storageState"]>>,
): Promise<PassReport> {
  const context: BrowserContext = await browser.newContext({
    viewport: VIEWPORTS[viewport],
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    storageState: authState,
  });
  const page = await context.newPage();

  // Aquecimento: o dev server compila rota e handler tRPC sob demanda. Na
  // primeira visita isso vira 404 em batch e `<main>` que não aparece em 20s —
  // achados fantasmas que custaram meia hora de investigação na primeira
  // varredura do PDV. Visita tudo uma vez e descarta.
  if (warmup) {
    for (const { url } of urls) {
      if (!url) continue;
      await page.goto(`${BASE_URL}${url}`, { waitUntil: "domcontentloaded" }).catch(() => undefined);
      await page.waitForTimeout(400);
    }
  }

  const routes: RouteFinding[] = [];
  for (const { route, url } of urls) {
    if (!url) {
      routes.push({
        path: route.path,
        requestedUrl: route.path,
        finalUrl: "",
        status: "skip",
        httpStatus: null,
        consoleErrors: [],
        pageErrors: [],
        failedRequests: [],
        horizontalOverflow: false,
        emptyMain: false,
        screenshot: null,
        note: "sem registro na base para preencher :id",
      });
      continue;
    }
    const label = `${role}-${viewport}-${url.replace(/[^a-z0-9]/gi, "_")}`;
    const finding = await visit(page, url, outDir, label);
    routes.push(finding);
    const mark = finding.status === "ok" ? "ok  " : finding.status.toUpperCase().padEnd(4);
    console.log(`  [${mark}] ${url}`);
    for (const err of finding.pageErrors) console.log(`         pageerror: ${err}`);
    for (const err of finding.consoleErrors) console.log(`         console:   ${err}`);
    for (const req of finding.failedRequests) {
      console.log(`         ${req.status}: ${req.url.slice(0, 100)}`);
      if (req.body) console.log(`           corpo: ${req.body.slice(0, 220)}`);
    }
    if (finding.emptyMain) console.log("         <main> praticamente vazio");
    if (finding.horizontalOverflow) console.log("         overflow horizontal");
    if (finding.note) console.log(`         nota: ${finding.note}`);
  }

  await context.close();
  return { role, viewport, routes };
}

async function main(): Promise<void> {
  const { moduleKey, role, viewport } = parseArgs(process.argv.slice(2));
  if (!moduleKey) {
    console.error(`Módulos: ${AUDIT_MODULES.map((m) => m.key).join(", ")}`);
    throw new Error("Informe o módulo. Ex.: pnpm tsx scripts/audit/crawl-module.ts caixa");
  }
  const auditModule = findModule(moduleKey);
  if (!auditModule) throw new Error(`Módulo desconhecido: ${moduleKey}`);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL não definida.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

  const tenant = await prisma.tenant.findUnique({
    where: { slug: TENANT_SLUG },
    select: { id: true },
  });
  if (!tenant) throw new Error(`Tenant "${TENANT_SLUG}" não existe nesta base.`);

  const urls = await resolveRoutes(auditModule.routes, prisma, tenant.id);
  await prisma.$disconnect();

  const outDir = `${OUT_ROOT}/${auditModule.key}`;
  await mkdir(outDir, { recursive: true });

  const roles: RoleKey[] = role ? [role] : ["admin", "operator"];
  const viewports: ViewportKey[] = viewport ? [viewport] : ["desktop", "mobile"];

  const browser = await chromium.launch();
  const passes: PassReport[] = [];
  try {
    for (const r of roles) {
      const authState = await captureAuthState(browser, r);
      for (const v of viewports) {
        console.log(`\n=== ${auditModule.label} · ${r} · ${v} ===`);
        passes.push(
          await runPass(browser, r, v, urls, outDir, passes.length === 0, authState),
        );
      }
    }
  } finally {
    await browser.close();
  }

  const reportPath = `${outDir}/report.json`;
  await writeFile(reportPath, JSON.stringify({ module: auditModule.key, passes }, null, 2));

  const collect = (status: RouteFinding["status"]) =>
    passes.flatMap((p) =>
      p.routes.filter((r) => r.status === status).map((r) => `${p.role}/${p.viewport} ${r.path}`),
    );
  const broken = collect("broken");
  const warns = collect("warn");
  const redirects = collect("redirect");

  console.log(`\nRelatório: ${reportPath}`);
  console.log(`Quebradas: ${broken.length} · Atenção: ${warns.length} · Redirect: ${redirects.length}`);
  for (const item of broken) console.log(`  QUEBRADA  ${item}`);
  for (const item of warns) console.log(`  ATENÇÃO   ${item}`);
  for (const item of redirects) console.log(`  REDIRECT  ${item}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
