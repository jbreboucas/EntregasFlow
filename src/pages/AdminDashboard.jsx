import DatePicker from '../components/DatePicker'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useOrders } from '../App'
import { STATUS_CONFIG, timeAgo } from '../lib/mockData'
import { getPedidos, createPedido, updatePedido, subscribePedidos } from '../lib/supabase'
import AddressAutocomplete from '../components/AddressAutocomplete'
import OrderDetailModal from '../components/OrderDetailModal'
import {
  LogOut, Plus, Phone, MapPin, User, Package,
  Clock, CheckCircle, Truck, Search, X, ChevronRight,
  Hash, RefreshCw, Filter, Calendar,
} from 'lucide-react'

const CAR_POSITIONS = [
  { id:'frente-esq',      label:'Frente',         sub:'Esquerdo', icon:'🚗' },
  { id:'frente-dir',      label:'Frente',         sub:'Direito',  icon:'🚗' },
  { id:'traseiro-esq',    label:'Banco traseiro', sub:'Esquerdo', icon:'🪑' },
  { id:'traseiro-cen',    label:'Banco traseiro', sub:'Centro',   icon:'🪑' },
  { id:'traseiro-dir',    label:'Banco traseiro', sub:'Direito',  icon:'🪑' },
  { id:'porta-malas-esq', label:'Porta-malas',    sub:'Esquerdo', icon:'📦' },
  { id:'porta-malas-cen', label:'Porta-malas',    sub:'Centro',   icon:'📦' },
  { id:'porta-malas-dir', label:'Porta-malas',    sub:'Direito',  icon:'📦' },
]

