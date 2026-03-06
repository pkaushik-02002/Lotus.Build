import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { assertProjectCanEdit } from "@/lib/project-access"
import { requireUserUid } from "@/lib/server-auth"
import { generatePostgresSchema } from "@/lib/integrations/supabase/schema"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const body = await req.json().catch(() => ({}))
    const projectId = (body?.projectId ?? "").toString().trim()
    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 })
    }

    await assertProjectCanEdit(projectId, uid)
    const snap = await adminDb.collection("projects").doc(projectId).get()
    if (!snap.exists) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }
    const project = snap.data() as any
    const appPrompt = (project?.prompt ?? "").toString().trim()
    if (!appPrompt) {
      return NextResponse.json({ error: "Project prompt is missing" }, { status: 400 })
    }

    let companyContext = ""
    const workspaceId = (project?.workspaceId ?? "").toString().trim()
    if (workspaceId) {
      const wsSnap = await adminDb.collection("workspaces").doc(workspaceId).get()
      if (wsSnap.exists) {
        const ws = wsSnap.data() as any
        companyContext = (ws?.aiContextPrompt ?? "").toString().trim()
      }
    }

    const { sql, tables } = await generatePostgresSchema({
      appPrompt,
      projectName: (project?.name ?? "").toString().trim(),
      companyContext,
    })

    await adminDb.collection("projects").doc(projectId).set(
      {
        generatedSchemaSql: sql,
        generatedSchemaTables: tables,
        generatedSchemaUpdatedAt: new Date(),
      },
      { merge: true }
    )

    return NextResponse.json({ ok: true, sql, tables })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate schema"
    const status = message.includes("Forbidden") ? 403 : message.includes("Authorization") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

