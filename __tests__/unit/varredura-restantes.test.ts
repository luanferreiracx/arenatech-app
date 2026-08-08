/**
 * VAR-3 (Etapa 9, fechamento da varredura): as últimas telas com coluna decisiva
 * fora de vista.
 *
 * ## O que foi corrigido aqui
 *
 * | tela | coluna que nascia fora | por que importa |
 * |---|---|---|
 * | `/commissions` | **Contrato vigente** | mostra *"sem contrato"* em vermelho — quem não pode ser comissionado |
 * | `/services/manage` | **Status** | serviço inativo não entra na OS |
 * | `/settings/users` | **Perfil** | define o que a pessoa PODE fazer no sistema |
 * | `/stock/reports` (posição) | **Status** e **Qtd** | é a resposta que um relatório de posição existe para dar |
 *
 * ## Balanço da varredura completa
 *
 * 51 rotas estáticas medidas a 320px (as 53 originais menos as 2 do iPhone
 * Hunter, removido):
 *
 * ```
 * páginas que rolam horizontalmente:      0
 * elementos fora da viewport:             0
 * colunas decisivas ainda fora:           5  (ver abaixo)
 * ```
 *
 * ## As 5 que restam — e por que parei
 *
 * | tela | coluna | leitura |
 * |---|---|---|
 * | `/cashier/history` | Saldo Inicial | secundária: a **Diferença** (que diz se fechou certo) já aparece |
 * | `/financial/pending` | Valor Total | secundária: **A Receber** já aparece |
 * | `/stock/report` | Valor Total (Custo/Venda) | secundária: totais calculados; o unitário aparece |
 * | `/stock/reports` | Valor Total / Unit. | idem |
 * | **`/pdv/history`** | **Status** | **real — não resolvido** |
 *
 * ### `/pdv/history`: o que tentei e onde parei
 *
 * ```
 * inicial:               Status @ 707px
 * após reordenar:        Status @ 393px
 * após ano de 2 dígitos: Status @ 393px  (a data encolheu, o Valor entrou)
 * após padding px-2:     Status @ 345px
 * área visível:                  ~295px
 * ```
 *
 * O gargalo é o **número da venda**: `"VND202603242"` ocupa 126px sozinho. Para
 * `Status` entrar, seria preciso encurtar o identificador (tirar o prefixo `VND`
 * ou o ano) — isso é **mudança de dado, não de layout**, e não é decisão minha.
 *
 * Parei e registrei em vez de espremer mais: comprimir a coluna cortaria o
 * número da venda, que é como o operador identifica a linha.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const COMISSOES = ler("src/app/(app)/commissions/providers/_components/providers-list.tsx");
const SERVICOS = ler("src/app/(app)/services/_components/services-table.tsx");
const USUARIOS = ler("src/app/(app)/settings/users/_components/users-manager.tsx");
const POSICAO = ler("src/app/(app)/stock/reports/_components/posicao-estoque-tab.tsx");

const ordemHeaders = (fonte: string) =>
  [...fonte.matchAll(/header: "([^"]+)"/g)].map((m) => m[1] ?? "");

const ordemTableHead = (fonte: string) =>
  [...fonte.matchAll(/<TableHead[^>]*>([^<]+)<\/TableHead>/g)]
    .map((m) => (m[1] ?? "").trim())
    .filter(Boolean);

describe("VAR-3 — o alerta de contrato aparece na lista de prestadores", () => {
  it("Contrato vigente é a primeira coluna", () => {
    expect(
      ordemHeaders(COMISSOES)[0],
      `a coluna mostra "sem contrato" em VERMELHO — é o alerta de quem não pode ` +
        `ser comissionado, e nascia por último numa tabela de 581px em 270.`,
    ).toBe("Contrato vigente");
  });
});

describe("VAR-3 — o status do serviço aparece", () => {
  it("Status é a primeira coluna", () => {
    // Serviço inativo não entra na OS.
    expect(ordemHeaders(SERVICOS)[0]).toBe("Status");
  });

  it("Preco continua visível", () => {
    // Não-regressão: o preço já estava em posição boa antes da mudança.
    expect(ordemHeaders(SERVICOS).indexOf("Preco")).toBeLessThanOrEqual(3);
  });
});

describe("VAR-3 — o perfil do usuário aparece", () => {
  it("Perfil vem logo após Nome", () => {
    // O perfil define o que a pessoa PODE fazer — é o que se confere ao abrir.
    expect(ordemTableHead(USUARIOS).slice(0, 2)).toEqual(["Nome", "Perfil"]);
  });

  it("o corpo segue a ordem do cabeçalho", () => {
    const corpo = USUARIOS.slice(USUARIOS.indexOf("<TableBody>"));
    const posPerfil = corpo.indexOf("ROLE_LABELS[u.role]");
    const posCpf = corpo.indexOf("formatCpf(u.cpf)");
    const posEmail = corpo.indexOf("u.email ??");
    expect(posPerfil).toBeGreaterThan(0);
    expect(posPerfil).toBeLessThan(posCpf);
    expect(posCpf).toBeLessThan(posEmail);
  });
});

describe("VAR-3 — a posição de estoque responde o que a tela promete", () => {
  it("Status e Qtd são as duas primeiras", () => {
    expect(ordemTableHead(POSICAO).slice(0, 2)).toEqual(["Status", "Qtd"]);
  });

  it("o corpo segue a ordem do cabeçalho", () => {
    const corpo = POSICAO.slice(POSICAO.indexOf("<TableBody>"));
    const posStatus = corpo.indexOf("Sem Estoque");
    const posProduto = corpo.indexOf("title={p.name}");
    const posSku = corpo.indexOf("p.sku ||");
    expect(posStatus).toBeGreaterThan(0);
    expect(posStatus).toBeLessThan(posProduto);
    expect(posProduto).toBeLessThan(posSku);
  });

  it("o nome do produto tem teto de largura", () => {
    expect(POSICAO).toMatch(/max-w-\[12rem\] truncate/);
  });
});
