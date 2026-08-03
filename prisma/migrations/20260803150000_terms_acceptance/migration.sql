-- Aceite de Termos versionado (ADR 0065).
--
-- Antes, o aceite era um `useState` no navegador: desabilitava o botão e morria
-- ali. Nenhum registro no servidor de que alguém concordou com alguma coisa — e
-- um aceite que não deixa rastro não prova nada quando precisa provar.
--
-- Guarda a VERSÃO junto do carimbo de tempo: "aceitou" sozinho não distingue
-- quem concordou com o texto novo de quem concordou com a redação de meses
-- atrás, que é a única pergunta que um aceite existe para responder.
--
-- Colunas NULLABLE, sem backfill: quem se cadastrou antes disto não deixou
-- registro, e inventar consentimento retroativo seria pior do que admitir a
-- lacuna.
ALTER TABLE "pre_registrations"
  ADD COLUMN "terms_accepted_at" TIMESTAMP(3),
  ADD COLUMN "terms_accepted_version" TEXT;

-- Duplicado no tenant de propósito: o pré-cadastro é registro de PASSAGEM (a
-- senha dele é apagada na aprovação, e um dia a fila será podada), enquanto o
-- aceite precisa durar o quanto durar a relação comercial.
ALTER TABLE "tenants"
  ADD COLUMN "terms_accepted_at" TIMESTAMP(3),
  ADD COLUMN "terms_accepted_version" TEXT;
