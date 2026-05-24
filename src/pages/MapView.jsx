import { useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOrders } from '../App'
import { ArrowLeft, Phone, MapPin, Navigation, CheckCircle } from 'lucide-react'
import L from 'leaflet'

// Fix Leaflet's default icon path in Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export default function MapView() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const { orders } = useOrders()
  const order = orders.find(o => o.id === orderId)

  const mapRef  = useRef(null)
  const mapInst = useRef(null)

  useEffect(() => {
    if (!order || mapInst.current) return

    const map = L.map(mapRef.current, {
      center: [order.lat, order.lng],
      zoom: 14,
      zoomControl: false,
    })

    // OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

    // Destination marker (pin)
    const destIcon = L.divIcon({
      html: `
        <div style="
          position:relative; width:36px; height:36px;
          display:flex; align-items:center; justify-content:center;
        ">
          <div style="
            width:36px; height:36px;
            background:#00E5A0; border:3px solid #080D1A;
            border-radius:50% 50% 50% 0; transform:rotate(-45deg);
            box-shadow:0 3px 10px rgba(0,229,160,0.5);
          "></div>
        </div>`,
      iconSize: [36, 42],
      iconAnchor: [18, 42],
      className: '',
    })

    L.marker([order.lat, order.lng], { icon: destIcon })
      .addTo(map)
      .bindPopup(`
        <div style="font-family:'Outfit',sans-serif;padding:4px 2px;">
          <strong style="font-size:14px;">${order.cliente_nome}</strong>
          <p style="font-size:12px;margin-top:4px;color:#6b7280;">${order.endereco}</p>
        </div>`)

    // Courier position (simulated ~1km away)
    const oLat = order.lat + 0.009
    const oLng = order.lng - 0.007

    const courierIcon = L.divIcon({
      html: `
        <div style="
          width:30px; height:30px;
          background:#60A5FA; border:3px solid #080D1A;
          border-radius:50%;
          box-shadow:0 3px 10px rgba(96,165,250,0.5);
          display:flex; align-items:center; justify-content:center;
        ">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#080D1A" stroke="#080D1A" stroke-width="2">
            <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>
          </svg>
        </div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      className: '',
    })

    L.marker([oLat, oLng], { icon: courierIcon })
      .addTo(map)
      .bindPopup('<b style="font-family:Outfit,sans-serif;">Sua posição</b>')

    // Route line (simplified; in production use OSRM API)
    const routePoints = [
      [oLat,             oLng],
      [oLat - 0.003,     oLng + 0.002],
      [oLat - 0.005,     oLng + 0.004],
      [order.lat + 0.003, order.lng - 0.001],
      [order.lat,        order.lng],
    ]
    L.polyline(routePoints, {
      color: '#00E5A0', weight: 5, opacity: 0.85,
    }).addTo(map)

    // Fit both markers
    const bounds = L.latLngBounds([[oLat, oLng], [order.lat, order.lng]])
    map.fitBounds(bounds, { padding: [70, 70] })

    // Add zoom control bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    mapInst.current = map
    return () => { map.remove(); mapInst.current = null }
  }, [order])

  if (!order) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)' }}>
      Pedido não encontrado.
    </div>
  )

  return (
    <div style={s.page}>
      {/* Map fills the screen */}
      <div ref={mapRef} style={s.map} />

      {/* Back button */}
      <button style={s.backBtn} onClick={() => navigate('/courier')}>
        <ArrowLeft size={17} /> Voltar
      </button>

      {/* ── Bottom sheet ── */}
      <div style={s.sheet}>
        <div style={s.handle} />

        <div style={s.sheetRow}>
          <div style={{ flex: 1 }}>
            <div style={s.orderId}># {order.id}</div>
            <div style={s.clientName}>{order.cliente_nome}</div>
          </div>
          <div style={s.navBadge}><Navigation size={18} color="var(--in-route)" /></div>
        </div>

        <div style={s.infoList}>
          <InfoRow icon={Phone}  text={order.cliente_telefone} />
          <InfoRow icon={MapPin} text={order.endereco} />
        </div>

        <div style={s.btnRow}>
          <a href={`tel:${order.cliente_telefone}`} style={s.callBtn}>
            <Phone size={15} /> Ligar
          </a>
          <button style={s.confirmBtn} onClick={() => navigate(`/confirm/${order.id}`)}>
            <CheckCircle size={16} /> Confirmar entrega
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon: Icon, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
      <Icon size={14} color="var(--text-3)" style={{ marginTop: 1, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{text}</span>
    </div>
  )
}

const s = {
  page: { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg)' },
  map: { flex: 1, zIndex: 1 },

  backBtn: {
    position: 'absolute', top: 16, left: 16, zIndex: 500,
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '10px 14px', background: 'var(--bg-2)',
    border: '1px solid var(--border-2)', borderRadius: 10,
    color: 'var(--text-1)', fontSize: 13, fontWeight: 600,
    boxShadow: 'var(--shadow)',
  },

  sheet: {
    background: 'var(--bg-2)', borderTop: '1px solid var(--border-2)',
    borderRadius: '20px 20px 0 0', padding: '14px 18px 30px',
    zIndex: 400, flexShrink: 0,
  },
  handle: { width: 34, height: 3, background: 'var(--border-2)', borderRadius: 2, margin: '0 auto 16px' },
  sheetRow: { display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  orderId: { fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', marginBottom: 3 },
  clientName: { fontSize: 18, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.3px' },
  navBadge: {
    width: 40, height: 40, borderRadius: 10,
    background: 'var(--in-route-bg)', border: '1px solid rgba(96,165,250,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  infoList: { marginBottom: 16 },

  btnRow: { display: 'flex', gap: 10 },
  callBtn: {
    flex: 1, padding: '13px 0', background: 'var(--bg-3)',
    border: '1px solid var(--border)', borderRadius: 10,
    color: 'var(--text-1)', fontSize: 14, fontWeight: 600,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    textDecoration: 'none',
  },
  confirmBtn: {
    flex: 2.5, padding: '13px 0', background: 'var(--accent)',
    borderRadius: 10, color: '#080D1A', fontSize: 14, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
}
