# ADR 0065 — O aceite dos Termos é registrado no servidor, com versão

- **Status:** Aceito
- **Data:** 2026-08-03
- **Contexto:** [ADR 0064](0064-plano-escolhido-no-cadastro.md) (funil self-service), [ADR 0050](0050-tenant-no-kyc-onboarding.md) (onboarding NO-KYC)

## Contexto

A tela de cadastro sempre teve o checkbox "Li e concordo com os Termos de Uso e a
Política de Privacidade". Ele desabilitava o botão até ser marcado.

Era tudo. O aceite vivia num `useState` e morria com a aba:

- o **servidor nunca soube** que existia um aceite — o campo não estava no schema
  do `startRegistration`, então quem chamasse o endpoint direto (curl, script,
  cliente próprio) criava conta sem concordar com nada;
- **nada era gravado** — não havia como responder "esta pessoa aceitou?" nem
  "quando?";
- não havia **versão** — mesmo que gravássemos um booleano, quando o texto dos
  Termos mudasse ninguém distinguiria quem concordou com a redação nova de quem
  concordou com uma de meses atrás.

O terceiro ponto é o que importa. Um aceite existe para responder *o que* foi
aceito; um booleano responde só *que* algo foi.

Ao mesmo tempo, as quatro páginas em `/legal` carregavam a data de atualização
copiada quatro vezes (`const UPDATED_AT = "07 de julho de 2026"`), sem forma
legível por máquina.

## Decisão

**1. `acceptedTerms` entra no schema como `z.literal(true)`.**
Não `z.boolean()`: um `false` tem que ser **recusado pelo servidor**, não apenas
pelo botão desabilitado da tela. O botão é conveniência de UI; a regra é do
servidor.

**2. O servidor carimba data e versão.**
`termsAcceptedAt` e `termsAcceptedVersion` são preenchidos no `startRegistration`
a partir do relógio do servidor e de `CURRENT_TERMS_VERSION`. Aceitar data ou
versão vindas do cliente deixaria o registro valendo o que vale um campo de
formulário — nada, como prova.

**3. `CURRENT_TERMS_VERSION` é fonte única, e as páginas legais leem dela.**
Formato `AAAA-MM-DD`: ordenável como string, legível por humano, sem semver
(documento legal não tem "patch" — ou o texto mudou, e o aceite anterior virou
histórico, ou não mudou). `CURRENT_TERMS_LABEL` é a mesma data por extenso, que é
o que as páginas exibem. Um teste confere que as duas descrevem a mesma data:
sem ele, editar o texto e esquecer a versão produziria aceites novos carimbados
com a versão de um documento que não existe mais.

**4. O aceite é copiado para o `Tenant` na aprovação.**
Duplicação deliberada. O `PreRegistration` é um registro de **passagem** — a
senha dele já é apagada na aprovação, e um dia a fila será podada. A prova do
consentimento precisa durar o quanto durar a relação comercial, então mora
também no tenant.

**5. As colunas são NULLABLE e não há backfill.**
Quem se cadastrou antes disto não deixou registro. Preencher retroativamente
seria **inventar consentimento** — pior do que admitir a lacuna. `null` significa
exatamente "não temos registro", que é a verdade.

**6. A versão aparece na tela.**
"…na versão de 07 de julho de 2026". O servidor registra *qual* texto foi aceito;
a pessoa tem que poder ver qual é esse texto.

## Consequências

**Boas**
- Existe resposta para "esta pessoa aceitou os Termos, quando, e qual versão?" —
  no pré-cadastro e no tenant.
- Quando os Termos mudarem, dá para consultar quem está em qual versão. Este ADR
  **não** decide o que fazer com quem ficou para trás (re-aceite na entrada,
  aviso, nada) — decisão de produto, quando houver a primeira mudança real.
- As quatro páginas legais deixaram de ter a data copiada quatro vezes.

**Custos e riscos**
- Mudar o texto legal passa a exigir **dois** passos: editar a página e mudar
  `CURRENT_TERMS_VERSION`. O teste guarda o esquecimento, mas é um passo a mais.
- Tenants criados à mão (`createTenant`) ficam com aceite nulo: ali não há
  titular concordando com nada no momento da criação. É correto, mas significa
  que "tenant sem aceite" não é, sozinho, sinal de problema.

## Alternativas descartadas

- **Gravar só um booleano `termsAccepted`.** Responde à pergunta errada; no dia
  em que o texto mudar, o registro não vale nada.
- **Tabela de histórico de aceites (N por tenant).** Suportaria re-aceite a cada
  nova versão, que é o passo seguinte natural — mas hoje não existe re-aceite, e
  a tabela nasceria com uma linha por tenant e nenhum leitor. Quando a primeira
  mudança real de Termos acontecer, a migração de duas colunas para uma tabela é
  mecânica.
- **Backfill dos cadastros antigos com a data de criação.** Produziria um
  registro que parece prova e não é.

## Verificação

- `__tests__/unit/no-kyc-validators.test.ts` — o schema recusa aceite ausente,
  `false`, `"true"` e `1`; o erro aponta para o campo certo.
- `__tests__/unit/terms-version.test.ts` — formato, data real, e o rótulo exibido
  descrevendo a mesma data da versão gravada.
- `__tests__/integration/funil-self-service.test.ts` — o cadastro grava data e
  versão; o servidor recusa cadastro sem aceite **mesmo sem passar pela tela**
  (verificado que o caso falha quando o schema é enfraquecido para `z.boolean()`);
  a aprovação copia o aceite para o tenant.
