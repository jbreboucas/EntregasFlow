import { useRef, useState } from 'react'
import { Download, Share2, Loader } from 'lucide-react'

// Gera o recibo como PNG via Canvas API
const generateReceiptCanvas = async ({ order, recebidoPor, fotoBase64, courierName }) => {
  const W = 800, PAD = 44
  const ACCENT  = '#00E5A0'
  const BG      = '#0F1629'
  const BG2     = '#162040'
  const BORDER  = '#1E2D52'
  const WHITE   = '#F1F5F9'
  const GRAY    = '#94A3B8'
  const GRAY2   = '#475569'
  const GREEN   = '#34D399'

  // Carrega a foto se existir
  let fotoImg = null
  if (fotoBase64) {
    fotoImg = await new Promise(res => {
      const img = new Image()
      img.onload  = () => res(img)
      img.onerror = () => res(null)
      img.src = fotoBase64
    })
  }

  // Calcula altura dinâmica
  const fotoH     = fotoImg ? Math.round(fotoImg.height * (W - PAD*2) / fotoImg.width) : 0
  const fotoBlock = fotoImg ? Math.min(fotoH, 340) + 24 + 20 : 0
  const H = 320 + fotoBlock + 20

  const canvas = document.createElement('canvas')
  canvas.width  = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // ── Fundo ───────────────────────────────────────────────────────────────────
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)

  // Barra superior accent
  ctx.fillStyle = ACCENT
  ctx.fillRect(0, 0, W, 6)

  // ── Header ─────────────────────────────────────────────────────────────────
  const bold = (size) => `bold ${size}px 'Arial', sans-serif`
  const reg  = (size) => `${size}px 'Arial', sans-serif`

  // Logo / empresa
  ctx.fillStyle = ACCENT
  ctx.font = bold(22)
  ctx.fillText('BRLAB.ENTREGAS', PAD, 50)

  ctx.fillStyle = GRAY
  ctx.font = reg(13)
  ctx.fillText('Recibo de Entrega', PAD, 72)

  // Data/hora no canto direito
  const now = new Date().toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
  ctx.fillStyle = GRAY2
  ctx.font = reg(12)
  ctx.textAlign = 'right'
  ctx.fillText(now, W - PAD, 50)
  ctx.textAlign = 'left'

  // Linha separadora
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PAD, 88); ctx.lineTo(W - PAD, 88); ctx.stroke()

  // ── Corpo ──────────────────────────────────────────────────────────────────
  let y = 116

  // ID do pedido + badge
  ctx.fillStyle = ACCENT
  ctx.fillRect(PAD, y - 18, 110, 26)
  roundRect(ctx, PAD, y - 18, 110, 26, 6)
  ctx.fillStyle = '#080D1A'
  ctx.font = bold(13)
  ctx.fillText(`# ${order.id}`, PAD + 12, y)
  y += 8

  // Badge ENTREGUE
  ctx.fillStyle = '#0D2B1E'
  roundRect(ctx, PAD + 120, y - 24, 90, 26, 6)
  ctx.fillStyle = GREEN
  ctx.font = bold(12)
  ctx.fillText('✓  ENTREGUE', PAD + 132, y - 6)
  y += 20

  // Nome do cliente
  ctx.fillStyle = WHITE
  ctx.font = bold(26)
  ctx.fillText(order.cliente_nome || 'Cliente', PAD, y + 26)
  y += 48

  // Endereço
  ctx.fillStyle = GRAY
  ctx.font = reg(14)
  const endWrap = wrapText(ctx, order.endereco || '', W - PAD*2 - 20)
  endWrap.forEach(line => { ctx.fillText('📍  ' + line, PAD, y); y += 22 })

  // Telefone
  if (order.cliente_telefone) {
    ctx.fillStyle = GRAY
    ctx.font = reg(14)
    ctx.fillText('📞  ' + order.cliente_telefone, PAD, y)
    y += 24
  }

  y += 10
  ctx.strokeStyle = BORDER
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke()
  y += 18

  // Recebido por
  ctx.fillStyle = GRAY2
  ctx.font = reg(12)
  ctx.fillText('RECEBIDO POR', PAD, y)
  y += 20
  ctx.fillStyle = GREEN
  ctx.font = bold(20)
  ctx.fillText(recebidoPor, PAD, y)
  y += 30

  // Entregador
  ctx.fillStyle = GRAY2
  ctx.font = reg(12)
  ctx.fillText('ENTREGADOR', PAD + 280, y - 50)
  ctx.fillStyle = WHITE
  ctx.font = bold(15)
  ctx.fillText(courierName || '—', PAD + 280, y - 30)

  y += 6
  ctx.strokeStyle = BORDER
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke()
  y += 20

  // ── Foto ───────────────────────────────────────────────────────────────────
  if (fotoImg) {
    ctx.fillStyle = GRAY2
    ctx.font = reg(12)
    ctx.fillText('FOTO DO COMPROVANTE', PAD, y)
    y += 16

    const dispW = W - PAD * 2
    const dispH = Math.min(Math.round(fotoImg.height * dispW / fotoImg.width), 340)

    // Moldura arredondada
    ctx.save()
    roundClip(ctx, PAD, y, dispW, dispH, 10)
    ctx.drawImage(fotoImg, PAD, y, dispW, dispH)
    ctx.restore()

    // Borda
    ctx.strokeStyle = BORDER
    ctx.lineWidth = 2
    roundRect(ctx, PAD, y, dispW, dispH, 10, false)
    y += dispH + 16
  }

  // ── Rodapé ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = GRAY2
  ctx.font = reg(11)
  ctx.textAlign = 'center'
  ctx.fillText('Gerado automaticamente por BRLAB.ENTREGAS', W / 2, H - 14)
  ctx.textAlign = 'left'

  return canvas
}

