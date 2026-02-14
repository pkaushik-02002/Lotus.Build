import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { assertProjectCanEdit } from "@/lib/project-access"
import { requireUserUid } from "@/lib/server-auth"
import { supabaseManagementFetch } from "@/lib/supabase-management"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const body = await req.json().catch(() => ({}))
    const builderProjectId = (body?.builderProjectId ?? "").toString().trim()
    const supabaseProjectRef = (body?.supabaseProjectRef ?? "").toString().trim()
    if (!builderProjectId || !supabaseProjectRef) {
      return NextResponse.json({ error: "Missing builderProjectId or supabaseProjectRef" }, { status: 400 })
    }

    await assertProjectCanEdit(builderProjectId, uid)

    const details = await supabaseManagementFetch<Record<string, unknown>>(uid, `/v1/projects/${encodeURIComponent(supabaseProjectRef)}`)
    const apikeys = await supabaseManagementFetch<Array<{ api_key?: string; name?: string }>>(
      uid,
      `/v1/projects/${encodeURIComponent(supabaseProjectRef)}/api-keys`
    )

    const projectUrl = (details?.api_url as string) || (details?.url as string) || ""
    const anonKey = apikeys.find((k) => (k.name || "").toLowerCase().includes("anon"))?.api_key || ""

    await adminDb.collection("supabaseLinks").doc(builderProjectId).set(
      {
        id: builderProjectId,
        userId: uid,
        builderProjectId,
        supabaseProjectRef,
        supabaseUrl: projectUrl,
        supabaseAnonKey: anonKey,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true }
    )

    await adminDb.collection("projects").doc(builderProjectId).set(
      {
        supabaseProjectRef,
        supabaseUrl: projectUrl,
        supabaseAnonKey: anonKey,
        supabaseConnectedAt: new Date(),
      },
      { merge: true }
    )

    return NextResponse.json({
      ok: true,
      link: {
        builderProjectId,
        supabaseProjectRef,
        supabaseUrl: projectUrl,
        supabaseAnonKey: anonKey,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to link Supabase project"
    const status = message.includes("Forbidden") ? 403 : message.includes("not found") ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

