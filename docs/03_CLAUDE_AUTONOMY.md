# 03 — CLAUDE AUTONOMY

Configuração da autonomia do Claude Code: o que ele pode fazer sozinho, o que precisa confirmação, e como invocá-lo em modo "trabalhe a fase inteira".

**Pré-requisitos:** `01` e `02` concluídos.

---

## Parte 1 — Autonomia já configurada no `.claude/settings.json`

Você já criou esse arquivo no `01_DEV_LOCAL_SETUP.md` Parte 4.1. Vamos detalhar o que cada parte faz e adicionar refinamentos.

### 1.1 Allowlist (auto-aprovado)

| Categoria | Comandos |
|---|---|
| **Git seguro** | `status`, `diff`, `log`, `add`, `commit`, `checkout`, `branch`, `switch`, `pull`, `fetch`, `stash`, `restore`, `merge`, `rebase` |
| **GitHub CLI** | `gh pr *`, `gh issue *`, `gh repo view`, `gh run *` |
| **Pacotes** | `pnpm`, `npm`, `npx`, `node`, `tsx` |
| **Prisma** | qualquer comando Prisma (validate, generate, migrate dev/deploy/status) |
| **Docker (apenas containers do projeto)** | compose up/down/logs/ps, exec nos containers `arenatech-*` |
| **Web** | `curl`, `WebFetch`, `WebSearch` |
| **Filesystem** | `cat`, `ls`, `find`, `grep`, `rg`, `sed`, `awk`, `mkdir`, `cp`, `mv`, `touch`, `chmod`, `tree` |
| **Banco** | `psql`, `redis-cli` |
| **Edição de arquivos** | `Read`, `Edit`, `Write`, `Glob`, `Grep` |

**Tradução prática:** Claude pode fazer praticamente qualquer coisa que um dev faria normalmente, sem te perguntar. Editar código, criar componentes, rodar testes, commitar, pushar, fazer queries no banco local, ler documentação na web — tudo automático.

### 1.2 Denylist (sempre bloqueado)

| Comando | Por que |
|---|---|
| `rm -rf /`, `rm -rf ~`, `rm -rf $HOME` | Catastrófico |
| `sudo` | Eleva privilégios sem rastro |
| `git push --force`, `--force-with-lease`, `-f` | Reescreve história, perde commits |
| `git reset --hard origin/main` | Pode descartar trabalho local |
| `git push origin --delete` | Apaga branches remotas |
| `gh repo delete` | Apaga repositório |
| `docker system prune` | Limpa containers/volumes de outros projetos |
| `docker volume rm` | Apaga dados persistentes |
| `prisma migrate reset` | Apaga banco inteiro |
| `DROP DATABASE` | Óbvio |
| `brew uninstall` | Pode quebrar outros projetos |
| `npm uninstall -g` | Pode quebrar outros projetos |

Mesmo se você der "yes to all" durante uma sessão, esses ficam bloqueados.

### 1.3 Permissão de leitura externa

```json
"additionalDirectories": [
  "/Users/luanferreira/Herd/intranetpdv"
]
```

Claude pode **ler** o Laravel antigo (engenharia reversa do schema, das rotas, dos controllers) mas **não pode escrever lá**. Você não corre risco de o Claude bagunçar o sistema antigo.

---

## Parte 2 — Workflow de Git que o Claude vai seguir

### 2.1 Estratégia: trunk-based com branches curtas

- **`main`** é a branch de produção. Push direto **permitido**, mas só passa se CI verde.
- **Branches `feat/*`** para features grandes (Claude pode trabalhar dias numa branch antes de mergear pra main)
- **Branches `fix/*`** para correções
- **Branches `chore/*`** para refactoring/manutenção
- Sem `develop`. Sem GitFlow. Trunk-based puro.

### 2.2 Quando Claude usa branches vs main

**Direto na main:**
- Pequenos ajustes (typo, refactor pequeno, bump de dependência)
- Bugfix urgente (1 commit, óbvio)

**Em branch:**
- Implementação de módulo inteiro (Clientes, OS, PDV...)
- Mudança de schema do Prisma (migração não-trivial)
- Refactor que toca em vários arquivos
- Qualquer coisa que pode introduzir regressão sutil

A regra estará no `06_CLAUDE.md` (instruções permanentes).

### 2.3 Convenção de commits (Conventional Commits)

Claude vai seguir:

```
feat(modulo): descrição curta

Descrição mais detalhada se necessário.

Closes #123
```

Tipos:
- `feat` — nova feature
- `fix` — correção
- `chore` — manutenção
- `refactor` — refactor sem mudança de comportamento
- `docs` — só documentação
- `test` — só testes
- `style` — formatação
- `perf` — performance
- `db` — migração de schema
- `ci` — CI/CD

---

## Parte 3 — Modo autônomo: como invocar fases inteiras

### 3.1 Comando padrão de execução de fase

Dentro do `arena` (sessão tmux), na janela `claude`:

```bash
claude
```

Quando entrar no Claude Code, cola:

```
Você é o desenvolvedor sênior responsável pela migração Arena Tech.

Antes de qualquer coisa:
1. Leia integralmente: docs/06_CLAUDE.md
2. Leia integralmente: docs/04_MIGRATION_PLAN.md
3. Leia: docs/05_PROGRESS.md (estado atual)

Depois execute a próxima fase pendente, do início ao fim, atualizando docs/05_PROGRESS.md a cada checkpoint concluído.

Pare APENAS se:
(a) Bater em comando da denylist
(b) Precisar de uma decisão de produto não documentada (e nesse caso, registre a pergunta em docs/05_PROGRESS.md na seção "Decisões pendentes" e siga adiante com o que for possível)
(c) Algum teste falhar de forma irrecuperável após 3 tentativas de correção
(d) Terminar a fase

NÃO me peça confirmação para nada que esteja na allowlist do .claude/settings.json. Trabalhe com autonomia.

Ao terminar, dispare: `osascript -e 'display notification "Fase X concluída" with title "Arena Tech" sound name "Glass"'`
```

