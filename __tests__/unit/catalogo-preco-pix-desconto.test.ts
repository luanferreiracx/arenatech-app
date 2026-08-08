/**
 * CAT-1 (Etapa 9, Módulo 12 — Catálogo): o "Preço PIX" aceitava valor MAIOR que
 * o preço do cartão, sem aviso nenhum.
 *
 * ## Por que importa
 *
 * O campo é, por definição, o valor **com desconto** — o próprio diálogo diz
 * *"deixe em branco se não houver desconto"*. E ele não é decorativo:
 * `promotionalPrice` é o preço que o **bot usa ao responder o cliente**
 * (`pixPrice` em `device-catalog-admin`). Um dígito a mais faz o Talison
 * anunciar PIX mais caro que o cartão, contradizendo a própria oferta da loja.
 *
 * Medido no navegador, antes: cartão R$ 1.000 + PIX R$ 1.500 **salvava em
 * silêncio**.
 *
 * Em produção: **23 aparelhos no catálogo, 8 deles usando preço PIX**, zero
 * inválidos hoje. O defeito não aconteceu ainda — mas o campo está em uso real.
 *
 * ## O buraco que a primeira correção deixou
 *
 * Comecei com `superRefine` nos dois schemas. Passou no navegador (criação
 * barrada, edição pela tela barrada) — e **ainda tinha buraco**: no
 * `updateCatalogDevice` todo campo é opcional, então um PATCH com **apenas**
 * `promotionalPrice` chega com `price === undefined` e o refine não dispara.
 *
 * ```
 * PATCH { promotionalPrice: 99999 }  num aparelho de R$ 1.000  ->  HTTP 200
 * ```
 *
 * A guarda tem de comparar o valor **efetivo pós-edição**: o do payload quando
 * veio, o persistido quando não veio. Verificado depois, nos quatro cenários:
 *
 * | payload | resultado |
 * |---|---|
 * | `{ promotionalPrice: 99999 }` | **400 barrado** |
 * | `{ promotionalPrice: 800 }` | 200 passa |
 * | `{ price: 500, promotionalPrice: 400 }` | 200 passa |
 * | `{ price: 300 }` (deixaria PIX 400 > 300) | **400 barrado** |
 *
 * O último é o caso **simétrico** — baixar o preço do cartão e deixar o PIX
 * acima. Comparar só o campo enviado não o pegaria.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTER = readFileSync(
  join(process.cwd(), "src/server/api/routers/catalog.ts"),
  "utf8",
);
const TELA = readFileSync(
  join(
    process.cwd(),
    "src/app/(app)/aparelhos-catalogo/_components/device-catalog-admin.tsx",
  ),
  "utf8",
);

describe("CAT-1 — o preço PIX não pode ser maior que o do cartão", () => {
  it("o servidor tem a regra, não só a tela", () => {
    // A API é chamável direto: guarda de cliente evita o erro, a do servidor
    // impede o dado inválido.
    expect(ROUTER).toMatch(/function precoPixNaoPodeSerMaior/);
  });

  it("a criação aplica a regra", () => {
    const criar = ROUTER.slice(
      ROUTER.indexOf("createCatalogDevice:"),
      ROUTER.indexOf("updateCatalogDevice:"),
    );
    expect(criar).toMatch(/superRefine\(precoPixNaoPodeSerMaior\)/);
  });

  it("a edição aplica a regra — o irmão não fica de fora", () => {
    const editar = ROUTER.slice(
      ROUTER.indexOf("updateCatalogDevice:"),
      ROUTER.indexOf("deleteCatalogDevice:"),
    );
    expect(
      editar,
      "fechar só a criação deixaria o caminho aberto pela edição — o padrão " +
        "'a regra existe e o irmão fica de fora' que este programa já nomeou.",
    ).toMatch(/superRefine\(precoPixNaoPodeSerMaior\)/);
  });

  it("a edição compara o valor EFETIVO, não só o payload", () => {
    // Sem isto, `{ promotionalPrice: 99999 }` sozinho passa: `price` chega
    // `undefined` e o refine do schema não dispara. Medido: HTTP 200.
    const editar = ROUTER.slice(
      ROUTER.indexOf("updateCatalogDevice:"),
      ROUTER.indexOf("deleteCatalogDevice:"),
    );
    expect(editar).toMatch(/const precoFinal =/);
    expect(editar).toMatch(/const pixFinal =/);
    // O fallback para o persistido é o que fecha o buraco.
    expect(editar).toMatch(/existing\?\.price/);
    expect(editar).toMatch(/existing\?\.promotionalPrice/);
    expect(editar).toMatch(/pixFinal > precoFinal/);
  });

  it("a tela avisa antes de enviar", () => {
    // Erro do servidor num campo de preço é ruim de ler; a guarda de cliente
    // aponta o campo. Ela NÃO substitui a do servidor.
    expect(TELA).toMatch(/const precoPix =/);
    expect(TELA).toMatch(/precoPix > precoCartao/);
    expect(TELA).toMatch(/não pode ser maior que o preço do cartão/);
  });

  it("nenhuma das guardas dispara quando um dos preços está vazio", () => {
    // "Deixe em branco se não houver desconto" — sem preço PIX não há o que
    // comparar, e a regra não pode bloquear o cadastro comum.
    expect(ROUTER).toMatch(/if \(price == null \|\| promotionalPrice == null\) return/);
    expect(TELA).toMatch(/precoPix != null && precoCartao != null/);
  });
});
