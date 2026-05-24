import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOrders, useAuth } from '../App'
import { updatePedido, createEntrega, uploadFoto, uploadAssinatura } from '../lib/supabase'
import { ArrowLeft, Camera, Pen, CheckCircle, RotateCcw, Package } from 'lucide-react'

export default function DeliveryConfirm() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const { orders, updateOrder } = useOrders()
  const { user } = useAuth()
  const order = orders.find(o => o.id === orderId)

  const [step,       setStep]       = useState('photo')
  const [photo,      setPhoto]      = useState(null)
  const [photoFile,  setPhotoFile]  = useState(null)
  const [signed,     setSigned]     = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const canvasRef = useRef(null)
  const isDrawing = useRef(false)
  const lastPos   = useRef(null)

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    canvas.width  = rect.width  * window.devicePixelRatio
    canvas.height = rect.height * window.devicePixelRatio
    const ctx = canvas.getContext('2d')
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    ctx.strokeStyle = '#00E5A0'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  }, [])

  useEffect(() => { if (step === 'signature') setTimeout(setupCanvas, 50) }, [step, setupCanvas])

  const getXY = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const src  = e.touches ? e.touches[0] : e
    return { x: src.clientX - rect.left, y: src.clientY - rect.top }
  }
  const onStart = (e) => { e.preventDefault(); isDrawing.current = true; lastPos.current = getXY(e) }
  const onMove  = (e) => {
    e.preventDefault()
    if (!isDrawing.current) return
    const ctx = canvasRef.current.getContext('2d')
    const pos = getXY(e)
    ctx.beginPath(); ctx.moveTo(lastPos.current.x, lastPos.current.y); ctx.lineTo(pos.x, pos.y); ctx.stroke()
    lastPos.current = pos; setSigned(true)
  }
  const onEnd = () => { isDrawing.current = false }
  const clearSig = () => { setupCanvas(); setSigned(false) }

  const handlePhoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPhotoFile(file)
    setPhoto(URL.createObjectURL(file))
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      let foto_url = null, assinatura_url = null

      if (photoFile) {
        foto_url = await uploadFoto(orderId, photoFile)
      }

      const sigBlob = await new Promise(r => canvasRef.current?.toBlob(r, 'image/png'))
      if (sigBlob) {
        assinatura_url = await uploadAssinatura(orderId, sigBlob)
      }

      await createEntrega({ pedido_id: orderId, entregador_id: user.id, foto_url, assinatura_url })
      await updatePedido(orderId, { status: 'entregue' })
      updateOrder(orderId, { status: 'entregue' })
      setStep('done')
    } catch (err) {
      console.error(err)
      // Fallback: atualiza sem upload
      await updatePedido(orderId, { status: 'entregue' })
      updateOrder(orderId, { status: 'entregue' })
      setStep('done')
    }
    setSubmitting(false)
  }

  if (!order) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)' }}>
      Pedido não encontrado.
    </div>
  )

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => step === 'signature' ? setStep('photo') : navigate(`/map/${orderId}`)}>
          <ArrowLeft size={17} />
        </button>
        <div style={{ flex:1 }}>
          <div style={s.headerTitle}>Confirmar entrega</div>
          <div style={s.headerSub}># {orderId} · {order.cliente_nome}</div>
        </div>
        <div style={s.progress}>
          <div style={{ ...s.dot, background:'var(--accent)' }} />
          <div style={{ ...s.line, background: step !== 'photo' ? 'var(--accent)' : 'var(--border-2)' }} />
          <div style={{ ...s.dot, background: step !== 'photo' ? 'var(--accent)' : 'var(--border-2)' }} />
        </div>
      </header>

      <div style={s.content}>
        {step === 'photo' && (
          <div className="fade-up">
            <SectionHead icon={Camera} title="Foto da entrega" desc="Fotografe a entrega para registrar a comprovação." />
            <label style={s.photoArea}>
              {photo
                ? <img src={photo} alt="Foto" style={s.photoImg} />
                : <div style={s.photoPlaceholder}>
                    <div style={s.photoIconWrap}><Camera size={34} color="var(--text-3)" /></div>
                    <span style={s.photoLabel}>Toque para fotografar</span>
                    <span style={s.photoSub}>ou escolher da galeria</span>
                  </div>
              }
              <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display:'none' }} />
            </label>
            {photo && <button style={s.retakeBtn} onClick={() => { setPhoto(null); setPhotoFile(null) }}><RotateCcw size={13} /> Tirar nova foto</button>}
            <button style={{ ...s.primaryBtn, opacity: photo ? 1 : 0.38, marginTop:24 }} disabled={!photo} onClick={() => setStep('signature')}>
              Próximo — Assinatura →
            </button>
          </div>
        )}

        {step === 'signature' && (
          <div className="fade-up">
            <SectionHead icon={Pen} title="Assinatura do cliente" desc="Peça ao cliente para assinar abaixo confirmando o recebimento." />
            <div style={s.canvasWrap}>
              <canvas ref={canvasRef} style={s.canvas}
                onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
                onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} />
              {!signed && <div style={s.canvasHint}><Pen size={22} color="var(--text-3)" /><span style={s.hintTxt}>Assine aqui</span></div>}
            </div>
            <button style={s.retakeBtn} onClick={clearSig}><RotateCcw size={13} /> Limpar assinatura</button>
            <button style={{ ...s.primaryBtn, opacity: signed && !submitting ? 1 : 0.38, marginTop:24 }} disabled={!signed || submitting} onClick={handleSubmit}>
              {submitting ? 'Confirmando…' : <><CheckCircle size={17} /> Confirmar entrega</>}
            </button>
          </div>
        )}

        {step === 'done' && (
          <div style={s.done} className="scale-in">
            <div style={s.doneRing}><CheckCircle size={52} color="var(--delivered)" strokeWidth={1.5} /></div>
            <div style={s.doneTitle}>Entrega confirmada!</div>
            <div style={s.doneSub}>
              O pedido <strong style={{ color:'var(--text-1)', fontFamily:'var(--mono)' }}>#{orderId}</strong> foi marcado como{' '}
              <span style={{ color:'var(--delivered)', fontWeight:600 }}>Entregue</span> e o kanban foi atualizado em tempo real.
            </div>
            <div style={s.doneCard}>
              <Package size={16} color="var(--text-3)" />
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--text-1)' }}>{order.cliente_nome}</div>
                <div style={{ fontSize:12, color:'var(--text-3)', marginTop:2 }}>{order.endereco}</div>
              </div>
            </div>
            <button style={{ ...s.primaryBtn, marginTop:8 }} onClick={() => navigate('/courier')}>Voltar ao painel</button>
          </div>
        )}
      </div>
    </div>
  )
}

