#!/usr/bin/env bash
# One-shot installer for Interview Coach on Debian/Ubuntu-based Linux
# (tested against Linux Lite / Ubuntu LTS).
#
#   bash deploy/install-linux.sh
#
# It is safe to re-run: every step checks whether it's already done. Nothing
# here is destructive — it never overwrites an existing .env.local, and the
# systemd service is only installed if you ask for it.

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$HOME/Interview}"
REPO_URL="https://github.com/dklauberg/interview-coach"
NODE_MAJOR=20

say()  { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m !\033[0m %s\n' "$*"; }
die()  { printf '\n\033[1;31mERRO:\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] && die "Não rode como root. Rode como seu usuário normal; o script pede sudo quando precisa."
command -v apt-get >/dev/null || die "Este script é para distros baseadas em Debian/Ubuntu (usa apt)."

# ---------------------------------------------------------------- system deps
say "Verificando pacotes básicos"
missing=()
for pkg in git curl wget build-essential; do
  dpkg -s "$pkg" >/dev/null 2>&1 || missing+=("$pkg")
done
if ((${#missing[@]})); then
  echo "Instalando: ${missing[*]}"
  sudo apt-get update
  sudo apt-get install -y "${missing[@]}"
else
  echo "Já instalados."
fi

# ----------------------------------------------------------------------- node
say "Verificando Node.js (precisa ser >= v$NODE_MAJOR)"
need_node=1
if command -v node >/dev/null; then
  current=$(node -v | sed 's/^v\([0-9]*\).*/\1/')
  if ((current >= NODE_MAJOR)); then
    echo "Node $(node -v) — ok."
    need_node=0
  else
    warn "Node $(node -v) é antigo demais para o Next.js 15."
  fi
fi
if ((need_node)); then
  echo "Instalando Node $NODE_MAJOR pelo NodeSource…"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
  echo "Instalado: $(node -v)"
fi

# --------------------------------------------------------------------- chrome
say "Verificando um navegador Chromium"
if command -v google-chrome >/dev/null || command -v chromium >/dev/null || command -v chromium-browser >/dev/null; then
  echo "Encontrado — ok."
else
  warn "Nenhum navegador Chromium encontrado."
  echo "A voz do entrevistador roda em WebGPU no Chrome; no Firefox ela cai para CPU (funciona, porém mais lenta)."
  read -rp "Instalar o Google Chrome agora? [s/N] " answer
  if [[ ${answer,,} == s* ]]; then
    tmp=$(mktemp -d)
    wget -q --show-progress -O "$tmp/chrome.deb" \
      https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
    sudo apt-get install -y "$tmp/chrome.deb"
    rm -rf "$tmp"
  fi
fi

# ---------------------------------------------------------------------- clone
say "Preparando o projeto em $PROJECT_DIR"
if [[ -d $PROJECT_DIR/.git ]]; then
  echo "Já existe um clone; atualizando a partir do main…"
  git -C "$PROJECT_DIR" fetch origin main
  if [[ -n $(git -C "$PROJECT_DIR" status --porcelain) ]]; then
    warn "Há alterações locais não commitadas — não vou tocar nelas."
    warn "Rode 'git -C $PROJECT_DIR pull origin main' você mesmo quando resolver."
  else
    git -C "$PROJECT_DIR" checkout main
    git -C "$PROJECT_DIR" pull origin main
  fi
else
  git clone "$REPO_URL" "$PROJECT_DIR"
fi
cd "$PROJECT_DIR"

# --------------------------------------------------------------------- deps
say "Instalando dependências (demora alguns minutos)"
total_mem=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
swap=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo)
if ((total_mem < 3000 && swap < 1000)); then
  warn "Só ${total_mem} MB de RAM e ${swap} MB de swap — o 'npm install' pode ser morto por falta de memória."
  warn "Se isso acontecer, crie swap e rode o script de novo:"
  warn "  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile"
  warn "  sudo mkswap /swapfile && sudo swapon /swapfile"
fi
npm install

# ------------------------------------------------------------------ env file
say "Configuração (.env.local)"
if [[ -f .env.local ]]; then
  echo "Já existe — mantido como está."
  grep -q '^ANTHROPIC_API_KEY=sk-ant-' .env.local \
    || warn "ANTHROPIC_API_KEY parece não estar preenchida em $PROJECT_DIR/.env.local"
else
  cp .env.local.example .env.local
  echo "Criado a partir do exemplo."
  echo "Pegue uma chave em: https://console.anthropic.com/settings/keys"
  # -s: a chave não é ecoada, para não ficar visível na tela nem no scrollback.
  read -rsp "Cole a sua ANTHROPIC_API_KEY (não aparece na tela; Enter para pular): " key
  echo
  if [[ -n ${key:-} ]]; then
    # escapa & e / para o sed não interpretar
    esc=${key//\\/\\\\}; esc=${esc//&/\\&}; esc=${esc//\//\\/}
    sed -i "s/^ANTHROPIC_API_KEY=.*/ANTHROPIC_API_KEY=$esc/" .env.local
    echo "Chave gravada."
  else
    warn "Edite $PROJECT_DIR/.env.local e preencha ANTHROPIC_API_KEY antes de usar."
  fi
  echo
  echo "Dica: defina um limite mensal de gastos no console da Anthropic (Billing → Limits)."
fi

# ---------------------------------------------------------------------- build
say "Compilando"
npm run build

# -------------------------------------------------------------------- systemd
say "Iniciar sozinho quando o Linux ligar?"
if systemctl list-unit-files 2>/dev/null | grep -q '^interview-coach.service'; then
  echo "O serviço já está instalado; reiniciando com o novo build…"
  sudo systemctl restart interview-coach
  systemctl --no-pager status interview-coach | head -5
else
  read -rp "Instalar o serviço systemd (sobe no boot)? [s/N] " answer
  if [[ ${answer,,} == s* ]]; then
    sudo tee /etc/systemd/system/interview-coach.service > /dev/null <<EOF
[Unit]
Description=Interview Coach (Next.js)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
ExecStart=/bin/bash -lc 'npm start'
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl daemon-reload
    sudo systemctl enable --now interview-coach
    systemctl --no-pager status interview-coach | head -5
  else
    echo "Pulado. Para rodar na mão: cd $PROJECT_DIR && npm start"
  fi
fi

# --------------------------------------------------------------------- pronto
cat <<EOF

────────────────────────────────────────────────────────────
Pronto. Abra no Chrome:

    http://localhost:3000

Permita o microfone quando o navegador pedir. Na primeira
entrevista o navegador baixa dois modelos (~170 MB) que
ficam em cache — depois disso começa em segundos.

Ao atualizar o projeto no futuro:

    cd $PROJECT_DIR
    git pull origin main && npm install && npm run build
    sudo systemctl restart interview-coach   # se usar o serviço

Para acessar de outro computador é preciso HTTPS (o microfone
não funciona sem contexto seguro). Use o túnel da Cloudflare —
veja a seção "Deploy" do README.
────────────────────────────────────────────────────────────
EOF
