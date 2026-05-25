import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOrders } from '../App'
import { getPedidos } from '../lib/supabase'
import {
  ArrowLeft, CheckCircle, Phone, MapPin, Locate,
  Play, Pause, StopCircle, GripVertical, ChevronLeft, ChevronRight, Navigation,
} from 'lucide-react'
import L from 'leaflet'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const COLORS = ['#00E5A0','#60A5FA','#F59E0B','#F87171','#A78BFA','#FB923C']

const fmtDist = (m) => m >= 1000 ? `${(m/1000).toFixed(1)} km` : `${Math.round(m)} m`
const fmtTime = (s) => { const m = Math.round(s/60); return m >= 60 ? `${Math.floor(m/60)}h ${m%60}min` : `${m} min` }

const fetchRoute = async (from, to) => {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const d = await r.json()
    const route = d.routes?.[0]
    if (!route) return null
    return {
      points:   route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distance: route.distance,
      duration: route.duration,
    }
  } catch { return null }
}

// ─── Web Speech API ────────────────────────────────────────────────────────────
const speak = (text) => {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang  = 'pt-BR'
  u.rate  = 1.0
  u.pitch = 1.0
  // Tenta usar voz em português se disponível
  const voices = window.speechSynthesis.getVoices()
  const ptVoice = voices.find(v => v.lang.startsWith('pt')) || null
  if (ptVoice) u.voice = ptVoice
  window.speechSynthesis.speak(u)
}

// Estado da rota
const ROUTE_IDLE    = 'idle'
const ROUTE_ACTIVE  = 'active'
const ROUTE_PAUSED  = 'paused'

