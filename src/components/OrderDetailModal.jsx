import DatePicker from './DatePicker'
import { useState } from 'react'
import { X, Phone, MapPin, User, Clock, Camera, Edit2, Check, AlertCircle } from 'lucide-react'
import { updatePedido } from '../lib/supabase'
import { useOrders } from '../App'
import { STATUS_CONFIG, timeAgo } from '../lib/mockData'

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

const CAR_LABEL = (id) => {
  const p = CAR_POSITIONS.find(x => x.id === id)
  return p ? `${p.icon} ${p.label} · ${p.sub}` : id
}

const fmtDate = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

export default function OrderDetailModal({ order, onClose, allowCarEdit }) {
  const { updateOrder } = useOrders()
  const canEdit = order.status !== 'entregue'

  const [editing,  setEditing]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [imgOpen,  setImgOpen]  = useState(false)
  const [form, setForm] = useState({
    cliente_nome:      order.cliente_nome      || '',
    cliente_telefone:  order.cliente_telefone  || '',
    endereco:          order.endereco          || '',
    localizacao_carro: order.localizacao_carro || '',
    data_pedido:       order.data_pedido       || '',
  })

  if (!order) return null
  const cfg = STATUS_CONFIG[order.status]

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      cliente_nome:      form.cliente_nome.trim()      || null,
      cliente_telefone:  form.cliente_telefone.trim()  || null,
      endereco:          form.endereco.trim(),
      localizacao_carro: form.localizacao_carro        || null,
      data_pedido:       form.data_pedido              || null,
    }
    await updatePedido(order.id, payload)
    updateOrder(order.id, payload)
    setSaving(false)
    setEditing(false)
  }

  const saveCarPos = async (pos) => {
    if (!allowCarEdit || editing) return
    const newPos = pos === form.localizacao_carro ? '' : pos
    setForm(f => ({ ...f, localizacao_carro: newPos }))
    await updatePedido(order.id, { localizacao_carro: newPos || null })
    updateOrder(order.id, { localizacao_carro: newPos || null })
  }

  return (
    <>
      <div style={s.overlay} onClick={onClose}>
        <div style={s.modal} onClick={e => e.stopPropagation()} className="scale-in">

          {/* Header */}
          <div style={s.head}>
            <div style={s.headLeft}>
              <div style={{ ...s.statusDot, background: cfg.color }} />
              <span style={s.orderId}># {order.id}</span>
              <span style={{ ...s.pill, color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              {canEdit && !editing && (
                <button style={s.editBtn} onClick={() => setEditing(true)}>
                  <Edit2 size={13} /> Editar
                </button>
              )}
              {editing && (
                <button style={s.saveBtn} onClick={handleSave} disabled={saving}>
                  <Check size={13} /> {saving ? 'Salvando…' : 'Salvar'}
                </button>
              )}
              <button style={s.closeBtn} onClick={editing ? () => setEditing(false) : onClose}>
                <X size={16} />
              </button>
            </div>
          </div>

          <div style={s.body}>
            {/* Nome */}
            {editing ? (
              <div>
                <label style={s.lbl}>Nome do cliente</label>
                <EditInput value={form.cliente_nome} onChange={v => setForm(f => ({ ...f, cliente_nome: v }))} placeholder="Nome do cliente" icon={User} />
              </div>
            ) : (
              <div style={s.clientName}>
                {order.cliente_nome || <span style={{ color:'var(--text-3)', fontStyle:'italic', fontWeight:400 }}>Sem nome</span>}
              </div>
            )}

            {/* Campos de info / edição */}
            <div style={editing ? s.editGrid : s.infoSection}>
              {editing ? (
                <>
                  <div>
                    <label style={s.lbl}>Telefone</label>
                    <EditInput value={form.cliente_telefone} onChange={v => setForm(f => ({ ...f, cliente_telefone: v }))} placeholder="(85) 98765-4321" icon={Phone} />
                  </div>
                  <div>
                    <label style={s.lbl}>Endereço *</label>
                    <EditInput value={form.endereco} onChange={v => setForm(f => ({ ...f, endereco: v }))} placeholder="Endereço de entrega" icon={MapPin} />
                  </div>
                  <div>
                    <DatePicker
                      label="Data do pedido"
                      value={form.data_pedido}
                      onChange={v => setForm(f => ({ ...f, data_pedido: v }))}
                    />
                  </div>
                </>
              ) : (
                <>
                  {order.cliente_telefone && <InfoRow icon={Phone} label="Telefone"><a href={`tel:${order.cliente_telefone}`} style={{ color:'var(--accent)', textDecoration:'none', fontWeight:500 }}>{order.cliente_telefone}</a></InfoRow>}
                  <InfoRow icon={MapPin} label="Endereço"><span>{order.endereco}</span></InfoRow>
                  {order.entregador_nome && <InfoRow icon={User} label="Entregador"><span style={{ color:'var(--accent)' }}>{order.entregador_nome}</span></InfoRow>}
                  <InfoRow icon={Clock} label="Criado"><span>{fmtDate(order.criado_em)}</span></InfoRow>
                  {order.data_pedido && <InfoRow icon={Clock} label="Data pedido"><span>{new Date(order.data_pedido).toLocaleDateString('pt-BR')}</span></InfoRow>}
                  {order.data_entrega && <InfoRow icon={Check} label="Entregue em"><span style={{ color:'var(--delivered)' }}>{fmtDate(order.data_entrega)}</span></InfoRow>}
                </>
              )}
            </div>

            {/* Localização no carro */}
            <div style={s.section}>
              <div style={s.sectionTitle}>📦 Localização no carro</div>
              {(canEdit && (allowCarEdit || editing)) ? (
                <div style={s.carGrid}>
                  {CAR_POSITIONS.map(pos => (
                    <button key={pos.id} type="button"
                      style={{ ...s.carBtn, background: form.localizacao_carro === pos.id ? 'var(--accent-dim)' : 'var(--bg)', border:`1px solid ${form.localizacao_carro === pos.id ? 'var(--accent)' : 'var(--border)'}`, color: form.localizacao_carro === pos.id ? 'var(--accent)' : 'var(--text-3)' }}
                      onClick={() => {
                        const newPos = form.localizacao_carro === pos.id ? '' : pos.id
                        setForm(f => ({ ...f, localizacao_carro: newPos }))
                        if (!editing) saveCarPos(pos.id)
                      }}>
                      <span style={{ fontSize:18 }}>{pos.icon}</span>
                      <span style={{ fontSize:10, fontWeight:600, lineHeight:1.2, textAlign:'center' }}>{pos.label}<br/><span style={{ opacity:0.7 }}>{pos.sub}</span></span>
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize:13, color: form.localizacao_carro ? 'var(--accent)' : 'var(--text-3)', fontStyle: form.localizacao_carro ? 'normal' : 'italic' }}>
                  {form.localizacao_carro ? CAR_LABEL(form.localizacao_carro) : 'Não definida'}
                </div>
              )}
            </div>

            {/* Entrega confirmada */}
            {order.status === 'entregue' && (
              <div style={s.section}>
                <div style={s.sectionTitle}>✅ Confirmação de entrega</div>
                {order.recebido_por && (
                  <div style={s.receiverRow}>
                    <div style={s.receiverAvatar}>{order.recebido_por.slice(0,2).toUpperCase()}</div>
                    <div>
                      <div style={{ fontSize:11, color:'var(--text-3)' }}>Recebido por</div>
                      <div style={{ fontSize:14, fontWeight:700, color:'var(--text-1)' }}>{order.recebido_por}</div>
                    </div>
                  </div>
                )}
                {order.foto_entrega_url ? (
                  <div>
                    <div style={{ fontSize:12, color:'var(--text-3)', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}><Camera size={12} /> Foto da entrega</div>
                    <img src={order.foto_entrega_url} alt="Foto" onClick={() => setImgOpen(true)}
                      style={{ width:'100%', borderRadius:10, border:'1px solid var(--border)', objectFit:'cover', maxHeight:200, cursor:'zoom-in' }} />
                    <div style={{ fontSize:11, color:'var(--text-3)', marginTop:4, textAlign:'center' }}>Toque para ampliar</div>
                  </div>
                ) : (
                  <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:'var(--text-3)', fontStyle:'italic' }}>
                    <AlertCircle size={14} /> Foto não disponível
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {imgOpen && order.foto_entrega_url && (
        <div style={s.lightbox} onClick={() => setImgOpen(false)}>
          <img src={order.foto_entrega_url} alt="Entrega" style={s.lightboxImg} />
          <button style={s.lightboxClose} onClick={() => setImgOpen(false)}><X size={20} /></button>
        </div>
      )}
    </>
  )
}

function EditInput({ icon:Icon, value, onChange, placeholder }) {
  return (
    <div style={{ position:'relative' }}>
      <Icon size={13} color="var(--text-3)" style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width:'100%', padding:'9px 11px 9px 32px', background:'var(--bg)', border:'1px solid var(--border-2)', borderRadius:8, color:'var(--text-1)', fontSize:13, fontFamily:'var(--font)' }} />
    </div>
  )
}

function InfoRow({ icon:Icon, label, children }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'10px 14px', borderBottom:'1px solid var(--border)', gap:12 }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-3)', flexShrink:0, minWidth:90 }}>
        <Icon size={13} color="var(--text-3)" />{label}
      </div>
      <div style={{ fontSize:13, color:'var(--text-2)', textAlign:'right', flex:1 }}>{children}</div>
    </div>
  )
}

