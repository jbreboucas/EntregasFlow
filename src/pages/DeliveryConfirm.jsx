import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOrders, useAuth } from '../App'
import { updatePedido, createEntrega, prepararFoto } from '../lib/supabase'
import { ArrowLeft, Camera, User, CheckCircle, RotateCcw } from 'lucide-react'

// Comprime a imagem para no máximo 900px e retorna um Blob JPEG
const compressImage = (file, maxW = 900) =>
  new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const ratio  = Math.min(1, maxW / img.width)
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * ratio)
      canvas.height = Math.round(img.height * ratio)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', 0.78)
    }
    img.onerror = () => resolve(file)
    img.src = URL.createObjectURL(file)
  })

export default function DeliveryConfirm() {
  const { orderId } = useParams()
  const navigate    = useNavigate()
  const { orders, updateOrder } = useOrders()
  const { user }    = useAuth()
  const order       = orders.find(o => o.id === orderId)

  const [step,        setStep]        = useState('photo')
  const [preview,     setPreview]     = useState(null)   // URL para exibição
  const [photoFile,   setPhotoFile]   = useState(null)   // File original
  const [recebidoPor, setRecebidoPor] = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [statusMsg,   setStatusMsg]   = useState('')
  const [error,       setError]       = useState('')

  const handlePhoto = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async () => {
    if (!recebidoPor.trim()) { setError('Informe o nome de quem recebeu.'); return }
    setSubmitting(true); setError('')

    let foto_base64 = null
    try {
      setStatusMsg('Comprimindo foto…')
      const compressed = await compressImage(photoFile)
      setStatusMsg('Preparando foto…')
      foto_base64 = await prepararFoto(compressed)
      setStatusMsg('Salvando…')
    } catch (err) {
      console.warn('Erro ao processar foto:', err)
      foto_base64 = null
    }

    try {
      const recebido = recebidoPor.trim()
      const updates  = { status: 'entregue', recebido_por: recebido, foto_entrega_url: foto_base64 }

      await Promise.all([
        updatePedido(orderId, updates),
        createEntrega({ pedido_id: orderId, entregador_id: user.id, foto_url: foto_base64, recebido_por: recebido }),
      ])

      updateOrder(orderId, updates)
      setStep('done')
    } catch (err) {
      console.error('Erro ao confirmar:', err)
      setError('Erro ao confirmar entrega. Tente novamente.')
    }
    setStatusMsg(''); setSubmitting(false)
  }

  if (!order) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)' }}>
      Pedido não encontrado.
    </div>
  )

  const stepIdx = { photo:0, recipient:1, done:2 }[step]

  return (
    <div style={s.page}>
      {/* Header */}
      <header style={s.header}>
        <button style={s.backBtn}
          onClick={() => step === 'recipient' ? setStep('photo') : navigate(`/map/single/${orderId}`)}>
          <ArrowLeft size={17} />
        </button>
        <div style={{ flex:1 }}>
          <div style={s.headerTitle}>Confirmar entrega</div>
          <div style={s.headerSub}># {orderId}{order.cliente_nome ? ` · ${order.cliente_nome}` : ''}</div>
        </div>
        {step !== 'done' && (
          <div style={s.progress}>
            {[0,1].map(i => (
              <div key={i} style={{ ...s.progressSeg, background: i <= stepIdx ? 'var(--accent)' : 'var(--border-2)' }} />
            ))}
          </div>
        )}
      </header>

      <div style={s.content}>

        {/* ─── Etapa 1: Foto ─── */}
        {step === 'photo' && (
          <div className="fade-up">
            <SectionHead icon={Camera} title="Foto da entrega"
              desc="Fotografe a encomenda ou o local da entrega como comprovante." />

            <label style={s.photoArea}>
              {preview
                ? <img src={preview} alt="Comprovante" style={s.photoImg} />
                : <div style={s.photoPlaceholder}>
                    <div style={s.photoIconWrap}><Camera size={34} color="var(--text-3)" /></div>
                    <span style={s.photoLabel}>Toque para fotografar</span>
                    <span style={s.photoSub}>ou escolher da galeria</span>
                  </div>
              }
              <input type="file" accept="image/*" capture="environment"
                onChange={handlePhoto} style={{ display:'none' }} />
            </label>

            {preview && (
              <button style={s.retakeBtn} onClick={() => { setPreview(null); setPhotoFile(null) }}>
                <RotateCcw size={13} /> Tirar outra foto
              </button>
            )}

            <button style={{ ...s.primaryBtn, marginTop:24, opacity: preview ? 1 : 0.35 }}
              disabled={!preview} onClick={() => setStep('recipient')}>
              Próximo →
            </button>
          </div>
        )}

        {/* ─── Etapa 2: Quem recebeu ─── */}
        {step === 'recipient' && (
          <div className="fade-up">
            <SectionHead icon={User} title="Quem recebeu?"
              desc="Digite o nome de quem assinou o recebimento." />

            {preview && (
              <div style={s.thumbWrap}>
                <img src={preview} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                <div style={s.thumbBadge}>📸 Foto pronta</div>
              </div>
            )}

            <div style={s.recipientField}>
              <div style={s.recipientIcon}><User size={20} color="var(--accent)" /></div>
              <input style={s.recipientInput}
                placeholder="Nome completo"
                value={recebidoPor}
                autoFocus
                onChange={e => { setRecebidoPor(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && !submitting && handleSubmit()} />
            </div>

            {error && <div style={s.errorBox}>{error}</div>}

            <button style={{ ...s.primaryBtn, marginTop:24, opacity: submitting ? 0.7 : 1 }}
              disabled={submitting} onClick={handleSubmit}>
              {submitting
                ? <>{statusMsg || 'Confirmando…'}</>
                : <><CheckCircle size={17} /> Confirmar entrega</>}
            </button>
          </div>
        )}

        {/* ─── Etapa 3: Sucesso ─── */}
        {step === 'done' && (
          <div style={s.done} className="scale-in">
            <div style={s.doneRing}><CheckCircle size={52} color="var(--delivered)" strokeWidth={1.5} /></div>
            <div style={s.doneTitle}>Entrega confirmada!</div>
            <div style={s.doneSub}>
              Pedido <strong style={{ color:'var(--text-1)', fontFamily:'var(--mono)' }}>#{orderId}</strong> marcado
              como <span style={{ color:'var(--delivered)', fontWeight:600 }}>Entregue</span>.
            </div>

            {recebidoPor && (
              <div style={s.receiverCard}>
                <div style={s.receiverAvatar}>{recebidoPor.slice(0,2).toUpperCase()}</div>
                <div>
                  <div style={{ fontSize:11, color:'var(--text-3)', marginBottom:2 }}>Recebido por</div>
                  <div style={{ fontSize:15, fontWeight:700, color:'var(--text-1)' }}>{recebidoPor}</div>
                </div>
              </div>
            )}

            {preview && (
              <img src={preview} alt="Comprovante"
                style={{ width:'100%', maxWidth:300, borderRadius:10, border:'1px solid var(--border)', objectFit:'cover', maxHeight:180 }} />
            )}

            <button style={{ ...s.primaryBtn, marginTop:8 }} onClick={() => navigate('/courier')}>
              Voltar ao painel
            </button>
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
      <p style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.65 }}>{desc}</p>
    </div>
  )
}

const s = {
  page:{ height:'100vh', display:'flex', flexDirection:'column', background:'var(--bg)', overflow:'hidden' },
  header:{ display:'flex', alignItems:'center', gap:14, padding:'0 16px', height:58, flexShrink:0, background:'var(--bg-2)', borderBottom:'1px solid var(--border)' },
  backBtn:{ padding:8, background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:9, color:'var(--text-1)', display:'flex', alignItems:'center', flexShrink:0 },
  headerTitle:{ fontSize:14, fontWeight:700, color:'var(--text-1)' },
  headerSub:{ fontSize:11, color:'var(--text-3)', marginTop:1, fontFamily:'var(--mono)' },
  progress:{ display:'flex', gap:4, flexShrink:0 },
  progressSeg:{ width:26, height:3, borderRadius:2, transition:'background 0.3s' },
  content:{ flex:1, overflowY:'auto', padding:'24px 18px', maxWidth:500, width:'100%', margin:'0 auto' },
  photoArea:{ display:'flex', width:'100%', height:240, background:'var(--bg-2)', border:'2px dashed var(--border-2)', borderRadius:'var(--radius)', overflow:'hidden', alignItems:'center', justifyContent:'center', cursor:'pointer' },
  photoImg:{ width:'100%', height:'100%', objectFit:'cover' },
  photoPlaceholder:{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 },
  photoIconWrap:{ width:64, height:64, borderRadius:'50%', background:'var(--bg-3)', display:'flex', alignItems:'center', justifyContent:'center' },
  photoLabel:{ fontSize:15, fontWeight:600, color:'var(--text-2)' },
  photoSub:{ fontSize:12, color:'var(--text-3)' },
  retakeBtn:{ display:'flex', alignItems:'center', gap:7, background:'transparent', color:'var(--text-3)', fontSize:13, padding:'8px 0', marginTop:10, border:'none', cursor:'pointer' },
  thumbWrap:{ position:'relative', width:'100%', height:100, borderRadius:10, overflow:'hidden', marginBottom:20, border:'1px solid var(--border)' },
  thumbBadge:{ position:'absolute', bottom:8, right:8, background:'rgba(0,0,0,0.65)', color:'var(--delivered)', fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:20 },
  recipientField:{ display:'flex', alignItems:'center', background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:'var(--radius)', overflow:'hidden' },
  recipientIcon:{ width:52, height:56, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--accent-dim)', flexShrink:0, borderRight:'1px solid var(--accent-border)' },
  recipientInput:{ flex:1, padding:'16px', background:'transparent', border:'none', color:'var(--text-1)', fontSize:15, fontFamily:'var(--font)', outline:'none' },
  errorBox:{ marginTop:10, padding:'10px 14px', borderRadius:'var(--radius-sm)', background:'var(--danger-bg)', border:'1px solid rgba(248,113,113,0.2)', color:'var(--danger)', fontSize:13 },
  primaryBtn:{ display:'flex', alignItems:'center', justifyContent:'center', gap:9, width:'100%', padding:'15px 20px', background:'var(--accent)', color:'#080D1A', borderRadius:'var(--radius-sm)', fontSize:15, fontWeight:800, transition:'opacity 0.2s' },
  done:{ display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', paddingTop:32, gap:18 },
  doneRing:{ width:96, height:96, borderRadius:'50%', background:'var(--delivered-bg)', border:'1px solid rgba(52,211,153,0.25)', display:'flex', alignItems:'center', justifyContent:'center' },
  doneTitle:{ fontSize:26, fontWeight:900, color:'var(--text-1)', letterSpacing:'-0.5px' },
  doneSub:{ fontSize:14, color:'var(--text-2)', lineHeight:1.75, maxWidth:300 },
  receiverCard:{ display:'flex', alignItems:'center', gap:14, background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'14px 18px', width:'100%', maxWidth:300, textAlign:'left' },
  receiverAvatar:{ width:38, height:38, borderRadius:10, background:'var(--delivered)', color:'#080D1A', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, flexShrink:0 },
}
