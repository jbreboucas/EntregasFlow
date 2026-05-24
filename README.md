# EntregaFlow 📦
Sistema de gerenciamento de pedidos e rotas para entregadores.

## Stack
- **React 18** + Vite
- **React Router v6** — navegação entre telas
- **Leaflet + OpenStreetMap** — mapas gratuitos sem API Key
- **Supabase** — auth, banco de dados, realtime e storage (integração a conectar)
- **Lucide React** — ícones

## Como rodar localmente

```bash
npm install
npm run dev
```
Acesse `http://localhost:5173`

## Credenciais de demonstração

| Perfil         | Email           | Senha  |
|----------------|-----------------|--------|
| Administrador  | admin@demo.com  | 123456 |
| Entregador     | joao@demo.com   | 123456 |

## Deploy no Vercel

1. Suba o projeto para um repositório GitHub
2. Acesse [vercel.com](https://vercel.com) → **New Project** → importe o repositório
3. Clique em **Deploy** (sem configuração extra — o `vercel.json` já cuida do roteamento SPA)

## Estrutura do projeto

```
src/
├── App.jsx              # Roteamento + contextos (Auth, Orders)
├── main.jsx             # Entry point
├── index.css            # Design tokens e estilos globais
├── lib/
│   ├── mockData.js      # Dados de demonstração + helpers
│   └── supabase.js      # Cliente Supabase (pronto para configurar)
└── pages/
    ├── Login.jsx         # Tela de login (admin / entregador)
    ├── AdminDashboard.jsx# Kanban de pedidos (Pendente → Em rota → Entregue)
    ├── CourierDashboard.jsx # Painel do entregador
    ├── MapView.jsx       # Mapa Leaflet com rota
    └── DeliveryConfirm.jsx # Confirmação com foto + assinatura
```

## Próximo passo: conectar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com)
2. Execute o SQL de criação de tabelas (disponível em breve)
3. Adicione as variáveis no `.env`:
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-anon-key
   ```
4. Descomente os helpers em `src/lib/supabase.js`

## Funcionalidades

- [x] Login com perfis Admin e Entregador
- [x] Kanban com colunas Pendente / Em rota / Entregue
- [x] Criação de pedidos pelo admin
- [x] Busca e filtro de pedidos
- [x] Entregador se associa ao pedido pelo painel
- [x] Mapa com rota (Leaflet + OpenStreetMap)
- [x] Confirmação de entrega com foto e assinatura digital
- [x] Atualização automática do kanban ao confirmar entrega
- [ ] Supabase Realtime (kanban ao vivo entre sessões)
- [ ] Upload de foto/assinatura para Supabase Storage
- [ ] Autenticação real via Supabase Auth
- [ ] Roteamento real via OSRM API
