import {
  exchangeSupabaseOauthCode,
  getSupabaseAuthorizeUrl,
  getSupabaseConnection,
  saveSupabaseConnection,
} from "@/lib/supabase-management"

export function getAuthorizeUrl(state: string): string {
  return getSupabaseAuthorizeUrl(state)
}

export async function exchangeCode(code: string) {
  return exchangeSupabaseOauthCode(code)
}

export async function storeConnection(
  uid: string,
  payload: { accessToken: string; refreshToken?: string; expiresIn?: number }
) {
  return saveSupabaseConnection(uid, payload)
}

export async function getConnection(uid: string) {
  return getSupabaseConnection(uid)
}

export function getOAuthTokenIdForUser(uid: string): string {
  // Token material is stored server-side in supabaseConnections/{uid}.
  return uid
}

