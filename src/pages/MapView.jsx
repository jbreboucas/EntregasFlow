import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
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

const COLORS   = ['#00E5A0','#60A5FA','#F59E0B','#F87171','#A78BFA','#FB923C']
const fmtDist  = m => m >= 1000 ? `${(m/1000).toFixed(1)} km` : `${Math.round(m)} m`
const fmtTime  = s => { const m = Math.round(s/60); return m >= 60 ? `${Math.floor(m/60)}h ${m%60}min` : `${m} min` }

const haversine = (a1,n1,a2,n2) => {
  const R=6371000,r=Math.PI/180,da=(a2-a1)*r,dn=(n2-n1)*r
  const a=Math.sin(da/2)**2+Math.cos(a1*r)*Math.cos(a2*r)*Math.sin(dn/2)**2
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))
}
const distToPolyline = (lat,lng,pts) => {
  let min=Infinity
  for(let i=0;i<pts.length-1;i++){
    const[aL,aN]=pts[i],[bL,bN]=pts[i+1]
    const dx=bL-aL,dy=bN-aN,t=Math.max(0,Math.min(1,((lat-aL)*dx+(lng-aN)*dy)/(dx*dx+dy*dy+1e-12)))
    const d=haversine(lat,lng,aL+t*dx,aN+t*dy)
    if(d<min)min=d
  }
  return min
}

const fetchSegment = async (from, to) => {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const d = await r.json()
    const route = d.routes?.[0]
    if (!route) return null
    return { points: route.geometry.coordinates.map(([lng,lat])=>[lat,lng]), distance: route.distance, duration: route.duration }
  } catch { return null }
}

const fetchOptimizedTrip = async (waypoints) => {
  const coords = waypoints.map(p=>`${p.lng},${p.lat}`).join(';')
  const url = `https://router.project-osrm.org/trip/v1/driving/${coords}?roundtrip=false&source=first&overview=false`
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) })
    const d = await r.json()
    if (d.code !== 'Ok' || !d.waypoints?.length) return null
    const dests = d.waypoints.slice(1).map((w,i) => ({ origIdx:i, tripPos:w.waypoint_index }))
    dests.sort((a,b) => a.tripPos - b.tripPos)
    return { order: dests.map(d=>d.origIdx) }
  } catch { return null }
}

const speak = text => {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang='pt-BR'; u.rate=1.0
  const v = window.speechSynthesis.getVoices().find(v=>v.lang.startsWith('pt'))
  if (v) u.voice=v
  window.speechSynthesis.speak(u)
}

function makeStopIcon(num, color, active) {
  const sz = active ? 40 : 32
  return L.divIcon({
    html:`<div style="width:${sz}px;height:${sz}px;background:${color};border:${active?3:2}px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:${active?`0 0 0 4px ${color}44,0 4px 14px rgba(0,0,0,0.45)`:'0 2px 6px rgba(0,0,0,0.3)'};font-family:Outfit,sans-serif;font-weight:900;font-size:${active?14:12}px;color:#080D1A;cursor:pointer;">${num}</div>`,
    iconSize:[sz,sz], iconAnchor:[sz/2,sz/2], className:'',
  })
}

const IDLE='idle', ACTIVE='active', PAUSED='paused'

