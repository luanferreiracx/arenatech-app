# 01 — DEV LOCAL SETUP (Mac)

Configuração completa do MacBook Pro M5 para desenvolvimento local.
Ao final disso você terá: stack rodando em Docker, Claude Code com autonomia, atalhos `arena`, sessão tmux persistente, notificações nativas, modo de pausa de emergência.

---

## Parte 1 — Diagnóstico do que já está instalado

Cole **este bloco inteiro** no Terminal do Mac. Ele te diz exatamente o que falta:

```bash
echo "═══════════════════════════════════════════════════"
echo "  Diagnóstico do ambiente — Arena Tech"
echo "═══════════════════════════════════════════════════"

check() {
  if command -v "$1" &>/dev/null; then
    VERSION=$(eval "$2" 2>/dev/null | head -1)
    echo "✓ $1 — $VERSION"
  else
    echo "✗ $1 — NÃO INSTALADO"
  fi
}

check "brew" "brew --version"
check "git" "git --version"
check "node" "node --version"
check "pnpm" "pnpm --version"
check "npm" "npm --version"
check "docker" "docker --version"
check "docker-compose" "docker compose version"
check "gh" "gh --version"
check "claude" "claude --version"
check "tmux" "tmux -V"
check "jq" "jq --version"
check "psql" "psql --version"
check "redis-cli" "redis-cli --version"

echo ""
echo "── Docker rodando? ──"
if docker info &>/dev/null; then
  echo "✓ Docker daemon ativo"
else
  echo "✗ Docker daemon NÃO está rodando (abra Docker Desktop)"
fi

echo ""
echo "── SSH config para 'contabo'? ──"
if grep -q "Host contabo" ~/.ssh/config 2>/dev/null; then
  echo "✓ Host 'contabo' configurado"
else
  echo "✗ Host 'contabo' não está em ~/.ssh/config"
fi

echo ""
echo "── Conexão com VPS ──"
if ssh -o ConnectTimeout=5 -o BatchMode=yes contabo "echo ok" &>/dev/null; then
  echo "✓ SSH para contabo funcionando"
else
  echo "✗ SSH para contabo falhou (chave ou config?)"
fi

echo ""
echo "═══════════════════════════════════════════════════"
```

Anote o que está com `✗`. Vamos resolver tudo a seguir.

---

## Parte 2 — Instalação do que faltar

### 2.1 Homebrew (se não tiver)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Depois adiciona ao PATH (Apple Silicon):

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

### 2.2 Ferramentas base via Homebrew

```bash
brew install git tmux jq gh
brew install --cask docker
```

> **Importante:** depois de `brew install --cask docker`, **abra o Docker Desktop pela primeira vez manualmente** (Spotlight → Docker). Ele pede permissão de sistema. Aguarde até a baleia aparecer na barra de menus indicando que está rodando.

### 2.3 Node.js 22 via nvm

Por que nvm e não brew: o nvm permite trocar de versão entre projetos. Útil quando você for mexer em outro projeto que usa Node diferente.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Carrega o nvm na sessão atual (também adiciona ao ~/.zshrc automaticamente)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install 22
nvm alias default 22
nvm use 22

node --version  # deve mostrar v22.x.x
```

### 2.4 pnpm (gerenciador de pacotes)

```bash
npm install -g pnpm
pnpm --version
```

Por que pnpm e não npm: 3x mais rápido, usa muito menos disco (symlinks pra cache global), monorepo-ready se um dia precisar.

### 2.5 Claude Code CLI

```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

Primeira vez que rodar `claude`, ele pede pra autenticar. Faça o login.

### 2.6 GitHub CLI

```bash
gh auth login
```

Escolha:
- GitHub.com
- HTTPS
- Yes (autenticar git com gh)
- Login with browser

### 2.7 Cliente psql (opcional mas útil)

Pra conectar no Postgres local pelo terminal sem entrar no container:

```bash
brew install libpq
echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
psql --version
```

### 2.8 Roda o diagnóstico de novo

Cole o bloco da Parte 1 outra vez. Tudo tem que estar com `✓` agora.

---

## Parte 3 — Estrutura do projeto

### 3.1 Criar diretório

```bash
mkdir -p ~/dev
cd ~/dev
```

> **Decisão:** vou usar `~/dev/arenatech-app/` em vez de `~/Herd/`. Herd é específico do Laravel Herd. Esse projeto novo é Next.js, então fica em `~/dev/`.

### 3.2 Criar repositório no GitHub

```bash
cd ~/dev
gh repo create arenatech-app --private --description "Arena Tech - Sistema de gestão de assistência técnica (Next.js)" --clone
cd arenatech-app
```

