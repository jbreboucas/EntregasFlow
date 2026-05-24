import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn } from '../lib/supabase'
import { Mail, Lock, ArrowRight, Package, Truck, ShieldCheck } from 'lucide-react'

export default function Login() {
  const navigate = useNavigate()
  const [role,     setRole]     = useState('admin')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    const { data, error: authError } = await signIn(email, password)
    if (authError) {
      setError('Email ou senha incorretos. Verifique suas credenciais.')
      setLoading(false); return
    }
    // role redirect handled by App.jsx onAuthStateChange
    navigate('/', { replace: true })
    setLoading(false)
  }

  return (
    <div style={s.page}>
      <div style={s.grid} />
      <div style={s.glow} />
      <div style={s.card} className="fade-up">
        <div style={s.brand}>
          <div style={s.brandIcon}><Package size={22} color="var(--accent)" /></div>
          <div>
            <div style={s.brandName}>EntregaFlow</div>
            <div style={s.brandSub}>Gestão de pedidos e rotas</div>
          </div>
        </div>

        <div style={s.rolePicker}>
          {[
            { id: 'admin',      label: 'Administrador', Icon: ShieldCheck },
            { id: 'entregador', label: 'Entregador',    Icon: Truck },
          ].map(({ id, label, Icon }) => (
            <button key={id}
              style={{ ...s.roleBtn, ...(role === id ? s.roleBtnActive : {}) }}
              onClick={() => { setRole(id); setEmail(''); setPassword(''); setError('') }}>
              <Icon size={15} />{label}
            </button>
          ))}
        </div>

        <form onSubmit={handleLogin} style={s.form}>
          <Field icon={Mail} label="Email" type="email" value={email}
            placeholder="seu@email.com" onChange={e => setEmail(e.target.value)} />
          <Field icon={Lock} label="Senha" type="password" value={password}
            placeholder="••••••••" onChange={e => setPassword(e.target.value)} />

          {error && <div style={s.errorBox}>{error}</div>}

          <button type="submit" style={s.submitBtn} disabled={loading}>
            {loading
              ? <span style={{ opacity: 0.7 }}>Entrando…</span>
              : <><span>Entrar</span><ArrowRight size={16} /></>}
          </button>
        </form>
      </div>
    </div>
  )
}

function Field({ icon: Icon, label, ...inputProps }) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      <div style={s.inputWrap}>
        <Icon size={15} color="var(--text-3)"
          style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }} />
        <input style={s.input} required {...inputProps} />
      </div>
    </div>
  )
}

const s = {
  page: { minHeight:'100vh', overflow:'auto', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', position:'relative' },
  grid: { position:'fixed', inset:0, pointerEvents:'none', backgroundImage:'linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px)', backgroundSize:'44px 44px' },
  glow: { position:'fixed', top:'15%', left:'50%', transform:'translateX(-50%)', width:600, height:300, pointerEvents:'none', background:'radial-gradient(ellipse,rgba(0,229,160,0.07) 0%,transparent 70%)' },
  card: { position:'relative', zIndex:10, width:'100%', maxWidth:420, margin:'0 16px', background:'var(--bg-2)', border:'1px solid var(--border-2)', borderRadius:'var(--radius-lg)', padding:'32px 28px' },
  brand: { display:'flex', alignItems:'center', gap:12, marginBottom:28 },
  brandIcon: { width:46, height:46, borderRadius:13, background:'var(--accent-dim)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center' },
  brandName: { fontSize:19, fontWeight:800, color:'var(--text-1)', letterSpacing:'-0.4px' },
  brandSub: { fontSize:12, color:'var(--text-3)', marginTop:1 },
  rolePicker: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:10, padding:4, marginBottom:24 },
  roleBtn: { display:'flex', alignItems:'center', justifyContent:'center', gap:7, padding:'10px 14px', borderRadius:8, fontSize:13, fontWeight:500, color:'var(--text-3)', background:'transparent' },
  roleBtnActive: { background:'var(--bg-3)', color:'var(--text-1)', boxShadow:'inset 0 0 0 1px var(--border-2)' },
  form: { display:'flex', flexDirection:'column', gap:14 },
  field: { display:'flex', flexDirection:'column', gap:7 },
  label: { fontSize:13, fontWeight:500, color:'var(--text-2)' },
  inputWrap: { position:'relative' },
  input: { width:'100%', padding:'11px 14px 11px 38px', background:'var(--bg)', border:'1px solid var(--border-2)', borderRadius:'var(--radius-sm)', color:'var(--text-1)', fontSize:14, transition:'border-color 0.2s, box-shadow 0.2s' },
  errorBox: { padding:'10px 14px', borderRadius:'var(--radius-sm)', background:'var(--danger-bg)', border:'1px solid rgba(248,113,113,0.2)', color:'var(--danger)', fontSize:13, lineHeight:1.5 },
  submitBtn: { marginTop:4, padding:'13px 20px', background:'var(--accent)', color:'#080D1A', borderRadius:'var(--radius-sm)', fontSize:14, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8 },
}
