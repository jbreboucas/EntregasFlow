import OrderDetailModal from '../components/OrderDetailModal'
import AddressAutocomplete from '../components/AddressAutocomplete'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useOrders } from '../App'
import { STATUS_CONFIG, timeAgo } from '../lib/mockData'
import { getPedidos, updatePedido, subscribePedidos, createPedido } from '../lib/supabase'
import {
  LogOut, Package, MapPin, Phone, Truck, CheckCircle,
  Clock, Navigation, Link2, ChevronRight, Plus, X, User, Route, Hash
} from 'lucide-react'

// Opções de localização no carro
const CAR_POSITIONS = [
  { id: 'frente-esq',   label: 'Frente',       sub: 'Esquerdo',  icon: '🚗' },
  { id: 'frente-dir',   label: 'Frente',       sub: 'Direito',   icon: '🚗' },
  { id: 'traseiro-esq', label: 'Banco traseiro', sub: 'Esquerdo', icon: '🪑' },
  { id: 'traseiro-cen', label: 'Banco traseiro', sub: 'Centro',   icon: '🪑' },
  { id: 'traseiro-dir', label: 'Banco traseiro', sub: 'Direito',  icon: '🪑' },
  { id: 'porta-malas-esq', label: 'Porta-malas', sub: 'Esquerdo', icon: '📦' },
  { id: 'porta-malas-cen', label: 'Porta-malas', sub: 'Centro',   icon: '📦' },
  { id: 'porta-malas-dir', label: 'Porta-malas', sub: 'Direito',  icon: '📦' },
]

const CAR_LABEL = (id) => {
  const p = CAR_POSITIONS.find(x => x.id === id)
  return p ? `${p.label} · ${p.sub}` : id
}

