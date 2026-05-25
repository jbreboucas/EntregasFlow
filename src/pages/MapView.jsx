import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOrders } from '../App'
import { getPedidos } from '../lib/supabase'
import { ArrowLeft, CheckCircle, Phone, MapPin, Locate, Navigation } from 'lucide-react'
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

// Busca rota de 2 pontos via OSRM (simples, confiável)
const fetchRoute = async (from, to) => {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const d = await r.json()
    const route = d.routes?.[0]
    if (!route) return null
    return {
      points: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distance: route.distance,
      duration: route.duration,
    }
  } catch { return null }
}

export default function MapView() {
  const { mode, ids } = useParams()
  const navigate = useNavigate()
  const { orders, setOrders } = useOrders()

  const [pedidos,     setPedidos]     = useState([])   // pedidos resolvidos
  const [activeIdx,   setActiveIdx]   = useState(0)    // parada selecionada
  const [gpsPos,      setGpsPos]      = useState(null)
  const [gpsReady,    setGpsReady]    = useState(false)
  const [routeData,   setRouteData]   = useState([])   // [{distance, duration}] por pedido
  const [loadingIdx,  setLoadingIdx]  = useState([])   // quais rotas estão carregando

  const mapRef    = useRef(null)
  const mapInst   = useRef(null)
  const myMkr     = useRef(null)
  const routeLines = useRef([])   // L.polyline por pedido
  const stopMkrs   = useRef([])   // L.marker por pedido
  const origin     = useRef(null) // posição de origem (GPS ou fallback)

  // ── 1. Resolve pedidos ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!ids) return
    const idList = ids.split(',').filter(Boolean)
    const fromCtx = idList.map(id => orders.find(o => o.id === id)).filter(Boolean)
    if (fromCtx.length === idList.length) {
      setPedidos(fromCtx)
    } else {
      getPedidos().then(({ data }) => {
        if (data) {
          setOrders(data)
          setPedidos(idList.map(id => data.find(o => o.id === id)).filter(Boolean))
        }
      })
    }
  }, [ids])

  // ── 2. Inicia mapa ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapInst.current || !mapRef.current || pedidos.length === 0) return
    const first = pedidos[0]
    const map = L.map(mapRef.current, {
      center: [first.lat || -3.7317, first.lng || -38.5267],
      zoom: 13, zoomControl: false,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapInst.current = map
    return () => { map.remove(); mapInst.current = null }
  }, [pedidos])

  // ── 3. GPS ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) { setGpsReady(true); return }
    const wid = navigator.geolocation.watchPosition(
      pos => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setGpsPos(p)
        setGpsReady(true)
      },
      () => setGpsReady(true),   // sem GPS: usa fallback
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )
    // Fallback após 4s caso GPS demore
    const t = setTimeout(() => setGpsReady(true), 4000)
    return () => { navigator.geolocation.clearWatch(wid); clearTimeout(t) }
  }, [])

  // ── 4. Atualiza marcador "Você" ────────────────────────────────────────────
  useEffect(() => {
    if (!mapInst.current || !gpsPos) return
    if (myMkr.current) { myMkr.current.setLatLng([gpsPos.lat, gpsPos.lng]); return }
    myMkr.current = L.marker([gpsPos.lat, gpsPos.lng], {
      icon: L.divIcon({
        html: `<div style="width:18px;height:18px;background:#60A5FA;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 5px rgba(96,165,250,0.25);"></div>`,
        iconSize:[18,18], iconAnchor:[9,9], className:'',
      }), zIndexOffset: 2000,
    }).addTo(mapInst.current).bindTooltip('Você', { direction:'top', permanent:false })
  }, [gpsPos])

  // ── 5. Desenha TODAS as rotas depois que GPS está pronto e mapa existe ─────
  useEffect(() => {
    if (!gpsReady || !mapInst.current || pedidos.length === 0) return

    // Origem: GPS real ou ponto próximo ao primeiro pedido (demo)
    const from = gpsPos || {
      lat: (pedidos[0].lat || -3.7317) - 0.01,
      lng: (pedidos[0].lng || -38.5267) + 0.008,
    }
    origin.current = from

    // Remove camadas antigas
    routeLines.current.forEach(l => l?.remove())
    stopMkrs.current.forEach(m => m?.remove())
    routeLines.current = new Array(pedidos.length).fill(null)
    stopMkrs.current   = new Array(pedidos.length).fill(null)

    // Marcadores de parada — criados imediatamente
    pedidos.forEach((order, i) => {
      const color = COLORS[i % COLORS.length]
      const isActive = i === activeIdx
      const icon = makeStopIcon(i + 1, color, isActive)
      const mkr = L.marker([order.lat || -3.7317, order.lng || -38.5267], { icon })
        .addTo(mapInst.current)
        .on('click', () => selectStop(i))
      stopMkrs.current[i] = mkr
    })

    // Ajusta bounds com todos os pedidos
    const allPts = [
      [from.lat, from.lng],
      ...pedidos.map(o => [o.lat || -3.7317, o.lng || -38.5267]),
    ]
    mapInst.current.fitBounds(L.latLngBounds(allPts), { padding: [60, 60] })

    // Calcula rotas em paralelo — cada uma aparece assim que chega
    const newRouteData = new Array(pedidos.length).fill(null)
    setLoadingIdx(pedidos.map((_, i) => i))

    pedidos.forEach(async (order, i) => {
      const to = { lat: order.lat || -3.7317, lng: order.lng || -38.5267 }
      const result = await fetchRoute(from, to)

      if (result && mapInst.current) {
        const color = COLORS[i % COLORS.length]
        const isActive = i === activeIdx
        const line = L.polyline(result.points, {
          color,
          weight:  isActive ? 6 : 3,
          opacity: isActive ? 0.95 : 0.45,
          dashArray: isActive ? null : '8,6',
        }).addTo(mapInst.current)
        routeLines.current[i] = line

        newRouteData[i] = { distance: result.distance, duration: result.duration }
        setRouteData([...newRouteData])
      }

      setLoadingIdx(prev => prev.filter(x => x !== i))
    })
  }, [gpsReady, pedidos])

  // ── Seleciona parada ────────────────────────────────────────────────────────
  const selectStop = (idx) => {
    setActiveIdx(idx)

    // Atualiza visual de todas as rotas e marcadores
    routeLines.current.forEach((line, i) => {
      if (!line) return
      line.setStyle({
        weight:    i === idx ? 6 : 3,
        opacity:   i === idx ? 0.95 : 0.45,
        dashArray: i === idx ? null : '8,6',
      })
      if (i === idx) line.bringToFront()
    })

    stopMkrs.current.forEach((mkr, i) => {
      if (!mkr) return
      const color = COLORS[i % COLORS.length]
      mkr.setIcon(makeStopIcon(i + 1, color, i === idx))
    })

    // Centraliza no pedido selecionado
    const o = pedidos[idx]
    if (o && mapInst.current) {
      mapInst.current.setView([o.lat || -3.7317, o.lng || -38.5267], 15, { animate: true })
    }
  }

  const centerOnMe = () => {
    if (!gpsPos || !mapInst.current) return
    mapInst.current.setView([gpsPos.lat, gpsPos.lng], 16, { animate: true })
  }

  const activeOrder    = pedidos[activeIdx]
  const activeRoute    = routeData[activeIdx]
  const stillLoading   = loadingIdx.length > 0

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

      {/* Badge de status */}
      {stillLoading ? (
        <div style={s.badge}>
          <div style={{ width:12, height:12, borderRadius:'50%', border:`2px solid var(--accent)`, borderTopColor:'transparent', animation:'spin 0.7s linear infinite' }} />
          Calculando {loadingIdx.length} rota{loadingIdx.length > 1 ? 's' : ''}…
        </div>
      ) : activeRoute ? (
        <div style={s.badge}>
          <div style={{ width:10, height:10, borderRadius:'50%', background: COLORS[activeIdx % COLORS.length] }} />
          <span style={{ fontWeight:700, color: COLORS[activeIdx % COLORS.length] }}>{fmtDist(activeRoute.distance)}</span>
          <span style={{ color:'var(--text-3)' }}>·</span>
          <span style={{ color:'var(--text-2)' }}>{fmtTime(activeRoute.duration)}</span>
        </div>
      ) : null}

      {/* Seletor de paradas */}
      {pedidos.length > 1 && (
        <div style={s.stopSelector}>
          {pedidos.map((_, i) => (
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
        </div>
      )}

      {/* Bottom sheet */}
      <div style={s.sheet}>
        <div style={s.handle} />

        {activeOrder && (
          <>
            <div style={s.sheetTop}>
              <div style={{ ...s.numBadge, background: COLORS[activeIdx % COLORS.length]+'22', border:`1px solid ${COLORS[activeIdx % COLORS.length]}55` }}>
                <span style={{ fontSize:16, fontWeight:900, color: COLORS[activeIdx % COLORS.length] }}>{activeIdx + 1}</span>
              </div>
              <div style={{ flex:1 }}>
                <div style={s.orderId}># {activeOrder.id}</div>
                <div style={s.clientName}>{activeOrder.cliente_nome}</div>
              </div>
            </div>

            <div style={{ marginBottom:14 }}>
              <InfoRow icon={Phone}  text={activeOrder.cliente_telefone} />
              <InfoRow icon={MapPin} text={activeOrder.endereco} />
            </div>

            <div style={s.btnRow}>
              <a href={`tel:${activeOrder.cliente_telefone}`} style={s.callBtn}>
                <Phone size={15} /> Ligar
              </a>
              <button style={s.confirmBtn} onClick={() => navigate(`/confirm/${activeOrder.id}`)}>
                <CheckCircle size={16} /> Confirmar entrega
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Cria ícone de parada numerado
function makeStopIcon(num, color, active) {
  const size  = active ? 38 : 30
  const font  = active ? 13 : 11
  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border:${active ? 3 : 2}px solid ${active ? '#fff' : 'rgba(255,255,255,0.7)'};
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      box-shadow:${active ? `0 0 0 4px ${color}44,0 4px 12px rgba(0,0,0,0.4)` : '0 2px 6px rgba(0,0,0,0.3)'};
      font-family:Outfit,sans-serif;font-weight:900;font-size:${font}px;color:#080D1A;
      transition:all 0.2s;
      cursor:pointer;
    ">${num}</div>`,
    iconSize:   [size, size],
    iconAnchor: [size/2, size/2],
    className:  '',
  })
}

function InfoRow({ icon:Icon, text }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:6 }}>
      <Icon size={14} color="var(--text-3)" style={{ marginTop:1, flexShrink:0 }} />
      <span style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.5 }}>{text}</span>
    </div>
  )
}

