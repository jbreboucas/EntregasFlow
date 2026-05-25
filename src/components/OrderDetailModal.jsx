import { useState } from 'react'
import { X, Phone, MapPin, User, Package, Clock, Truck, CheckCircle, Camera } from 'lucide-react'
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

const STATUS_ICON = { pendente: Clock, em_rota: Truck, entregue: CheckCircle }

export default function OrderDetailModal({ order, onClose, allowCarEdit }) {
  const { updateOrder } = useOrders()
  const [carPos,   setCarPos]   = useState(order.localizacao_carro || '')
  const [saving,   setSaving]   = useState(false)
  const [imgOpen,  setImgOpen]  = useState(false)

  if (!order) return null
  const cfg      = STATUS_CONFIG[order.status]
  const StatusIcon = STATUS_ICON[order.status] || Package

  const saveCarPos = async (pos) => {
    const newPos = pos === carPos ? '' : pos
    setCarPos(newPos)
    setSaving(true)
    await updatePedido(order.id, { localizacao_carro: newPos || null })
    updateOrder(order.id, { localizacao_carro: newPos || null })
    setSaving(false)
  }

  return (
    <>
      <div style={s.overlay} onClick={onClose}>
        <div style={s.modal} onClick={e => e.stopPropagation()} className="scale-in">

          {/* Header */}
          <div style={s.head}>
            <div style={s.headLeft}>
              <div style={{ ...s.statusDot, background: cfg.color }} />
              <div>
                <span style={s.orderId}># {order.id}</span>
                <span style={{ ...s.statusPill, color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
              </div>
            </div>
            <button style={s.closeBtn} onClick={onClose}><X size={16} /></button>
          </div>

          <div style={s.body}>
            {/* Nome cliente */}
            <div style={s.clientName}>
              {order.cliente_nome || <span style={{ color:'var(--text-3)', fontWeight:400, fontStyle:'italic' }}>Cliente não informado</span>}
            </div>

            {/* Infos */}
            <div style={s.infoSection}>
              {order.cliente_telefone && (
                <InfoRow icon={Phone} label="Telefone">
                  <a href={`tel:${order.cliente_telefone}`} style={{ color:'var(--accent)', textDecoration:'none', fontWeight:500 }}>
                    {order.cliente_telefone}
                  </a>
                </InfoRow>
              )}
              <InfoRow icon={MapPin} label="Endereço">
                <span>{order.endereco}</span>
              </InfoRow>
              {order.entregador_nome && (
                <InfoRow icon={User} label="Entregador">
                  <span style={{ color:'var(--accent)' }}>{order.entregador_nome}</span>
                </InfoRow>
              )}
              <InfoRow icon={Clock} label="Criado">
                <span>{timeAgo(order.criado_em)}</span>
              </InfoRow>
            </div>

            {/* Localização no carro */}
            <div style={s.section}>
              <div style={s.sectionTitle}>
                📦 Localização no carro
                {saving && <span style={{ fontSize:11, color:'var(--text-3)', marginLeft:8 }}>Salvando…</span>}
                {!allowCarEdit && carPos && <span style={{ ...s.carTag }}>{CAR_LABEL(carPos)}</span>}
              </div>

              {allowCarEdit ? (
                <div style={s.carGrid}>
                  {CAR_POSITIONS.map(pos => (
                    <button key={pos.id} type="button"
                      style={{ ...s.carBtn, background: carPos === pos.id ? 'var(--accent-dim)' : 'var(--bg)', border:`1px solid ${carPos === pos.id ? 'var(--accent)' : 'var(--border)'}`, color: carPos === pos.id ? 'var(--accent)' : 'var(--text-3)' }}
                      onClick={() => saveCarPos(pos.id)}>
                      <span style={{ fontSize:18 }}>{pos.icon}</span>
                      <span style={{ fontSize:10, fontWeight:600, lineHeight:1.2, textAlign:'center' }}>
                        {pos.label}<br/><span style={{ opacity:0.7 }}>{pos.sub}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : !carPos ? (
                <div style={{ fontSize:13, color:'var(--text-3)', fontStyle:'italic', padding:'4px 0' }}>Não definida</div>
              ) : null}
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
                    <div style={{ fontSize:12, color:'var(--text-3)', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                      <Camera size={12} /> Foto da entrega
                    </div>
                    <img
                      src={order.foto_entrega_url}
                      alt="Foto da entrega"
                      onClick={() => setImgOpen(true)}
                      style={{ width:'100%', borderRadius:10, border:'1px solid var(--border)', objectFit:'cover', maxHeight:200, cursor:'zoom-in' }}
                    />
                    <div style={{ fontSize:11, color:'var(--text-3)', marginTop:4, textAlign:'center' }}>Toque para ampliar</div>
                  </div>
                ) : (
                  <div style={{ fontSize:13, color:'var(--text-3)', fontStyle:'italic' }}>Foto não disponível</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox da foto */}
      {imgOpen && order.foto_entrega_url && (
        <div style={s.lightbox} onClick={() => setImgOpen(false)}>
          <img src={order.foto_entrega_url} alt="Entrega" style={s.lightboxImg} />
          <button style={s.lightboxClose} onClick={() => setImgOpen(false)}><X size={20} /></button>
        </div>
      )}
    </>
  )
}

function InfoRow({ icon:Icon, label, children }) {
  return (
    <div style={s.infoRow}>
      <div style={s.infoLabel}>
        <Icon size={13} color="var(--text-3)" />
        <span>{label}</span>
      </div>
      <div style={s.infoValue}>{children}</div>
    </div>
  )
}

const s = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:400, padding:'16px' },
  modal: { width:'100%', maxWidth:500, background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:'var(--radius-lg)', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'var(--shadow)' },
  head: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px 14px', borderBottom:'1px solid var(--border)', flexShrink:0 },
  headLeft: { display:'flex', alignItems:'center', gap:10 },
  statusDot: { width:10, height:10, borderRadius:'50%', flexShrink:0 },
  orderId: { fontFamily:'var(--mono)', fontSize:13, fontWeight:700, color:'var(--text-1)', marginRight:8 },
  statusPill: { fontSize:11, fontWeight:700, padding:'2px 9px', borderRadius:20 },
  closeBtn: { padding:7, background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text-2)', display:'flex', alignItems:'center' },
  body: { overflowY:'auto', overflowX:'hidden', padding:'18px 20px 32px', display:'flex', flexDirection:'column', gap:20, flex:1 },
  clientName: { fontSize:20, fontWeight:900, color:'var(--text-1)', letterSpacing:'-0.4px' },
  infoSection: { display:'flex', flexDirection:'column', gap:0, background:'var(--bg-3)', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden' },
  infoRow: { display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'11px 14px', borderBottom:'1px solid var(--border)', gap:12 },
  infoLabel: { display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-3)', flexShrink:0, minWidth:80 },
  infoValue: { fontSize:13, color:'var(--text-2)', textAlign:'right', flex:1 },
  section: { display:'flex', flexDirection:'column', gap:12 },
  sectionTitle: { fontSize:13, fontWeight:700, color:'var(--text-2)', display:'flex', alignItems:'center', gap:8 },
  carTag: { fontSize:12, color:'var(--accent)', background:'var(--accent-dim)', border:'1px solid var(--accent-border)', borderRadius:6, padding:'2px 9px', fontWeight:600 },
  carGrid: { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:7 },
  carBtn: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, padding:'10px 6px', borderRadius:9, cursor:'pointer', transition:'all 0.15s', minHeight:60 },
  receiverRow: { display:'flex', alignItems:'center', gap:12, background:'var(--delivered-bg)', border:'1px solid rgba(52,211,153,0.2)', borderRadius:10, padding:'12px 14px' },
  receiverAvatar: { width:38, height:38, borderRadius:10, background:'var(--delivered)', color:'#080D1A', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, flexShrink:0 },
  lightbox: { position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:600, cursor:'zoom-out', padding:20 },
  lightboxImg: { maxWidth:'100%', maxHeight:'90vh', borderRadius:12, objectFit:'contain' },
  lightboxClose: { position:'absolute', top:20, right:20, padding:10, background:'rgba(255,255,255,0.1)', border:'none', borderRadius:10, color:'#fff', display:'flex', alignItems:'center', cursor:'pointer' },
}
