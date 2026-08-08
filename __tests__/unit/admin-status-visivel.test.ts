/**
 * ADM-1 (Etapa 9, Módulo 18 — Admin): as três listas do superadmin escondiam a
 * coluna `Status`.
 *
 * ## Medido a 320px, com dados
 *
 * | tela | tabela | `Status` começava em |
 * |---|---|---|
 * | `/admin/pre-registrations` | **1199px** / 270 | **982px** |
 * | `/admin/tenants` | 994px / 270 | 461px |
 * | `/admin/reports` | 704px / 270 | 391px |
 *
 * A fila de pré-cadastros é a mais grave: **seis das sete colunas fora de
 * vista**. É onde o superadmin decide quem entra na plataforma, e
 * "pendente/aprovado/rejeitado" era justamente o que não se via.
 *
 * Em `/admin/reports` a ironia é maior — o quadro se chama **"Tenants por
 * Status"**, e `Status` era a única coluna invisível.
 *
 * ## Quinta ocorrência da mesma classe nesta etapa
 *
 * CMU-9 (M8, valor da alíquota a 356px), CMN-1 (M10, status do envio a 707px),
 * INT-1 (M11, status do lead a 475px), QSL-2 (M15, valor e status a 420/540px).
 * O padrão é estável: **a coluna que decide a ação é declarada por último**.
 *
 * ## Reordenar sozinho não bastava
 *
 * "Nome Fantasia" consumia **277px** (25 → 302) porque texto livre sem teto
 * estica a coluna — a reordenação seria desfeita pelo primeiro nome longo. Daí o
 * `max-w-*` + `truncate` nas colunas de texto, com `title` para o valor inteiro
 * ficar acessível no hover.
 *
 * Depois: `Status` em **25px** nas três telas (49 em reports), com o corpo
 * batendo com o cabeçalho.
 *
 * ## Sobre a cobertura desta varredura
 *
 * As 11 telas do admin foram medidas a 320px. **Quatro estavam vazias**
 * localmente (`addons`, `refunds`, `depix-holds`, `depix-fees`) — passaram por
 * não ter o que quebrar, não por estarem corretas. Registro para não contar como
 * verificadas.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const PREREG = ler(
  "src/app/(admin)/admin/pre-registrations/_components/pre-registrations-table.tsx",
);
const TENANTS = ler("src/app/(admin)/admin/tenants/_components/tenants-table.tsx");
const REPORTS = ler("src/app/(admin)/admin/reports/_components/admin-reports.tsx");

/** Cabeçalhos na ordem declarada, para tabelas que usam `columns`. */
function ordemColumns(fonte: string): string[] {
  return [...fonte.matchAll(/header: "([^"]*)"/g)].map((m) => m[1] ?? "");
}

describe("ADM-1 — Status é a primeira coluna nas listas do admin", () => {
  it("fila de pré-cadastros", () => {
    const ordem = ordemColumns(PREREG);
    expect(
      ordem[0],
      `ordem: ${ordem.join("|")}. A tabela media 1199px numa área de 270 — seis ` +
        `das sete colunas nasciam fora de vista, e Status em 982px. É a fila de ` +
        `aprovação de novas lojas.`,
    ).toBe("Status");
  });

  it("lista de tenants", () => {
    expect(ordemColumns(TENANTS)[0]).toBe("Status");
  });

  it('relatório "Tenants por Status"', () => {
    // HTML puro, não `columns`: mede a ordem dos `<th>`.
    const ths = [...REPORTS.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map((m) => (m[1] ?? "").trim());
    expect(
      ths[0],
      `o quadro se chama "Tenants por Status" e Status era a única coluna ` +
        `invisível (391px numa área de 270).`,
    ).toBe("Status");
  });

  it("o corpo do relatório segue a MESMA ordem do cabeçalho", () => {
    // Reordenar só o `<thead>` desalinharia todas as células — em HTML puro não
    // há `accessorKey` para proteger.
    const corpo = REPORTS.slice(REPORTS.indexOf("<tbody>"));
    const posStatus = corpo.indexOf("StatusBadge");
    const posNome = corpo.indexOf("title={t.name}");
    const posPlano = corpo.indexOf("t.plan ??");
    const posSlug = corpo.indexOf("t.slug");
    expect(posStatus).toBeGreaterThan(0);
    expect(posStatus).toBeLessThan(posNome);
    expect(posNome).toBeLessThan(posPlano);
    expect(posPlano).toBeLessThan(posSlug);
  });
});

describe("ADM-1 — texto livre não estica a coluna de volta", () => {
  it("as colunas de texto das três telas têm teto", () => {
    // Sem `max-w-*`, um nome longo desfaz a reordenação: "Nome Fantasia" sozinho
    // consumia 277px.
    for (const [nome, fonte] of [
      ["pré-cadastros", PREREG],
      ["tenants", TENANTS],
      ["reports", REPORTS],
    ] as const) {
      expect(fonte, `${nome} sem teto de largura`).toMatch(/max-w-\[1[24]rem\]/);
      expect(fonte, `${nome} sem truncate`).toMatch(/truncate/);
    }
  });

  it("o valor inteiro fica acessível no title", () => {
    // Truncar sem `title` esconde a informação de vez — aqui ela volta no hover.
    expect(PREREG).toMatch(/title=\{row\.original\.tradeName\}/);
    expect(TENANTS).toMatch(/title=\{row\.original\.name\}/);
    expect(REPORTS).toMatch(/title=\{t\.name\}/);
  });
});
