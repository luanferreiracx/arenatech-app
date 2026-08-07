# Etapa 8 · Módulo 10 (final) — Routers restantes

> Varredura por módulo. Três provas: código, dado de produção, navegador real.
> Data: 2026-08-07. Skill: `audit-security`.

## Escopo

Os 8 routers que sobraram depois de 9 módulos. Auditados **juntos** porque
compartilham a mesma característica: superfície pequena e sem dinheiro direto —
com **uma exceção que justificou a passada**.

| router | procedures | nível |
|---|---|---|
| `no-kyc` | 4 | **`publicProcedure`** — anônimo |
| `depix-fee-wallet-admin` | 9 | `adminProcedure` (superadmin) |
| `partner-api-key` | 7 | `tenantAdminProcedure` |
| `recurring-expense` | 6 | `tenantProcedure` |
| `simulator` | 4 | 3 tenant + 1 superAdminTenant |
| `depix-lbtc-admin` | 3 | `adminProcedure` |
| `depix-holds-admin` | 3 | `adminProcedure` |
| `payment-link` | 3 | `tenantProcedure` |

---

## Sem achados. E isso é um resultado, não ausência de trabalho.

### A superfície anônima (`no-kyc`) está bem construída

É o auto-cadastro de tenant — qualquer pessoa na internet alcança. As quatro
procedures são `publicProcedure`, o que soa alarmante e **não é**:

| defesa | como está |
|---|---|
| rate limit | **todas as 4**: 5/h no cadastro, 10/h nas verificações, 5/15min no reenvio |
| código de verificação | **6 dígitos, hasheado** no banco (nunca em claro) |
| tentativas por código | **máximo 5**, depois o código é queimado |
| expiração | sim, e código expirado é consumido |
| reuso | `consumedAt` — uso único |
| validação de entrada | Zod **antes** de qualquer escrita |

Força bruta é 5 tentativas em 1 milhão, e o código morre depois disso.

**Testado contra produção real:**

```
noKyc.startRegistration -> 400,400,400,400,429,429,429
```

Quatro passam a validação (e são recusadas por dados inválidos), o quinto em
diante leva **429**. Confirmei em seguida no banco de produção: **0
pré-cadastros criados** — a validação recusou antes de gravar.

### A fronteira da central (superadmin) está intacta

Os 3 routers admin do DePix somam **15 procedures, todas em `adminProcedure`**,
que exige `isSuperAdmin`. Testado no navegador com um **admin de tenant**:

| procedure | resultado |
|---|---|
| `depixLbtcAdmin.list` | **403** "Not a super admin" |
| `depixLbtcAdmin.refillManual` | **403** |
| `depixFeeWalletAdmin.status` | **403** |
| `depixFeeWalletAdmin.sendOnchain` | **403** |
| `depixHoldsAdmin.list` | **403** |

Inclui `sendOnchain`, que **move cripto para fora** — o vetor mais grave da
lista. Cinco tentativas, cinco recusas.

### Uma decisão de fronteira que vale preservar

`simulator.updateConfig` é `superAdminTenantProcedure`, e as outras três são
`tenantProcedure`. Faz sentido: **ler** a simulação de parcelamento é operação
de balcão; **mudar as taxas** que a plataforma pratica não é decisão do tenant.
Mesma lógica do `updateFeeConfig` no M9.

---

## O que isto diz sobre o programa

Nove módulos produziram 12 achados. O décimo produziu zero — e o motivo é
instrutivo: **estes routers foram escritos depois**, já com o rate limit, o
hash, o `adminProcedure` e a validação Zod como padrão.

Os achados dos módulos anteriores concentraram-se em código **antigo**, onde a
regra foi criada depois e aplicada só em parte. É a assinatura do padrão que o
programa nomeou 14 vezes: *a regra existia e foi esquecida no irmão*.

---

## Baixa confiança

- **Não testei `partner-api-key` nem `recurring-expense` no navegador.**
  Verifiquei o nível de acesso de todas as procedures (7 `tenantAdmin`, 6
  `tenant`), não a lógica. `recurring-expense` tem **0 registros** em produção.
- **Não exercitei o fluxo completo do `no-kyc`** (cadastro → e-mail → WhatsApp →
  aprovação). Testei as bordas: rate limit, validação e ausência de resíduo.
- **`payment-link` foi coberto parcialmente no M1** (token de 82 bits, rate
  limit na ação de gerar QR). As 3 procedures do router em si não foram
  exercitadas.
