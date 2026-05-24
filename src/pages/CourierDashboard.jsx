import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useOrders } from '../App'
import { STATUS_CONFIG, timeAgo } from '../lib/mockData'
import {
  LogOut, Package, MapPin, Phone, Truck, CheckCircle,
  Clock, Navigation, Link2, ChevronRight,
} from 'lucide-react'

export default function CourierDashboard() {
  const { user, logout } = useAuth()
  const { orders, updateOrder } = useOrders()
  const navigate = useNavigate()
  const [tab, setTab] = useState('available')

  const handleLogout = () => { logout(); navigate('/login') }

  const available = orders.filter(o => o.status === 'pendente' && !o.entregador_id)
  const myOrders  = orders.filter(o => o.entregador_id === user.id)
  const myActive  = myOrders.filter(o => o.status === 'em_rota')
  const myDone    = myOrders.filter(o => o.status === 'entregue')

  const associate = (orderId) => {
    updateOrder(orderId, {
      status: 'em_rota',
      entregador_id: user.id,
      entregador_nome: user.name,
    })
    setTab('mine')
  }

  const shown = tab === 'available' ? available : myOrders

  return (
    <div style={s.page}>
      {/* ── Header ── */}
      <header style={s.header}>
        <div style={s.hLeft}>
          <div style={s.logoBox}><Package size={17} color="var(--accent)" /></div>
          <span style={s.logoName}>EntregaFlow</span>
        </div>
        <div style={s.hRight}>
          <div style={s.userChip}>
            <div style={s.avatar}>{user.avatar}</div>
            <div>
              <div style={s.userName}>{user.name}</div>
              <div style={s.userRole}>Entregador</div>
            </div>
          </div>
          <button style={s.iconBtn} onClick={handleLogout}><LogOut size={15} /></button>
        </div>
      </header>

      {/* ── Stats strip ── */}
      <div style={s.statsStrip}>
        <Stat icon={Clock}       color="var(--pending)"   value={available.length} label="Disponíveis" />
        <div style={s.divider} />
        <Stat icon={Truck}       color="var(--in-route)"  value={myActive.length}  label="Em rota" />
        <div style={s.divider} />
        <Stat icon={CheckCircle} color="var(--delivered)" value={myDone.length}    label="Entregues hoje" />
      </div>

      {/* ── Tabs ── */}
      <div style={s.tabs}>
        <Tab active={tab === 'available'} onClick={() => setTab('available')}
          label="Disponíveis" count={available.length} countColor="var(--pending)" />
        <Tab active={tab === 'mine'} onClick={() => setTab('mine')}
          label="Meus pedidos" count={myOrders.length} countColor="var(--in-route)" />
      </div>

      {/* ── List ── */}
      <div style={s.list}>
        {shown.length === 0 ? (
          <div style={s.empty} className="fade-in">
            <Package size={40} color="var(--text-3)" />
            <p style={s.emptyTitle}>
              {tab === 'available' ? 'Nenhum pedido disponível' : 'Nenhum pedido atribuído'}
            </p>
            <p style={s.emptySub}>
              {tab === 'available'
                ? 'Novos pedidos aparecerão aqui assim que forem criados.'
                : 'Associe um pedido da aba "Disponíveis".'}
            </p>
          </div>
        ) : (
          shown.map((order, i) => (
            <CourierCard
              key={order.id}
              order={order}
              delay={i * 0.05}
              isAvailable={tab === 'available'}
              onAssociate={() => associate(order.id)}
              onNavigate={() => navigate(`/map/${order.id}`)}
              onConfirm={() => navigate(`/confirm/${order.id}`)}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Stat({ icon: Icon, color, value, label }) {
  return (
    <div style={s.stat}>
      <Icon size={15} color={color} />
      <span style={{ ...s.statN, color }}>{value}</span>
      <span style={s.statL}>{label}</span>
    </div>
  )
}

function Tab({ active, onClick, label, count, countColor }) {
  return (
    <button style={{ ...s.tab, ...(active ? s.tabActive : {}) }} onClick={onClick}>
      {label}
      {count > 0 && (
        <span style={{ ...s.tabBadge, color: countColor, background: active ? 'transparent' : undefined }}>
          {count}
        </span>
      )}
    </button>
  )
}

function CourierCard({ order, delay, isAvailable, onAssociate, onNavigate, onConfirm }) {
  const cfg = STATUS_CONFIG[order.status]

  return (
    <div style={{ ...s.card, animationDelay: `${delay}s` }} className="slide-in">
      <div style={s.cardTop}>
        <span style={s.cardId}># {order.id}</span>
        <span style={{ ...s.pill, color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
      </div>

      <div style={s.cardName}>{order.cliente_nome}</div>

      <div style={s.infoList}>
        <InfoRow icon={Phone}  text={order.cliente_telefone} />
        <InfoRow icon={MapPin} text={order.endereco} />
      </div>

      <div style={s.cardFoot}>
        <span style={s.cardTime}>{timeAgo(order.criado_em)}</span>

        <div style={s.actions}>
          {isAvailable && (
            <button style={s.associateBtn} onClick={onAssociate}>
              <Link2 size={14} /> Associar
            </button>
          )}
          {!isAvailable && order.status === 'em_rota' && (
            <>
              <button style={s.mapBtn} onClick={onNavigate}>
                <Navigation size={14} /> Rota
              </button>
              <button style={s.confirmBtn} onClick={onConfirm}>
                <CheckCircle size={14} /> Confirmar <ChevronRight size={12} />
              </button>
            </>
          )}
          {!isAvailable && order.status === 'entregue' && (
            <span style={s.donePill}>
              <CheckCircle size={13} color="var(--delivered)" /> Concluído
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon: Icon, text }) {
  return (
    <div style={s.infoRow}>
      <Icon size={12} color="var(--text-3)" style={{ flexShrink: 0 }} />
      <span style={s.infoText}>{text}</span>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  page: { height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' },

  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 18px', height: 56, flexShrink: 0,
    background: 'var(--bg-2)', borderBottom: '1px solid var(--border)',
  },
  hLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  logoBox: {
    width: 34, height: 34, borderRadius: 9,
    background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  logoName: { fontSize: 15, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.3px' },
  hRight: { display: 'flex', alignItems: 'center', gap: 10 },
  userChip: { display: 'flex', alignItems: 'center', gap: 8 },
  avatar: {
    width: 32, height: 32, borderRadius: 9,
    background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)',
  },
  userName: { fontSize: 13, fontWeight: 600, color: 'var(--text-1)' },
  userRole: { fontSize: 11, color: 'var(--text-3)' },
  iconBtn: {
    padding: 7, background: 'transparent', color: 'var(--text-3)',
    border: '1px solid var(--border)', borderRadius: 7,
    display: 'flex', alignItems: 'center',
  },

  statsStrip: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 24, padding: '12px 18px', flexShrink: 0,
    background: 'var(--bg-2)', borderBottom: '1px solid var(--border)',
  },
  stat: { display: 'flex', alignItems: 'center', gap: 6 },
  statN: { fontSize: 16, fontWeight: 800 },
  statL: { fontSize: 12, color: 'var(--text-3)' },
  divider: { width: 1, height: 18, background: 'var(--border-2)' },

  tabs: {
    display: 'flex', gap: 2, padding: '8px 18px',
    background: 'var(--bg-2)', borderBottom: '1px solid var(--border)', flexShrink: 0,
  },
  tab: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '7px 14px', borderRadius: 8, fontSize: 13,
    fontWeight: 500, color: 'var(--text-3)', background: 'transparent',
    transition: 'all 0.18s',
  },
  tabActive: {
    background: 'var(--bg-3)', color: 'var(--text-1)',
    boxShadow: 'inset 0 0 0 1px var(--border-2)',
  },
  tabBadge: {
    fontSize: 11, fontWeight: 700,
    padding: '1px 6px', borderRadius: 10,
    background: 'var(--bg-3)',
  },

  list: { flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 },

  empty: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: '60px 20px', gap: 12, textAlign: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: 600, color: 'var(--text-2)' },
  emptySub: { fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, maxWidth: 280 },

  card: {
    background: 'var(--bg-2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: 8,
    opacity: 0,
  },
  cardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardId: { fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.5px' },
  pill: { padding: '2px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700 },
  cardName: { fontSize: 15, fontWeight: 700, color: 'var(--text-1)' },
  infoList: { display: 'flex', flexDirection: 'column', gap: 6 },
  infoRow: { display: 'flex', alignItems: 'flex-start', gap: 7 },
  infoText: { fontSize: 13, color: 'var(--text-2)', lineHeight: 1.4 },
  cardFoot: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 10, borderTop: '1px solid var(--border)', marginTop: 2,
  },
  cardTime: { fontSize: 11, color: 'var(--text-3)' },
  actions: { display: 'flex', gap: 6, alignItems: 'center' },
  associateBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', background: 'var(--accent)', color: '#080D1A',
    borderRadius: 8, fontSize: 13, fontWeight: 700,
  },
  mapBtn: {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '7px 12px', background: 'var(--in-route-bg)',
    border: '1px solid rgba(96,165,250,0.3)',
    borderRadius: 8, fontSize: 12, fontWeight: 600, color: 'var(--in-route)',
  },
  confirmBtn: {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '7px 12px', background: 'var(--accent)', color: '#080D1A',
    borderRadius: 8, fontSize: 12, fontWeight: 700,
  },
  donePill: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 12, fontWeight: 600, color: 'var(--delivered)',
    padding: '5px 10px', background: 'var(--delivered-bg)',
    borderRadius: 8,
  },
}
