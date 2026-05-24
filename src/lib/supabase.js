// ─── Supabase Client ──────────────────────────────────────────────────────────
// 1. npm install @supabase/supabase-js
// 2. Crie um arquivo .env na raiz com:
//    VITE_SUPABASE_URL=https://xxxxx.supabase.co
//    VITE_SUPABASE_ANON_KEY=sua-anon-key
// 3. Descomente o código abaixo

// import { createClient } from '@supabase/supabase-js'
//
// const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
// const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
//
// export const supabase = createClient(supabaseUrl, supabaseKey)

// ─── Auth helpers ─────────────────────────────────────────────────────────────
// export const signIn  = (email, password) => supabase.auth.signInWithPassword({ email, password })
// export const signOut = () => supabase.auth.signOut()
// export const getUser = () => supabase.auth.getUser()

// ─── Orders CRUD ──────────────────────────────────────────────────────────────
// export const getOrders      = () => supabase.from('pedidos').select('*').order('criado_em', { ascending: false })
// export const createOrder    = (data) => supabase.from('pedidos').insert(data).select().single()
// export const updateOrder    = (id, data) => supabase.from('pedidos').update(data).eq('id', id)
// export const subscribeOrders = (callback) =>
//   supabase.channel('pedidos').on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, callback).subscribe()

// ─── Storage ──────────────────────────────────────────────────────────────────
// export const uploadDeliveryPhoto = async (orderId, file) => {
//   const path = `entregas/${orderId}/foto_${Date.now()}.jpg`
//   const { data, error } = await supabase.storage.from('confirmacoes').upload(path, file)
//   if (error) throw error
//   return supabase.storage.from('confirmacoes').getPublicUrl(path).data.publicUrl
// }
//
// export const uploadSignature = async (orderId, blob) => {
//   const path = `entregas/${orderId}/assinatura.png`
//   const { data, error } = await supabase.storage.from('confirmacoes').upload(path, blob)
//   if (error) throw error
//   return supabase.storage.from('confirmacoes').getPublicUrl(path).data.publicUrl
// }

export {}