// ── Helpers Canvas ────────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r, fill = true) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  if (fill) ctx.fill(); else ctx.stroke()
}

function roundClip(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.clip()
}

function wrapText(ctx, text, maxW) {
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line); line = w
    } else line = test
  }
  if (line) lines.push(line)
  return lines
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function ReceiptGenerator({ order, recebidoPor, fotoBase64, courierName }) {
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState(null)
  const [shared,  setShared]  = useState(false)

  const generate = async () => {
    setLoading(true)
    try {
      const canvas = await generateReceiptCanvas({ order, recebidoPor, fotoBase64, courierName })
      const url = canvas.toDataURL('image/png')
      setPreview(url)
      return { canvas, url }
    } finally { setLoading(false) }
  }

  const handleDownload = async () => {
    const { url } = await generate()
    const a = document.createElement('a')
    a.href     = url
    a.download = `recibo-${order.id}-${Date.now()}.png`
    a.click()
  }

  const handleShare = async () => {
    const { canvas } = await generate()
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
    const file = new File([blob], `recibo-${order.id}.png`, { type: 'image/png' })

    // Web Share API — abre o compartilhamento nativo do celular (WhatsApp, etc.)
    if (navigator.share && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: `Recibo de entrega #${order.id}`,
          text:  `Entrega de ${order.cliente_nome || 'cliente'} confirmada. Recebido por: ${recebidoPor}`,
          files: [file],
        })
        setShared(true)
      } catch (e) {
        if (e.name !== 'AbortError') {
          // Fallback: download
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download = file.name; a.click()
        }
      }
    } else {
      // Desktop ou browser sem Web Share: download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = file.name; a.click()
    }
  }

  return (
    <div style={s.wrap}>
      {/* Preview do recibo */}
      {preview && (
        <div style={s.previewWrap}>
          <img src={preview} alt="Recibo" style={s.previewImg} />
        </div>
      )}

      {/* Botões */}
      <div style={s.btns}>
        <button style={s.downloadBtn} onClick={handleDownload} disabled={loading}>
          {loading ? <Loader size={15} style={{ animation:'spin 0.8s linear infinite' }} /> : <Download size={15} />}
          {loading ? 'Gerando…' : 'Salvar PNG'}
        </button>

        <button style={{ ...s.shareBtn, background: shared ? 'var(--delivered-bg)' : 'var(--accent)' }}
          onClick={handleShare} disabled={loading}>
          {loading
            ? <Loader size={15} style={{ animation:'spin 0.8s linear infinite' }} />
            : <Share2 size={15} />
          }
          {shared ? '✓ Compartilhado!' : 'Compartilhar'}
        </button>
      </div>

      {/* Dica WhatsApp */}
      <div style={s.hint}>
        <span style={{ fontSize:16 }}>💬</span>
        <span style={s.hintText}>
          Toque em <strong>Compartilhar</strong> e escolha o WhatsApp para enviar o recibo direto para o admin.
        </span>
      </div>
    </div>
  )
}

const s = {
  wrap:       { display:'flex', flexDirection:'column', gap:12 },
  previewWrap:{ borderRadius:10, overflow:'hidden', border:'1px solid var(--border)', background:'var(--bg)' },
  previewImg: { width:'100%', display:'block' },
  btns:       { display:'flex', gap:10 },
  downloadBtn:{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'12px', background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:10, color:'var(--text-1)', fontSize:13, fontWeight:600, cursor:'pointer' },
  shareBtn:   { flex:2, display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'12px', borderRadius:10, color:'#080D1A', fontSize:14, fontWeight:800, cursor:'pointer', transition:'background 0.3s' },
  hint:       { display:'flex', alignItems:'flex-start', gap:10, background:'rgba(0,229,160,0.06)', border:'1px solid var(--accent-border)', borderRadius:10, padding:'10px 12px' },
  hintText:   { fontSize:12, color:'var(--text-2)', lineHeight:1.5 },
}
