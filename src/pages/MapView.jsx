import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOrders } from '../App'
import { ArrowLeft, Navigation, CheckCircle, Phone, MapPin, ChevronRight, ChevronLeft, Locate, Route } from 'lucide-react'
import L from 'leaflet'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// ─── OSRM Route ───────────────────────────────────────────────────────────────
const getOSRMRoute = async (waypoints) => {
  // waypoints: [{lat, lng}, ...]
  const coords = waypoints.map(p => `${p.lng},${p.lat}`).join(';')
  const url = waypoints.length > 2
    ? `https://router.project-osrm.org/trip/v1/driving/${coords}?overview=full&geometries=geojson&roundtrip=false&source=first&destination=last`
    : `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
  try {
    const res  = await fetch(url)
    const data = await res.json()
    if (waypoints.length > 2) {
      const trip = data.trips?.[0]
      return {
        geometry: trip?.geometry?.coordinates || [],
        distance: trip?.distance || 0,
        duration: trip?.duration || 0,
        order:    data.waypoints?.sort((a,b) => a.trips_index !== undefined ? a.waypoint_index - b.waypoint_index : 0).map(w => w.waypoint_index) || [],
      }
    } else {
      const route = data.routes?.[0]
      return {
        geometry: route?.geometry?.coordinates || [],
        distance: route?.distance || 0,
        duration: route?.duration || 0,
        order: [0, 1],
      }
    }
  } catch { return null }
}

const fmtDist = (m) => m >= 1000 ? `${(m/1000).toFixed(1)} km` : `${Math.round(m)} m`
const fmtTime = (s) => {
  const m = Math.round(s/60)
  if (m >= 60) return `${Math.floor(m/60)}h ${m%60}min`
  return `${m} min`
}

// Cores por índice de parada
const STOP_COLORS = ['#00E5A0','#60A5FA','#F59E0B','#F87171','#A78BFA','#34D399']

export default function MapView() {
  const { mode, ids } = useParams()   // /map/multi/:ids  ou  /map/single/:orderId
  const navigate = useNavigate()
  const { orders } = useOrders()

  // Resolve pedidos a exibir
  const targetOrders = mode === 'multi'
    ? ids.split(',').map(id => orders.find(o => o.id === id)).filter(Boolean)
    : [orders.find(o => o.id === ids)].filter(Boolean)

  const [currentIdx,  setCurrentIdx]  = useState(0)
  const [gpsPos,      setGpsPos]      = useState(null)
  const [routeInfo,   setRouteInfo]   = useState(null)
  const [optimized,   setOptimized]   = useState([]) // pedidos na ordem otimizada
  const [gpsError,    setGpsError]    = useState(false)
  const [loading,     setLoading]     = useState(true)

  const mapRef     = useRef(null)
  const mapInst    = useRef(null)
  const courierMkr = useRef(null)
  const routeLine  = useRef(null)
  const stopMkrs   = useRef([])
  const watchId    = useRef(null)

  const currentOrder = optimized[currentIdx] || targetOrders[0]

  // ── Build map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapInst.current || !mapRef.current || targetOrders.length === 0) return

    const map = L.map(mapRef.current, {
      center: [targetOrders[0].lat || -3.7317, targetOrders[0].lng || -38.5267],
      zoom: 14, zoomControl: false,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
    L.control.zoom({ position:'bottomright' }).addTo(map)
    mapInst.current = map

    return () => { map.remove(); mapInst.current = null }
  }, [])

  // ── GPS watch ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) { setGpsError(true); return }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords
        setGpsPos({ lat, lng, accuracy })
        setGpsError(false)
      },
      () => setGpsError(true),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    )
    return () => navigator.geolocation.clearWatch(watchId.current)
  }, [])

  // ── Atualiza marcador do entregador ──────────────────────────────────────────
  const updateCourierMarker = useCallback((pos) => {
    if (!mapInst.current || !pos) return
    const { lat, lng } = pos
    if (courierMkr.current) {
      courierMkr.current.setLatLng([lat, lng])
    } else {
      const icon = L.divIcon({
        html: `<div style="
          width:20px;height:20px;
          background:#60A5FA;border:3px solid #fff;
          border-radius:50%;
          box-shadow:0 0 0 4px rgba(96,165,250,0.3),0 2px 8px rgba(0,0,0,0.4);">
        </div>`,
        iconSize:[20,20], iconAnchor:[10,10], className:'',
      })
      courierMkr.current = L.marker([lat,lng], { icon, zIndexOffset:1000 })
        .addTo(mapInst.current)
        .bindPopup('<b style="font-family:Outfit,sans-serif;font-size:13px;">Você está aqui</b>')
    }
  }, [])

  useEffect(() => { updateCourierMarker(gpsPos) }, [gpsPos, updateCourierMarker])

  // ── Calcula e desenha rota otimizada ─────────────────────────────────────────
  const buildRoute = useCallback(async (pos) => {
    if (!mapInst.current || targetOrders.length === 0) return
    setLoading(true)

    // Remove linhas e marcadores anteriores
    routeLine.current?.forEach(l => l.remove())
    routeLine.current = []
    stopMkrs.current?.forEach(m => m.remove())
    stopMkrs.current = []

    // Waypoints: posição atual (se GPS) + destinos
    const origin = pos || { lat: targetOrders[0].lat - 0.009, lng: targetOrders[0].lng + 0.007 }
    const destinations = targetOrders.map(o => ({ lat: o.lat || -3.7317, lng: o.lng || -38.5267 }))
    const waypoints = [origin, ...destinations]

    // Rota via OSRM
    const result = await getOSRMRoute(waypoints)
    if (result?.geometry?.length > 0) {
      const latlngs = result.geometry.map(([lng, lat]) => [lat, lng])
      const line = L.polyline(latlngs, { color:'#00E5A0', weight:5, opacity:0.9, lineCap:'round' })
        .addTo(mapInst.current)
      routeLine.current = [line]
      setRouteInfo({ distance: result.distance, duration: result.duration })
    }

    // Determina ordem otimizada dos pedidos
    const orderedOrders = [...targetOrders] // mantém ordem original se OSRM não retornar trip
    setOptimized(orderedOrders)

    // Marcadores de parada numerados
    targetOrders.forEach((order, i) => {
      const color = STOP_COLORS[i % STOP_COLORS.length]
      const icon = L.divIcon({
        html: `<div style="
          position:relative;width:32px;height:42px;
          display:flex;align-items:flex-start;justify-content:center;">
          <div style="
            width:32px;height:32px;
            background:${color};border:2px solid #fff;
            border-radius:50% 50% 50% 0;transform:rotate(-45deg);
            box-shadow:0 3px 10px rgba(0,0,0,0.35);
            display:flex;align-items:center;justify-content:center;">
            <span style="transform:rotate(45deg);color:#080D1A;font-weight:800;font-size:12px;font-family:Outfit,sans-serif;">${i+1}</span>
          </div>
        </div>`,
        iconSize:[32,42], iconAnchor:[16,42], className:'',
      })
      const mkr = L.marker([order.lat || -3.7317, order.lng || -38.5267], { icon })
        .addTo(mapInst.current)
        .bindPopup(`<div style="font-family:Outfit,sans-serif;padding:4px;">
          <strong style="font-size:13px;">Parada ${i+1} — ${order.cliente_nome}</strong>
          <p style="font-size:11px;color:#6b7280;margin-top:4px;">${order.endereco}</p>
        </div>`)
      stopMkrs.current.push(mkr)
    })

    // Ajusta bounds
    const allPoints = [
      [origin.lat, origin.lng],
      ...targetOrders.map(o => [o.lat || -3.7317, o.lng || -38.5267])
    ]
    if (allPoints.length > 1) {
      mapInst.current.fitBounds(L.latLngBounds(allPoints), { padding:[60,60] })
    }

    setLoading(false)
  }, [targetOrders])

  // Recalcula rota quando GPS muda (primeira vez) ou ao montar
  const routeBuilt = useRef(false)
  useEffect(() => {
    if (!mapInst.current) return
    if (gpsPos && !routeBuilt.current) {
      routeBuilt.current = true
      buildRoute(gpsPos)
    } else if (!gpsPos && !routeBuilt.current) {
      const timer = setTimeout(() => {
        routeBuilt.current = true
        buildRoute(null)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [gpsPos, buildRoute])

  // Centraliza no entregador
  const centerOnMe = () => {
    if (!gpsPos || !mapInst.current) return
    mapInst.current.setView([gpsPos.lat, gpsPos.lng], 17, { animate: true })
  }

  // Centraliza na parada atual
  const centerOnStop = () => {
    const o = currentOrder
    if (!o || !mapInst.current) return
    mapInst.current.setView([o.lat || -3.7317, o.lng || -38.5267], 16, { animate: true })
    stopMkrs.current[currentIdx]?.openPopup()
  }

  if (targetOrders.length === 0) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)' }}>
      Nenhum pedido encontrado.
    </div>
  )

  return (
    <div style={s.page}>
      <div ref={mapRef} style={s.map} />

      {/* Botão voltar */}
      <button style={s.backBtn} onClick={() => navigate('/courier')}>
        <ArrowLeft size={16} /> Voltar
      </button>

      {/* Centralizar em mim */}
      <button style={s.locateBtn} onClick={centerOnMe} title="Minha localização">
        <Locate size={18} color={gpsPos ? 'var(--accent)' : 'var(--text-3)'} />
      </button>

      {/* Status de loading */}
      {loading && (
        <div style={s.loadingBadge}>
          <div style={{ width:12, height:12, borderRadius:'50%', border:'2px solid var(--accent)', borderTopColor:'transparent', animation:'spin 0.8s linear infinite' }} />
          Calculando rota…
        </div>
      )}

      {/* Resumo da rota */}
      {routeInfo && !loading && (
        <div style={s.routeSummary}>
          <Route size={13} color="var(--accent)" />
          <span style={{ color:'var(--accent)', fontWeight:700 }}>{fmtDist(routeInfo.distance)}</span>
          <span style={{ color:'var(--text-3)' }}>·</span>
          <span style={{ color:'var(--text-2)' }}>{fmtTime(routeInfo.duration)}</span>
          {targetOrders.length > 1 && (
            <><span style={{ color:'var(--text-3)' }}>·</span>
            <span style={{ color:'var(--text-2)' }}>{targetOrders.length} paradas</span></>
          )}
        </div>
      )}

      {/* GPS Error */}
      {gpsError && (
        <div style={s.gpsBadge}>⚠️ GPS indisponível — ative a localização</div>
      )}

      {/* ── Bottom sheet ── */}
      <div style={s.sheet}>
        <div style={s.handle} />

        {/* Navegação entre paradas (multi) */}
        {optimized.length > 1 && (
          <div style={s.stopNav}>
            <button style={s.stopNavBtn} disabled={currentIdx === 0}
              onClick={() => { setCurrentIdx(i => i-1); centerOnStop() }}>
              <ChevronLeft size={18} />
            </button>
            <div style={{ textAlign:'center', flex:1 }}>
              <div style={s.stopNavLabel}>Parada {currentIdx+1} de {optimized.length}</div>
              <div style={{ display:'flex', justifyContent:'center', gap:4, marginTop:4 }}>
                {optimized.map((_, i) => (
                  <div key={i} style={{
                    width:6, height:6, borderRadius:'50%',
                    background: i === currentIdx ? STOP_COLORS[i] : 'var(--border-2)',
                    transition:'background 0.2s',
                  }} />
                ))}
              </div>
            </div>
            <button style={s.stopNavBtn} disabled={currentIdx === optimized.length-1}
              onClick={() => { setCurrentIdx(i => i+1); centerOnStop() }}>
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
              <div style={{ ...s.stopBadge, background: STOP_COLORS[currentIdx] + '22', border:`1px solid ${STOP_COLORS[currentIdx]}55` }}>
                <Navigation size={18} color={STOP_COLORS[currentIdx]} />
              </div>
            </div>

            <div style={s.infoList}>
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
  loadingBadge:{ position:'absolute', top:70, left:'50%', transform:'translateX(-50%)', zIndex:500, display:'flex', alignItems:'center', gap:8, background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:20, padding:'7px 14px', fontSize:12, color:'var(--text-2)', boxShadow:'var(--shadow)', whiteSpace:'nowrap' },
  routeSummary:{ position:'absolute', top:70, left:'50%', transform:'translateX(-50%)', zIndex:500, display:'flex', alignItems:'center', gap:8, background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:20, padding:'7px 14px', fontSize:12, boxShadow:'var(--shadow)', whiteSpace:'nowrap' },
  gpsBadge:{ position:'absolute', top:70, left:'50%', transform:'translateX(-50%)', zIndex:500, background:'var(--danger-bg)', border:'1px solid rgba(248,113,113,0.3)', borderRadius:20, padding:'7px 14px', fontSize:12, color:'var(--danger)', whiteSpace:'nowrap' },
  sheet:{ background:'var(--bg-2)', borderTop:'1px solid var(--border-2)', borderRadius:'20px 20px 0 0', padding:'12px 18px 30px', zIndex:400, flexShrink:0 },
  handle:{ width:34, height:3, background:'var(--border-2)', borderRadius:2, margin:'0 auto 14px' },
  stopNav:{ display:'flex', alignItems:'center', gap:8, marginBottom:14, paddingBottom:14, borderBottom:'1px solid var(--border)' },
  stopNavBtn:{ width:36, height:36, borderRadius:9, background:'var(--bg-3)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)', flexShrink:0, cursor:'pointer', opacity:1 },
  stopNavLabel:{ fontSize:12, fontWeight:600, color:'var(--text-2)' },
  sheetRow:{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:12 },
  orderId:{ fontFamily:'var(--mono)', fontSize:10, color:'var(--text-3)', marginBottom:3 },
  clientName:{ fontSize:18, fontWeight:800, color:'var(--text-1)', letterSpacing:'-0.3px' },
  stopBadge:{ width:40, height:40, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  infoList:{ marginBottom:14 },
  btnRow:{ display:'flex', gap:10 },
  callBtn:{ flex:1, padding:'13px 0', background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:10, color:'var(--text-1)', fontSize:14, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:7, textDecoration:'none' },
  confirmBtn:{ flex:2.5, padding:'13px 0', background:'var(--accent)', borderRadius:10, color:'#080D1A', fontSize:14, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8 },
}
