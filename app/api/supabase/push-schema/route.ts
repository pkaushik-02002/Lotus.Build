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
    const projectId = (body?.projectId ?? "").toString().trim()
    const sql = (body?.sql ?? "").toString().trim()
    if (!projectId || !sql) {
      return NextResponse.json({ error: "Missing projectId or sql" }, { status: 400 })
    }

    await assertProjectCanEdit(projectId, uid)
    const linkSnap = await adminDb.collection("supabaseLinks").doc(projectId).get()
    if (!linkSnap.exists) {
      return NextResponse.json({ error: "No Supabase project linked" }, { status: 400 })
    }
    const link = linkSnap.data() as { supabaseProjectRef?: string }
    const projectRef = (link?.supabaseProjectRef ?? "").toString().trim()
    if (!projectRef) {
      return NextResponse.json({ error: "Linked Supabase project ref missing" }, { status: 400 })
    }

    await supabaseManagementFetch(uid, `/v1/projects/${encodeURIComponent(projectRef)}/database/query`, {
      method: "POST",
      body: JSON.stringify({ query: sql }),
    })

    await adminDb.collection("projects").doc(projectId).set(
      { schemaPushedAt: new Date(), schemaPushStatus: "success" },
      { merge: true }
    )

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to push schema"
    const status = message.includes("Forbidden") ? 403 : message.includes("Authorization") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

