import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, createContext, useContext } from 'react'
import Login from './pages/Login'
import AdminDashboard from './pages/AdminDashboard'
import CourierDashboard from './pages/CourierDashboard'
import MapView from './pages/MapView'
import DeliveryConfirm from './pages/DeliveryConfirm'
import { mockOrders } from './lib/mockData'

export const AuthContext = createContext(null)
export const OrderContext = createContext(null)

export const useAuth = () => useContext(AuthContext)
export const useOrders = () => useContext(OrderContext)

export default function App() {
  const [user, setUser] = useState(null)
  const [orders, setOrders] = useState(mockOrders)

  const login = (userData) => setUser(userData)
  const logout = () => setUser(null)

  const updateOrder = (id, changes) =>
    setOrders(prev => prev.map(o => o.id === id ? { ...o, ...changes } : o))

  const addOrder = (order) => setOrders(prev => [order, ...prev])

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <OrderContext.Provider value={{ orders, updateOrder, addOrder }}>
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
            <Navigate to={
              user ? (user.role === 'admin' ? '/admin' : '/courier') : '/login'
            } replace />
          } />
        </Routes>
      </OrderContext.Provider>
    </AuthContext.Provider>
  )
}
