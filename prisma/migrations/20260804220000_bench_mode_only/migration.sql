-- Modo bancada: enxuga a tela de OS para quem só faz reparo.
--
-- Decisão do dono (2026-08-04): campo PRÓPRIO, não derivado de `is_technician`.
-- Em loja pequena o técnico às vezes também atende o balcão, e aí esconder o
-- bloco de dinheiro atrapalharia. Quem sabe a rotina é o admin da loja.
--
-- Nasce `false` para todo mundo: nada muda até alguém ligar. Não é permissão —
-- o servidor segue barrando quem não pode; isto é carga cognitiva.
ALTER TABLE "user_tenants"
  ADD COLUMN IF NOT EXISTS "bench_mode_only" BOOLEAN NOT NULL DEFAULT false;
