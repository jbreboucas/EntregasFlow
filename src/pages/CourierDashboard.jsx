import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useOrders } from '../App'
import { STATUS_CONFIG, timeAgo } from '../lib/mockData'
import { getPedidos, updatePedido, subscribePedidos, createPedido } from '../lib/supabase'
import {
  LogOut, Package, MapPin, Phone, Truck, CheckCircle,
  Clock, Navigation, Link2, ChevronRight, Plus, X, User, Route
} from 'lucide-react'

export default function CourierDashboard() {
  const { user, logout } = useAuth()
  const { orders, setOrders, updateOrder } = useOrders()
  const navigate = useNavigate()
  const [tab, setTab] = useState('available')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newOrder, setNewOrder] = useState({ cliente_nome:'', cliente_telefone:'', endereco:'' })

  useEffect(() => {
    getPedidos().then(({ data }) => { if (data) setOrders(data) })
    const ch = subscribePedidos((p) => {
      if (p.eventType === 'INSERT') setOrders(prev => [p.new, ...prev])
      if (p.eventType === 'UPDATE') setOrders(prev => prev.map(o => o.id === p.new.id ? p.new : o))
    })
    return () => ch.unsubscribe()
  }, [])

  const handleLogout = async () => { await logout(); navigate('/login') }

  const available = orders.filter(o => o.status === 'pendente' && !o.entregador_id)
  const myOrders  = orders.filter(o => o.entregador_id === user.id)
  const myActive  = myOrders.filter(o => o.status === 'em_rota')
  const myDone    = myOrders.filter(o => o.status === 'entregue')

  const associate = async (orderId) => {
    const changes = { status:'em_rota', entregador_id: user.id, entregador_nome: user.name }
    updateOrder(orderId, changes)
    await updatePedido(orderId, changes)
    setTab('mine')
  }

  const handleCreate = async () => {
    setSaving(true)
    const { data, error } = await createPedido({
      ...newOrder,
      status: 'em_rota',
      entregador_id: user.id,
      entregador_nome: user.name,
    })
    if (!error && data) {
      setOrders(prev => [data, ...prev])
    }
    setNewOrder({ cliente_nome:'', cliente_telefone:'', endereco:'' })
    setShowModal(false)
    setSaving(false)
    setTab('mine')
  }

  // Navegar para mapa com TODOS os pedidos ativos do entregador
  const handleOpenRoute = () => {
    const ids = myActive.map(o => o.id).join(',')
    if (ids) navigate(`/map/multi/${ids}`)
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
            <div style={s.avatar}>{user.avatar || user.name?.slice(0,2).toUpperCase()}</div>
            <div>
              <div style={s.userName}>{user.name}</div>
              <div style={s.userRole}>Entregador</div>
            </div>
          </div>
          <button style={s.iconBtn} onClick={handleLogout} title="Sair"><LogOut size={15} /></button>
        </div>
      </header>

      {/* ── Stats ── */}
      <div style={s.statsStrip}>
        <Stat icon={Clock}       color="var(--pending)"   value={available.length} label="Disponíveis" />
        <div style={s.divider} />
        <Stat icon={Truck}       color="var(--in-route)"  value={myActive.length}  label="Em rota" />
        <div style={s.divider} />
        <Stat icon={CheckCircle} color="var(--delivered)" value={myDone.length}    label="Entregues" />
      </div>

      {/* ── Rota otimizada banner ── */}
      {myActive.length > 0 && (
        <button style={s.routeBanner} onClick={handleOpenRoute}>
          <div style={s.routeBannerLeft}>
            <div style={s.routeIcon}><Route size={18} color="var(--accent)" /></div>
            <div>
              <div style={s.routeTitle}>Rota otimizada ativa</div>
              <div style={s.routeSub}>{myActive.length} entrega{myActive.length > 1 ? 's' : ''} — toque para abrir o GPS</div>
            </div>
          </div>
          <ChevronRight size={16} color="var(--accent)" />
        </button>
      )}

      {/* ── Toolbar ── */}
      <div style={s.toolbar}>
        <div style={s.tabs}>
          <Tab active={tab==='available'} onClick={() => setTab('available')} label="Disponíveis"  count={available.length} countColor="var(--pending)" />
          <Tab active={tab==='mine'}      onClick={() => setTab('mine')}      label="Meus pedidos" count={myOrders.length}   countColor="var(--in-route)" />
        </div>
        <button style={s.addBtn} onClick={() => setShowModal(true)}>
          <Plus size={14} /> Novo
        </button>
      </div>

      {/* ── List ── */}
      <div style={s.list}>
        {shown.length === 0
          ? <div style={s.empty} className="fade-in">
              <Package size={40} color="var(--text-3)" />
              <p style={s.emptyTitle}>{tab === 'available' ? 'Nenhum pedido disponível' : 'Nenhum pedido atribuído'}</p>
              <p style={s.emptySub}>{tab === 'available' ? 'Novos pedidos aparecem aqui automaticamente.' : 'Associe um pedido ou crie um novo.'}</p>
            </div>
          : shown.map((order, i) => (
            <CourierCard key={order.id} order={order} delay={i*0.04}
              isAvailable={tab === 'available'}
              onAssociate={() => associate(order.id)}
              onNavigate={() => navigate(`/map/single/${order.id}`)}
              onConfirm={() => navigate(`/confirm/${order.id}`)} />
          ))
        }
      </div>

      {/* ── Modal novo pedido ── */}
      {showModal && (
        <div style={s.overlay} onClick={() => setShowModal(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()} className="scale-in">
            <div style={s.modalHead}>
              <span style={s.modalTitle}>Novo pedido</span>
              <button style={s.iconBtn} onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <div style={s.modalBody}>
              <p style={s.modalNote}>O pedido será criado e atribuído a você automaticamente.</p>
              {[
                { key:'cliente_nome',     label:'Nome do cliente',    placeholder:'Ana Beatriz Silva',            Icon:User },
                { key:'cliente_telefone', label:'Telefone',            placeholder:'(85) 98765-4321',              Icon:Phone },
                { key:'endereco',         label:'Endereço de entrega', placeholder:'Rua das Flores, 142, Aldeota', Icon:MapPin },
              ].map(({ key, label, placeholder, Icon }) => (
                <div key={key} style={s.field}>
                  <label style={s.fieldLabel}>{label}</label>
                  <div style={{ position:'relative' }}>
                    <Icon size={14} color="var(--text-3)" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }} />
                    <input style={s.fieldInput} value={newOrder[key]} placeholder={placeholder}
                      onChange={e => setNewOrder(p => ({ ...p, [key]: e.target.value }))} />
                  </div>
                </div>
              ))}
              <button
                style={{ ...s.addBtn, width:'100%', justifyContent:'center', padding:'12px', fontSize:14, marginTop:4, opacity: saving ? 0.6 : 1 }}
                disabled={!newOrder.cliente_nome || !newOrder.cliente_telefone || !newOrder.endereco || saving}
                onClick={handleCreate}>
                {saving ? 'Criando…' : <><Plus size={15} /> Criar e assumir pedido</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ icon:Icon, color, value, label }) {
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
      {count > 0 && <span style={{ ...s.tabBadge, color: countColor }}>{count}</span>}
    </button>
  )
}