export default function MapView() {
  const { ids }  = useParams()
  const navigate = useNavigate()
  const { orders, setOrders } = useOrders()

  const [pedidos,     setPedidos]     = useState([])
  const [seqOrder,    setSeqOrder]    = useState([])
  const [activeIdx,   setActiveIdx]   = useState(0)
  const [gpsPos,      setGpsPos]      = useState(null)
  const [routeState,  setRouteState]  = useState(IDLE)
  const [routeData,   setRouteData]   = useState([])
  const [loadingIdx,  setLoadingIdx]  = useState([])
  const [showReorder, setShowReorder] = useState(false)
  const [showNavApps, setShowNavApps] = useState(false)
  const [dragOver,    setDragOver]    = useState(null)
  const [ready,       setReady]       = useState(false)  // mapa+GPS prontos

  // refs
  const mapRef       = useRef(null)
  const mapInst      = useRef(null)
  const myMkr        = useRef(null)
  const routeLines   = useRef([])
  const stopMkrs     = useRef([])
  const routePts     = useRef([])
  const originRef    = useRef(null)
  const gpsRef       = useRef(null)       // espelho síncrono do gpsPos
  const seqRef       = useRef([])         // espelho síncrono do seqOrder
  const pedidosRef   = useRef([])         // espelho síncrono dos pedidos
  const activeIdxRef = useRef(0)
  const routeStateRef= useRef(IDLE)
  const didBuild     = useRef(false)
  const lastRecalc   = useRef(0)
  const dragSrc      = useRef(null)
  const listRef      = useRef(null)

  // mantém refs sincronizados
  useEffect(() => { gpsRef.current      = gpsPos     }, [gpsPos])
  useEffect(() => { seqRef.current      = seqOrder   }, [seqOrder])
  useEffect(() => { pedidosRef.current  = pedidos    }, [pedidos])
  useEffect(() => { activeIdxRef.current= activeIdx  }, [activeIdx])
  useEffect(() => { routeStateRef.current=routeState }, [routeState])

  const orderedPedidos = useMemo(()=>seqOrder.map(i=>pedidos[i]).filter(Boolean),[seqOrder,pedidos])
  const currentOrder   = orderedPedidos[activeIdx]

  // ── 1. Resolve pedidos (UMA VEZ) ──────────────────────────────────────────
  useEffect(() => {
    if (!ids) return
    const idList = ids.split(',').filter(Boolean)
    const resolve = all => {
      const found = idList.map(id=>all.find(o=>o.id===id)).filter(Boolean)
      setPedidos(found)
      setSeqOrder(found.map((_,i)=>i))
    }
    const fromCtx = idList.map(id=>orders.find(o=>o.id===id)).filter(Boolean)
    if (fromCtx.length === idList.length) resolve(orders)
    else getPedidos().then(({data})=>{ if(data){setOrders(data);resolve(data)} })
  }, [ids]) // eslint-disable-line

  // ── 2. Cria mapa (UMA VEZ quando ref está pronta) ─────────────────────────
  useEffect(() => {
    if (!mapRef.current) return
    // Aguarda DOM estar estável
    const t = setTimeout(() => {
      if (mapInst.current) return
      const map = L.map(mapRef.current, { center:[-3.7317,-38.5267], zoom:13, zoomControl:false })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
      L.control.zoom({ position:'bottomright' }).addTo(map)
      mapInst.current = map
    }, 100)
    return () => {
      clearTimeout(t)
      if (mapInst.current) { mapInst.current.remove(); mapInst.current=null; myMkr.current=null }
    }
  }, [])  // sem deps — cria apenas uma vez

  // ── 3. GPS ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let gpsOk = false
    const fallback = setTimeout(() => { if (!gpsOk) setReady(true) }, 5000)
    if (!navigator.geolocation) { setReady(true); return }
    const wid = navigator.geolocation.watchPosition(
      pos => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setGpsPos(p); gpsRef.current = p
        if (!gpsOk) { gpsOk=true; setReady(true) }
      },
      () => setReady(true),
      { enableHighAccuracy:true, maximumAge:3000, timeout:10000 }
    )
    return () => { navigator.geolocation.clearWatch(wid); clearTimeout(fallback) }
  }, [])

  // ── 4. buildRoutes (função pura, sem deps de state) ───────────────────────
  const buildRoutes = useCallback(async (pos, sq, peds, actIdx, forceOrder=false) => {
    const map = mapInst.current
    if (!map || !peds || peds.length === 0) return

    // limpa
    routeLines.current.forEach(l=>l?.remove())
    stopMkrs.current.forEach(m=>m?.remove())
    routeLines.current = []; stopMkrs.current = []; routePts.current = []

    const from = pos || { lat:(peds[0].lat||-3.7317)-0.012, lng:(peds[0].lng||-38.5267)+0.009 }
    originRef.current = from

    let finalSeq = sq

    // Otimização OSRM trip
    if (!forceOrder && peds.length > 1) {
      const wps = [from, ...sq.map(i=>({ lat:peds[i]?.lat||-3.7317, lng:peds[i]?.lng||-38.5267 }))]
      const trip = await fetchOptimizedTrip(wps)
      if (trip?.order?.length === sq.length) {
        finalSeq = trip.order.map(i=>sq[i])
        setSeqOrder(finalSeq)
        speak(`Rota otimizada. ${peds.length} paradas na melhor sequência.`)
      }
    }

    const ordered = finalSeq.map(i=>peds[i]).filter(Boolean)

    // Centraliza o mapa
    const allPts = [[from.lat,from.lng], ...peds.map(o=>[o.lat||-3.7317,o.lng||-38.5267])]
    map.fitBounds(L.latLngBounds(allPts), { padding:[60,60] })

    // Marcadores
    ordered.forEach((ped,si) => {
      const col = COLORS[si%COLORS.length]
      const mkr = L.marker([ped.lat||-3.7317,ped.lng||-38.5267],{icon:makeStopIcon(si+1,col,si===actIdx)})
        .addTo(map).on('click',()=>setActiveIdx(si))
      stopMkrs.current[si] = mkr
    })

    // Rotas em cadeia
    setLoadingIdx(peds.map((_,i)=>i))
    const chain = [from,...ordered.map(p=>({lat:p.lat||-3.7317,lng:p.lng||-38.5267}))]
    const segs  = await Promise.all(chain.slice(0,-1).map((wp,i)=>fetchSegment(wp,chain[i+1])))

    segs.forEach((res,si) => {
      if (!res || !mapInst.current) return
      const col  = COLORS[si%COLORS.length]
      const isAct = si===actIdx
      L.polyline(res.points,{color:'#fff',weight:isAct?11:9,opacity:0.15}).addTo(map).bringToBack()
      const line = L.polyline(res.points,{color:col,weight:isAct?7:5,opacity:isAct?1:0.65}).addTo(map)
      routeLines.current[si] = line
      routePts.current[si]   = res.points
      setRouteData(prev => { const n=[...prev]; n[si]={distance:res.distance,duration:res.duration}; return n })
    })
    setLoadingIdx([])
  }, []) // eslint-disable-line

  // ── 5. Dispara buildRoutes quando mapa+GPS+pedidos prontos ────────────────
  useEffect(() => {
    if (!ready || pedidos.length === 0 || didBuild.current) return
    const map = mapInst.current
    if (!map) return
    didBuild.current = true
    buildRoutes(gpsRef.current, seqRef.current, pedidosRef.current, activeIdxRef.current)
  }, [ready, pedidos, buildRoutes])

  // ── 6. Marcador GPS + pan + desvio ───────────────────────────────────────
  useEffect(() => {
    const map = mapInst.current
    if (!map || !gpsPos) return
    const {lat,lng} = gpsPos
    if (myMkr.current) myMkr.current.setLatLng([lat,lng])
    else {
      myMkr.current = L.marker([lat,lng],{icon:L.divIcon({
        html:`<div style="width:22px;height:22px;background:#60A5FA;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 6px rgba(96,165,250,0.2);"></div>`,
        iconSize:[22,22],iconAnchor:[11,11],className:'',
      }),zIndexOffset:2000}).addTo(map)
    }
    if (routeStateRef.current===ACTIVE) map.panTo([lat,lng],{animate:true,duration:0.8})

    // Desvio
    if (routeStateRef.current!==ACTIVE) return
    if (!didBuild.current) return
    if (Date.now()-lastRecalc.current<15000) return
    const pts = routePts.current.find(p=>p?.length>0)
    if (!pts || distToPolyline(lat,lng,pts) <= 80) return
    lastRecalc.current = Date.now()
    speak('Recalculando rota.')
    didBuild.current = false
    setTimeout(() => {
      didBuild.current = true
      buildRoutes(gpsRef.current,seqRef.current,pedidosRef.current,activeIdxRef.current)
    }, 400)
  }, [gpsPos]) // eslint-disable-line

  // ── selectStop ────────────────────────────────────────────────────────────
  const selectStop = useCallback(si => {
    setActiveIdx(si)
    const ordered = seqRef.current.map(i=>pedidosRef.current[i]).filter(Boolean)
    const ped = ordered[si]
    if (!ped || !mapInst.current) return
    ordered.forEach((_,i) => {
      routeLines.current[i]?.setStyle({weight:i===si?7:5,opacity:i===si?1:0.65})
      stopMkrs.current[i]?.setIcon(makeStopIcon(i+1,COLORS[i%COLORS.length],i===si))
    })
    mapInst.current.setView([ped.lat||-3.7317,ped.lng||-38.5267],15,{animate:true})
    if (routeStateRef.current===ACTIVE) speak(`Parada ${si+1}: ${ped.cliente_nome||ped.endereco}`)
  }, [])

  // ── Controles de rota ─────────────────────────────────────────────────────
  const startRoute  = () => { setRouteState(ACTIVE);  speak(`Rota iniciada. ${orderedPedidos.length} entrega${orderedPedidos.length>1?'s':''} programadas. Primeira parada: ${orderedPedidos[activeIdx]?.cliente_nome||'destino'}`) }
  const pauseRoute  = () => { setRouteState(PAUSED);  speak('Rota pausada.') }
  const resumeRoute = () => { setRouteState(ACTIVE);  speak('Rota retomada.') }
  const endRoute    = () => { setRouteState(IDLE);    speak('Rota finalizada. Bom trabalho!'); setTimeout(()=>navigate('/courier'),2500) }

  // ── Navegar com app externo ───────────────────────────────────────────────
  const openNavApp = app => {
    if (!currentOrder) return
    const lat=currentOrder.lat||-3.7317, lng=currentOrder.lng||-38.5267
    const urls={waze:`waze://?ll=${lat},${lng}&navigate=yes`,gmaps:`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,amaps:`maps://?daddr=${lat},${lng}`,moovit:`moovit://directions?dest_lat=${lat}&dest_lon=${lng}`}
    window.open(urls[app],'_blank'); setShowNavApps(false)
  }

  // ── Reordenar ─────────────────────────────────────────────────────────────
  const applyReorder = (from, to) => {
    if (from===to) return
    const next=[...seqRef.current]; const[m]=next.splice(from,1); next.splice(to,0,m)
    setSeqOrder(next); setActiveIdx(0); seqRef.current=next
    speak(`Ordem atualizada. Parada 1: ${pedidosRef.current[next[0]]?.cliente_nome||pedidosRef.current[next[0]]?.endereco}`)
    didBuild.current=false
    setTimeout(()=>{ didBuild.current=true; buildRoutes(gpsRef.current,next,pedidosRef.current,0,true) },100)
  }
  const onDragStart=(e,i)=>{dragSrc.current=i;e.dataTransfer.effectAllowed='move'}
  const onDragOver=(e,i)=>{e.preventDefault();setDragOver(i)}
  const onDrop=(e,i)=>{e.preventDefault();setDragOver(null);applyReorder(dragSrc.current,i);dragSrc.current=null}
  const touchSrc=useRef(null)
  const onTouchStart=(_,i)=>{ touchSrc.current=i }
  const onTouchMove=e=>{
    e.preventDefault()
    if(!listRef.current)return
    const y=e.touches[0].clientY
    listRef.current.querySelectorAll('[data-item]').forEach((el,i)=>{ const r=el.getBoundingClientRect(); if(y>=r.top&&y<=r.bottom)setDragOver(i) })
  }
  const onTouchEnd=()=>{ if(touchSrc.current!==null&&dragOver!==null)applyReorder(touchSrc.current,dragOver); touchSrc.current=null; setDragOver(null) }

  const centerOnMe = () => { if(gpsPos&&mapInst.current)mapInst.current.setView([gpsPos.lat,gpsPos.lng],16,{animate:true}) }

  const currentRoute = currentOrder ? routeData[orderedPedidos.indexOf(currentOrder)] : null
  const stillLoading = loadingIdx.length > 0

  return (
    <div style={s.page}>
      <div ref={mapRef} style={s.map} />
      <button style={s.backBtn} onClick={()=>navigate('/courier')}><ArrowLeft size={16}/> Voltar</button>
      <button style={s.locateBtn} onClick={centerOnMe}><Locate size={18} color={gpsPos?'var(--accent)':'var(--text-3)'}/></button>

      {(stillLoading||currentRoute)&&(
        <div style={s.badge}>
          {stillLoading?<><div style={s.spin}/>Calculando rotas…</>
            :<><div style={{width:10,height:10,borderRadius:'50%',background:COLORS[activeIdx%COLORS.length]}}/>
              <b style={{color:COLORS[activeIdx%COLORS.length]}}>{fmtDist(currentRoute.distance)}</b>
              <span style={{color:'var(--text-3)'}}>·</span>
              <span style={{color:'var(--text-2)'}}>{fmtTime(currentRoute.duration)}</span>
            </>}
        </div>
      )}

      {routeState!==IDLE&&(
        <div style={{...s.stateBadge,background:routeState===ACTIVE?'rgba(0,229,160,.15)':'rgba(245,158,11,.15)',borderColor:routeState===ACTIVE?'var(--accent-border)':'rgba(245,158,11,.3)'}}>
          <div style={{width:8,height:8,borderRadius:'50%',background:routeState===ACTIVE?'var(--accent)':'var(--pending)',animation:routeState===ACTIVE?'pulseDot 1.5s infinite':'none'}}/>
          <span style={{fontSize:12,fontWeight:700,color:routeState===ACTIVE?'var(--accent)':'var(--pending)'}}>{routeState===ACTIVE?'Em andamento':'Pausada'}</span>
        </div>
      )}

      <div style={s.sheet}>
        <div style={s.handle}/>

        {showReorder&&orderedPedidos.length>1&&(
          <div style={s.reorderWrap}>
            <div style={s.reorderHead}><span style={{fontSize:13,fontWeight:700,color:'var(--text-1)'}}>Reordenar entregas</span><button style={s.closeBtn} onClick={()=>setShowReorder(false)}>✕</button></div>
            <p style={{fontSize:11,color:'var(--text-3)',margin:'0 0 8px'}}>Segure e arraste para mudar a ordem</p>
            <div ref={listRef} style={{display:'flex',flexDirection:'column',gap:6,touchAction:'none'}} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
              {seqOrder.map((ri,si)=>{
                const ped=pedidos[ri]
                return(
                  <div key={ri} data-item draggable onDragStart={e=>onDragStart(e,si)} onDragOver={e=>onDragOver(e,si)} onDrop={e=>onDrop(e,si)} onDragEnd={()=>{dragSrc.current=null;setDragOver(null)}} onTouchStart={e=>onTouchStart(e,si)}
                    style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:10,background:dragOver===si?'var(--accent-dim)':'var(--bg-3)',border:`1px solid ${dragOver===si?'var(--accent)':'var(--border)'}`,userSelect:'none',WebkitUserSelect:'none'}}>
                    <div style={{width:30,height:30,borderRadius:'50%',background:COLORS[si%COLORS.length],color:'#080D1A',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:900,flexShrink:0}}>{si+1}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:'var(--text-1)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{ped?.cliente_nome||'Sem nome'}</div>
                      <div style={{fontSize:11,color:'var(--text-3)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',marginTop:1}}>{ped?.endereco}</div>
                    </div>
                    <GripVertical size={18} color="var(--text-3)" style={{flexShrink:0,touchAction:'none'}}/>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!showReorder&&orderedPedidos.length>1&&(
          <div style={s.stopNav}>
            <button style={{...s.navBtn,opacity:activeIdx===0?.3:1}} disabled={activeIdx===0} onClick={()=>selectStop(activeIdx-1)}><ChevronLeft size={18}/></button>
            <div style={{textAlign:'center',flex:1}}>
              <div style={{fontSize:12,fontWeight:600,color:'var(--text-2)'}}>Parada {activeIdx+1} de {orderedPedidos.length}</div>
              <div style={{display:'flex',justifyContent:'center',gap:5,marginTop:5}}>
                {orderedPedidos.map((_,i)=>(
                  <button key={i} onClick={()=>selectStop(i)} style={{width:i===activeIdx?20:7,height:7,borderRadius:4,background:i===activeIdx?COLORS[i%COLORS.length]:'var(--border-2)',transition:'all .25s',cursor:'pointer',border:'none',padding:0}}/>
                ))}
              </div>
            </div>
            <button style={{...s.navBtn,opacity:activeIdx===orderedPedidos.length-1?.3:1}} disabled={activeIdx===orderedPedidos.length-1} onClick={()=>selectStop(activeIdx+1)}><ChevronRight size={18}/></button>
            <button style={s.navBtn} onClick={()=>setShowReorder(true)}><GripVertical size={15}/></button>
          </div>
        )}

        {currentOrder&&!showReorder&&(
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
              {currentOrder.cliente_telefone&&<InfoRow icon={Phone} text={currentOrder.cliente_telefone}/>}
              <InfoRow icon={MapPin} text={currentOrder.endereco}/>
            </div>
            <div style={s.actionBtns}>
              <a href={`tel:${currentOrder.cliente_telefone}`} style={s.callBtn}><Phone size={14}/> Ligar</a>
              <button style={s.navAppBtn} onClick={()=>setShowNavApps(v=>!v)}>🧭 Navegar</button>
              <button style={s.confirmBtn} onClick={()=>navigate(`/confirm/${currentOrder.id}`)}><CheckCircle size={15}/> Confirmar</button>
            </div>
            {showNavApps&&(
              <div style={s.navPanel}>
                <div style={s.navPanelTitle}>Abrir no aplicativo:</div>
                <div style={s.navGrid}>
                  {[{id:'waze',label:'Waze',emoji:'🟦'},{id:'gmaps',label:'Google Maps',emoji:'🗺️'},{id:'amaps',label:'Apple Maps',emoji:'🍎'},{id:'moovit',label:'Moovit',emoji:'🚌'}].map(app=>(
                    <button key={app.id} style={s.navAppItem} onClick={()=>openNavApp(app.id)}><span style={{fontSize:24}}>{app.emoji}</span><span style={{fontSize:10,fontWeight:600,color:'var(--text-2)'}}>{app.label}</span></button>
                  ))}
                </div>
                <button style={s.cancelBtn} onClick={()=>setShowNavApps(false)}>Cancelar</button>
              </div>
            )}
          </>
        )}

        {!showReorder&&(
          <div style={s.routeControls}>
            {routeState===IDLE   &&<button style={s.startBtn} onClick={startRoute}><Play size={16}/> Iniciar rota</button>}
            {routeState===ACTIVE &&<><button style={s.pauseBtn} onClick={pauseRoute}><Pause size={16}/> Pausar</button><button style={s.endBtn} onClick={endRoute}><StopCircle size={16}/> Finalizar</button></>}
            {routeState===PAUSED &&<><button style={s.startBtn} onClick={resumeRoute}><Play size={16}/> Retomar</button><button style={s.endBtn} onClick={endRoute}><StopCircle size={16}/> Finalizar</button></>}
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({icon:Icon,text}){return(<div style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:5}}><Icon size={14} color="var(--text-3)" style={{marginTop:1,flexShrink:0}}/><span style={{fontSize:13,color:'var(--text-2)',lineHeight:1.5}}>{text}</span></div>)}

const s={
  page:{position:'fixed',inset:0,display:'flex',flexDirection:'column',background:'var(--bg)'},
  map:{flex:1,zIndex:1,minHeight:0},
  backBtn:{position:'absolute',top:16,left:16,zIndex:500,display:'flex',alignItems:'center',gap:7,padding:'10px 14px',background:'var(--bg-2)',border:'1px solid var(--border-2)',borderRadius:10,color:'var(--text-1)',fontSize:13,fontWeight:600,boxShadow:'var(--shadow)'},
  locateBtn:{position:'absolute',top:16,right:16,zIndex:500,width:42,height:42,background:'var(--bg-2)',border:'1px solid var(--border-2)',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'var(--shadow)',cursor:'pointer'},
  badge:{position:'absolute',top:70,left:'50%',transform:'translateX(-50%)',zIndex:500,display:'flex',alignItems:'center',gap:7,background:'var(--bg-2)',border:'1px solid var(--border-2)',borderRadius:20,padding:'7px 14px',fontSize:12,color:'var(--text-2)',boxShadow:'var(--shadow)',whiteSpace:'nowrap'},
  spin:{width:12,height:12,borderRadius:'50%',border:'2px solid var(--accent)',borderTopColor:'transparent',animation:'spin 0.7s linear infinite'},
  stateBadge:{position:'absolute',top:110,left:'50%',transform:'translateX(-50%)',zIndex:500,display:'flex',alignItems:'center',gap:7,borderRadius:20,border:'1px solid',padding:'6px 13px',boxShadow:'var(--shadow)',whiteSpace:'nowrap'},
  sheet:{background:'var(--bg-2)',borderTop:'1px solid var(--border-2)',borderRadius:'20px 20px 0 0',padding:'12px 16px 28px',zIndex:400,flexShrink:0},
  handle:{width:34,height:3,background:'var(--border-2)',borderRadius:2,margin:'0 auto 14px'},
  reorderWrap:{background:'var(--bg-3)',border:'1px solid var(--border)',borderRadius:12,padding:'12px 12px 14px',marginBottom:14},
  reorderHead:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6},
  closeBtn:{width:26,height:26,borderRadius:7,background:'var(--bg-2)',border:'1px solid var(--border)',color:'var(--text-2)',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'},
  stopNav:{display:'flex',alignItems:'center',gap:8,marginBottom:12,paddingBottom:12,borderBottom:'1px solid var(--border)'},
  navBtn:{width:36,height:36,borderRadius:9,background:'var(--bg-3)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-2)',cursor:'pointer',flexShrink:0},
  sheetRow:{display:'flex',alignItems:'flex-start',gap:12,marginBottom:10},
  stopBadge:{width:40,height:40,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0},
  actionBtns:{display:'flex',gap:8,marginBottom:10},
  callBtn:{flex:1,padding:'11px 0',background:'var(--bg-3)',border:'1px solid var(--border)',borderRadius:10,color:'var(--text-1)',fontSize:12,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',gap:6,textDecoration:'none'},
  navAppBtn:{flex:1,padding:'11px 0',background:'var(--bg-3)',border:'1px solid var(--border)',borderRadius:10,color:'var(--text-1)',fontSize:12,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',gap:6},
  confirmBtn:{flex:1.5,padding:'11px 0',background:'var(--accent)',borderRadius:10,color:'#080D1A',fontSize:12,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',gap:6},
  navPanel:{background:'var(--bg-3)',border:'1px solid var(--border)',borderRadius:14,padding:'12px',marginBottom:10},
  navPanelTitle:{fontSize:11,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:10,textAlign:'center'},
  navGrid:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:10},
  navAppItem:{display:'flex',flexDirection:'column',alignItems:'center',gap:6,padding:'12px 6px',borderRadius:12,background:'var(--bg-2)',border:'1px solid var(--border)',cursor:'pointer'},
  cancelBtn:{width:'100%',padding:'9px',background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:9,color:'var(--text-3)',fontSize:13,cursor:'pointer'},
  routeControls:{display:'flex',gap:8},
  startBtn:{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'13px 0',background:'var(--accent)',color:'#080D1A',borderRadius:10,fontSize:14,fontWeight:800},
  pauseBtn:{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'13px 0',background:'var(--pending-bg)',border:'1px solid rgba(245,158,11,.3)',color:'var(--pending)',borderRadius:10,fontSize:14,fontWeight:700},
  endBtn:{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'13px 0',background:'var(--danger-bg)',border:'1px solid rgba(248,113,113,.3)',color:'var(--danger)',borderRadius:10,fontSize:14,fontWeight:700},
}