function makeStopIcon(num, color, active) {
  const size = active ? 40 : 32
  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};border:${active ? 3 : 2}px solid #fff;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      box-shadow:${active ? `0 0 0 4px ${color}44,0 4px 14px rgba(0,0,0,0.45)` : '0 2px 6px rgba(0,0,0,0.3)'};
      font-family:Outfit,sans-serif;font-weight:900;font-size:${active ? 14 : 12}px;color:#080D1A;cursor:pointer;">
      ${num}
    </div>`,
    iconSize:[size,size], iconAnchor:[size/2,size/2], className:'',
  })
}

export default function MapView() {
  const { mode, ids } = useParams()
  const navigate = useNavigate()
  const { orders, setOrders } = useOrders()

  const [pedidos,      setPedidos]      = useState([])
  const [order,        setOrder]        = useState([])  // índices da ordem atual
  const [activeIdx,    setActiveIdx]    = useState(0)
  const [gpsPos,       setGpsPos]       = useState(null)
  const [gpsReady,     setGpsReady]     = useState(false)
  const [routeData,    setRouteData]    = useState([])
  const [loadingIdx,   setLoadingIdx]   = useState([])
  const [routeState,   setRouteState]   = useState(ROUTE_IDLE)
  const [showReorder,  setShowReorder]  = useState(false)
  const [dragIdx,      setDragIdx]      = useState(null)
  const [dragOverIdx,  setDragOverIdx]  = useState(null)

  const mapRef     = useRef(null)
  const mapInst    = useRef(null)
  const myMkr      = useRef(null)
  const routeLines = useRef([])
  const stopMkrs   = useRef([])
  const origin     = useRef(null)
  const routeBuilt = useRef(false)

  // Pedidos ordenados pela ordem atual
  const orderedPedidos = order.map(i => pedidos[i]).filter(Boolean)

  // ── Resolve pedidos ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ids) return
    const idList = ids.split(',').filter(Boolean)
    const fromCtx = idList.map(id => orders.find(o => o.id === id)).filter(Boolean)
    const resolve = (all) => {
      const found = idList.map(id => all.find(o => o.id === id)).filter(Boolean)
      setPedidos(found)
      setOrder(found.map((_, i) => i))
    }
    if (fromCtx.length === idList.length) resolve(orders)
    else getPedidos().then(({ data }) => { if (data) { setOrders(data); resolve(data) } })
  }, [ids])

  // ── Mapa ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapInst.current || !mapRef.current || pedidos.length === 0) return
    const first = pedidos[0]
    const map = L.map(mapRef.current, {
      center: [first.lat || -3.7317, first.lng || -38.5267],
      zoom: 13, zoomControl: false,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
    L.control.zoom({ position:'bottomright' }).addTo(map)
    mapInst.current = map
    return () => { map.remove(); mapInst.current = null; routeBuilt.current = false }
  }, [pedidos])

  // ── GPS ───────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) { setGpsReady(true); return }
    const wid = navigator.geolocation.watchPosition(
      pos => { setGpsPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsReady(true) },
      () => setGpsReady(true),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )
    const t = setTimeout(() => setGpsReady(true), 4000)
    return () => { navigator.geolocation.clearWatch(wid); clearTimeout(t) }
  }, [])

  // ── Marcador do entregador ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInst.current || !gpsPos) return
    const { lat, lng } = gpsPos
    if (myMkr.current) { myMkr.current.setLatLng([lat, lng]); return }
    myMkr.current = L.marker([lat, lng], {
      icon: L.divIcon({
        html: `<div style="width:20px;height:20px;background:#60A5FA;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 5px rgba(96,165,250,0.25);"></div>`,
        iconSize:[20,20], iconAnchor:[10,10], className:'',
      }), zIndexOffset:2000,
    }).addTo(mapInst.current).bindTooltip('Você', { direction:'top' })
  }, [gpsPos])

  // ── Desenha rotas ─────────────────────────────────────────────────────────────
  const buildRoutes = useCallback(async (pos) => {
    if (!mapInst.current || pedidos.length === 0) return

    routeLines.current.forEach(l => l?.remove())
    stopMkrs.current.forEach(m => m?.remove())
    routeLines.current = new Array(pedidos.length).fill(null)
    stopMkrs.current   = new Array(pedidos.length).fill(null)

    const from = pos || {
      lat: (pedidos[0].lat || -3.7317) - 0.01,
      lng: (pedidos[0].lng || -38.5267) + 0.008,
    }
    origin.current = from

    // Marcadores por ORDEM atual
    orderedPedidos.forEach((ped, seqIdx) => {
      const realIdx = pedidos.indexOf(ped)
      const color = COLORS[seqIdx % COLORS.length]
      const isActive = seqIdx === activeIdx
      const mkr = L.marker([ped.lat || -3.7317, ped.lng || -38.5267], {
        icon: makeStopIcon(seqIdx + 1, color, isActive),
      }).addTo(mapInst.current).on('click', () => selectStop(seqIdx))
      stopMkrs.current[realIdx] = mkr
    })

    // Rotas em paralelo
    const newRouteData = new Array(pedidos.length).fill(null)
    setLoadingIdx(pedidos.map((_, i) => i))

    orderedPedidos.forEach(async (ped, seqIdx) => {
      const realIdx = pedidos.indexOf(ped)
      const to = { lat: ped.lat || -3.7317, lng: ped.lng || -38.5267 }
      const result = await fetchRoute(from, to)
      if (result && mapInst.current) {
        const color = COLORS[seqIdx % COLORS.length]
        const isActive = seqIdx === activeIdx
        const line = L.polyline(result.points, {
          color, weight: isActive ? 6 : 3, opacity: isActive ? 0.95 : 0.45,
          dashArray: isActive ? null : '8,6',
        }).addTo(mapInst.current)
        routeLines.current[realIdx] = line
        newRouteData[realIdx] = { distance: result.distance, duration: result.duration }
        setRouteData([...newRouteData])
      }
      setLoadingIdx(prev => prev.filter(x => x !== realIdx))
    })

    const allPts = [[from.lat, from.lng], ...pedidos.map(o => [o.lat || -3.7317, o.lng || -38.5267])]
    mapInst.current.fitBounds(L.latLngBounds(allPts), { padding:[60,60] })
  }, [pedidos, orderedPedidos, activeIdx])

  useEffect(() => {
    if (!mapInst.current || pedidos.length === 0 || routeBuilt.current) return
    routeBuilt.current = true
    if (gpsPos) buildRoutes(gpsPos)
    else { const t = setTimeout(() => buildRoutes(null), 2000); return () => clearTimeout(t) }
  }, [mapInst.current, pedidos, gpsPos])

  // ── Seleciona parada ──────────────────────────────────────────────────────────
  const selectStop = (seqIdx) => {
    setActiveIdx(seqIdx)
    const ped = orderedPedidos[seqIdx]
    if (!ped || !mapInst.current) return

    // Atualiza visuais
    orderedPedidos.forEach((p, i) => {
      const realIdx = pedidos.indexOf(p)
      const line = routeLines.current[realIdx]
      const mkr  = stopMkrs.current[realIdx]
      if (line) line.setStyle({ weight: i === seqIdx ? 6 : 3, opacity: i === seqIdx ? 0.95 : 0.45, dashArray: i === seqIdx ? null : '8,6' })
      if (mkr) mkr.setIcon(makeStopIcon(i + 1, COLORS[i % COLORS.length], i === seqIdx))
    })

    mapInst.current.setView([ped.lat || -3.7317, ped.lng || -38.5267], 15, { animate:true })
    if (routeState === ROUTE_ACTIVE) {
      speak(`Parada ${seqIdx + 1}: ${ped.cliente_nome || ped.endereco}`)
    }
  }

  const centerOnMe = () => {
    if (!gpsPos || !mapInst.current) return
    mapInst.current.setView([gpsPos.lat, gpsPos.lng], 16, { animate:true })
  }

  // ── Controles de rota ─────────────────────────────────────────────────────────
  const startRoute = () => {
    setRouteState(ROUTE_ACTIVE)
    const ped = orderedPedidos[activeIdx]
    speak(`Rota iniciada. ${orderedPedidos.length} entrega${orderedPedidos.length > 1 ? 's' : ''} programada${orderedPedidos.length > 1 ? 's' : ''}. Primeira parada: ${ped?.cliente_nome || ped?.endereco || 'destino'}`)
  }

  const pauseRoute = () => {
    setRouteState(ROUTE_PAUSED)
    speak('Rota pausada.')
  }

  const resumeRoute = () => {
    setRouteState(ROUTE_ACTIVE)
    speak('Rota retomada.')
  }

  const endRoute = () => {
    setRouteState(ROUTE_IDLE)
    speak('Rota finalizada. Bom trabalho!')
    setTimeout(() => navigate('/courier'), 2500)
  }

  // ── Reordenação drag ──────────────────────────────────────────────────────────
  const onDragStart = (idx) => setDragIdx(idx)
  const onDragOver  = (e, idx) => { e.preventDefault(); setDragOverIdx(idx) }
  const onDrop      = (idx) => {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return }
    const newOrder = [...order]
    const [moved]  = newOrder.splice(dragIdx, 1)
    newOrder.splice(idx, 0, moved)
    setOrder(newOrder)
    setDragIdx(null); setDragOverIdx(null)
    setActiveIdx(0)
    routeBuilt.current = false
    // Recalcula rotas com nova ordem
    setTimeout(() => {
      routeBuilt.current = true
      buildRoutes(gpsPos || origin.current)
    }, 100)
    speak(`Ordem atualizada. Parada 1 agora é ${pedidos[newOrder[0]]?.cliente_nome || pedidos[newOrder[0]]?.endereco}`)
  }

  // Touch drag (mobile)
  const touchSrc  = useRef(null)
  const onTouchStart = (idx) => { touchSrc.current = idx }
  const onTouchEnd   = (idx) => {
    if (touchSrc.current !== null && touchSrc.current !== idx) onDrop(idx)
    touchSrc.current = null; setDragOverIdx(null)
  }

  const currentOrder  = orderedPedidos[activeIdx]
  const currentRoute  = currentOrder ? routeData[pedidos.indexOf(currentOrder)] : null
  const stillLoading  = loadingIdx.length > 0

  return (
    <div style={s.page}>
      <div ref={mapRef} style={s.map} />

      {/* Voltar */}
      <button style={s.backBtn} onClick={() => navigate('/courier')}>
        <ArrowLeft size={16} /> Voltar
      </button>

      {/* Centralizar */}
      <button style={s.locateBtn} onClick={centerOnMe}>
        <Locate size={18} color={gpsPos ? 'var(--accent)' : 'var(--text-3)'} />
      </button>

      {/* Badge de distância */}
      {(stillLoading || currentRoute) && (
        <div style={s.badge}>
          {stillLoading
            ? <><div style={s.spinner} /> Calculando rotas…</>
            : <><div style={{ width:10, height:10, borderRadius:'50%', background: COLORS[activeIdx % COLORS.length] }} />
                <span style={{ fontWeight:700, color: COLORS[activeIdx % COLORS.length] }}>{fmtDist(currentRoute.distance)}</span>
                <span style={{ color:'var(--text-3)' }}>·</span>
                <span style={{ color:'var(--text-2)' }}>{fmtTime(currentRoute.duration)}</span>
              </>
          }
        </div>
      )}

      {/* Status da rota */}
      {routeState !== ROUTE_IDLE && (
        <div style={{ ...s.routeStateBadge, background: routeState === ROUTE_ACTIVE ? 'rgba(0,229,160,0.15)' : 'rgba(245,158,11,0.15)', borderColor: routeState === ROUTE_ACTIVE ? 'var(--accent-border)' : 'rgba(245,158,11,0.3)' }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background: routeState === ROUTE_ACTIVE ? 'var(--accent)' : 'var(--pending)', animation: routeState === ROUTE_ACTIVE ? 'pulseDot 1.5s infinite' : 'none' }} />
          <span style={{ fontSize:12, fontWeight:700, color: routeState === ROUTE_ACTIVE ? 'var(--accent)' : 'var(--pending)' }}>
            {routeState === ROUTE_ACTIVE ? '● Em andamento' : '⏸ Pausada'}
          </span>
        </div>
      )}

      {/* Seletor de paradas */}
      {orderedPedidos.length > 1 && (
        <div style={s.stopSelector}>
          {orderedPedidos.map((_, i) => (
            <button key={i} style={{
              ...s.stopChip,
              background: i === activeIdx ? COLORS[i % COLORS.length] : 'var(--bg-3)',
              color:       i === activeIdx ? '#080D1A' : 'var(--text-3)',
              border:      `1px solid ${i === activeIdx ? COLORS[i % COLORS.length] : 'var(--border)'}`,
              fontWeight:  i === activeIdx ? 800 : 500,
            }} onClick={() => selectStop(i)}>
              {i + 1}
            </button>
          ))}
          <button style={s.reorderBtn} onClick={() => setShowReorder(v => !v)}>
            <GripVertical size={14} />
          </button>
        </div>
      )}

      {/* ── Painel de reordenação ── */}
      {showReorder && (
        <div style={s.reorderPanel} className="fade-up">
          <div style={s.reorderHead}>
            <span style={{ fontSize:13, fontWeight:700, color:'var(--text-1)' }}>Reordenar entregas</span>
            <button style={s.closeReorder} onClick={() => setShowReorder(false)}>✕</button>
          </div>
          <p style={{ fontSize:11, color:'var(--text-3)', padding:'0 14px 8px', margin:0 }}>Arraste para mudar a ordem de entrega</p>
          {order.map((realIdx, seqIdx) => {
            const ped   = pedidos[realIdx]
            const color = COLORS[seqIdx % COLORS.length]
            const isDragTarget = dragOverIdx === seqIdx
            return (
              <div key={realIdx}
                draggable
                onDragStart={() => onDragStart(seqIdx)}
                onDragOver={e => onDragOver(e, seqIdx)}
                onDrop={() => onDrop(seqIdx)}
                onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
                onTouchStart={() => onTouchStart(seqIdx)}
                onTouchEnd={() => onTouchEnd(seqIdx)}
                style={{
                  ...s.reorderItem,
                  background: isDragTarget ? 'var(--accent-dim)' : dragIdx === seqIdx ? 'var(--bg-4)' : 'var(--bg-3)',
                  borderColor: isDragTarget ? 'var(--accent)' : 'var(--border)',
                  opacity: dragIdx === seqIdx ? 0.5 : 1,
                }}>
                <div style={{ ...s.reorderNum, background: color, color:'#080D1A' }}>{seqIdx + 1}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--text-1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {ped?.cliente_nome || 'Sem nome'}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text-3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {ped?.endereco}
                  </div>
                </div>
                <GripVertical size={16} color="var(--text-3)" style={{ flexShrink:0, cursor:'grab' }} />
              </div>
            )
          })}
        </div>
      )}

      {/* ── Bottom sheet ── */}
      <div style={s.sheet}>
        <div style={s.handle} />

        {/* Navegação entre paradas */}
        {orderedPedidos.length > 1 && (
          <div style={s.stopNav}>
            <button style={{ ...s.navBtn, opacity: activeIdx === 0 ? 0.3 : 1 }}
              disabled={activeIdx === 0} onClick={() => selectStop(activeIdx - 1)}>
              <ChevronLeft size={18} />
            </button>
            <div style={{ textAlign:'center', flex:1 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--text-2)' }}>Parada {activeIdx+1} de {orderedPedidos.length}</div>
              <div style={{ display:'flex', justifyContent:'center', gap:5, marginTop:5 }}>
                {orderedPedidos.map((_, i) => (
                  <button key={i} onClick={() => selectStop(i)} style={{
                    width: i === activeIdx ? 20 : 7, height:7, borderRadius:4,
                    background: i === activeIdx ? COLORS[i % COLORS.length] : 'var(--border-2)',
                    transition:'all 0.25s', cursor:'pointer', border:'none', padding:0,
                  }} />
                ))}
              </div>
            </div>
            <button style={{ ...s.navBtn, opacity: activeIdx === orderedPedidos.length-1 ? 0.3 : 1 }}
              disabled={activeIdx === orderedPedidos.length-1} onClick={() => selectStop(activeIdx + 1)}>
              <ChevronRight size={18} />
            </button>
          </div>
        )}

        {currentOrder && (
          <>
            <div style={s.sheetRow}>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)', marginBottom:3 }}>#{currentOrder.id}</div>
                <div style={{ fontSize:17, fontWeight:800, color:'var(--text-1)', letterSpacing:'-0.3px' }}>{currentOrder.cliente_nome || 'Sem nome'}</div>
              </div>
              <div style={{ ...s.stopIconBadge, background: COLORS[activeIdx%COLORS.length]+'22', border:`1px solid ${COLORS[activeIdx%COLORS.length]}44` }}>
                <Navigation size={18} color={COLORS[activeIdx%COLORS.length]} />
              </div>
            </div>

            <div style={{ marginBottom:12 }}>
              {currentOrder.cliente_telefone && <InfoRow icon={Phone} text={currentOrder.cliente_telefone} />}
              <InfoRow icon={MapPin} text={currentOrder.endereco} />
            </div>

            {/* Ações da entrega */}
            <div style={s.deliveryBtns}>
              <a href={`tel:${currentOrder.cliente_telefone}`} style={s.callBtn}>
                <Phone size={15} /> Ligar
              </a>
              <button style={s.confirmBtn} onClick={() => navigate(`/confirm/${currentOrder.id}`)}>
                <CheckCircle size={16} /> Confirmar entrega
              </button>
            </div>
          </>
        )}

        {/* ── Controles de rota ── */}
        <div style={s.routeControls}>
          {routeState === ROUTE_IDLE && (
            <button style={s.startBtn} onClick={startRoute}>
              <Play size={16} /> Iniciar rota
            </button>
          )}
          {routeState === ROUTE_ACTIVE && (
            <>
              <button style={s.pauseBtn} onClick={pauseRoute}>
                <Pause size={16} /> Pausar
              </button>
              <button style={s.endBtn} onClick={endRoute}>
                <StopCircle size={16} /> Finalizar rota
              </button>
            </>
          )}
          {routeState === ROUTE_PAUSED && (
            <>
              <button style={s.startBtn} onClick={resumeRoute}>
                <Play size={16} /> Retomar
              </button>
              <button style={s.endBtn} onClick={endRoute}>
                <StopCircle size={16} /> Finalizar rota
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon:Icon, text }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:5 }}>
      <Icon size={14} color="var(--text-3)" style={{ marginTop:1, flexShrink:0 }} />
      <span style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.5 }}>{text}</span>
    </div>
  )
}

const s = {
  page:{ position:'fixed', inset:0, display:'flex', flexDirection:'column', background:'var(--bg)' },
  map:{ flex:1, zIndex:1 },
  backBtn:{ position:'absolute', top:16, left:16, zIndex:500, display:'flex', alignItems:'center', gap:7, padding:'10px 14px', background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:10, color:'var(--text-1)', fontSize:13, fontWeight:600, boxShadow:'var(--shadow)' },
  locateBtn:{ position:'absolute', top:16, right:16, zIndex:500, width:42, height:42, background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'var(--shadow)', cursor:'pointer' },
  badge:{ position:'absolute', top:70, left:'50%', transform:'translateX(-50%)', zIndex:500, display:'flex', alignItems:'center', gap:7, background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:20, padding:'7px 14px', fontSize:12, color:'var(--text-2)', boxShadow:'var(--shadow)', whiteSpace:'nowrap' },
  spinner:{ width:12, height:12, borderRadius:'50%', border:'2px solid var(--accent)', borderTopColor:'transparent', animation:'spin 0.7s linear infinite' },
  routeStateBadge:{ position:'absolute', top:70, right:16, zIndex:500, display:'flex', alignItems:'center', gap:7, borderRadius:20, border:'1px solid', padding:'7px 13px', boxShadow:'var(--shadow)' },
  stopSelector:{ position:'absolute', bottom:310, left:'50%', transform:'translateX(-50%)', zIndex:500, display:'flex', gap:6, background:'rgba(8,13,26,0.88)', backdropFilter:'blur(10px)', border:'1px solid var(--border-2)', borderRadius:40, padding:'7px 10px', boxShadow:'var(--shadow)', flexWrap:'wrap', maxWidth:'90vw', justifyContent:'center' },
  stopChip:{ width:32, height:32, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, cursor:'pointer', transition:'all 0.2s', flexShrink:0 },
  reorderBtn:{ width:32, height:32, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-4)', border:'1px solid var(--border)', color:'var(--text-2)', cursor:'pointer' },

  // Painel de reordenação
  reorderPanel:{ position:'absolute', bottom:310, left:'50%', transform:'translateX(-50%)', zIndex:600, background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:16, width:'calc(100% - 32px)', maxWidth:420, boxShadow:'var(--shadow)', overflow:'hidden' },
  reorderHead:{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', borderBottom:'1px solid var(--border)' },
  closeReorder:{ width:26, height:26, borderRadius:6, background:'var(--bg-3)', border:'1px solid var(--border)', color:'var(--text-2)', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' },
  reorderItem:{ display:'flex', alignItems:'center', gap:10, margin:'6px 10px', padding:'10px 12px', borderRadius:10, border:'1px solid', transition:'all 0.15s', cursor:'grab' },
  reorderNum:{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900, flexShrink:0 },

  // Bottom sheet
  sheet:{ background:'var(--bg-2)', borderTop:'1px solid var(--border-2)', borderRadius:'20px 20px 0 0', padding:'12px 18px 24px', zIndex:400, flexShrink:0 },
  handle:{ width:34, height:3, background:'var(--border-2)', borderRadius:2, margin:'0 auto 14px' },
  stopNav:{ display:'flex', alignItems:'center', gap:8, marginBottom:14, paddingBottom:14, borderBottom:'1px solid var(--border)' },
  navBtn:{ width:36, height:36, borderRadius:9, background:'var(--bg-3)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)', cursor:'pointer' },
  sheetRow:{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:10 },
  stopIconBadge:{ width:40, height:40, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  deliveryBtns:{ display:'flex', gap:10, marginBottom:12 },
  callBtn:{ flex:1, padding:'11px 0', background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:10, color:'var(--text-1)', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:7, textDecoration:'none' },
  confirmBtn:{ flex:2.5, padding:'11px 0', background:'var(--accent)', borderRadius:10, color:'#080D1A', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8 },

  // Controles de rota
  routeControls:{ display:'flex', gap:8 },
  startBtn:{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'12px 0', background:'var(--accent)', color:'#080D1A', borderRadius:10, fontSize:14, fontWeight:800 },
  pauseBtn:{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'12px 0', background:'var(--pending-bg)', border:'1px solid rgba(245,158,11,0.3)', color:'var(--pending)', borderRadius:10, fontSize:14, fontWeight:700 },
  endBtn:{   flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'12px 0', background:'var(--danger-bg)', border:'1px solid rgba(248,113,113,0.3)', color:'var(--danger)', borderRadius:10, fontSize:14, fontWeight:700 },
}