function CourierCard({ order, delay, isAvailable, onAssociate, onNavigate, onConfirm }) {
  const cfg = STATUS_CONFIG[order.status]
  return (
    <div style={{ ...s.card, animationDelay:`${delay}s` }} className="slide-in">
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
            <button style={s.associateBtn} onClick={onAssociate}><Link2 size={14} /> Assumir</button>
          )}
          {!isAvailable && order.status === 'em_rota' && (
            <>
              <button style={s.mapBtn} onClick={onNavigate}><Navigation size={14} /> GPS</button>
              <button style={s.confirmBtn} onClick={onConfirm}><CheckCircle size={14} /> Confirmar</button>
            </>
          )}
          {!isAvailable && order.status === 'entregue' && (
            <span style={s.donePill}><CheckCircle size={13} color="var(--delivered)" /> Concluído</span>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon:Icon, text }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:7 }}>
      <Icon size={12} color="var(--text-3)" style={{ flexShrink:0, marginTop:1 }} />
      <span style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.4 }}>{text}</span>
    </div>
  )
}

const s = {
  page:{ height:'100vh', display:'flex', flexDirection:'column', background:'var(--bg)', overflow:'hidden' },
  header:{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 18px', height:56, flexShrink:0, background:'var(--bg-2)', borderBottom:'1px solid var(--border)' },
  hLeft:{ display:'flex', alignItems:'center', gap:10 },
  logoBox:{ width:34, height:34, borderRadius:9, background:'var(--accent-dim)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center' },
  logoName:{ fontSize:15, fontWeight:800, color:'var(--text-1)', letterSpacing:'-0.3px' },
  hRight:{ display:'flex', alignItems:'center', gap:10 },
  userChip:{ display:'flex', alignItems:'center', gap:8 },
  avatar:{ width:32, height:32, borderRadius:9, background:'var(--accent-dim)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'var(--accent)', fontFamily:'var(--mono)' },
  userName:{ fontSize:13, fontWeight:600, color:'var(--text-1)' },
  userRole:{ fontSize:11, color:'var(--text-3)' },
  iconBtn:{ padding:7, background:'transparent', color:'var(--text-3)', border:'1px solid var(--border)', borderRadius:7, display:'flex', alignItems:'center' },
  statsStrip:{ display:'flex', alignItems:'center', justifyContent:'center', gap:24, padding:'10px 18px', flexShrink:0, background:'var(--bg-2)', borderBottom:'1px solid var(--border)' },
  stat:{ display:'flex', alignItems:'center', gap:6 },
  statN:{ fontSize:16, fontWeight:800 },
  statL:{ fontSize:12, color:'var(--text-3)' },
  divider:{ width:1, height:18, background:'var(--border-2)' },
  routeBanner:{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 18px', background:'var(--accent-dim)', borderBottom:'1px solid var(--accent-border)', flexShrink:0, cursor:'pointer' },
  routeBannerLeft:{ display:'flex', alignItems:'center', gap:12 },
  routeIcon:{ width:36, height:36, borderRadius:9, background:'rgba(0,229,160,0.15)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center' },
  routeTitle:{ fontSize:13, fontWeight:700, color:'var(--accent)' },
  routeSub:{ fontSize:11, color:'var(--text-2)', marginTop:1 },
  toolbar:{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 14px', background:'var(--bg-2)', borderBottom:'1px solid var(--border)', flexShrink:0 },
  tabs:{ display:'flex', gap:2 },
  tab:{ display:'flex', alignItems:'center', gap:7, padding:'7px 14px', borderRadius:8, fontSize:13, fontWeight:500, color:'var(--text-3)', background:'transparent' },
  tabActive:{ background:'var(--bg-3)', color:'var(--text-1)', boxShadow:'inset 0 0 0 1px var(--border-2)' },
  tabBadge:{ fontSize:11, fontWeight:700, padding:'1px 6px', borderRadius:10, background:'var(--bg-3)' },
  addBtn:{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:'var(--accent)', color:'#080D1A', borderRadius:'var(--radius-sm)', fontSize:13, fontWeight:700 },
  list:{ flex:1, overflowY:'auto', padding:'10px 14px', display:'flex', flexDirection:'column', gap:8 },
  empty:{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'60px 20px', gap:12, textAlign:'center' },
  emptyTitle:{ fontSize:15, fontWeight:600, color:'var(--text-2)' },
  emptySub:{ fontSize:13, color:'var(--text-3)', lineHeight:1.6, maxWidth:280 },
  card:{ background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 16px', display:'flex', flexDirection:'column', gap:8, opacity:0 },
  cardTop:{ display:'flex', alignItems:'center', justifyContent:'space-between' },
  cardId:{ fontFamily:'var(--mono)', fontSize:10, fontWeight:600, color:'var(--text-3)', letterSpacing:'0.5px' },
  pill:{ padding:'2px 9px', borderRadius:20, fontSize:10, fontWeight:700 },
  cardName:{ fontSize:15, fontWeight:700, color:'var(--text-1)' },
  infoList:{ display:'flex', flexDirection:'column', gap:6 },
  cardFoot:{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:10, borderTop:'1px solid var(--border)', marginTop:2 },
  cardTime:{ fontSize:11, color:'var(--text-3)' },
  actions:{ display:'flex', gap:6, alignItems:'center' },
  associateBtn:{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', background:'var(--accent)', color:'#080D1A', borderRadius:8, fontSize:13, fontWeight:700 },
  mapBtn:{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', background:'var(--in-route-bg)', border:'1px solid rgba(96,165,250,0.3)', borderRadius:8, fontSize:12, fontWeight:600, color:'var(--in-route)' },
  confirmBtn:{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', background:'var(--accent)', color:'#080D1A', borderRadius:8, fontSize:12, fontWeight:700 },
  donePill:{ display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:600, color:'var(--delivered)', padding:'5px 10px', background:'var(--delivered-bg)', borderRadius:8 },
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.72)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300 },
  modal:{ width:'100%', maxWidth:440, margin:'0 16px', background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:'var(--radius-lg)', overflow:'hidden', boxShadow:'var(--shadow)' },
  modalHead:{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 22px', borderBottom:'1px solid var(--border)' },
  modalTitle:{ fontSize:15, fontWeight:700, color:'var(--text-1)' },
  modalNote:{ fontSize:12, color:'var(--text-3)', background:'var(--accent-dim)', border:'1px solid var(--accent-border)', borderRadius:8, padding:'8px 12px' },
  modalBody:{ padding:'18px 22px', display:'flex', flexDirection:'column', gap:14 },
  field:{ display:'flex', flexDirection:'column', gap:7 },
  fieldLabel:{ fontSize:12, fontWeight:500, color:'var(--text-2)' },
  fieldInput:{ width:'100%', padding:'10px 12px 10px 36px', background:'var(--bg)', border:'1px solid var(--border-2)', borderRadius:'var(--radius-sm)', color:'var(--text-1)', fontSize:13 },
}