const s = {
  page: { position:'fixed', inset:0, display:'flex', flexDirection:'column', background:'var(--bg)' },
  map:  { flex:1, zIndex:1 },
  backBtn: { position:'absolute', top:16, left:16, zIndex:500, display:'flex', alignItems:'center', gap:7, padding:'10px 14px', background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:10, color:'var(--text-1)', fontSize:13, fontWeight:600, boxShadow:'var(--shadow)' },
  locateBtn: { position:'absolute', top:16, right:16, zIndex:500, width:42, height:42, background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'var(--shadow)', cursor:'pointer' },
  badge: { position:'absolute', top:70, left:'50%', transform:'translateX(-50%)', zIndex:500, display:'flex', alignItems:'center', gap:7, background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:20, padding:'7px 14px', fontSize:12, color:'var(--text-2)', boxShadow:'var(--shadow)', whiteSpace:'nowrap' },
  stopSelector: { position:'absolute', bottom:220, left:'50%', transform:'translateX(-50%)', zIndex:500, display:'flex', gap:6, background:'rgba(8,13,26,0.85)', backdropFilter:'blur(10px)', border:'1px solid var(--border-2)', borderRadius:40, padding:'7px 10px', boxShadow:'var(--shadow)' },
  stopChip: { width:32, height:32, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, cursor:'pointer', transition:'all 0.2s', flexShrink:0 },
  sheet: { background:'var(--bg-2)', borderTop:'1px solid var(--border-2)', borderRadius:'20px 20px 0 0', padding:'12px 18px 34px', zIndex:400, flexShrink:0 },
  handle: { width:34, height:3, background:'var(--border-2)', borderRadius:2, margin:'0 auto 14px' },
  sheetTop: { display:'flex', alignItems:'flex-start', gap:12, marginBottom:12 },
  numBadge: { width:44, height:44, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  orderId: { fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)', marginBottom:3 },
  clientName: { fontSize:18, fontWeight:800, color:'var(--text-1)', letterSpacing:'-0.3px' },
  btnRow: { display:'flex', gap:10 },
  callBtn: { flex:1, padding:'13px 0', background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:10, color:'var(--text-1)', fontSize:14, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:7, textDecoration:'none' },
  confirmBtn: { flex:2.5, padding:'13px 0', background:'var(--accent)', borderRadius:10, color:'#080D1A', fontSize:14, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8 },
}