Isso cria o repo privado, clona local e te coloca dentro. Repositório vazio, branch `main` por padrão.

### 3.3 Estrutura inicial vazia

```bash
# .gitignore base
cat > .gitignore << 'EOF'
# Dependências
node_modules/
.pnpm-store/

# Build
.next/
out/
dist/
build/

# Env
.env
.env.local
.env*.local
!.env.example

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json
.idea/

# Testes
coverage/
.nyc_output/
playwright-report/
test-results/

# Prisma
prisma/*.db
prisma/migrations/dev/

# Docker
docker/data/
EOF

# README inicial
cat > README.md << 'EOF'
# Arena Tech — App

Sistema de gestão de assistência técnica (multi-tenant).

Stack: Next.js 15 · tRPC v11 · Prisma 6 · NextAuth v5 · Postgres 16 (RLS) · Redis 7 · MinIO

Documentação completa em `/docs`.

## Desenvolvimento

```bash
pnpm install
docker compose up -d
pnpm db:migrate
pnpm dev
```

Veja `docs/01_DEV_LOCAL_SETUP.md` para setup completo.
EOF

mkdir -p docs

git add .
git commit -m "chore: initial commit"
git push -u origin main
```

### 3.4 Mover os documentos do pacote pra `docs/`

Quando você receber esse pacote (este e os outros), salva todos em `~/dev/arenatech-app/docs/`. Eles ficam versionados junto com o código.

---

## Parte 4 — Configuração do Claude Code (autonomia)

### 4.1 Settings do projeto

```bash
mkdir -p ~/dev/arenatech-app/.claude

cat > ~/dev/arenatech-app/.claude/settings.json << 'EOF'
{
  "$schema": "https://json.schemastore.org/claude-code-settings",
  "permissions": {
    "allow": [
      "Bash(git status)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git checkout:*)",
      "Bash(git branch:*)",
      "Bash(git switch:*)",
      "Bash(git pull:*)",
      "Bash(git fetch:*)",
      "Bash(git stash:*)",
      "Bash(git restore:*)",
      "Bash(git merge:*)",
      "Bash(git rebase:*)",
      "Bash(gh pr:*)",
      "Bash(gh issue:*)",
      "Bash(gh repo view:*)",
      "Bash(gh run:*)",
      "Bash(pnpm:*)",
      "Bash(npm:*)",
      "Bash(npx:*)",
      "Bash(node:*)",
      "Bash(tsx:*)",
      "Bash(prisma:*)",
      "Bash(docker compose:*)",
      "Bash(docker logs:*)",
      "Bash(docker ps)",
      "Bash(docker exec arenatech-postgres:*)",
      "Bash(docker exec arenatech-redis:*)",
      "Bash(docker exec arenatech-minio:*)",
      "Bash(curl:*)",
      "Bash(jq:*)",
      "Bash(cat:*)",
      "Bash(ls:*)",
      "Bash(pwd)",
      "Bash(find:*)",
      "Bash(grep:*)",
      "Bash(ripgrep:*)",
      "Bash(rg:*)",
      "Bash(sed:*)",
      "Bash(awk:*)",
      "Bash(echo:*)",
      "Bash(mkdir:*)",
      "Bash(cp:*)",
      "Bash(mv:*)",
      "Bash(touch:*)",
      "Bash(chmod:*)",
      "Bash(tree:*)",
      "Bash(psql:*)",
      "Bash(redis-cli:*)",
      "Read",
      "Edit",
      "Write",
      "Glob",
      "Grep",
      "WebFetch",
      "WebSearch"
    ],
    "deny": [
      "Bash(rm -rf /:*)",
      "Bash(rm -rf ~:*)",
      "Bash(rm -rf $HOME:*)",
      "Bash(sudo:*)",
      "Bash(git push --force:*)",
      "Bash(git push -f:*)",
      "Bash(git push --force-with-lease:*)",
      "Bash(git reset --hard origin/main)",
      "Bash(git push origin --delete:*)",
      "Bash(gh repo delete:*)",
      "Bash(docker system prune:*)",
      "Bash(docker volume rm:*)",
      "Bash(prisma migrate reset:*)",
      "Bash(DROP DATABASE:*)",
      "Bash(brew uninstall:*)",
      "Bash(npm uninstall -g:*)",
      "Bash(rm -rf /Users:*)",
      "Bash(rm -rf node_modules/.pnpm)"
    ],
    "additionalDirectories": [
      "/Users/luanferreira/Herd/intranetpdv"
    ]
  },
  "env": {
    "BASH_DEFAULT_TIMEOUT_MS": "120000",
    "BASH_MAX_TIMEOUT_MS": "600000"
  }
}
EOF
```

