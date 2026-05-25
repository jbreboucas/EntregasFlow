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
    return { points: route.geometry.coordinates.map(([lng,lat]) => [lat,lng]), distance: route.distance, duration: route.duration }
  } catch { return null }
}

const speak = (text) => {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'pt-BR'; u.rate = 1.0
  const ptVoice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('pt'))
  if (ptVoice) u.voice = ptVoice
  window.speechSynthesis.speak(u)
}

const ROUTE_IDLE = 'idle', ROUTE_ACTIVE = 'active', ROUTE_PAUSED = 'paused'

function makeStopIcon(num, color, active) {
  const size = active ? 40 : 32
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:${active?3:2}px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:${active?`0 0 0 4px ${color}44,0 4px 14px rgba(0,0,0,0.45)`:'0 2px 6px rgba(0,0,0,0.3)'};font-family:Outfit,sans-serif;font-weight:900;font-size:${active?14:12}px;color:#080D1A;cursor:pointer;">${num}</div>`,
    iconSize:[size,size], iconAnchor:[size/2,size/2], className:'',
  })
}

export default function MapView() {
  const { mode, ids } = useParams()
  const navigate = useNavigate()
  const { orders, setOrders } = useOrders()

  const [pedidos,     setPedidos]     = useState([])
  const [order,       setOrder]       = useState([])
  const [activeIdx,   setActiveIdx]   = useState(0)
  const [gpsPos,      setGpsPos]      = useState(null)
  const [gpsReady,    setGpsReady]    = useState(false)
  const [routeData,   setRouteData]   = useState([])
  const [loadingIdx,  setLoadingIdx]  = useState([])
  const [routeState,  setRouteState]  = useState(ROUTE_IDLE)
  const [showReorder, setShowReorder] = useState(false)
  const [dragOver,    setDragOver]    = useState(null)

  const mapRef     = useRef(null)
  const mapInst    = useRef(null)
  const myMkr      = useRef(null)
  const routeLines = useRef([])
  const stopMkrs   = useRef([])
  const origin     = useRef(null)
  const routeBuilt = useRef(false)
  const dragSrc    = useRef(null)      // índice de origem do drag (touch e mouse)
  const listRef    = useRef(null)      // ref da lista de reordenação

  const orderedPedidos = order.map(i => pedidos[i]).filter(Boolean)

  // ── Resolve pedidos ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ids) return
    const idList = ids.split(',').filter(Boolean)
    const resolve = (all) => {
      const found = idList.map(id => all.find(o => o.id === id)).filter(Boolean)
      setPedidos(found); setOrder(found.map((_,i) => i))
    }
    const fromCtx = idList.map(id => orders.find(o => o.id === id)).filter(Boolean)
    if (fromCtx.length === idList.length) resolve(orders)
    else getPedidos().then(({ data }) => { if (data) { setOrders(data); resolve(data) } })
  }, [ids])

  // ── Mapa ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapInst.current || !mapRef.current || pedidos.length === 0) return
    const map = L.map(mapRef.current, { center:[pedidos[0].lat||-3.7317, pedidos[0].lng||-38.5267], zoom:13, zoomControl:false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
    L.control.zoom({ position:'bottomright' }).addTo(map)
    mapInst.current = map
    return () => { map.remove(); mapInst.current = null; routeBuilt.current = false }
  }, [pedidos])

  // ── GPS ───────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) { setGpsReady(true); return }
    const wid = navigator.geolocation.watchPosition(
      pos => { setGpsPos({ lat:pos.coords.latitude, lng:pos.coords.longitude }); setGpsReady(true) },
      () => setGpsReady(true),
      { enableHighAccuracy:true, maximumAge:5000, timeout:10000 }
    )
    const t = setTimeout(() => setGpsReady(true), 4000)
    return () => { navigator.geolocation.clearWatch(wid); clearTimeout(t) }
  }, [])

  // ── Marcador GPS ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInst.current || !gpsPos) return
    const {lat,lng} = gpsPos
    if (myMkr.current) { myMkr.current.setLatLng([lat,lng]); return }
    myMkr.current = L.marker([lat,lng], { icon: L.divIcon({
      html:`<div style="width:20px;height:20px;background:#60A5FA;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 5px rgba(96,165,250,0.25);"></div>`,
      iconSize:[20,20], iconAnchor:[10,10], className:'',
    }), zIndexOffset:2000 }).addTo(mapInst.current)
  }, [gpsPos])

  // ── Build rotas ───────────────────────────────────────────────────────────────
  const buildRoutes = useCallback(async (pos) => {
    if (!mapInst.current || pedidos.length === 0) return
    routeLines.current.forEach(l => l?.remove()); stopMkrs.current.forEach(m => m?.remove())
    routeLines.current = new Array(pedidos.length).fill(null)
    stopMkrs.current   = new Array(pedidos.length).fill(null)
    const from = pos || { lat:(pedidos[0].lat||-3.7317)-0.01, lng:(pedidos[0].lng||-38.5267)+0.008 }
    origin.current = from
    const ordered = order.map(i => pedidos[i]).filter(Boolean)
    ordered.forEach((ped, seqIdx) => {
      const ri  = pedidos.indexOf(ped)
      const col = COLORS[seqIdx%COLORS.length]
      const mkr = L.marker([ped.lat||-3.7317, ped.lng||-38.5267], { icon: makeStopIcon(seqIdx+1, col, seqIdx===activeIdx) })
        .addTo(mapInst.current).on('click', () => selectStop(seqIdx))
      stopMkrs.current[ri] = mkr
    })
    const newRD = new Array(pedidos.length).fill(null)
    setLoadingIdx(pedidos.map((_,i)=>i))
    ordered.forEach(async (ped, seqIdx) => {
      const ri  = pedidos.indexOf(ped)
      const res = await fetchRoute(from, { lat:ped.lat||-3.7317, lng:ped.lng||-38.5267 })
      if (res && mapInst.current) {
        const col = COLORS[seqIdx%COLORS.length]
        const line = L.polyline(res.points, { color:col, weight:seqIdx===activeIdx?6:3, opacity:seqIdx===activeIdx?0.95:0.45, dashArray:seqIdx===activeIdx?null:'8,6' }).addTo(mapInst.current)
        routeLines.current[ri] = line
        newRD[ri] = { distance:res.distance, duration:res.duration }
        setRouteData([...newRD])
      }
      setLoadingIdx(prev => prev.filter(x => x !== ri))
    })
    const allPts = [[from.lat,from.lng], ...pedidos.map(o=>[o.lat||-3.7317,o.lng||-38.5267])]
    mapInst.current.fitBounds(L.latLngBounds(allPts), { padding:[60,60] })
  }, [pedidos, order, activeIdx])

  useEffect(() => {
    if (!mapInst.current || pedidos.length===0 || routeBuilt.current) return
    routeBuilt.current = true
    if (gpsPos) buildRoutes(gpsPos)
    else { const t = setTimeout(()=>buildRoutes(null),2000); return ()=>clearTimeout(t) }
  }, [mapInst.current, pedidos, gpsPos])

  const selectStop = (seqIdx) => {
    setActiveIdx(seqIdx)
    const ordered = order.map(i=>pedidos[i]).filter(Boolean)
    const ped = ordered[seqIdx]
    if (!ped || !mapInst.current) return
    ordered.forEach((p,i) => {
      const ri = pedidos.indexOf(p)
      routeLines.current[ri]?.setStyle({ weight:i===seqIdx?6:3, opacity:i===seqIdx?0.95:0.45, dashArray:i===seqIdx?null:'8,6' })
      stopMkrs.current[ri]?.setIcon(makeStopIcon(i+1, COLORS[i%COLORS.length], i===seqIdx))
    })
    mapInst.current.setView([ped.lat||-3.7317, ped.lng||-38.5267], 15, { animate:true })
    if (routeState===ROUTE_ACTIVE) speak(`Parada ${seqIdx+1}: ${ped.cliente_nome||ped.endereco}`)
  }

  const centerOnMe = () => { if (gpsPos && mapInst.current) mapInst.current.setView([gpsPos.lat,gpsPos.lng],16,{animate:true}) }

  // ── Controles voz ─────────────────────────────────────────────────────────────
  const startRoute = () => {
    setRouteState(ROUTE_ACTIVE)
    const ped = orderedPedidos[activeIdx]
    speak(`Rota iniciada. ${orderedPedidos.length} entrega${orderedPedidos.length>1?'s':''} programada${orderedPedidos.length>1?'s':''}. Primeira parada: ${ped?.cliente_nome||ped?.endereco||'destino'}`)
  }
  const pauseRoute  = () => { setRouteState(ROUTE_PAUSED);  speak('Rota pausada.') }
  const resumeRoute = () => { setRouteState(ROUTE_ACTIVE);  speak('Rota retomada.') }
  const endRoute    = () => { setRouteState(ROUTE_IDLE); speak('Rota finalizada. Bom trabalho!'); setTimeout(()=>navigate('/courier'),2500) }

  // ── Drag reorder — MOUSE (desktop) ───────────────────────────────────────────
  const onDragStart = (e, idx) => { dragSrc.current = idx; e.dataTransfer.effectAllowed='move' }
  const onDragOver  = (e, idx) => { e.preventDefault(); setDragOver(idx) }
  const onDrop      = (e, idx) => {
    e.preventDefault(); setDragOver(null)
    if (dragSrc.current === null || dragSrc.current === idx) { dragSrc.current=null; return }
    applyReorder(dragSrc.current, idx)
    dragSrc.current = null
  }

  // ── Touch reorder — MOBILE ────────────────────────────────────────────────────
  const touchY     = useRef(0)
  const touchSrcIdx = useRef(null)

  const onTouchStart = (e, idx) => {
    touchSrcIdx.current = idx
    touchY.current = e.touches[0].clientY
  }

  const onTouchMove = (e) => {
    e.preventDefault()  // impede scroll da página durante drag
    if (touchSrcIdx.current === null || !listRef.current) return
    const y = e.touches[0].clientY
    const items = listRef.current.querySelectorAll('[data-reorder-item]')
    let targetIdx = null
    items.forEach((el, i) => {
      const rect = el.getBoundingClientRect()
      if (y >= rect.top && y <= rect.bottom) targetIdx = i
    })
    if (targetIdx !== null && targetIdx !== touchSrcIdx.current) setDragOver(targetIdx)
  }

  const onTouchEnd = () => {
    if (touchSrcIdx.current !== null && dragOver !== null && dragOver !== touchSrcIdx.current) {
      applyReorder(touchSrcIdx.current, dragOver)
    }
    touchSrcIdx.current = null; setDragOver(null)
  }

  const applyReorder = (fromIdx, toIdx) => {
    const newOrder = [...order]
    const [moved]  = newOrder.splice(fromIdx, 1)
    newOrder.splice(toIdx, 0, moved)
    setOrder(newOrder); setActiveIdx(0)
    routeBuilt.current = false
    setTimeout(() => { routeBuilt.current = true; buildRoutes(gpsPos||origin.current) }, 100)
    speak(`Ordem atualizada. Parada 1: ${pedidos[newOrder[0]]?.cliente_nome||pedidos[newOrder[0]]?.endereco}`)
  }

  const currentOrder = orderedPedidos[activeIdx]
  const currentRoute = currentOrder ? routeData[pedidos.indexOf(currentOrder)] : null
  const stillLoading = loadingIdx.length > 0

  return (
    <div style={s.page}>
      <div ref={mapRef} style={s.map} />

      {/* Voltar */}
      <button style={s.backBtn} onClick={() => navigate('/courier')}>
        <ArrowLeft size={16} /> Voltar
      </button>

      {/* GPS */}
      <button style={s.locateBtn} onClick={centerOnMe}>
        <Locate size={18} color={gpsPos ? 'var(--accent)' : 'var(--text-3)'} />
      </button>

      {/* Badge distância / loading */}
      {(stillLoading || currentRoute) && (
        <div style={s.badge}>
          {stillLoading
            ? <><div style={s.spinner}/>Calculando rotas…</>
            : <><div style={{width:10,height:10,borderRadius:'50%',background:COLORS[activeIdx%COLORS.length]}}/>
                <span style={{fontWeight:700,color:COLORS[activeIdx%COLORS.length]}}>{fmtDist(currentRoute.distance)}</span>
                <span style={{color:'var(--text-3)'}}>·</span>
                <span style={{color:'var(--text-2)'}}>{fmtTime(currentRoute.duration)}</span>
              </>
          }
        </div>
      )}

      {/* Estado da rota */}
      {routeState !== ROUTE_IDLE && (
        <div style={{...s.stateBadge, background:routeState===ROUTE_ACTIVE?'rgba(0,229,160,0.15)':'rgba(245,158,11,0.15)', borderColor:routeState===ROUTE_ACTIVE?'var(--accent-border)':'rgba(245,158,11,0.3)'}}>
          <div style={{width:8,height:8,borderRadius:'50%',background:routeState===ROUTE_ACTIVE?'var(--accent)':'var(--pending)',animation:routeState===ROUTE_ACTIVE?'pulseDot 1.5s infinite':'none'}}/>
          <span style={{fontSize:12,fontWeight:700,color:routeState===ROUTE_ACTIVE?'var(--accent)':'var(--pending)'}}>
            {routeState===ROUTE_ACTIVE?'Em andamento':'Pausada'}
          </span>
        </div>
      )}

      {/* ── Bottom sheet ─────────────────────────────────────────────────────── */}
      <div style={s.sheet}>
        <div style={s.handle}/>

        {/* Painel de reordenação — dentro do sheet, aparece quando showReorder */}
        {showReorder && orderedPedidos.length > 1 && (
          <div style={s.reorderWrap}>
            <div style={s.reorderHead}>
              <span style={{fontSize:13,fontWeight:700,color:'var(--text-1)'}}>Reordenar entregas</span>
              <button style={s.closeBtn} onClick={()=>setShowReorder(false)}>✕</button>
            </div>
            <p style={{fontSize:11,color:'var(--text-3)',margin:'2px 0 8px',paddingLeft:2}}>Segure e arraste para mudar a ordem</p>
            {/* Lista touch-friendly */}
            <div
              ref={listRef}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              style={{display:'flex',flexDirection:'column',gap:6,touchAction:'none'}}
            >
              {order.map((realIdx, seqIdx) => {
                const ped   = pedidos[realIdx]
                const color = COLORS[seqIdx % COLORS.length]
                return (
                  <div
                    key={realIdx}
                    data-reorder-item
                    draggable
                    onDragStart={e => onDragStart(e, seqIdx)}
                    onDragOver={e => onDragOver(e, seqIdx)}
                    onDrop={e => onDrop(e, seqIdx)}
                    onDragEnd={() => { dragSrc.current=null; setDragOver(null) }}
                    onTouchStart={e => onTouchStart(e, seqIdx)}
                    style={{
                      display:'flex', alignItems:'center', gap:10,
                      padding:'10px 12px', borderRadius:10,
                      background: dragOver===seqIdx ? 'var(--accent-dim)' : 'var(--bg-3)',
                      border:`1px solid ${dragOver===seqIdx ? 'var(--accent)' : 'var(--border)'}`,
                      opacity: dragSrc.current===seqIdx ? 0.4 : 1,
                      transition:'background 0.15s, border-color 0.15s',
                      userSelect:'none', WebkitUserSelect:'none',
                    }}>
                    {/* Número colorido */}
                    <div style={{width:30,height:30,borderRadius:'50%',background:color,color:'#080D1A',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:900,flexShrink:0}}>
                      {seqIdx+1}
                    </div>
                    {/* Textos */}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:'var(--text-1)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                        {ped?.cliente_nome || 'Sem nome'}
                      </div>
                      <div style={{fontSize:11,color:'var(--text-3)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',marginTop:1}}>
                        {ped?.endereco}
                      </div>
                    </div>
                    {/* Handle */}
                    <div style={{padding:'4px 2px',cursor:'grab',color:'var(--text-3)',flexShrink:0,touchAction:'none'}}>
                      <GripVertical size={18}/>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Navegação entre paradas */}
        {orderedPedidos.length > 1 && !showReorder && (
          <div style={s.stopNav}>
            <button style={{...s.navBtn, opacity:activeIdx===0?0.3:1}} disabled={activeIdx===0} onClick={()=>selectStop(activeIdx-1)}>
              <ChevronLeft size={18}/>
            </button>
            <div style={{textAlign:'center',flex:1}}>
              <div style={{fontSize:12,fontWeight:600,color:'var(--text-2)'}}>Parada {activeIdx+1} de {orderedPedidos.length}</div>
              <div style={{display:'flex',justifyContent:'center',gap:5,marginTop:5}}>
                {orderedPedidos.map((_,i)=>(
                  <button key={i} onClick={()=>selectStop(i)} style={{width:i===activeIdx?20:7,height:7,borderRadius:4,background:i===activeIdx?COLORS[i%COLORS.length]:'var(--border-2)',transition:'all 0.25s',cursor:'pointer',border:'none',padding:0}}/>
                ))}
              </div>
            </div>
            <button style={{...s.navBtn, opacity:activeIdx===orderedPedidos.length-1?0.3:1}} disabled={activeIdx===orderedPedidos.length-1} onClick={()=>selectStop(activeIdx+1)}>
              <ChevronRight size={18}/>
            </button>
            {/* Botão reordenar dentro da navegação */}
            <button style={s.reorderToggle} onClick={()=>setShowReorder(true)} title="Reordenar">
              <GripVertical size={15}/>
            </button>
          </div>
        )}

        {/* Info da parada atual */}
        {currentOrder && !showReorder && (
          <>
            <div style={s.sheetRow}>
              <div style={{flex:1}}>
                <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text-3)',marginBottom:3}}>#{currentOrder.id}</div>
                <div style={{fontSize:17,fontWeight:800,color:'var(--text-1)',letterSpacing:'-0.3px'}}>{currentOrder.cliente_nome||'Sem nome'}</div>
              </div>
              <div style={{...s.stopBadge,background:COLORS[activeIdx%COLORS.length]+'22',border:`1px solid ${COLORS[activeIdx%COLORS.length]}44`}}>
                <Navigation size={18} color={COLORS[activeIdx%COLORS.length]}/>
              </div>
            </div>
            <div style={{marginBottom:12}}>
              {currentOrder.cliente_telefone && <InfoRow icon={Phone} text={currentOrder.cliente_telefone}/>}
              <InfoRow icon={MapPin} text={currentOrder.endereco}/>
            </div>
            <div style={s.deliveryBtns}>
              <a href={`tel:${currentOrder.cliente_telefone}`} style={s.callBtn}>
                <Phone size={15}/> Ligar
              </a>
              <button style={s.confirmBtn} onClick={()=>navigate(`/confirm/${currentOrder.id}`)}>
                <CheckCircle size={16}/> Confirmar entrega
              </button>
            </div>
          </>
        )}

        {/* Controles de rota */}
        {!showReorder && (
          <div style={s.routeControls}>
            {routeState===ROUTE_IDLE   && <button style={s.startBtn} onClick={startRoute}><Play size={16}/> Iniciar rota</button>}
            {routeState===ROUTE_ACTIVE && <>
              <button style={s.pauseBtn} onClick={pauseRoute}><Pause size={16}/> Pausar</button>
              <button style={s.endBtn}   onClick={endRoute}><StopCircle size={16}/> Finalizar</button>
            </>}
            {routeState===ROUTE_PAUSED && <>
              <button style={s.startBtn} onClick={resumeRoute}><Play size={16}/> Retomar</button>
              <button style={s.endBtn}   onClick={endRoute}><StopCircle size={16}/> Finalizar</button>
            </>}
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({ icon:Icon, text }) {
  return (
    <div style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:5}}>
      <Icon size={14} color="var(--text-3)" style={{marginTop:1,flexShrink:0}}/>
      <span style={{fontSize:13,color:'var(--text-2)',lineHeight:1.5}}>{text}</span>
    </div>
  )
}

const s = {
  page:      { position:'fixed', inset:0, display:'flex', flexDirection:'column', background:'var(--bg)' },
  map:       { flex:1, zIndex:1 },
  backBtn:   { position:'absolute', top:16, left:16, zIndex:500, display:'flex', alignItems:'center', gap:7, padding:'10px 14px', background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:10, color:'var(--text-1)', fontSize:13, fontWeight:600, boxShadow:'var(--shadow)' },
  locateBtn: { position:'absolute', top:16, right:16, zIndex:500, width:42, height:42, background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'var(--shadow)', cursor:'pointer' },
  badge:     { position:'absolute', top:70, left:'50%', transform:'translateX(-50%)', zIndex:500, display:'flex', alignItems:'center', gap:7, background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:20, padding:'7px 14px', fontSize:12, color:'var(--text-2)', boxShadow:'var(--shadow)', whiteSpace:'nowrap' },
  spinner:   { width:12, height:12, borderRadius:'50%', border:'2px solid var(--accent)', borderTopColor:'transparent', animation:'spin 0.7s linear infinite' },
  stateBadge:{ position:'absolute', top:110, left:'50%', transform:'translateX(-50%)', zIndex:500, display:'flex', alignItems:'center', gap:7, borderRadius:20, border:'1px solid', padding:'6px 13px', boxShadow:'var(--shadow)', whiteSpace:'nowrap' },
  sheet:     { background:'var(--bg-2)', borderTop:'1px solid var(--border-2)', borderRadius:'20px 20px 0 0', padding:'12px 16px 28px', zIndex:400, flexShrink:0 },
  handle:    { width:34, height:3, background:'var(--border-2)', borderRadius:2, margin:'0 auto 14px' },
  reorderWrap:{ background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 12px 14px', marginBottom:14 },
  reorderHead:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 },
  closeBtn:  { width:26, height:26, borderRadius:7, background:'var(--bg-2)', border:'1px solid var(--border)', color:'var(--text-2)', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' },
  stopNav:   { display:'flex', alignItems:'center', gap:8, marginBottom:12, paddingBottom:12, borderBottom:'1px solid var(--border)' },
  navBtn:    { width:36, height:36, borderRadius:9, background:'var(--bg-3)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)', cursor:'pointer', flexShrink:0 },
  reorderToggle:{ width:36, height:36, borderRadius:9, background:'var(--bg-3)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)', cursor:'pointer', flexShrink:0 },
  sheetRow:  { display:'flex', alignItems:'flex-start', gap:12, marginBottom:10 },
  stopBadge: { width:40, height:40, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  deliveryBtns:{ display:'flex', gap:10, marginBottom:12 },
  callBtn:   { flex:1, padding:'11px 0', background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:10, color:'var(--text-1)', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:7, textDecoration:'none' },
  confirmBtn:{ flex:2.5, padding:'11px 0', background:'var(--accent)', borderRadius:10, color:'#080D1A', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8 },
  routeControls:{ display:'flex', gap:8 },
  startBtn:  { flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'13px 0', background:'var(--accent)', color:'#080D1A', borderRadius:10, fontSize:14, fontWeight:800 },
  pauseBtn:  { flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'13px 0', background:'var(--pending-bg)', border:'1px solid rgba(245,158,11,0.3)', color:'var(--pending)', borderRadius:10, fontSize:14, fontWeight:700 },
  endBtn:    { flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'13px 0', background:'var(--danger-bg)', border:'1px solid rgba(248,113,113,0.3)', color:'var(--danger)', borderRadius:10, fontSize:14, fontWeight:700 },
}
