import { NextResponse } from "next/server"
import { randomState, requireUserUid } from "@/lib/server-auth"
import { adminDb } from "@/lib/firebase-admin"
import { getSupabaseAuthorizeUrl } from "@/lib/supabase-management"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const url = new URL(req.url)
    const builderProjectId = url.searchParams.get("builderProjectId") || ""
    const state = randomState()

    await adminDb.collection("supabaseOauthStates").doc(state).set({
      uid,
      builderProjectId,
      createdAt: new Date(),
    })

    return NextResponse.json({ url: getSupabaseAuthorizeUrl(state) })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unauthorized"
    return NextResponse.json({ error: message }, { status: 401 })
  }
}