function SectionHead({ icon:Icon, title, desc }) {
  return (
    <div style={{ marginBottom:22 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
        <div style={{ width:36, height:36, borderRadius:10, background:'var(--accent-dim)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Icon size={17} color="var(--accent)" />
        </div>
        <span style={{ fontSize:17, fontWeight:800, color:'var(--text-1)', letterSpacing:'-0.3px' }}>{title}</span>
      </div>
      <p style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.65, paddingLeft:4 }}>{desc}</p>
    </div>
  )
}

const s = {
  page:{ height:'100vh', display:'flex', flexDirection:'column', background:'var(--bg)', overflow:'hidden' },
  header:{ display:'flex', alignItems:'center', gap:14, padding:'0 16px', height:58, flexShrink:0, background:'var(--bg-2)', borderBottom:'1px solid var(--border)' },
  backBtn:{ padding:8, background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:9, color:'var(--text-1)', display:'flex', alignItems:'center', flexShrink:0 },
  headerTitle:{ fontSize:14, fontWeight:700, color:'var(--text-1)' },
  headerSub:{ fontSize:11, color:'var(--text-3)', marginTop:1, fontFamily:'var(--mono)' },
  progress:{ display:'flex', alignItems:'center', gap:5, flexShrink:0 },
  dot:{ width:9, height:9, borderRadius:'50%', transition:'background 0.3s' },
  line:{ width:26, height:2, borderRadius:1, transition:'background 0.3s' },
  content:{ flex:1, overflowY:'auto', padding:'24px 18px', maxWidth:500, width:'100%', margin:'0 auto' },
  photoArea:{ display:'flex', width:'100%', height:260, background:'var(--bg-2)', border:'2px dashed var(--border-2)', borderRadius:'var(--radius)', cursor:'pointer', overflow:'hidden', alignItems:'center', justifyContent:'center' },
  photoImg:{ width:'100%', height:'100%', objectFit:'cover' },
  photoPlaceholder:{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 },
  photoIconWrap:{ width:64, height:64, borderRadius:'50%', background:'var(--bg-3)', display:'flex', alignItems:'center', justifyContent:'center' },
  photoLabel:{ fontSize:15, fontWeight:600, color:'var(--text-2)' },
  photoSub:{ fontSize:12, color:'var(--text-3)' },
  retakeBtn:{ display:'flex', alignItems:'center', gap:7, background:'transparent', color:'var(--text-3)', fontSize:13, padding:'8px 0', marginTop:10, border:'none' },
  canvasWrap:{ position:'relative', background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:'var(--radius)', overflow:'hidden' },
  canvas:{ display:'block', width:'100%', height:220, touchAction:'none', cursor:'crosshair' },
  canvasHint:{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, pointerEvents:'none', opacity:0.5 },
  hintTxt:{ fontSize:14, color:'var(--text-3)' },
  primaryBtn:{ display:'flex', alignItems:'center', justifyContent:'center', gap:9, width:'100%', padding:'15px 20px', background:'var(--accent)', color:'#080D1A', borderRadius:'var(--radius-sm)', fontSize:15, fontWeight:800 },
  done:{ display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', paddingTop:40, gap:18 },
  doneRing:{ width:96, height:96, borderRadius:'50%', background:'var(--delivered-bg)', border:'1px solid rgba(52,211,153,0.25)', display:'flex', alignItems:'center', justifyContent:'center' },
  doneTitle:{ fontSize:26, fontWeight:900, color:'var(--text-1)', letterSpacing:'-0.5px' },
  doneSub:{ fontSize:14, color:'var(--text-2)', lineHeight:1.75, maxWidth:300 },
  doneCard:{ display:'flex', alignItems:'flex-start', gap:12, textAlign:'left', background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'14px 16px', width:'100%', maxWidth:320 },
}