**O que isso faz:**
- **`allow`:** Claude executa esses comandos sem pedir confirmação. Praticamente todo o desenvolvimento normal entra aqui.
- **`deny`:** Mesmo se você der "yes to all" depois, esses comandos são bloqueados. Linha vermelha permanente.
- **`additionalDirectories`:** Permite Claude ler o Laravel antigo (engenharia reversa) sem permitir escrita lá.
- **Timeouts:** comandos podem rodar até 10 minutos (build pesado, instalação grande).

### 4.2 CLAUDE.md (instruções permanentes)

Esse arquivo é lido pelo Claude Code em **toda sessão**. É a "memória de longo prazo" do projeto.

Veja o documento separado **`06_CLAUDE.md`** — você copia o conteúdo dele pro arquivo `CLAUDE.md` na raiz do projeto.

### 4.3 Modo autônomo: como invocar

Para o Claude rodar uma fase inteira sem te incomodar:

```bash
cd ~/dev/arenatech-app
claude
```

Dentro do prompt do Claude:
```
Leia docs/04_MIGRATION_PLAN.md e docs/06_CLAUDE.md, depois execute a Fase 0 completa. Atualize docs/05_PROGRESS.md a cada checkpoint. Pare apenas se: (a) bater em um item da denylist, (b) precisar de uma decisão de produto que eu não documentei, ou (c) terminar a fase. Não me peça confirmação para nada que esteja na allowlist.
```

---

## Parte 5 — tmux local com layout pré-configurado

### 5.1 Config do tmux no Mac

```bash
cat > ~/.tmux.conf << 'EOF'
# ============================================
# Arena Tech - tmux config (Mac)
# ============================================

set -g mouse on
set -g history-limit 50000
set -g base-index 1
setw -g pane-base-index 1
set -g renumber-windows on
set -g status-interval 5

# Status bar
set -g status-bg colour234
set -g status-fg colour255
set -g status-left-length 30
set -g status-left '#[fg=green,bold]⚡ #S #[fg=yellow]│ '
set -g status-right '#[fg=cyan]%d/%m #[fg=white]%H:%M'

setw -g window-status-current-style 'fg=black bg=green bold'
setw -g window-status-current-format ' #I:#W '
setw -g window-status-format ' #I:#W '

# Splits
unbind '"'
unbind %
bind | split-window -h -c "#{pane_current_path}"
bind - split-window -v -c "#{pane_current_path}"

# Reload
bind r source-file ~/.tmux.conf \; display "✓ tmux config recarregada"

# Navegação entre painéis com Alt+setas
bind -n M-Left  select-pane -L
bind -n M-Right select-pane -R
bind -n M-Up    select-pane -U
bind -n M-Down  select-pane -D

setw -g mode-keys vi
set -g display-time 2000
set -sg escape-time 0
EOF
```

### 5.2 Script de bootstrap da sessão local

