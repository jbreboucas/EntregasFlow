import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOrders } from '../App'
import { getPedidos } from '../lib/supabase'
import { ArrowLeft, Navigation, CheckCircle, Phone, MapPin, ChevronRight, ChevronLeft, Locate, Route } from 'lucide-react'
import L from 'leaflet'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const STOP_COLORS = ['#00E5A0','#60A5FA','#F59E0B','#F87171','#A78BFA','#34D399']

const fmtDist = (m) => m >= 1000 ? `${(m/1000).toFixed(1)} km` : `${Math.round(m)} m`
const fmtTime = (s) => { const m = Math.round(s/60); return m >= 60 ? `${Math.floor(m/60)}h ${m%60}min` : `${m} min` }

const getOSRMRoute = async (waypoints) => {
  const coords = waypoints.map(p => `${p.lng},${p.lat}`).join(';')
  const isMulti = waypoints.length > 2
  const url = isMulti
    ? `https://router.project-osrm.org/trip/v1/driving/${coords}?overview=full&geometries=geojson&roundtrip=false&source=first&destination=last`
    : `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
  try {
    const res  = await fetch(url)
    const data = await res.json()
    const obj  = isMulti ? data.trips?.[0] : data.routes?.[0]
    if (!obj) return null
    return {
      geometry: obj.geometry?.coordinates || [],
      distance: obj.distance || 0,
      duration: obj.duration || 0,
    }
  } catch { return null }
}

export default function MapView() {
  const { mode, ids } = useParams()
  const navigate = useNavigate()
  const { orders, setOrders } = useOrders()

  const [resolvedOrders, setResolvedOrders] = useState([])
  const [currentIdx,     setCurrentIdx]     = useState(0)
  const [gpsPos,         setGpsPos]         = useState(null)
  const [routeInfo,      setRouteInfo]      = useState(null)
  const [gpsError,       setGpsError]       = useState(false)
  const [loading,        setLoading]        = useState(true)

  const mapRef     = useRef(null)
  const mapInst    = useRef(null)
  const courierMkr = useRef(null)
  const routeLine  = useRef(null)
  const stopMkrs   = useRef([])
  const routeBuilt = useRef(false)

  // ── Resolve pedidos (do contexto ou do banco) ──────────────────────────────
  useEffect(() => {
    if (!ids) return
    const idList = ids.split(',').filter(Boolean)

    const resolve = (allOrders) => {
      const found = idList.map(id => allOrders.find(o => o.id === id)).filter(Boolean)
      setResolvedOrders(found)
    }

    // Tenta primeiro o contexto
    const fromCtx = idList.map(id => orders.find(o => o.id === id)).filter(Boolean)
    if (fromCtx.length === idList.length) {
      resolve(orders)
    } else {
      // Busca no banco se contexto não tiver todos
      getPedidos().then(({ data }) => {
        if (data) { setOrders(data); resolve(data) }
      })
    }
  }, [ids, orders])

  // ── Inicializa mapa ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapInst.current || !mapRef.current || resolvedOrders.length === 0) return

    const first = resolvedOrders[0]
    const map = L.map(mapRef.current, {
      center: [first.lat || -3.7317, first.lng || -38.5267],
      zoom: 14, zoomControl: false,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
    L.control.zoom({ position:'bottomright' }).addTo(map)
    mapInst.current = map

    return () => { map.remove(); mapInst.current = null; routeBuilt.current = false }
  }, [resolvedOrders])

  // ── GPS watchPosition ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) { setGpsError(true); return }
    const wid = navigator.geolocation.watchPosition(
      (pos) => { setGpsPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsError(false) },
      ()    => setGpsError(true),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    )
    return () => navigator.geolocation.clearWatch(wid)
  }, [])

  // ── Atualiza marcador do entregador ────────────────────────────────────────
  useEffect(() => {
    if (!mapInst.current || !gpsPos) return
    const { lat, lng } = gpsPos
    if (courierMkr.current) {
      courierMkr.current.setLatLng([lat, lng])
    } else {
      const icon = L.divIcon({
        html: `<div style="width:20px;height:20px;background:#60A5FA;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 5px rgba(96,165,250,0.25),0 2px 8px rgba(0,0,0,0.35);"></div>`,
        iconSize:[20,20], iconAnchor:[10,10], className:'',
      })
      courierMkr.current = L.marker([lat,lng], { icon, zIndexOffset:1000 })
        .addTo(mapInst.current)
        .bindTooltip('Você', { permanent:false, direction:'top' })
    }
  }, [gpsPos])

  // ── Desenha rota + marcadores ──────────────────────────────────────────────
  const buildRoute = useCallback(async (pos) => {
    if (!mapInst.current || resolvedOrders.length === 0) return
    setLoading(true)

    // Limpa anteriores
    routeLine.current?.remove()
    stopMkrs.current.forEach(m => m.remove())
    stopMkrs.current = []

    const origin = pos || { lat: (resolvedOrders[0].lat || -3.7317) - 0.009, lng: (resolvedOrders[0].lng || -38.5267) + 0.007 }
    const destinations = resolvedOrders.map(o => ({ lat: o.lat || -3.7317, lng: o.lng || -38.5267 }))
    const waypoints = [origin, ...destinations]

    // OSRM
    const result = await getOSRMRoute(waypoints)
    if (result?.geometry?.length > 0) {
      const latlngs = result.geometry.map(([lng, lat]) => [lat, lng])
      routeLine.current = L.polyline(latlngs, { color:'#00E5A0', weight:5, opacity:0.9, lineCap:'round' })
        .addTo(mapInst.current)
      setRouteInfo({ distance: result.distance, duration: result.duration })
    }

    // Marcadores numerados
    resolvedOrders.forEach((order, i) => {
      const color = STOP_COLORS[i % STOP_COLORS.length]
      const icon = L.divIcon({
        html: `<div style="position:relative;width:32px;height:42px;display:flex;align-items:flex-start;justify-content:center;">
          <div style="width:32px;height:32px;background:${color};border:2px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 3px 10px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
            <span style="transform:rotate(45deg);color:#080D1A;font-weight:800;font-size:12px;font-family:Outfit,sans-serif;">${i+1}</span>
          </div>
        </div>`,
        iconSize:[32,42], iconAnchor:[16,42], className:'',
      })
      const mkr = L.marker([order.lat || -3.7317, order.lng || -38.5267], { icon })
        .addTo(mapInst.current)
        .bindPopup(`<div style="font-family:Outfit,sans-serif;padding:4px 2px;">
          <strong style="font-size:13px;">Parada ${i+1} — ${order.cliente_nome}</strong>
          <p style="font-size:11px;color:#6b7280;margin-top:3px;">${order.endereco}</p>
        </div>`)
      stopMkrs.current.push(mkr)
    })

    // Ajusta bounds
    const allPts = [[origin.lat, origin.lng], ...resolvedOrders.map(o => [o.lat || -3.7317, o.lng || -38.5267])]
    mapInst.current.fitBounds(L.latLngBounds(allPts), { padding:[70,70] })
    setLoading(false)
  }, [resolvedOrders])

  // Constrói rota quando mapa e pedidos estão prontos
  useEffect(() => {
    if (!mapInst.current || resolvedOrders.length === 0 || routeBuilt.current) return
    routeBuilt.current = true

    if (gpsPos) {
      buildRoute(gpsPos)
    } else {
      // Aguarda 2s pelo GPS; se não vier, usa origem simulada
      const t = setTimeout(() => buildRoute(null), 2000)
      return () => clearTimeout(t)
    }
  }, [mapInst.current, resolvedOrders, gpsPos, buildRoute])

  const centerOnMe = () => {
    if (!gpsPos || !mapInst.current) return
    mapInst.current.setView([gpsPos.lat, gpsPos.lng], 17, { animate:true })
  }

  const goToStop = (idx) => {
    const o = resolvedOrders[idx]
    if (!o || !mapInst.current) return
    mapInst.current.setView([o.lat || -3.7317, o.lng || -38.5267], 16, { animate:true })
    stopMkrs.current[idx]?.openPopup()
    setCurrentIdx(idx)
  }

  const currentOrder = resolvedOrders[currentIdx]

  if (resolvedOrders.length === 0 && !loading) return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'var(--bg)', gap:12 }}>
      <span style={{ fontSize:40 }}>📦</span>
      <p style={{ color:'var(--text-2)', fontWeight:600 }}>Nenhum pedido encontrado</p>
      <button style={{ padding:'10px 18px', background:'var(--accent)', color:'#080D1A', borderRadius:8, fontWeight:700, fontSize:13, marginTop:4 }} onClick={() => navigate('/courier')}>Voltar</button>
    </div>
  )

  return (
    <div style={s.page}>
      <div ref={mapRef} style={s.map} />

      <button style={s.backBtn} onClick={() => navigate('/courier')}>
        <ArrowLeft size={16} /> Voltar
      </button>

      <button style={s.locateBtn} onClick={centerOnMe} title="Minha localização">
        <Locate size={18} color={gpsPos ? 'var(--accent)' : 'var(--text-3)'} />
      </button>

      {loading && (
        <div style={s.badge}>
          <div style={{ width:12, height:12, borderRadius:'50%', border:'2px solid var(--accent)', borderTopColor:'transparent', animation:'spin 0.8s linear infinite' }} />
          Calculando rota…
        </div>
      )}

      {routeInfo && !loading && (
        <div style={s.badge}>
          <Route size={12} color="var(--accent)" />
          <span style={{ color:'var(--accent)', fontWeight:700 }}>{fmtDist(routeInfo.distance)}</span>
          <span style={{ color:'var(--text-3)' }}>·</span>
          <span style={{ color:'var(--text-2)' }}>{fmtTime(routeInfo.duration)}</span>
          {resolvedOrders.length > 1 && <><span style={{ color:'var(--text-3)' }}>·</span><span style={{ color:'var(--text-2)' }}>{resolvedOrders.length} paradas</span></>}
        </div>
      )}

      {gpsError && <div style={s.gpsBadge}>⚠️ GPS indisponível — ative a localização</div>}

      {/* Bottom sheet */}
      <div style={s.sheet}>
        <div style={s.handle} />

        {/* Navegação entre paradas */}
        {resolvedOrders.length > 1 && (
          <div style={s.stopNav}>
            <button style={{ ...s.navBtn, opacity: currentIdx === 0 ? 0.3 : 1 }}
              disabled={currentIdx === 0} onClick={() => goToStop(currentIdx - 1)}>
              <ChevronLeft size={18} />
            </button>
            <div style={{ textAlign:'center', flex:1 }}>
              <div style={s.stopLabel}>Parada {currentIdx+1} de {resolvedOrders.length}</div>
              <div style={{ display:'flex', justifyContent:'center', gap:5, marginTop:5 }}>
                {resolvedOrders.map((_, i) => (
                  <button key={i} onClick={() => goToStop(i)} style={{
                    width: i === currentIdx ? 20 : 7, height:7, borderRadius:4,
                    background: i === currentIdx ? STOP_COLORS[i] : 'var(--border-2)',
                    transition:'all 0.25s', cursor:'pointer', border:'none', padding:0,
                  }} />
                ))}
              </div>
            </div>
            <button style={{ ...s.navBtn, opacity: currentIdx === resolvedOrders.length-1 ? 0.3 : 1 }}
              disabled={currentIdx === resolvedOrders.length-1} onClick={() => goToStop(currentIdx + 1)}>
              <ChevronRight size={18} />
            </button>
          </div>
        )}

        {currentOrder && (
          <>
            <div style={s.sheetRow}>
              <div style={{ flex:1 }}>
                <div style={s.orderId}># {currentOrder.id}</div>
                <div style={s.clientName}>{currentOrder.cliente_nome}</div>
              </div>
              <div style={{ ...s.stopIcon, background: STOP_COLORS[currentIdx]+'22', border:`1px solid ${STOP_COLORS[currentIdx]}44` }}>
                <Navigation size={18} color={STOP_COLORS[currentIdx]} />
              </div>
            </div>

            <div style={{ marginBottom:14 }}>
              <InfoRow icon={Phone}  text={currentOrder.cliente_telefone} />
              <InfoRow icon={MapPin} text={currentOrder.endereco} />
            </div>

            <div style={s.btnRow}>
              <a href={`tel:${currentOrder.cliente_telefone}`} style={s.callBtn}>
                <Phone size={15} /> Ligar
              </a>
              <button style={s.confirmBtn} onClick={() => navigate(`/confirm/${currentOrder.id}`)}>
                <CheckCircle size={16} /> Confirmar entrega
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
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
  page:{ position:'fixed', inset:0, display:'flex', flexDirection:'column', background:'var(--bg)' },
  map:{ flex:1, zIndex:1 },
  backBtn:{ position:'absolute', top:16, left:16, zIndex:500, display:'flex', alignItems:'center', gap:7, padding:'10px 14px', background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:10, color:'var(--text-1)', fontSize:13, fontWeight:600, boxShadow:'var(--shadow)' },
  locateBtn:{ position:'absolute', top:16, right:16, zIndex:500, width:42, height:42, background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'var(--shadow)', cursor:'pointer' },
  badge:{ position:'absolute', top:70, left:'50%', transform:'translateX(-50%)', zIndex:500, display:'flex', alignItems:'center', gap:7, background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:20, padding:'7px 14px', fontSize:12, color:'var(--text-2)', boxShadow:'var(--shadow)', whiteSpace:'nowrap' },
  gpsBadge:{ position:'absolute', top:70, left:'50%', transform:'translateX(-50%)', zIndex:500, background:'var(--danger-bg)', border:'1px solid rgba(248,113,113,0.3)', borderRadius:20, padding:'7px 14px', fontSize:12, color:'var(--danger)', whiteSpace:'nowrap' },
  sheet:{ background:'var(--bg-2)', borderTop:'1px solid var(--border-2)', borderRadius:'20px 20px 0 0', padding:'12px 18px 34px', zIndex:400, flexShrink:0 },
  handle:{ width:34, height:3, background:'var(--border-2)', borderRadius:2, margin:'0 auto 14px' },
  stopNav:{ display:'flex', alignItems:'center', gap:8, marginBottom:14, paddingBottom:14, borderBottom:'1px solid var(--border)' },
  navBtn:{ width:36, height:36, borderRadius:9, background:'var(--bg-3)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)', flexShrink:0, cursor:'pointer' },
  stopLabel:{ fontSize:12, fontWeight:600, color:'var(--text-2)' },
  sheetRow:{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:10 },
  orderId:{ fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)', marginBottom:3 },
  clientName:{ fontSize:18, fontWeight:800, color:'var(--text-1)', letterSpacing:'-0.3px' },
  stopIcon:{ width:40, height:40, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  btnRow:{ display:'flex', gap:10 },
  callBtn:{ flex:1, padding:'13px 0', background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:10, color:'var(--text-1)', fontSize:14, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:7, textDecoration:'none' },
  confirmBtn:{ flex:2.5, padding:'13px 0', background:'var(--accent)', borderRadius:10, color:'#080D1A', fontSize:14, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8 },
}
