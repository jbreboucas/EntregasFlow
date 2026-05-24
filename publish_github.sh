#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# EntregaFlow — script de publicação no GitHub
# Como usar:
#   1. Preencha GITHUB_USER e GITHUB_TOKEN abaixo
#   2. Execute: bash publish_github.sh
# ─────────────────────────────────────────────────────────────────────────────

GITHUB_USER="SEU_USUARIO_AQUI"
GITHUB_TOKEN="SEU_TOKEN_AQUI"       # https://github.com/settings/tokens (escopo: repo)
REPO_NAME="entregaflow"
REPO_DESC="Sistema de gerenciamento de pedidos e rotas para entregadores"

set -e

echo ""
echo "🚀 EntregaFlow — Publicando no GitHub"
echo "────────────────────────────────────"

# 1. Cria o repositório via API
echo "📦 Criando repositório $REPO_NAME..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://api.github.com/user/repos \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  -d "{
    \"name\": \"$REPO_NAME\",
    \"description\": \"$REPO_DESC\",
    \"private\": false,
    \"auto_init\": false
  }")

if [ "$HTTP_STATUS" = "201" ]; then
  echo "✅ Repositório criado com sucesso!"
elif [ "$HTTP_STATUS" = "422" ]; then
  echo "⚠️  Repositório já existe — continuando com push..."
else
  echo "❌ Erro ao criar repositório (HTTP $HTTP_STATUS). Verifique seu token."
  exit 1
fi

# 2. Inicializa git e faz push
echo ""
echo "📤 Enviando arquivos para o GitHub..."

git init
git config user.email "deploy@entregaflow.app"
git config user.name  "EntregaFlow Deploy"

git add .
git commit -m "feat: projeto inicial EntregaFlow

- Tela de login com perfis Admin/Entregador
- Kanban de pedidos (Pendente → Em rota → Entregue)
- Painel do entregador com associação por ID
- Mapa interativo com Leaflet + OpenStreetMap
- Confirmação de entrega com foto e assinatura digital
- Configuração Vercel (vercel.json) pronta para deploy"

git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin "https://$GITHUB_TOKEN@github.com/$GITHUB_USER/$REPO_NAME.git"
git push -u origin main

echo ""
echo "────────────────────────────────────"
echo "✅ Publicado com sucesso!"
echo ""
echo "🔗 Repositório: https://github.com/$GITHUB_USER/$REPO_NAME"
echo ""
echo "🚀 Para fazer deploy no Vercel:"
echo "   1. Acesse https://vercel.com/new"
echo "   2. Importe o repositório: $GITHUB_USER/$REPO_NAME"
echo "   3. Clique em Deploy — pronto!"
echo "────────────────────────────────────"