```bash
mkdir -p ~/bin

cat > ~/bin/arena-start << 'EOF'
#!/bin/bash
# ============================================
# Arena Tech - bootstrap de sessão tmux local
# ============================================

SESSION="arena"
PROJECT="$HOME/dev/arenatech-app"

if [ ! -d "$PROJECT" ]; then
  echo "✗ Projeto não existe em $PROJECT"
  echo "  Crie com: gh repo clone arenatech-app ~/dev/arenatech-app"
  exit 1
fi

if tmux has-session -t $SESSION 2>/dev/null; then
  echo "→ Sessão '$SESSION' já existe, anexando..."
  tmux attach -t $SESSION
  exit 0
fi

echo "→ Criando nova sessão '$SESSION'..."

# === Janela 1: claude ===
tmux new-session -d -s $SESSION -n claude -c $PROJECT
tmux send-keys -t $SESSION:claude "clear" C-m
tmux send-keys -t $SESSION:claude "echo '╔══════════════════════════════════════════════╗'" C-m
tmux send-keys -t $SESSION:claude "echo '║   ARENA TECH - Migração Laravel → Next.js   ║'" C-m
tmux send-keys -t $SESSION:claude "echo '╚══════════════════════════════════════════════╝'" C-m
tmux send-keys -t $SESSION:claude "echo ''" C-m
tmux send-keys -t $SESSION:claude "echo 'Projeto: $PROJECT'" C-m
tmux send-keys -t $SESSION:claude "echo ''" C-m
tmux send-keys -t $SESSION:claude "echo 'Comandos rápidos:'" C-m
tmux send-keys -t $SESSION:claude "echo '  claude              # iniciar Claude Code'" C-m
tmux send-keys -t $SESSION:claude "echo '  cat docs/05_PROGRESS.md  # ver progresso'" C-m
tmux send-keys -t $SESSION:claude "echo ''" C-m

# === Janela 2: dev (Next.js dev server) ===
tmux new-window -t $SESSION -n dev -c $PROJECT
tmux send-keys -t $SESSION:dev "clear" C-m
tmux send-keys -t $SESSION:dev "echo '── Next.js dev server ──'" C-m
tmux send-keys -t $SESSION:dev "echo 'Quando o app estiver pronto, rode: pnpm dev'" C-m

# === Janela 3: docker (logs do Postgres/Redis/MinIO) ===
tmux new-window -t $SESSION -n docker -c $PROJECT
tmux send-keys -t $SESSION:docker "clear" C-m
tmux send-keys -t $SESSION:docker "echo '── Docker Compose ──'" C-m
tmux send-keys -t $SESSION:docker "echo 'Subir stack: docker compose up -d'" C-m
tmux send-keys -t $SESSION:docker "echo 'Ver logs:    docker compose logs -f'" C-m
tmux send-keys -t $SESSION:docker "echo 'Status:      docker compose ps'" C-m

# === Janela 4: db ===
tmux new-window -t $SESSION -n db -c $PROJECT
tmux send-keys -t $SESSION:db "clear" C-m
tmux send-keys -t $SESSION:db "echo '── Banco de dados ──'" C-m
tmux send-keys -t $SESSION:db "echo 'Postgres: docker exec -it arenatech-postgres psql -U arenatech arenatech'" C-m
tmux send-keys -t $SESSION:db "echo 'Redis:    docker exec -it arenatech-redis redis-cli'" C-m
tmux send-keys -t $SESSION:db "echo 'Prisma:   pnpm prisma studio'" C-m

# === Janela 5: shell (livre) ===
tmux new-window -t $SESSION -n shell -c $PROJECT
tmux send-keys -t $SESSION:shell "clear" C-m
tmux send-keys -t $SESSION:shell "echo '── Shell livre ──'" C-m

# Volta pra janela 1 e anexa
tmux select-window -t $SESSION:claude
tmux attach -t $SESSION
EOF

chmod +x ~/bin/arena-start
```

### 5.3 Aliases no `~/.zshrc`

Cola no final do `~/.zshrc`:

```bash
# ===========================================
# Arena Tech - dev local
# ===========================================

# PATH para ~/bin (scripts pessoais)
export PATH="$HOME/bin:$PATH"

# Atalho principal: abre/anexa sessão tmux 'arena' local
alias arena='arena-start'

# Sai pro projeto rapidinho
alias cdarena='cd ~/dev/arenatech-app'

# Pausa de emergência: envia SIGSTOP pro processo do Claude Code
# Use quando perceber que o Claude está fazendo bobagem.
# Retomar: arena-resume
alias arena-pause='pkill -STOP -f "claude" && echo "⏸  Claude Code pausado. Use arena-resume para retomar."'
alias arena-resume='pkill -CONT -f "claude" && echo "▶️  Claude Code retomado."'

# Mata Claude Code (último recurso — perde estado em memória)
alias arena-kill-claude='pkill -9 -f "claude" && echo "💀 Claude Code morto."'

# Status do projeto
alias arena-status='cd ~/dev/arenatech-app && echo "── Git ──" && git status -sb && echo "" && echo "── Docker ──" && docker compose ps 2>/dev/null && echo "" && echo "── Sessão tmux ──" && tmux ls 2>/dev/null | grep arena'

# Logs do dev server (se estiver rodando em outra janela tmux)
alias arena-logs='cd ~/dev/arenatech-app && docker compose logs -f --tail=100'

# Lê o PROGRESS.md
alias arena-progress='cat ~/dev/arenatech-app/docs/05_PROGRESS.md 2>/dev/null || echo "PROGRESS.md ainda não existe"'

# Subir / derrubar stack local
alias arena-up='cd ~/dev/arenatech-app && docker compose up -d && echo "✓ Stack local de pé."'
alias arena-down='cd ~/dev/arenatech-app && docker compose down && echo "✓ Stack local desligada."'
alias arena-restart='arena-down && arena-up'

# === VPS (deploy/monitoramento) ===
alias arena-vps='ssh contabo'
alias arena-vps-logs='ssh contabo "pm2 logs arenatech-app --lines 100"'
alias arena-vps-status='ssh contabo "pm2 status && systemctl status nginx postgresql redis-server --no-pager | head -30"'

# === Notificações nativas do Mac ===
# Use no fim de comandos longos: pnpm test && arena-notify "Testes passaram"
arena-notify() {
  osascript -e "display notification \"$1\" with title \"Arena Tech\" sound name \"Glass\""
}
export -f arena-notify 2>/dev/null || true
```

