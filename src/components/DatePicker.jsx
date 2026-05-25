import { useState, useRef, useEffect } from 'react'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DAYS   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

export default function DatePicker({ label, value, onChange, optional, placeholder = 'Selecionar data' }) {
  const today    = new Date()
  const parsed   = value ? new Date(value + 'T12:00:00') : null
  const [open, setOpen] = useState(false)
  const [view, setView] = useState({ month: parsed?.getMonth() ?? today.getMonth(), year: parsed?.getFullYear() ?? today.getFullYear() })
  const wrapRef  = useRef(null)

  // Fecha ao clicar fora
  useEffect(() => {
    const h = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const firstDay   = new Date(view.year, view.month, 1).getDay()
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const cells      = Array(firstDay).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1))
  while (cells.length % 7 !== 0) cells.push(null)

  const prevMonth = () => {
    if (view.month === 0) setView({ month:11, year: view.year - 1 })
    else setView({ month: view.month - 1, year: view.year })
  }
  const nextMonth = () => {
    if (view.month === 11) setView({ month:0, year: view.year + 1 })
    else setView({ month: view.month + 1, year: view.year })
  }

  const selectDay = (day) => {
    if (!day) return
    const iso = `${view.year}-${String(view.month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    onChange(iso)
    setOpen(false)
  }

  const clear = (e) => { e.stopPropagation(); onChange('') }

  const isSelected = (day) => {
    if (!day || !parsed) return false
    return parsed.getFullYear() === view.year && parsed.getMonth() === view.month && parsed.getDate() === day
  }

  const isToday = (day) => {
    if (!day) return false
    return today.getFullYear() === view.year && today.getMonth() === view.month && today.getDate() === day
  }

  const displayValue = parsed
    ? parsed.toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' })
    : ''

  return (
    <div ref={wrapRef} style={{ position:'relative' }}>
      {label && (
        <label style={s.label}>
          {label} {optional && <span style={{ color:'var(--text-3)', fontSize:11 }}>(opcional)</span>}
        </label>
      )}

      {/* Trigger */}
      <button type="button" style={{ ...s.trigger, ...(open ? s.triggerOpen : {}) }}
        onClick={() => setOpen(v => !v)}>
        <Calendar size={14} color={value ? 'var(--accent)' : 'var(--text-3)'} />
        <span style={{ flex:1, textAlign:'left', color: value ? 'var(--text-1)' : 'var(--text-3)', fontSize:13 }}>
          {displayValue || placeholder}
        </span>
        {value
          ? <button type="button" style={s.clearBtn} onClick={clear}><X size={12} /></button>
          : <ChevronRight size={13} color="var(--text-3)" style={{ transform: open ? 'rotate(90deg)' : 'none', transition:'transform 0.2s' }} />
        }
      </button>

      {/* Calendário */}
      {open && (
        <div style={s.cal} className="scale-in">
          {/* Navegação */}
          <div style={s.calNav}>
            <button type="button" style={s.navBtn} onClick={prevMonth}><ChevronLeft size={15} /></button>
            <span style={s.calTitle}>{MONTHS[view.month]} {view.year}</span>
            <button type="button" style={s.navBtn} onClick={nextMonth}><ChevronRight size={15} /></button>
          </div>

          {/* Dias da semana */}
          <div style={s.grid}>
            {DAYS.map(d => (
              <div key={d} style={s.dayLabel}>{d}</div>
            ))}
          </div>

          {/* Células */}
          <div style={s.grid}>
            {cells.map((day, i) => (
              <button key={i} type="button"
                disabled={!day}
                onClick={() => selectDay(day)}
                style={{
                  ...s.cell,
                  ...(isSelected(day) ? s.cellSelected : {}),
                  ...(isToday(day) && !isSelected(day) ? s.cellToday : {}),
                  ...(!day ? s.cellEmpty : {}),
                  cursor: day ? 'pointer' : 'default',
                }}>
                {day || ''}
              </button>
            ))}
          </div>

          {/* Atalho hoje */}
          <div style={s.calFoot}>
            <button type="button" style={s.todayBtn}
              onClick={() => { setView({ month: today.getMonth(), year: today.getFullYear() }); selectDay(today.getDate()) }}>
              Hoje
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const s = {
  label:{ display:'block', fontSize:12, fontWeight:500, color:'var(--text-2)', marginBottom:7 },
  trigger:{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'10px 12px', background:'var(--bg)', border:'1px solid var(--border-2)', borderRadius:'var(--radius-sm)', cursor:'pointer', transition:'border-color 0.2s, box-shadow 0.2s' },
  triggerOpen:{ borderColor:'var(--accent-border)', boxShadow:'0 0 0 3px rgba(0,229,160,0.08)' },
  clearBtn:{ display:'flex', alignItems:'center', justifyContent:'center', width:18, height:18, borderRadius:4, background:'var(--border-2)', color:'var(--text-3)', flexShrink:0 },
  cal:{ position:'absolute', left:0, right:0, top:'calc(100% + 6px)', background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:14, boxShadow:'var(--shadow)', zIndex:700, padding:'14px 12px 10px', minWidth:280 },
  calNav:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 },
  navBtn:{ display:'flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:8, background:'var(--bg-3)', border:'1px solid var(--border)', color:'var(--text-2)', cursor:'pointer' },
  calTitle:{ fontSize:14, fontWeight:700, color:'var(--text-1)' },
  grid:{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 },
  dayLabel:{ textAlign:'center', fontSize:10, fontWeight:700, color:'var(--text-3)', padding:'0 0 6px', textTransform:'uppercase', letterSpacing:'0.3px' },
  cell:{ height:34, borderRadius:8, border:'none', background:'transparent', color:'var(--text-2)', fontSize:13, fontWeight:500, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.12s' },
  cellSelected:{ background:'var(--accent)', color:'#080D1A', fontWeight:800 },
  cellToday:{ background:'var(--accent-dim)', color:'var(--accent)', fontWeight:700, border:'1px solid var(--accent-border)' },
  cellEmpty:{ opacity:0 },
  calFoot:{ display:'flex', justifyContent:'flex-end', paddingTop:10, marginTop:8, borderTop:'1px solid var(--border)' },
  todayBtn:{ padding:'6px 14px', background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text-2)', fontSize:12, fontWeight:600, cursor:'pointer' },
}