const s = {
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:400, padding:16 },
  modal:{ width:'100%', maxWidth:500, background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:'var(--radius-lg)', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'var(--shadow)' },
  head:{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 18px', borderBottom:'1px solid var(--border)', flexShrink:0 },
  headLeft:{ display:'flex', alignItems:'center', gap:10 },
  statusDot:{ width:9, height:9, borderRadius:'50%', flexShrink:0 },
  orderId:{ fontFamily:'var(--mono)', fontSize:13, fontWeight:700, color:'var(--text-1)' },
  pill:{ fontSize:11, fontWeight:700, padding:'2px 9px', borderRadius:20 },
  editBtn:{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', background:'var(--bg-3)', border:'1px solid var(--border-2)', borderRadius:7, color:'var(--text-2)', fontSize:12, fontWeight:600, cursor:'pointer' },
  saveBtn:{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', background:'var(--accent)', border:'none', borderRadius:7, color:'#080D1A', fontSize:12, fontWeight:700, cursor:'pointer' },
  closeBtn:{ padding:7, background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text-2)', display:'flex', alignItems:'center', cursor:'pointer' },
  body:{ overflowY:'auto', overflowX:'hidden', padding:'18px 18px 28px', display:'flex', flexDirection:'column', gap:18, flex:1 },
  clientName:{ fontSize:20, fontWeight:900, color:'var(--text-1)', letterSpacing:'-0.4px' },
  lbl:{ fontSize:11, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.4px', display:'block', marginBottom:6 },
  editGrid:{ display:'flex', flexDirection:'column', gap:12 },
  infoSection:{ background:'var(--bg-3)', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden' },
  dateInput:{ width:'100%', padding:'9px 12px', background:'var(--bg)', border:'1px solid var(--border-2)', borderRadius:8, color:'var(--text-1)', fontSize:13, fontFamily:'var(--font)' },
  section:{ display:'flex', flexDirection:'column', gap:12 },
  sectionTitle:{ fontSize:13, fontWeight:700, color:'var(--text-2)' },
  carGrid:{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:7 },
  carBtn:{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, padding:'10px 6px', borderRadius:9, cursor:'pointer', transition:'all 0.15s', minHeight:60 },
  receiverRow:{ display:'flex', alignItems:'center', gap:12, background:'var(--delivered-bg)', border:'1px solid rgba(52,211,153,0.2)', borderRadius:10, padding:'12px 14px' },
  receiverAvatar:{ width:38, height:38, borderRadius:10, background:'var(--delivered)', color:'#080D1A', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, flexShrink:0 },
  lightbox:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:600, cursor:'zoom-out', padding:20 },
  lightboxImg:{ maxWidth:'100%', maxHeight:'90vh', borderRadius:12, objectFit:'contain' },
  lightboxClose:{ position:'absolute', top:20, right:20, padding:10, background:'rgba(255,255,255,0.1)', border:'none', borderRadius:10, color:'#fff', display:'flex', alignItems:'center', cursor:'pointer' },
}