Recarrega:

```bash
source ~/.zshrc
```

### 5.4 Perfil dedicado no Terminal do Mac

1. **Terminal → Settings (⌘,)**
2. **Profiles → Default → engrenagem (canto inferior) → Duplicate Profile**
3. Renomeia pra **Arena**
4. Aba **Shell**:
   - Marca **Run command:** e coloca `arena-start`
   - Marca **Run command in shell**
5. Aba **Window**: cor de fundo distintiva (sugiro `#0d2818`, verde escuro)
6. Aba **Text**: fonte "JetBrains Mono" tamanho 14 (`brew install --cask font-jetbrains-mono` se quiser)
7. **Default** (canto inferior) — se quiser que **⌘N** sempre abra perfil Arena
8. Salva

Agora **⌘N** abre direto na sessão arena.

---

## Parte 6 — Notificações nativas durante a migração

Você já disse que está com notificações ativas — confirmo o que cobre:

### 6.1 Notificações automáticas do Claude Code

Claude Code dispara notificações nativas do macOS quando:
- Termina uma fase longa
- Bate em comando da denylist (precisa decisão sua)
- Encontra erro irrecuperável
- Termina um build/teste depois de muito tempo

Para garantir que estão ativas no projeto, o `.claude/settings.json` que criamos já habilita.

### 6.2 Configurar notificações do macOS para o Terminal

1. **System Settings → Notifications**
2. Procura **Terminal** na lista
3. **Allow Notifications:** ON
4. **Banner style:** Alerts (fica até você dispensar — recomendo) ou Banners (some sozinho)
5. **Sounds:** ON
6. **Show in Notification Center:** ON

### 6.3 Notificação personalizada em qualquer comando

Use o alias `arena-notify`:

```bash
pnpm test && arena-notify "✓ Testes passaram"
pnpm build && arena-notify "✓ Build concluído"
```

Ou use Claude com a instrução: _"Quando terminar a Fase 0, dispare `arena-notify 'Fase 0 concluída'`."_

---

## Parte 7 — Modo de pausa de emergência

Se você notar pelo `arena-progress` (ou observando) que o Claude está tomando um caminho errado, pode pausar **sem matar**:

```bash
arena-pause     # ⏸  pausa imediato (SIGSTOP)
# revisa o estado, lê PROGRESS.md, decide
arena-resume    # ▶️  continua de onde parou
```

Se for irrecuperável:

```bash
arena-kill-claude   # 💀 mata o processo (perde memória)
# Aí você abre sessão nova e instrui Claude a retomar do PROGRESS.md
```

---

## Parte 8 — Fluxo do dia a dia

**Manhã:**
```bash
arena
# tmux abre, você cai na janela claude
# vai pra janela docker (Ctrl+b 3) e: docker compose up -d
# volta pra claude (Ctrl+b 1) e: claude
# instrui: "continue de onde paramos no PROGRESS.md"
```

**Vai sair:**
```
Ctrl+b d    # desanexa, fecha o terminal
```

**Volta:**
```bash
arena       # reanexa exatamente onde estava
```

**Algo deu errado:**
```bash
arena-pause     # pausa
arena-progress  # lê o que aconteceu
arena-resume    # ou arena-kill-claude se for grave
```

---

## Checklist final da Parte 1

Antes de avançar para `02_DEPLOY_SETUP.md`:

- [ ] Diagnóstico (Parte 1) com tudo `✓`
- [ ] `~/dev/arenatech-app` clonado do GitHub
- [ ] `.gitignore`, `README.md`, `docs/` criados e commitados
- [ ] `.claude/settings.json` criado
- [ ] `~/.tmux.conf` criado
- [ ] `~/bin/arena-start` criado e executável
- [ ] Aliases `arena*` no `~/.zshrc` carregados
- [ ] Perfil "Arena" no Terminal do Mac configurado
- [ ] `arena` abre tmux com 5 janelas
- [ ] `Ctrl+b d` desanexa e `arena` reanexa
- [ ] `arena-pause` e `arena-resume` testados
- [ ] Notificações nativas do macOS para Terminal habilitadas

Quando todos estiverem ✓, prossiga para `02_DEPLOY_SETUP.md`.