export default function CourierDashboard() {
  const { user, logout } = useAuth()
  const { orders, setOrders, updateOrder } = useOrders()
  const navigate = useNavigate()
  const [tab, setTab]           = useState('available')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm]         = useState({
    id_externo: '', cliente_nome: '', cliente_telefone: '', endereco: '',
    localizacao_carro: '', lat: null, lng: null
  })

  useEffect(() => {
    getPedidos().then(({ data }) => { if (data) setOrders(data) })
    const ch = subscribePedidos(p => {
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
    const changes = { status: 'em_rota', entregador_id: user.id, entregador_nome: user.name }
    updateOrder(orderId, changes)
    await updatePedido(orderId, changes)
    setTab('mine')
  }

  const handleCreate = async () => {
    if (!form.endereco.trim()) return
    setSaving(true)

    const payload = {
      status:          'em_rota',
      entregador_id:   user.id,
      entregador_nome: user.name,
      endereco:        form.endereco.trim(),
      ...(form.lat && { lat: form.lat }),
      ...(form.lng && { lng: form.lng }),
      ...(form.cliente_nome      && { cliente_nome:      form.cliente_nome.trim() }),
      ...(form.cliente_telefone  && { cliente_telefone:  form.cliente_telefone.trim() }),
      ...(form.localizacao_carro && { localizacao_carro: form.localizacao_carro }),
      ...(form.id_externo.trim() && { id: form.id_externo.trim() }),
    }

    const { data, error } = await createPedido(payload)
    if (!error && data) {
      // Adiciona imediatamente ao contexto local
      setOrders(prev => [data, ...prev])
      setTab('mine')
    } else {
      console.error('Erro ao criar pedido:', error)
    }

    setForm({ id_externo:'', cliente_nome:'', cliente_telefone:'', endereco:'', localizacao_carro:'' })
    setShowModal(false)
    setSaving(false)
  }

  const handleOpenRoute = () => {
    const ids = myActive.map(o => o.id).join(',')
    if (ids) navigate(`/map/multi/${ids}`)
  }

  const shown = tab === 'available' ? available : myOrders
  const selectedOrder = selectedId ? orders.find(o => o.id === selectedId) : null

  return (
    <div style={s.page}>
      {/* Header */}
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

      {/* Stats */}
      <div style={s.statsStrip}>
        <Stat icon={Clock}       color="var(--pending)"   value={available.length} label="Disponíveis" />
        <div style={s.divider} />
        <Stat icon={Truck}       color="var(--in-route)"  value={myActive.length}  label="Em rota" />
        <div style={s.divider} />
        <Stat icon={CheckCircle} color="var(--delivered)" value={myDone.length}    label="Entregues" />
      </div>

      {/* Banner rota otimizada */}
      {myActive.length > 0 && (
        <button style={s.routeBanner} onClick={handleOpenRoute}>
          <div style={s.routeBannerLeft}>
            <div style={s.routeIcon}><Route size={18} color="var(--accent)" /></div>
            <div>
              <div style={s.routeTitle}>Ver todas as rotas no mapa</div>
              <div style={s.routeSub}>{myActive.length} entrega{myActive.length > 1 ? 's' : ''} em rota</div>
            </div>
          </div>
          <ChevronRight size={16} color="var(--accent)" />
        </button>
      )}

      {/* Toolbar */}
      <div style={s.toolbar}>
        <div style={s.tabs}>
          <Tab active={tab==='available'} onClick={() => setTab('available')} label="Disponíveis"  count={available.length} countColor="var(--pending)" />
          <Tab active={tab==='mine'}      onClick={() => setTab('mine')}      label="Meus pedidos" count={myOrders.length}   countColor="var(--in-route)" />
        </div>
        <button style={s.addBtn} onClick={() => setShowModal(true)}>
          <Plus size={14} /> Novo pedido
        </button>
      </div>

      {/* Lista */}
      <div style={s.list}>
        {shown.length === 0
          ? <div style={s.empty} className="fade-in">
              <Package size={40} color="var(--text-3)" />
              <p style={s.emptyTitle}>{tab === 'available' ? 'Nenhum pedido disponível' : 'Nenhum pedido atribuído'}</p>
              <p style={s.emptySub}>{tab === 'available' ? 'Novos pedidos aparecem aqui em tempo real.' : 'Crie um pedido ou assuma um disponível.'}</p>
            </div>
          : shown.map((order, i) => (
            <CourierCard key={order.id} order={order} delay={i*0.04}
              isAvailable={tab === 'available'}
              onAssociate={() => associate(order.id)}
              onNavigate={() => navigate(`/map/single/${order.id}`)}
              onConfirm={() => navigate(`/confirm/${order.id}`)}
              onClick={() => setSelectedId(order.id)} />
          ))
        }
      </div>

      {/* Modal novo pedido */}
      {showModal && (
        <div style={s.overlay} onClick={() => setShowModal(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()} className="scale-in">
            <div style={s.modalHead}>
              <span style={s.modalTitle}>Novo pedido</span>
              <button style={s.iconBtn} onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>

            <div style={s.modalBody}>
              {/* ID manual */}
              <FormField icon={Hash} label="Nº do pedido" placeholder="Auto (ex: PED-042)" optional
                value={form.id_externo} onChange={v => setForm(p => ({ ...p, id_externo: v }))} />

              {/* Endereço — obrigatório, com autocomplete */}
              <AddressAutocomplete
                value={form.endereco}
                onChange={v => setForm(p => ({ ...p, endereco: v }))}
                onSelect={({ address, lat, lng }) => setForm(p => ({ ...p, endereco: address, lat, lng }))}
              />

              {/* Nome — opcional */}
              <FormField icon={User} label="Nome do cliente" placeholder="Ana Beatriz Silva" optional
                value={form.cliente_nome} onChange={v => setForm(p => ({ ...p, cliente_nome: v }))} />

              {/* Telefone — opcional */}
              <FormField icon={Phone} label="Telefone" placeholder="(85) 98765-4321" optional
                value={form.cliente_telefone} onChange={v => setForm(p => ({ ...p, cliente_telefone: v }))} />

              {/* Localização no carro */}
              <div>
                <label style={s.fieldLabel}>
                  📍 Localização no carro <span style={{ color:'var(--text-3)', fontSize:11 }}>(opcional)</span>
                </label>
                <div style={s.carGrid}>
                  {CAR_POSITIONS.map(pos => (
                    <button key={pos.id} type="button"
                      style={{
                        ...s.carBtn,
                        background:   form.localizacao_carro === pos.id ? 'var(--accent-dim)' : 'var(--bg)',
                        border:       `1px solid ${form.localizacao_carro === pos.id ? 'var(--accent)' : 'var(--border)'}`,
                        color:        form.localizacao_carro === pos.id ? 'var(--accent)' : 'var(--text-3)',
                      }}
                      onClick={() => setForm(p => ({
                        ...p,
                        localizacao_carro: p.localizacao_carro === pos.id ? '' : pos.id
                      }))}>
                      <span style={{ fontSize:16 }}>{pos.icon}</span>
                      <span style={{ fontSize:10, fontWeight:600, lineHeight:1.2, textAlign:'center' }}>
                        {pos.label}<br/><span style={{ opacity:0.7 }}>{pos.sub}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                style={{ ...s.addBtn, width:'100%', justifyContent:'center', padding:'13px', fontSize:14, marginTop:4, opacity: (!form.endereco.trim() || saving) ? 0.38 : 1 }}
                disabled={!form.endereco.trim() || saving}
                onClick={handleCreate}>
                {saving ? 'Criando…' : <><Plus size={15} /> Criar e assumir pedido</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

      {/* Modal detalhe */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedId(null)}
          allowCarEdit={!selectedOrder.entregador_id || selectedOrder.entregador_id !== user?.id}
        />
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────────
function FormField({ icon:Icon, label, placeholder, optional, value, onChange }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <label style={{ fontSize:12, fontWeight:500, color:'var(--text-2)' }}>
        {label} {optional && <span style={{ color:'var(--text-3)', fontSize:11 }}>(opcional)</span>}
      </label>
      <div style={{ position:'relative' }}>
        <Icon size={14} color="var(--text-3)"
          style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }} />
        <input
          style={{ width:'100%', padding:'10px 12px 10px 36px', background:'var(--bg)', border:'1px solid var(--border-2)', borderRadius:'var(--radius-sm)', color:'var(--text-1)', fontSize:13 }}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    </div>
  )
}

function Stat({ icon:Icon, color, value, label }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <Icon size={15} color={color} />
      <span style={{ fontSize:16, fontWeight:800, color }}>{value}</span>
      <span style={{ fontSize:12, color:'var(--text-3)' }}>{label}</span>
    </div>
  )
}

function Tab({ active, onClick, label, count, countColor }) {
  return (
    <button style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 14px', borderRadius:8, fontSize:13, fontWeight:500, color: active ? 'var(--text-1)' : 'var(--text-3)', background: active ? 'var(--bg-3)' : 'transparent', boxShadow: active ? 'inset 0 0 0 1px var(--border-2)' : 'none' }} onClick={onClick} onClickCapture={e => { if (e.target.closest("button")) e.stopPropagation() }}>
      {label}
      {count > 0 && <span style={{ fontSize:11, fontWeight:700, padding:'1px 6px', borderRadius:10, background:'var(--bg-3)', color: countColor }}>{count}</span>}
    </button>
  )
}

function CourierCard({ order, delay, isAvailable, onAssociate, onNavigate, onConfirm, onClick }) {
  const cfg = STATUS_CONFIG[order.status]
  return (
    <div style={{ background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 16px', display:'flex', flexDirection:'column', gap:8, opacity:0, animationDelay:`${delay}s`, cursor:'pointer' }} className="slide-in" onClick={onClick} onClickCapture={e => { if (e.target.closest("button")) e.stopPropagation() }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontFamily:'var(--mono)', fontSize:10, fontWeight:600, color:'var(--text-3)', letterSpacing:'0.5px' }}># {order.id}</span>
        <span style={{ padding:'2px 9px', borderRadius:20, fontSize:10, fontWeight:700, color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
      </div>

      <div style={{ fontSize:15, fontWeight:700, color:'var(--text-1)' }}>
        {order.cliente_nome || <span style={{ color:'var(--text-3)', fontStyle:'italic', fontWeight:400 }}>Cliente não informado</span>}
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
        {order.cliente_telefone && <InfoRow icon={Phone}  text={order.cliente_telefone} />}
        <InfoRow icon={MapPin} text={order.endereco} />
        {order.recebido_por && (
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--delivered)', background:'var(--delivered-bg)', border:'1px solid rgba(52,211,153,0.2)', borderRadius:6, padding:'4px 9px', width:'fit-content' }}>
            ✓ Recebido por <strong>{order.recebido_por}</strong>
          </div>
        )}
        {order.localizacao_carro && (
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--accent)', background:'var(--accent-dim)', border:'1px solid var(--accent-border)', borderRadius:6, padding:'4px 9px', width:'fit-content' }}>
            📦 {CAR_LABEL(order.localizacao_carro)}
          </div>
        )}
      </div>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:10, borderTop:'1px solid var(--border)', marginTop:2 }}>
        <span style={{ fontSize:11, color:'var(--text-3)' }}>{timeAgo(order.criado_em)}</span>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {isAvailable && <button style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', background:'var(--accent)', color:'#080D1A', borderRadius:8, fontSize:13, fontWeight:700 }} onClick={e => { e.stopPropagation(); onAssociate() }}><Link2 size={14} /> Assumir</button>}
          {!isAvailable && order.status === 'em_rota' && <>
            <button style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', background:'var(--in-route-bg)', border:'1px solid rgba(96,165,250,0.3)', borderRadius:8, fontSize:12, fontWeight:600, color:'var(--in-route)' }} onClick={e => { e.stopPropagation(); onNavigate() }}><Navigation size={14} /> GPS</button>
            <button style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', background:'var(--accent)', color:'#080D1A', borderRadius:8, fontSize:12, fontWeight:700 }} onClick={e => { e.stopPropagation(); onConfirm() }}><CheckCircle size={14} /> Confirmar</button>
          </>}
          {!isAvailable && order.status === 'entregue' && (
            <span style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:600, color:'var(--delivered)', padding:'5px 10px', background:'var(--delivered-bg)', borderRadius:8 }}>
              <CheckCircle size={13} color="var(--delivered)" /> Concluído
            </span>
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
  divider:{ width:1, height:18, background:'var(--border-2)' },
  routeBanner:{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 18px', background:'var(--accent-dim)', borderBottom:'1px solid var(--accent-border)', flexShrink:0, cursor:'pointer' },
  routeBannerLeft:{ display:'flex', alignItems:'center', gap:12 },
  routeIcon:{ width:36, height:36, borderRadius:9, background:'rgba(0,229,160,0.15)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center' },
  routeTitle:{ fontSize:13, fontWeight:700, color:'var(--accent)' },
  routeSub:{ fontSize:11, color:'var(--text-2)', marginTop:1 },
  toolbar:{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 14px', background:'var(--bg-2)', borderBottom:'1px solid var(--border)', flexShrink:0 },
  tabs:{ display:'flex', gap:2 },
  addBtn:{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:'var(--accent)', color:'#080D1A', borderRadius:'var(--radius-sm)', fontSize:13, fontWeight:700 },
  list:{ flex:1, overflowY:'auto', padding:'10px 14px', display:'flex', flexDirection:'column', gap:8 },
  empty:{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'60px 20px', gap:12, textAlign:'center' },
  emptyTitle:{ fontSize:15, fontWeight:600, color:'var(--text-2)' },
  emptySub:{ fontSize:13, color:'var(--text-3)', lineHeight:1.6, maxWidth:280 },
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.72)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300 },
  modal:{ width:'100%', maxWidth:460, margin:'0 16px', background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:'var(--radius-lg)', overflow:'hidden', boxShadow:'var(--shadow)', maxHeight:'90vh', overflowY:'auto' },
  modalHead:{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 22px', borderBottom:'1px solid var(--border)', position:'sticky', top:0, background:'var(--bg-2)', zIndex:10 },
  modalTitle:{ fontSize:15, fontWeight:700, color:'var(--text-1)' },
  modalBody:{ padding:'18px 22px', display:'flex', flexDirection:'column', gap:14 },
  fieldLabel:{ fontSize:12, fontWeight:500, color:'var(--text-2)', marginBottom:8, display:'block' },
  carGrid:{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:7 },
  carBtn:{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, padding:'10px 6px', borderRadius:9, cursor:'pointer', transition:'all 0.15s', minHeight:60 },
}
