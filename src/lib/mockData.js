// ─── Mock Orders ──────────────────────────────────────────────────────────────
export const mockOrders = [
  {
    id: 'PED-001',
    cliente_nome: 'Ana Beatriz Silva',
    cliente_telefone: '(85) 98765-4321',
    endereco: 'Rua das Flores, 142, Aldeota, Fortaleza-CE',
    lat: -3.7317, lng: -38.5267,
    status: 'pendente',
    entregador_id: null, entregador_nome: null,
    criado_em: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
  },
  {
    id: 'PED-002',
    cliente_nome: 'Carlos Eduardo Mendes',
    cliente_telefone: '(85) 91234-5678',
    endereco: 'Av. Beira Mar, 890, Meireles, Fortaleza-CE',
    lat: -3.7283, lng: -38.5005,
    status: 'em_rota',
    entregador_id: 'E001', entregador_nome: 'João Santos',
    criado_em: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
  },
  {
    id: 'PED-003',
    cliente_nome: 'Mariana Costa Ferreira',
    cliente_telefone: '(85) 99876-5432',
    endereco: 'Rua Tibúrcio Cavalcante, 55, Meireles, Fortaleza-CE',
    lat: -3.7250, lng: -38.5100,
    status: 'entregue',
    entregador_id: 'E002', entregador_nome: 'Maria Fernanda',
    criado_em: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    id: 'PED-004',
    cliente_nome: 'Roberto Alves Neto',
    cliente_telefone: '(85) 98888-7777',
    endereco: 'Rua Barão de Studart, 1200, Aldeota, Fortaleza-CE',
    lat: -3.7350, lng: -38.5220,
    status: 'pendente',
    entregador_id: null, entregador_nome: null,
    criado_em: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
  },
  {
    id: 'PED-005',
    cliente_nome: 'Fernanda Lima Souza',
    cliente_telefone: '(85) 97654-3210',
    endereco: 'Av. Santos Dumont, 5678, Cocó, Fortaleza-CE',
    lat: -3.7420, lng: -38.4920,
    status: 'pendente',
    entregador_id: null, entregador_nome: null,
    criado_em: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: 'PED-006',
    cliente_nome: 'Lucas Moreira Gomes',
    cliente_telefone: '(85) 92345-6789',
    endereco: 'Rua Pereira Filgueiras, 330, Aldeota, Fortaleza-CE',
    lat: -3.7380, lng: -38.5190,
    status: 'em_rota',
    entregador_id: 'E001', entregador_nome: 'João Santos',
    criado_em: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
  },
]

// ─── Demo Users ───────────────────────────────────────────────────────────────
export const mockAdmin = {
  id: 'A001', name: 'Admin Gestor', email: 'admin@demo.com',
  role: 'admin', avatar: 'AG',
}

export const mockCourier = {
  id: 'E001', name: 'João Santos', email: 'joao@demo.com',
  role: 'entregador', avatar: 'JS',
}

export const DEMO_CREDENTIALS = [
  { email: 'admin@demo.com', password: '123456', user: mockAdmin },
  { email: 'joao@demo.com',  password: '123456', user: mockCourier },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
export const STATUS_CONFIG = {
  pendente: {
    label: 'Pendente',
    color: 'var(--pending)',
    bg: 'var(--pending-bg)',
    next: 'em_rota',
    nextLabel: 'Mover p/ Em rota',
  },
  em_rota: {
    label: 'Em rota',
    color: 'var(--in-route)',
    bg: 'var(--in-route-bg)',
    next: 'entregue',
    nextLabel: 'Mover p/ Entregue',
  },
  entregue: {
    label: 'Entregue',
    color: 'var(--delivered)',
    bg: 'var(--delivered-bg)',
    next: null,
    nextLabel: null,
  },
}

export const timeAgo = (dateStr) => {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m atrás`
  if (m > 0) return `${m}m atrás`
  return 'agora'
}
