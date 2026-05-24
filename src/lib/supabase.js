import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Auth ──────────────────────────────────────────────────────────────────────
export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password })

export const signOut = () => supabase.auth.signOut()

export const getSession = () => supabase.auth.getSession()

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

// ─── Storage ───────────────────────────────────────────────────────────────────
export const uploadFoto = async (orderId, file) => {
  const ext  = file.name?.split('.').pop() || 'jpg'
  const path = `${orderId}/foto_${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('confirmacoes').upload(path, file, { upsert: true })
  if (error) throw error
  return supabase.storage.from('confirmacoes').getPublicUrl(path).data.publicUrl
}

export const uploadAssinatura = async (orderId, blob) => {
  const path = `${orderId}/assinatura_${Date.now()}.png`
  const { error } = await supabase.storage
    .from('confirmacoes').upload(path, blob, { contentType: 'image/png', upsert: true })
  if (error) throw error
  return supabase.storage.from('confirmacoes').getPublicUrl(path).data.publicUrl
}
