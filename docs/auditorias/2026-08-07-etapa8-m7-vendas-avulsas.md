# Etapa 8 · Módulo 7 — Vendas avulsas (quick-sale)

> Varredura por módulo. Três provas: código, dado de produção, navegador real.
> Data: 2026-08-07. Skill: `audit-security`.

## Escala

**21 vendas, R$ 7.555,52** — 16 pagas, 3 canceladas, 2 aguardando. Volume baixo,
mas é um caminho de dinheiro paralelo ao PDV.

O `imei` (3 consultas, 1 quota) foi verificado e descartado por irrelevância de
volume.

---

## E8-8 — Declarar dinheiro recebido não deixava rastro — ✅ CORRIGIDO

Provado no navegador contra a cópia de produção: um **operador** marcou uma
venda avulsa real como PAGA, **HTTP 200**, sem admin e sem 2FA.

*(A venda foi revertida imediatamente para `AWAITING_PAYMENT` — estado final
16/3/2, idêntico ao inicial.)*

### Isso não é o defeito

Registrar recebimento é **atendimento**, não gestão. O PDV segue a mesma regra:
restringe o **estorno** (`sale.refund` é admin-only) e não a venda. Um gate de
admin aqui quebraria o balcão.

### O defeito é o silêncio

`markPaid` não gravava **nada** — nem `logAudit`, nem `logger`. Nem `cancel`.

E isso importa de forma desigual:

| situação | vendas | prova do pagamento |
|---|---|---|
| com lastro externo (DePix/wallet) | **18** | o `markPaid` **revalida na fonte** |
| sem lastro externo | **3** | **a palavra do operador** |

Nas 18, a revalidação é rigorosa — verifica que a transação DePix **pertence a
esta venda** (`sourceId !== existing.id` → `FORBIDDEN`) e que liquidou. O
operador não consegue mentir.

Nas 3, não havia como reconstruir quem declarou o quê.

### O fix

`logAudit` com `number`, `totalAmount` e — o campo que importa —
**`revalidadoNaFonte`**, que separa "o DePix confirmou" de "o operador afirmou".

Verificado no navegador:

```
action:  quick_sale_mark_paid
quem:    Auditoria Operador
payload: {"number":"QS202600002","totalAmount":"19.98","revalidadoNaFonte":false}
```

---

## E8-8b — CAS nos dois caminhos que marcam PAID

O webhook do PagBank (`webhooks/pagbank/route.ts:108`) escreve a **mesma**
transição, com o mesmo padrão ler-checar-escrever. Ambos ganharam CAS ancorado
em `status: "AWAITING_PAYMENT"`.

**Por honestidade, a severidade é baixa (P3).** Medi antes de corrigir:

- **nenhum dos dois gera efeito colateral financeiro** — não escreve movimento
  de caixa, recebível de cartão nem `financial_transaction`;
- **`quick_sales.paid_at` não alimenta DRE nem fluxo de caixa** — grep em
  `financial.ts` e `report.ts` não achou um único leitor de `quickSale`.

Escrever `PAID` duas vezes não duplica dinheiro; só sobrescreveria o `paidAt`.
Corrigi porque é barato e o padrão é conhecido — **não porque estava sangrando**.

---

## O que verifiquei e está correto

- **Invariante `unit_price × quantity − discount = total_amount`**: íntegro nos
  21 registros. Zero desconto maior que a venda, zero total negativo.
- **A revalidação do DePix é rigorosa**: confirma que a transação pertence à
  venda (não basta existir) e que o status liquidou. É a melhor defesa deste
  módulo.
- **`cancel` recusa venda já paga** — testado: operador recebeu 400 *"Apenas
  vendas aguardando pagamento podem ser canceladas"*.
- **A revalidação roda FORA da transação** (comentário `QS1`), evitando
  transação aninhada e segunda conexão do pool.

---

## Baixa confiança

- **Não testei o `generatePix` nem o `checkPixStatus`** com a mesma
  profundidade. São os caminhos que falam com o gateway externo.
- **`cancel` também não grava trilha.** Cancelar não move dinheiro (a venda
  nunca foi paga), então deixei de fora — mas é assimétrico com o `markPaid`
  agora.
- **Não medi o que acontece se o webhook chegar para uma venda já CANCELLED.**
  O CAS agora recusa, mas não verifiquei se o PagBank reenvia nesse caso.
