import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://uxcstfeyxalmapqjsszd.supabase.co'
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4Y3N0ZmV5eGFsbWFwcWpzc3pkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MDE3NTYsImV4cCI6MjA5NDk3Nzc1Nn0.BuOPd35DQk0t7sHSF0zPdEsEd-8KojJDkLhaea4YQd8'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Auth ──────────────────────────────────────────────────────────────────────
export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password })

export const signOut = () => supabase.auth.signOut()

export const getProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles').select('*').eq('id', userId).single()
  if (error) throw error
  return data
}

// ─── Pedidos ───────────────────────────────────────────────────────────────────
export const getPedidos = () =>
  supabase.from('pedidos').select('*').order('criado_em', { ascending: false })

export const createPedido = (data) =>
  supabase.from('pedidos').insert(data).select().single()

export const updatePedido = (id, data) =>
  supabase.from('pedidos').update(data).eq('id', id)

export const subscribePedidos = (callback) =>
  supabase.channel('pedidos-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, callback)
    .subscribe()

// ─── Entregas ──────────────────────────────────────────────────────────────────
export const createEntrega = (data) =>
  supabase.from('entregas').insert(data).select().single()

// ─── Foto: converte para base64 e salva direto no banco ────────────────────────
// Evita dependência do Supabase Storage (sem RLS extra)
export const prepararFoto = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result) // retorna data:image/jpeg;base64,...
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
