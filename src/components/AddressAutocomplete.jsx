import { useState, useRef, useEffect } from 'react'
import { MapPin, Loader, X } from 'lucide-react'

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'

const formatAddress = (item) => {
  const a = item.address || {}
  const parts = []
  if (a.road) parts.push(a.road + (a.house_number ? ', ' + a.house_number : ''))
  if (a.suburb || a.neighbourhood) parts.push(a.suburb || a.neighbourhood)
  if (a.city || a.town || a.municipality) parts.push(a.city || a.town || a.municipality)
  if (a.state) parts.push(a.state)
  return parts.length > 0 ? parts.join(', ') : item.display_name
}

export default function AddressAutocomplete({ value, onChange, onSelect }) {
  const [query,       setQuery]       = useState(value || '')
  const [suggestions, setSuggestions] = useState([])
  const [loading,     setLoading]     = useState(false)
  const [open,        setOpen]        = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const debounceRef  = useRef(null)
  const abortRef     = useRef(null)
  const inputRef     = useRef(null)
  const wrapRef      = useRef(null)
  const skipSync     = useRef(false)  // evita loop ao selecionar

  // Sincroniza query com value externo (ex: reset do form, modal fecha/abre)
  useEffect(() => {
    if (skipSync.current) { skipSync.current = false; return }
    setQuery(value || '')
    if (!value) { setSuggestions([]); setOpen(false) }
  }, [value])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!query || query.length < 4) { setSuggestions([]); setOpen(false); return }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      abortRef.current?.abort()
      abortRef.current = new AbortController()
      try {
        const params = new URLSearchParams({
          q: query, format: 'json', addressdetails: 1,
          limit: 6, countrycodes: 'br', 'accept-language': 'pt-BR',
        })
        const res  = await fetch(`${NOMINATIM}?${params}`, { signal: abortRef.current.signal })
        const data = await res.json()
        const results = data.map(item => ({
          label: formatAddress(item),
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
        }))
        setSuggestions(results)
        setOpen(results.length > 0)
        setHighlighted(-1)
      } catch (e) {
        if (e.name !== 'AbortError') setSuggestions([])
      } finally { setLoading(false) }
    }, 420)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  const select = (item) => {
    skipSync.current = true  // evita que o useEffect de value resete o query
    setQuery(item.label); setSuggestions([]); setOpen(false)
    onChange(item.label)
    onSelect?.({ address: item.label, lat: item.lat, lng: item.lng })
  }

  const handleKey = (e) => {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h+1, suggestions.length-1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted(h => Math.max(h-1, 0)) }
    if (e.key === 'Enter' && highlighted >= 0) { e.preventDefault(); select(suggestions[highlighted]) }
    if (e.key === 'Escape')    { setOpen(false) }
  }

  useEffect(() => {
    const handler = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={wrapRef} style={{ position:'relative' }}>
      <label style={s.label}>
        Endereço de entrega <span style={{ color:'var(--danger)' }}>*</span>
      </label>

      <div style={s.wrap}>
        <MapPin size={14} color="var(--text-3)" style={s.iconLeft} />

        <input
          ref={inputRef}
          style={{ ...s.input, ...(open ? { borderColor:'var(--accent-border)', boxShadow:'0 0 0 3px rgba(0,229,160,0.08)' } : {}) }}
          value={query}
          placeholder="Comece a digitar o endereço…"
          onChange={e => { setQuery(e.target.value); onChange(e.target.value) }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onKeyDown={handleKey}
          autoComplete="off"
        />

        <div style={s.iconRight}>
          {loading
            ? <Loader size={13} color="var(--text-3)" style={{ animation:'spin 0.8s linear infinite' }} />
            : query
              ? <button type="button" style={s.clearBtn}
                  onClick={() => { setQuery(''); onChange(''); setSuggestions([]); setOpen(false); inputRef.current?.focus() }}>
                  <X size={12} />
                </button>
              : null
          }
        </div>
      </div>

      {open && suggestions.length > 0 && (
        <div style={s.dropdown} className="fade-in">
          {suggestions.map((item, i) => (
            <button key={i} type="button"
              style={{ ...s.item, background: i === highlighted ? 'var(--bg-3)' : 'transparent', borderLeft:`3px solid ${i === highlighted ? 'var(--accent)' : 'transparent'}` }}
              onMouseEnter={() => setHighlighted(i)}
              onMouseDown={e => { e.preventDefault(); select(item) }}>
              <MapPin size={13} color={i === highlighted ? 'var(--accent)' : 'var(--text-3)'} style={{ flexShrink:0, marginTop:2 }} />
              <span style={s.itemText}>{item.label}</span>
            </button>
          ))}
          <div style={s.footer}>🗺️ OpenStreetMap · Nominatim</div>
        </div>
      )}

      {!open && query.length >= 4 && !loading && suggestions.length === 0 && (
        <div style={{ ...s.dropdown, padding:'12px 14px' }}>
          <span style={{ fontSize:12, color:'var(--text-3)' }}>Nenhum resultado. Continue digitando ou insira manualmente.</span>
        </div>
      )}
    </div>
  )
}

const s = {
  label: { fontSize:12, fontWeight:500, color:'var(--text-2)', marginBottom:7, display:'block' },
  wrap:  { position:'relative' },
  iconLeft: { position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', zIndex:1 },
  iconRight: { position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', display:'flex', alignItems:'center', gap:4 },
  input: { width:'100%', padding:'10px 34px', background:'var(--bg)', border:'1px solid var(--border-2)', borderRadius:'var(--radius-sm)', color:'var(--text-1)', fontSize:13, fontFamily:'var(--font)', transition:'border-color 0.2s, box-shadow 0.2s' },
  clearBtn: { display:'flex', alignItems:'center', justifyContent:'center', width:18, height:18, borderRadius:4, background:'var(--border-2)', color:'var(--text-3)' },
  dropdown: { position:'absolute', left:0, right:0, top:'calc(100% + 4px)', background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:'var(--radius-sm)', boxShadow:'var(--shadow)', zIndex:600, overflow:'hidden', maxHeight:272, overflowY:'auto' },
  item: { width:'100%', display:'flex', alignItems:'flex-start', gap:9, padding:'11px 14px', textAlign:'left', color:'var(--text-2)', transition:'background 0.1s', cursor:'pointer', borderBottom:'1px solid var(--border)' },
  itemText: { fontSize:13, lineHeight:1.4, flex:1 },
  footer: { padding:'6px 14px', fontSize:10, color:'var(--text-3)', background:'var(--bg-3)' },
}
