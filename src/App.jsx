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

export default function App() {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [orders,  setOrders]  = useState([])

  // Rehydrate session on mount
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        try {
          const profile = await getProfile(session.user.id)
          setUser({ ...session.user, ...profile })
        } catch { setUser(null) }
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        try {
          const profile = await getProfile(session.user.id)
          setUser({ ...session.user, ...profile })
        } catch { setUser(null) }
      } else {
        setUser(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const logout = async () => { await supabase.auth.signOut(); setUser(null) }

  const updateOrder = (id, changes) =>
    setOrders(prev => prev.map(o => o.id === id ? { ...o, ...changes } : o))

  const addOrder = (order) => setOrders(prev => [order, ...prev])

  if (loading) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', color:'var(--text-3)', fontSize:13 }}>
      Carregando…
    </div>
  )

  return (
    <AuthContext.Provider value={{ user, logout }}>
      <OrderContext.Provider value={{ orders, setOrders, updateOrder, addOrder }}>
        <Routes>
          <Route path="/login" element={
            !user
              ? <Login />
              : <Navigate to={user.role === 'admin' ? '/admin' : '/courier'} replace />
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