export default function AdminDashboard() {
  const { user, logout } = useAuth()
  const { orders, setOrders, updateOrder } = useOrders()
  const navigate = useNavigate()

  const [search,      setSearch]      = useState('')
  const [showModal,   setShowModal]   = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [selectedId,  setSelectedId]  = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [refreshing,  setRefreshing]  = useState(false)
  const [dragId,      setDragId]      = useState(null)
  const [dragOver,    setDragOver]    = useState(null)

  // Filtros
  const [filterCourier,   setFilterCourier]   = useState('')
  const [filterDateStart, setFilterDateStart] = useState('')
  const [filterDateEnd,   setFilterDateEnd]   = useState('')

  // Formulário novo pedido
  const [form, setForm] = useState({
    id_externo:'', cliente_nome:'', cliente_telefone:'', endereco:'',
    localizacao_carro:'', data_pedido:'', lat:null, lng:null,
  })

  useEffect(() => {
    getPedidos().then(({ data }) => { if (data) setOrders(data) })
    const ch = subscribePedidos(p => {
      if (p.eventType === 'INSERT') setOrders(prev => [p.new, ...prev])
      if (p.eventType === 'UPDATE') setOrders(prev => prev.map(o => o.id === p.new.id ? p.new : o))
      if (p.eventType === 'DELETE') setOrders(prev => prev.filter(o => o.id !== p.old.id))
    })
    return () => ch.unsubscribe()
  }, [])

  const handleLogout  = async () => { await logout(); navigate('/login') }
  const handleRefresh = async () => {
    setRefreshing(true)
    const { data } = await getPedidos()
    if (data) setOrders(data)
    setRefreshing(false)
  }

  // Lista de entregadores únicos para o filtro
  const couriers = useMemo(() => {
    const map = {}
    orders.forEach(o => { if (o.entregador_id && o.entregador_nome) map[o.entregador_id] = o.entregador_nome })
    return Object.entries(map).map(([id, name]) => ({ id, name }))
  }, [orders])

  const activeFilters = [filterCourier, filterDateStart, filterDateEnd].filter(Boolean).length

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (search && !(
        o.cliente_nome?.toLowerCase().includes(search.toLowerCase()) ||
        o.id?.toLowerCase().includes(search.toLowerCase()) ||
        o.endereco?.toLowerCase().includes(search.toLowerCase())
      )) return false
      if (filterCourier && o.entregador_id !== filterCourier) return false
      if (filterDateStart) {
        const d = new Date(o.data_pedido || o.criado_em)
        if (d < new Date(filterDateStart)) return false
      }
      if (filterDateEnd) {
        const d = new Date(o.data_pedido || o.criado_em)
        if (d > new Date(filterDateEnd + 'T23:59:59')) return false
      }
      return true
    })
  }, [orders, search, filterCourier, filterDateStart, filterDateEnd])

  const byStatus = (st) => filtered.filter(o => o.status === st)
  const counts = {
    pendente: orders.filter(o => o.status === 'pendente').length,
    em_rota:  orders.filter(o => o.status === 'em_rota').length,
    entregue: orders.filter(o => o.status === 'entregue').length,
  }

  const handleCreate = async () => {
    if (!form.endereco.trim()) return
    setSaving(true)
    const payload = {
      status: 'pendente',
      endereco: form.endereco.trim(),
      ...(form.cliente_nome      && { cliente_nome:      form.cliente_nome.trim() }),
      ...(form.cliente_telefone  && { cliente_telefone:  form.cliente_telefone.trim() }),
      ...(form.localizacao_carro && { localizacao_carro: form.localizacao_carro }),
      ...(form.data_pedido       && { data_pedido:       form.data_pedido }),
      ...(form.lat               && { lat: form.lat }),
      ...(form.lng               && { lng: form.lng }),
      ...(form.id_externo.trim() && { id: form.id_externo.trim() }),
    }
    const { data, error } = await createPedido(payload)
    if (!error && data) setOrders(prev => [data, ...prev])
    setForm({ id_externo:'', cliente_nome:'', cliente_telefone:'', endereco:'', localizacao_carro:'', data_pedido:'', lat:null, lng:null })
    setShowModal(false)
    setSaving(false)
  }

  // Drag & drop handlers
  const handleDragStart = (e, orderId) => {
    setDragId(orderId)
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (e, col) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(col)
  }
  const handleDrop = async (e, newStatus) => {
    e.preventDefault()
    setDragOver(null)
    if (!dragId) return
    const order = orders.find(o => o.id === dragId)
    if (!order || order.status === newStatus) { setDragId(null); return }
    updateOrder(dragId, { status: newStatus })
    await updatePedido(dragId, { status: newStatus })
    setDragId(null)
  }

  const selectedOrder = selectedId ? orders.find(o => o.id === selectedId) : null

  return (
    <div style={s.page}>
      {/* Header */}
      <header style={s.header}>
        <div style={s.hLeft}>
          <div style={s.logoBox}><Package size={17} color="var(--accent)" /></div>
          <div>
            <div style={s.logoName}>BRLAB.ENTREGAS</div>
            <div style={s.logoSub}>Painel do Administrador</div>
          </div>
        </div>
        <div style={s.hRight}>
          <div style={s.statsRow} className="header-stats">
            {[
              { key:'pendente', label:'Pendentes', icon:Clock,       color:'var(--pending)' },
              { key:'em_rota',  label:'Em rota',   icon:Truck,       color:'var(--in-route)' },
              { key:'entregue', label:'Entregues', icon:CheckCircle, color:'var(--delivered)' },
            ].map(({ key, label, icon:Icon, color }) => (
              <div key={key} style={s.stat}>
                <Icon size={14} color={color} />
                <span style={{ ...s.statN, color }}>{counts[key]}</span>
                <span style={s.statL}>{label}</span>
              </div>
            ))}
          </div>
          <div style={s.userChip}>
            <div style={s.avatar}>{user.avatar || user.name?.slice(0,2).toUpperCase()}</div>
            <span style={s.userName}>{user.name}</span>
          </div>
          <button style={s.iconBtn} onClick={handleLogout} title="Sair"><LogOut size={15} /></button>
        </div>
      </header>

      {/* Toolbar */}
      <div style={s.toolbar} className="admin-toolbar">
        <div style={s.searchWrap}>
          <Search size={14} color="var(--text-3)" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }} />
          <input style={s.searchInput} value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, ID ou endereço…" />
          {search && <button style={s.clearBtn} onClick={() => setSearch('')}><X size={13} /></button>}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button style={{ ...s.iconBtn2, ...(showFilters || activeFilters > 0 ? s.iconBtn2Active : {}) }}
            onClick={() => setShowFilters(v => !v)}>
            <Filter size={14} />
            {activeFilters > 0 && <span style={s.filterBadge}>{activeFilters}</span>}
          </button>
          <button style={s.iconBtn2} onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
          </button>
          <button style={s.addBtn} className="add-btn" onClick={() => setShowModal(true)}>
            <Plus size={15} /> Novo pedido
          </button>
        </div>
      </div>

      {/* Filtros */}
      {showFilters && (
        <div style={s.filterBar} className="fade-in">
          <div style={s.filterGroup}>
            <label style={s.filterLabel}><User size={12} /> Entregador</label>
            <select style={s.filterSelect} value={filterCourier} onChange={e => setFilterCourier(e.target.value)}>
              <option value="">Todos</option>
              {couriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={s.filterGroup}>
            <label style={s.filterLabel}><Calendar size={12} /> De</label>
            <input type="date" style={s.filterDate} value={filterDateStart} onChange={e => setFilterDateStart(e.target.value)} />
          </div>
          <div style={s.filterGroup}>
            <label style={s.filterLabel}><Calendar size={12} /> Até</label>
            <input type="date" style={s.filterDate} value={filterDateEnd} onChange={e => setFilterDateEnd(e.target.value)} />
          </div>
          {activeFilters > 0 && (
            <button style={s.clearFiltersBtn} onClick={() => { setFilterCourier(''); setFilterDateStart(''); setFilterDateEnd('') }}>
              <X size={12} /> Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Kanban */}
      <div style={s.kanban} className="kanban-grid">
        {['pendente','em_rota','entregue'].map(col => {
          const cfg   = STATUS_CONFIG[col]
          const cards = byStatus(col)
          const isDragTarget = dragOver === col
          return (
            <div key={col} style={{ ...s.column, ...(isDragTarget ? s.columnDragOver : {}) }}
              onDragOver={e => handleDragOver(e, col)}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => handleDrop(e, col)}>
              <div style={s.colHead}>
                <div style={{ ...s.colDot, background: cfg.color }} />
                <span style={s.colTitle}>{cfg.label}</span>
                <div style={{ ...s.colBadge, color: cfg.color, background: cfg.bg }}>{cards.length}</div>
              </div>
              {isDragTarget && (
                <div style={s.dropHint}>Soltar aqui para mover para <strong>{cfg.label}</strong></div>
              )}
              <div style={s.cardList}>
                {cards.length === 0
                  ? <div style={s.emptyCol}><Package size={26} color="var(--text-3)" /><span style={s.emptyTxt}>Nenhum pedido</span></div>
                  : cards.map((order, i) => (
                    <AdminCard key={order.id} order={order} delay={i*0.04}
                      isDragging={dragId === order.id}
                      onDragStart={e => handleDragStart(e, order.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => setSelectedId(order.id)} />
                  ))
                }
              </div>
            </div>
          )
        })}
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
              <FormField icon={Hash} label="Nº do pedido" placeholder="Auto (ex: PED-042)" optional
                value={form.id_externo} onChange={v => setForm(p => ({ ...p, id_externo: v }))} />

              <AddressAutocomplete value={form.endereco}
                onChange={v => setForm(p => ({ ...p, endereco: v }))}
                onSelect={({ address, lat, lng }) => setForm(p => ({ ...p, endereco: address, lat, lng }))} />

              <FormField icon={User} label="Nome do cliente" placeholder="Ana Beatriz Silva" optional
                value={form.cliente_nome} onChange={v => setForm(p => ({ ...p, cliente_nome: v }))} />

              <FormField icon={Phone} label="Telefone" placeholder="(85) 98765-4321" optional
                value={form.cliente_telefone} onChange={v => setForm(p => ({ ...p, cliente_telefone: v }))} />

              {/* Data do pedido */}
              <DatePicker
                label="📅 Data do pedido"
                value={form.data_pedido}
                onChange={v => setForm(p => ({ ...p, data_pedido: v }))}
                optional
              />

              {/* Localização no carro */}
              <div>
                <label style={s.fieldLabel}>📦 Localização no carro <span style={{ color:'var(--text-3)', fontSize:11 }}>(opcional)</span></label>
                <div style={s.carGrid}>
                  {CAR_POSITIONS.map(pos => (
                    <button key={pos.id} type="button"
                      style={{ ...s.carBtn, background: form.localizacao_carro === pos.id ? 'var(--accent-dim)' : 'var(--bg)', border:`1px solid ${form.localizacao_carro === pos.id ? 'var(--accent)' : 'var(--border)'}`, color: form.localizacao_carro === pos.id ? 'var(--accent)' : 'var(--text-3)' }}
                      onClick={() => setForm(p => ({ ...p, localizacao_carro: p.localizacao_carro === pos.id ? '' : pos.id }))}>
                      <span style={{ fontSize:16 }}>{pos.icon}</span>
                      <span style={{ fontSize:10, fontWeight:600, lineHeight:1.2, textAlign:'center' }}>
                        {pos.label}<br/><span style={{ opacity:0.7 }}>{pos.sub}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <button style={{ ...s.addBtn, width:'100%', justifyContent:'center', padding:'13px', fontSize:14, marginTop:4, opacity:(!form.endereco.trim() || saving) ? 0.38 : 1 }}
                disabled={!form.endereco.trim() || saving} onClick={handleCreate}>
                {saving ? 'Criando…' : <><Plus size={15} /> Criar pedido</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedOrder && (
        <OrderDetailModal order={selectedOrder} onClose={() => setSelectedId(null)} allowCarEdit={false} />
      )}
    </div>
  )
}

function FormField({ icon:Icon, label, placeholder, optional, value, onChange }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <label style={{ fontSize:12, fontWeight:500, color:'var(--text-2)' }}>
        {label} {optional && <span style={{ color:'var(--text-3)', fontSize:11 }}>(opcional)</span>}
      </label>
      <div style={{ position:'relative' }}>
        <Icon size={14} color="var(--text-3)" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }} />
        <input style={{ width:'100%', padding:'10px 12px 10px 36px', background:'var(--bg)', border:'1px solid var(--border-2)', borderRadius:'var(--radius-sm)', color:'var(--text-1)', fontSize:13, fontFamily:'var(--font)' }}
          placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
      </div>
    </div>
  )
}

function AdminCard({ order, delay, isDragging, onDragStart, onDragEnd, onClick }) {
  const cfg = STATUS_CONFIG[order.status]
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{ ...s.card, animationDelay:`${delay}s`, opacity: isDragging ? 0.4 : 0, cursor:'grab' }}
      className="slide-in">
      <div style={s.cardTop}>
        <span style={s.cardId}># {order.id}</span>
        <span style={{ ...s.pill, color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
      </div>
      <div style={s.cardName}>
        {order.cliente_nome || <span style={{ color:'var(--text-3)', fontStyle:'italic', fontWeight:400, fontSize:13 }}>Sem nome</span>}
      </div>
      <div style={s.infoList}>
        {order.cliente_telefone && <Row icon={Phone} text={order.cliente_telefone} />}
        <Row icon={MapPin} text={order.endereco} truncate />
        {order.data_pedido && <Row icon={Calendar} text={new Date(order.data_pedido).toLocaleDateString('pt-BR')} />}
        {order.entregador_nome && <Row icon={User} text={order.entregador_nome} accent />}
        {order.recebido_por && <Row icon={CheckCircle} text={`Recebido por ${order.recebido_por}`} delivered />}
      </div>
      <div style={s.cardFoot}>
        <span style={s.cardTime}>{timeAgo(order.criado_em)}</span>
        <span style={{ fontSize:11, color:'var(--text-3)', display:'flex', alignItems:'center', gap:3 }}>
          Ver detalhes <ChevronRight size={11} />
        </span>
      </div>
    </div>
  )
}

function Row({ icon:Icon, text, truncate, accent, delivered }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
      <Icon size={12} color={delivered ? 'var(--delivered)' : accent ? 'var(--accent)' : 'var(--text-3)'} style={{ flexShrink:0 }} />
      <span style={{ fontSize:12, color: delivered ? 'var(--delivered)' : accent ? 'var(--accent)' : 'var(--text-2)', overflow: truncate ? 'hidden' : undefined, textOverflow: truncate ? 'ellipsis' : undefined, whiteSpace: truncate ? 'nowrap' : undefined, flex: truncate ? 1 : undefined }}>
        {text}
      </span>
    </div>
  )
}

const s = {
  page:{ height:'100vh', display:'flex', flexDirection:'column', background:'var(--bg)', overflow:'hidden' },
  header:{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 20px', height:56, flexShrink:0, background:'var(--bg-2)', borderBottom:'1px solid var(--border)' },
  hLeft:{ display:'flex', alignItems:'center', gap:11 },
  logoBox:{ width:34, height:34, borderRadius:9, background:'var(--accent-dim)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center' },
  logoName:{ fontSize:15, fontWeight:800, color:'var(--text-1)', letterSpacing:'-0.3px' },
  logoSub:{ fontSize:10, color:'var(--text-3)' },
  hRight:{ display:'flex', alignItems:'center', gap:14 },
  statsRow:{ display:'flex', gap:18 },
  stat:{ display:'flex', alignItems:'center', gap:5 },
  statN:{ fontSize:15, fontWeight:800 },
  statL:{ fontSize:12, color:'var(--text-3)' },
  userChip:{ display:'flex', alignItems:'center', gap:8, padding:'5px 10px', background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:8 },
  avatar:{ width:24, height:24, borderRadius:6, background:'var(--accent-dim)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'var(--accent)', fontFamily:'var(--mono)' },
  userName:{ fontSize:13, fontWeight:500, color:'var(--text-1)' },
  iconBtn:{ padding:7, background:'transparent', color:'var(--text-3)', border:'1px solid var(--border)', borderRadius:7, display:'flex', alignItems:'center' },
  iconBtn2:{ display:'flex', alignItems:'center', justifyContent:'center', position:'relative', padding:8, background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', color:'var(--text-2)', cursor:'pointer', flexShrink:0 },
  iconBtn2Active:{ borderColor:'var(--accent-border)', color:'var(--accent)', background:'var(--accent-dim)' },
  filterBadge:{ position:'absolute', top:-5, right:-5, width:16, height:16, borderRadius:'50%', background:'var(--accent)', color:'#080D1A', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center' },
  toolbar:{ display:'flex', gap:10, padding:'10px 20px', flexShrink:0, background:'var(--bg-2)', borderBottom:'1px solid var(--border)', alignItems:'center' },
  searchWrap:{ flex:1, position:'relative' },
  searchInput:{ width:'100%', padding:'8px 32px 8px 34px', background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', color:'var(--text-1)', fontSize:13 },
  clearBtn:{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'transparent', color:'var(--text-3)', padding:2, borderRadius:4, display:'flex' },
  addBtn:{ padding:'8px 16px', background:'var(--accent)', color:'#080D1A', borderRadius:'var(--radius-sm)', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap', flexShrink:0 },
  filterBar:{ display:'flex', alignItems:'flex-end', gap:14, padding:'10px 20px', background:'var(--bg-2)', borderBottom:'1px solid var(--border)', flexShrink:0, flexWrap:'wrap' },
  filterGroup:{ display:'flex', flexDirection:'column', gap:5 },
  filterLabel:{ display:'flex', alignItems:'center', gap:4, fontSize:11, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.4px' },
  filterSelect:{ padding:'7px 10px', background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text-1)', fontSize:13, minWidth:160, fontFamily:'var(--font)' },
  filterDate:{ padding:'7px 10px', background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text-1)', fontSize:13, fontFamily:'var(--font)' },
  clearFiltersBtn:{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', background:'var(--danger-bg)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:8, color:'var(--danger)', fontSize:12, fontWeight:600, cursor:'pointer', marginBottom:0, alignSelf:'flex-end' },
  kanban:{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, padding:'12px 20px', flex:1, overflow:'hidden', alignItems:'start' },
  column:{ display:'flex', flexDirection:'column', background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden', maxHeight:'calc(100vh - 130px)', transition:'border-color 0.15s, box-shadow 0.15s' },
  columnDragOver:{ borderColor:'var(--accent)', boxShadow:`0 0 0 2px rgba(0,229,160,0.2)` },
  colHead:{ display:'flex', alignItems:'center', gap:8, padding:'11px 14px', borderBottom:'1px solid var(--border)', flexShrink:0 },
  colDot:{ width:8, height:8, borderRadius:'50%' },
  colTitle:{ fontSize:13, fontWeight:600, color:'var(--text-1)', flex:1 },
  colBadge:{ width:22, height:22, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700 },
  dropHint:{ margin:'8px 8px 0', padding:'8px 12px', background:'var(--accent-dim)', border:'1px dashed var(--accent-border)', borderRadius:8, fontSize:12, color:'var(--accent)', textAlign:'center', flexShrink:0 },
  cardList:{ padding:8, display:'flex', flexDirection:'column', gap:7, overflowY:'auto', flex:1 },
  emptyCol:{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'36px 20px', gap:10, opacity:0.5 },
  emptyTxt:{ fontSize:13, color:'var(--text-3)' },
  card:{ background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'11px 13px', display:'flex', flexDirection:'column', gap:6, transition:'border-color 0.15s, box-shadow 0.15s' },
  cardTop:{ display:'flex', alignItems:'center', justifyContent:'space-between' },
  cardId:{ fontFamily:'var(--mono)', fontSize:10, fontWeight:600, color:'var(--text-3)', letterSpacing:'0.5px' },
  pill:{ padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700 },
  cardName:{ fontSize:14, fontWeight:600, color:'var(--text-1)' },
  infoList:{ display:'flex', flexDirection:'column', gap:5 },
  cardFoot:{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:9, marginTop:3, borderTop:'1px solid var(--border)' },
  cardTime:{ fontSize:10, color:'var(--text-3)' },
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.72)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500, padding:'0 16px' },
  modal:{ width:'100%', maxWidth:460, background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:'var(--radius-lg)', boxShadow:'var(--shadow)', maxHeight:'90vh', overflowY:'auto', display:'flex', flexDirection:'column' },
  modalHead:{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 22px', borderBottom:'1px solid var(--border)', position:'sticky', top:0, background:'var(--bg-2)', zIndex:10 },
  modalTitle:{ fontSize:15, fontWeight:700, color:'var(--text-1)' },
  modalBody:{ padding:'18px 22px', display:'flex', flexDirection:'column', gap:14 },
  fieldLabel:{ fontSize:12, fontWeight:500, color:'var(--text-2)', marginBottom:8, display:'block' },
  dateInput:{ width:'100%', padding:'10px 12px', background:'var(--bg)', border:'1px solid var(--border-2)', borderRadius:'var(--radius-sm)', color:'var(--text-1)', fontSize:13, fontFamily:'var(--font)' },
  carGrid:{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:7 },
  carBtn:{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, padding:'10px 6px', borderRadius:9, cursor:'pointer', transition:'all 0.15s', minHeight:60 },
}
