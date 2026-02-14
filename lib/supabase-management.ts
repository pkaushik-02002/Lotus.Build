import { adminDb } from "@/lib/firebase-admin"

const SUPABASE_API_BASE = "https://api.supabase.com"

type SupabaseConnection = {
  userId: string
  accessToken: string
  refreshToken?: string
  expiresAt?: string
  createdAt?: Date
  updatedAt?: Date
}

function getOAuthEnv() {
  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID
  const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET
  const redirectUri = process.env.SUPABASE_OAUTH_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("SUPABASE_OAUTH_CLIENT_ID / SUPABASE_OAUTH_CLIENT_SECRET / SUPABASE_OAUTH_REDIRECT_URI not configured")
  }
  return { clientId, clientSecret, redirectUri }
}

export function getSupabaseAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getOAuthEnv()
  const authUrl = new URL("/v1/oauth/authorize", SUPABASE_API_BASE)
  authUrl.searchParams.set("client_id", clientId)
  authUrl.searchParams.set("redirect_uri", redirectUri)
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("state", state)
  authUrl.searchParams.set(
    "scope",
    "organizations:read projects:read projects:write database:write"
  )
  return authUrl.toString()
}

export async function exchangeSupabaseOauthCode(code: string) {
  const { clientId, clientSecret, redirectUri } = getOAuthEnv()
  const tokenRes = await fetch(`${SUPABASE_API_BASE}/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  })
  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "")
    throw new Error(`Supabase token exchange failed (${tokenRes.status}): ${text}`)
  }
  return tokenRes.json() as Promise<{
    access_token: string
    refresh_token?: string
    expires_in?: number
    token_type?: string
  }>
}

export async function refreshSupabaseToken(uid: string, refreshToken: string) {
  const { clientId, clientSecret } = getOAuthEnv()
  const tokenRes = await fetch(`${SUPABASE_API_BASE}/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  })
  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "")
    throw new Error(`Supabase token refresh failed (${tokenRes.status}): ${text}`)
  }
  const json = (await tokenRes.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }
  const expiresAt =
    typeof json.expires_in === "number"
      ? new Date(Date.now() + json.expires_in * 1000).toISOString()
      : undefined
  const updatedAt = new Date()
  const nextRefreshToken = json.refresh_token ?? refreshToken
  await adminDb.collection("supabaseConnections").doc(uid).set(
    {
      userId: uid,
      accessToken: json.access_token,
      refreshToken: nextRefreshToken,
      expiresAt,
      updatedAt,
    },
    { merge: true }
  )
  await adminDb.collection("users").doc(uid).set(
    {
      supabaseAccessToken: json.access_token,
      supabaseRefreshToken: nextRefreshToken,
      supabaseExpiresAt: expiresAt ?? null,
      supabaseConnectedAt: updatedAt,
      supabaseTokenUpdatedAt: updatedAt,
    },
    { merge: true }
  )
  return json.access_token
}

export async function getSupabaseConnection(uid: string): Promise<SupabaseConnection | null> {
  const snap = await adminDb.collection("supabaseConnections").doc(uid).get()
  if (snap.exists) {
    return snap.data() as SupabaseConnection
  }

  // Backward/alternate storage fallback on users doc.
  const userSnap = await adminDb.collection("users").doc(uid).get()
  const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : null
  const accessToken = (userData?.supabaseAccessToken ?? "") as string
  if (!accessToken) return null
  const refreshToken = (userData?.supabaseRefreshToken ?? undefined) as string | undefined
  const expiresAt = (userData?.supabaseExpiresAt ?? undefined) as string | undefined
  return {
    userId: uid,
    accessToken,
    refreshToken,
    expiresAt,
  }
}

export async function saveSupabaseConnection(uid: string, payload: { accessToken: string; refreshToken?: string; expiresIn?: number }) {
  const expiresAt =
    typeof payload.expiresIn === "number"
      ? new Date(Date.now() + payload.expiresIn * 1000).toISOString()
      : undefined
  const connectedAt = new Date()
  await adminDb.collection("supabaseConnections").doc(uid).set(
    {
      userId: uid,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken ?? null,
      expiresAt: expiresAt ?? null,
      createdAt: connectedAt,
      updatedAt: connectedAt,
    },
    { merge: true }
  )
  await adminDb.collection("users").doc(uid).set(
    {
      supabaseAccessToken: payload.accessToken,
      supabaseRefreshToken: payload.refreshToken ?? null,
      supabaseExpiresAt: expiresAt ?? null,
      supabaseConnectedAt: connectedAt,
      supabaseTokenUpdatedAt: connectedAt,
    },
    { merge: true }
  )
}

export async function supabaseManagementFetch<T = unknown>(
  uid: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const connection = await getSupabaseConnection(uid)
  if (!connection?.accessToken) {
    throw new Error("Supabase is not connected. Please reconnect Supabase.")
  }

  const doFetch = async (accessToken: string) => {
    const res = await fetch(`${SUPABASE_API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${accessToken}`,
      },
    })
    return res
  }

  let res = await doFetch(connection.accessToken)
  if (res.status === 401 && connection.refreshToken) {
    const newToken = await refreshSupabaseToken(uid, connection.refreshToken)
    res = await doFetch(newToken)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Supabase API request failed (${res.status}): ${text}`)
  }
  if (res.status === 204) return {} as T
  return (await res.json()) as T
}
