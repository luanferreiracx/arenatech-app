# 00 — INDEX

Pacote completo de migração **Arena Tech: Laravel → Next.js**.

## Ordem de execução

Execute na ordem. Cada documento depende dos anteriores estarem prontos.

| # | Documento | Onde executa | Tempo estimado | Pré-requisito |
|---|---|---|---|---|
| 01 | `01_DEV_LOCAL_SETUP.md` | Seu Mac | 30-60 min | Mac M5 com 16GB |
| 02 | `02_DEPLOY_SETUP.md` | Mac + VPS + GitHub | 2-3h | 01 concluído |
| 03 | `03_CLAUDE_AUTONOMY.md` | Mac (no projeto) | 15 min | 01 e 02 concluídos |
| 04 | `04_MIGRATION_PLAN.md` | Lido pelo Claude Code | — | 03 concluído |
| 05 | `05_PROGRESS.md` | Atualizado pelo Claude | — | Inicia na Fase 0 |
| 06 | `06_CLAUDE.md` | Lido pelo Claude (sempre) | — | Vai pro repo |

## Visão geral do fluxo final

```
┌─────────────────────────────────────────────────────────────┐
│  SEU MACBOOK PRO M5                                         │
│                                                             │
│  ~/dev/arenatech-app/                                       │
│  ├─ código-fonte (Next.js 16, tRPC, Prisma 7)              │
│  ├─ Claude Code CLI rodando aqui                            │
│  ├─ Docker Compose: Postgres 16 + Redis 7 + MinIO           │
│  └─ Sessão tmux 'arena' com 5 janelas pré-configuradas      │
│                                                             │
│              │ git push origin main                         │
│              ▼                                              │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  GITHUB                                                     │
│                                                             │
│  Repo privado: arenatech-app                                │
│  Actions roda em pre-receive:                               │
│   ├─ pnpm lint                                              │
│   ├─ pnpm typecheck                                         │
│   ├─ pnpm test (Vitest)                                     │
│   ├─ pnpm test:e2e (Playwright nas rotas críticas)          │
│   ├─ pnpm build                                             │
│   └─ Migrações Prisma validadas                             │
│                                                             │
│  Se passar tudo → trigger deploy                            │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  VPS CONTABO (194.34.232.81)                                │
│                                                             │
│  /var/www/arenatechpi.com.br/                               │
│  ├─ intranet-laravel/   ← legado, continua rodando          │
│  └─ arenatech-app/      ← novo, deploy via git pull         │
│                                                             │
│  Serviços:                                                  │
│   ├─ Postgres 16 (banco do app novo)                        │
│   ├─ MySQL (banco do Laravel legado)                        │
│   ├─ Redis 7                                                │
│   ├─ MinIO                                                  │
│   ├─ Nginx (reverse proxy)                                  │
│   └─ PM2 (processo Node)                                    │
└─────────────────────────────────────────────────────────────┘
```

## Princípios do projeto

1. **Desenvolvimento local, deploy automatizado** — você nunca faz deploy manual
2. **Testes obrigatórios** — push direto pra `main` permitido SE testes passarem
3. **Claude com autonomia generosa dentro do projeto, restrita fora**
4. **Documentação viva** — `05_PROGRESS.md` é atualizado a cada checkpoint, é a memória do projeto
5. **Migração em fases sequenciais nas bases (0-6), paralelas nos módulos folha (7+)**
6. **Tenants atuais descartados** — só a intranet central migra

## Próximo passo

Abra `01_DEV_LOCAL_SETUP.md` e comece.
