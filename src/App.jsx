import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, createContext, useContext } from 'react'
import { supabase, getProfile } from './lib/supabase'
import Login from './pages/Login'
import AdminDashboard from './pages/AdminDashboard'
import CourierDashboard from './pages/CourierDashboard'
import MapView from './pages/MapView'
import DeliveryConfirm from './pages/DeliveryConfirm'

export const AuthContext  = createContext(null)
export const OrderContext = createContext(null)
export const useAuth   = () => useContext(AuthContext)
export const useOrders = () => useContext(OrderContext)

// Monta usuário a partir da sessão + profile (com fallback)
const buildUser = async (sessionUser) => {
  try {
    const profile = await getProfile(sessionUser.id)
    return { ...sessionUser, ...profile }
  } catch {
    // Fallback: usa metadados do token JWT
    const meta = sessionUser.user_metadata || {}
    return {
      ...sessionUser,
      name:   meta.name  || sessionUser.email?.split('@')[0] || 'Usuário',
      role:   meta.role  || 'entregador',
      avatar: meta.name  ? meta.name.slice(0,2).toUpperCase() : 'US',
    }
  }
}

export default function App() {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [orders,  setOrders]  = useState([])

  useEffect(() => {
    let settled = false
    const finish = (u) => { if (!settled) { settled = true; setUser(u); setLoading(false) } }

    // Timeout máximo de 5s
    const timeout = setTimeout(() => finish(null), 5000)

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const u = await buildUser(session.user)
        finish(u)
      } else {
        finish(null)
      }
    }).catch(() => finish(null))

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      clearTimeout(timeout)
      if (session?.user) {
        const u = await buildUser(session.user)
        setUser(u)
        setLoading(false)
      } else {
        setUser(null)
        setLoading(false)
      }
    })

    return () => { subscription.unsubscribe(); clearTimeout(timeout) }
  }, [])

  const logout = async () => { await supabase.auth.signOut(); setUser(null) }
  const updateOrder = (id, changes) => setOrders(prev => prev.map(o => o.id === id ? { ...o, ...changes } : o))
  const addOrder    = (order) => setOrders(prev => [order, ...prev])

  if (loading) return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'var(--bg)', gap:16 }}>
      <div style={{ width:36, height:36, borderRadius:9, background:'var(--accent-dim)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', animation:'spin 1s linear infinite' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round">
          <path d="M21 10c-2-5-8-8-13-6"/><path d="M3 14c2 5 8 8 13 6"/>
        </svg>
      </div>
      <span style={{ fontSize:13, color:'var(--text-3)' }}>Carregando…</span>
    </div>
  )

  return (
    <AuthContext.Provider value={{ user, logout }}>
      <OrderContext.Provider value={{ orders, setOrders, updateOrder, addOrder }}>
        <Routes>
          <Route path="/login" element={
            !user ? <Login /> : <Navigate to={user.role === 'admin' ? '/admin' : '/courier'} replace />
          } />
          <Route path="/admin" element={
            user?.role === 'admin' ? <AdminDashboard /> : <Navigate to="/login" replace />
          } />
          <Route path="/courier" element={
            user?.role === 'entregador' ? <CourierDashboard /> : <Navigate to="/login" replace />
          } />
          <Route path="/map/:orderId" element={
            user ? <MapView /> : <Navigate to="/login" replace />
          } />
          <Route path="/confirm/:orderId" element={
            user ? <DeliveryConfirm /> : <Navigate to="/login" replace />
          } />
          <Route path="*" element={
            <Navigate to={user ? (user.role === 'admin' ? '/admin' : '/courier') : '/login'} replace />
          } />
        </Routes>
      </OrderContext.Provider>
    </AuthContext.Provider>
  )
}
