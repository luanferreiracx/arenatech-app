# Etapa 9 · Módulo 7 — Clientes (frontend)

> Varredura por módulo. Três provas: código, dado de produção, navegador real.
> Data: 2026-08-08. Skill: `audit-frontend`.

## Escala

**1.422 clientes, 1.288 com CPF**, todos com telefone. É dado pessoal na tela.

---

## E9-6 — A ficha oferecia WhatsApp a quem pediu para não ser contatado — ✅ CORRIGIDO

O `CustomerMessageDialog` **já respeitava** o opt-out: bloqueia o envio e cita a
LGPD explicitamente.

Mas a ficha do cliente tem **dois links `wa.me`** (telefone principal e
alternativo) que abrem a conversa fora do sistema — contornam o gate e saem do
rastro.

Provado no navegador, com opt-out ativo num cliente real:

```
{"linksWhatsApp":["https://wa.me/5586995423021"], "avisaOptOut":false}
```

O operador via CPF, WhatsApp e telefone — e **nada** indicava que aquela pessoa
pediu para não ser contatada.

### A decisão: esconder o CONVITE, não o dado

O telefone **continua visível**. O operador precisa dele para atender quem ligou
para a loja; esconder o número quebraria o atendimento legítimo.

O que some é o `wa.me` — o atalho que **inicia** contato. É a mesma lógica do M6
(custo no PDF): nega a **ação**, não a informação de trabalho.

E o aviso vem junto, obrigatoriamente: **link que some sem explicação é pior que
link que nega** — o operador acharia que a tela quebrou.

### Verificado

| estado | aviso | links `wa.me` | telefone |
|---|---|---|---|
| sem opt-out | não | 1 | visível |
| **com opt-out** | **sim** | **0** | **visível** |

Texto do aviso: *"Cliente optou por não receber comunicações (LGPD). Não inicie
contato — atenda apenas se ele procurar a loja."*

O teste afirma que **todas** as chamadas passam o flag — o telefone alternativo
é o fácil de esquecer, e é o mesmo padrão de "a regra existe e o irmão fica de
fora" que este programa já nomeou 15 vezes.

---

## O que verifiquei e está correto

- **8 combinações** (4 telas × 2 papéis): zero rolagem horizontal a 320px, zero
  erro de JS, nenhuma tela quebrada.
- **Nenhum God component**: o maior é `customer-detail.tsx` com **384 linhas**.
- **O gate de mensagem já existia e é bom** — bloqueia por opt-out, avisa
  quando não há telefone, e sinaliza a janela de 24h do WhatsApp.

---

## Registro sem proposta

1. **A UI não permite MARCAR o opt-out.** O backend tem `unsubscribeCustomer`
   (M4 da Etapa 7, livre ao operador por decisão), mas nenhuma tela o chama —
   hoje só o link público `/unsubscribe` registra. Se um cliente pedir por
   telefone, o operador não tem onde clicar. **Não corrigi porque é decisão de
   produto**: adicionar o botão exige definir se o operador confirma o pedido,
   se precisa registrar quem pediu, e o que fazer com o histórico.
2. **Zero opt-outs em produção** (1.422 clientes). O caminho existe e nunca foi
   usado — o que torna este achado preventivo, não incidente.
3. **`customers-table.tsx` (340 linhas)** hospeda o `CustomerMessageDialog`.
   Padrão correto (um diálogo global, não um por linha), registrado para não
   ser "otimizado" por engano.

---

## Baixa confiança

- **Não medi WCAG 1.4.4 (zoom 200%) nem 1.4.12 (text spacing)** — cobri o
  1.4.10 nas 4 telas.
- **Não exercitei o formulário de cadastro** com CPF inválido, duplicado ou
  CJK. Testei que a tela carrega e cabe em 320px.
- **Não verifiquei se a busca de clientes vaza dado entre tenants** — o M3 da
  Etapa 8 cobriu isolamento no backend, mas não medi a busca da UI.
