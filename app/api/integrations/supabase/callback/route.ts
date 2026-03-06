import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { exchangeCode, storeConnection } from "@/lib/integrations/supabase/oauth"

export const runtime = "nodejs"

function callbackHtml(ok: boolean, message: string, builderProjectId?: string) {
  const payload = JSON.stringify({
    type: "supabase-oauth",
    ok,
    message,
    builderProjectId: builderProjectId || null,
  })
  return `<!doctype html><html><body><script>
    (function () {
      try { if (window.opener) { window.opener.postMessage(${payload}, window.location.origin); } } catch (_) {}
      window.close();
    })();
  </script><p>${ok ? "Supabase connected. You can close this window." : "Supabase connection failed. You can close this window."}</p></body></html>`
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")

  if (error) {
    return new NextResponse(callbackHtml(false, error), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } })
  }
  if (!code || !state) {
    return new NextResponse("Missing code or state", { status: 400 })
  }

  const stateSnap = await adminDb.collection("supabaseOauthStates").doc(state).get()
  if (!stateSnap.exists) {
    return new NextResponse("Invalid or expired state", { status: 400 })
  }

  const { uid, builderProjectId } = (stateSnap.data() ?? {}) as { uid?: string; builderProjectId?: string }
  if (!uid) {
    return new NextResponse("Invalid state payload", { status: 400 })
  }

  try {
    const token = await exchangeCode(code)
    await storeConnection(uid, {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresIn: token.expires_in,
    })
    await adminDb.collection("supabaseOauthStates").doc(state).delete().catch(() => {})
    return new NextResponse(callbackHtml(true, "connected", builderProjectId), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "OAuth callback failed"
    return new NextResponse(callbackHtml(false, message, builderProjectId), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  }
}

