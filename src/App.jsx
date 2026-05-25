import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import AdminDashboard from './pages/AdminDashboard'
import CourierDashboard from './pages/CourierDashboard'
import MapView from './pages/MapView'
import DeliveryConfirm from './pages/DeliveryConfirm'

export const AuthContext  = createContext(null)
export const OrderContext = createContext(null)
export const useAuth   = () => useContext(AuthContext)
export const useOrders = () => useContext(OrderContext)

const userFromSession = (session) => {
  if (!session?.user) return null
  const meta = session.user.user_metadata || {}
  return {
    ...session.user,
    name:   meta.name  || session.user.email?.split('@')[0] || 'Usuário',
    role:   meta.role  || 'entregador',
    avatar: meta.name  ? meta.name.slice(0,2).toUpperCase() : 'US',
  }
}

export default function App() {
  const [user,   setUser]   = useState(undefined)
  const [orders, setOrders] = useState([])

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => setUser(userFromSession(session)))
      .catch(() => setUser(null))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(userFromSession(session))
    })
    return () => subscription.unsubscribe()
  }, [])

  const logout      = async () => { await supabase.auth.signOut(); setUser(null) }
  const updateOrder = (id, ch) => setOrders(prev => prev.map(o => o.id === id ? { ...o, ...ch } : o))
  const addOrder    = (order)  => setOrders(prev => [order, ...prev])

  if (user === undefined) return (
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
          <Route path="/login"    element={!user ? <Login /> : <Navigate to={user.role === 'admin' ? '/admin' : '/courier'} replace />} />
          <Route path="/admin"    element={user?.role === 'admin'      ? <AdminDashboard />   : <Navigate to="/login" replace />} />
          <Route path="/courier"  element={user?.role === 'entregador' ? <CourierDashboard /> : <Navigate to="/login" replace />} />
          {/* ✅ mode e ids como parâmetros dinâmicos */}
          <Route path="/map/:mode/:ids"    element={user ? <MapView /> : <Navigate to="/login" replace />} />
          <Route path="/confirm/:orderId"  element={user ? <DeliveryConfirm /> : <Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to={user ? (user.role === 'admin' ? '/admin' : '/courier') : '/login'} replace />} />
        </Routes>
      </OrderContext.Provider>
    </AuthContext.Provider>
  )
}