> Salve esse texto num arquivo `~/dev/arenatech-app/.claude/prompt-fase.txt` pra reutilizar todo dia.

### 3.2 Invocação ainda mais curta (com cat)

```bash
cd ~/dev/arenatech-app
cat .claude/prompt-fase.txt | claude --print
```

`--print` faz o Claude rodar em modo não-interativo: ele lê, executa tudo, escreve o output e sai. Útil pra pipelines longos.

### 3.3 Modo interativo normal

Se você prefere acompanhar:

```bash
cd ~/dev/arenatech-app
claude
```

E aí cola o prompt da seção 3.1. Você vê o Claude trabalhando em tempo real e pode interromper com Ctrl+C se quiser.

---

## Parte 4 — Notificações inteligentes

### 4.1 Notificação ao terminar uma fase

Adiciona no `06_CLAUDE.md` (instruções permanentes) a regra: ao concluir qualquer fase, executar:

```bash
osascript -e 'display notification "Fase X concluída — pronto para revisão" with title "Arena Tech" sound name "Glass"'
```

### 4.2 Notificação quando build/teste falha

Cria um wrapper:

```bash
cat > ~/bin/arena-test << 'EOF'
#!/bin/bash
cd ~/dev/arenatech-app

if pnpm test "$@"; then
  osascript -e 'display notification "✓ Testes passaram" with title "Arena Tech" sound name "Glass"'
else
  osascript -e 'display notification "✗ Testes FALHARAM" with title "Arena Tech" sound name "Basso"'
  exit 1
fi
EOF

cat > ~/bin/arena-build << 'EOF'
#!/bin/bash
cd ~/dev/arenatech-app

if pnpm build; then
  osascript -e 'display notification "✓ Build OK" with title "Arena Tech" sound name "Glass"'
else
  osascript -e 'display notification "✗ Build FALHOU" with title "Arena Tech" sound name "Basso"'
  exit 1
fi
EOF

chmod +x ~/bin/arena-test ~/bin/arena-build
```

### 4.3 Notificação ao receber comentário do CI

Adiciona no `~/.zshrc`:

```bash
# Notifica quando o último deploy/CI termina
arena-watch-ci() {
  cd ~/dev/arenatech-app
  RUN_ID=$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')
  echo "Aguardando run $RUN_ID..."
  if gh run watch $RUN_ID; then
    osascript -e 'display notification "✓ Deploy concluído" with title "Arena Tech" sound name "Glass"'
  else
    osascript -e 'display notification "✗ Deploy FALHOU" with title "Arena Tech" sound name "Basso"'
  fi
}
```

Aí depois de um `git push`, você pode rodar `arena-watch-ci` e ir fazer outra coisa. O Mac te chama.

---

## Parte 5 — Protocolo de pausa de emergência

Cenário: você está observando o Claude e percebe que ele está indo pra um caminho ruim.

### 5.1 Pausa sem matar

```bash
arena-pause   # SIGSTOP — Claude congela imediatamente
```

Você revisa o que ele estava fazendo, lê `docs/05_PROGRESS.md`, decide.

### 5.2 Opção A — retomar

```bash
arena-resume  # SIGCONT — continua exatamente de onde parou
```

### 5.3 Opção B — abortar e redirecionar

```bash
arena-kill-claude   # mata o processo
```

Depois você abre nova sessão e instrui:

```
Reverta os últimos commits que estão errados (use git log para identificar).
Leia o PROGRESS.md, identifique onde paramos, e retome a partir do checkpoint X com a seguinte correção: [descreva o que ele estava fazendo errado].
```

### 5.4 Reverter commits que ficaram ruins

Se Claude já commitou (mas ainda não pushou):
```bash
git reset --soft HEAD~3   # volta 3 commits, mantém arquivos
git status                # revisa
```

Se já pushou na main mas o CI ainda nem rodou:
```bash
git revert HEAD           # cria um commit de reversão
git push
```

---

## Parte 6 — Sanidade da sessão

### 6.1 Como saber se Claude está realmente trabalhando ou travou

Na sessão tmux, na janela `claude`:
- Se está digitando saída → trabalhando
- Se cursor parado mas processo existe (`ps aux | grep claude`) → pensando, deixa
- Se mais de 5 minutos sem output **e** sem CPU consumida (`top` na janela shell) → provavelmente travou. `arena-pause` pra investigar.

### 6.2 Logs do Claude Code

```bash
ls ~/.claude/projects/
```

Cada projeto tem suas conversas registradas em arquivos JSONL. Se algo deu errado, você consegue ler exatamente o que aconteceu.

---

## Checklist da Parte 03

- [ ] `.claude/settings.json` revisado e entendido
- [ ] `.claude/prompt-fase.txt` criado para reutilização
- [ ] Wrappers `arena-test` e `arena-build` criados
- [ ] Função `arena-watch-ci` no `~/.zshrc`
- [ ] Você sabe usar `arena-pause`, `arena-resume`, `arena-kill-claude`
- [ ] Você sabe como invocar Claude em modo de fase autônoma

Quando todos `✓`, prossiga para `04_MIGRATION_PLAN.md`.
