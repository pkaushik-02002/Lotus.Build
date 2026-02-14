import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { assertProjectCanEdit } from "@/lib/project-access"
import { requireUserUid } from "@/lib/server-auth"

export const runtime = "nodejs"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const uid = await requireUserUid(req)
    const { id } = await params
    const migrationSnap = await adminDb.collection("migrations").doc(id).get()
    if (!migrationSnap.exists) {
      return NextResponse.json({ error: "Migration not found" }, { status: 404 })
    }
    const migration = migrationSnap.data() as { builderProjectId: string }
    await assertProjectCanEdit(migration.builderProjectId, uid)

    await migrationSnap.ref.set(
      { status: "discarded", updatedAt: new Date() },
      { merge: true }
    )

    return NextResponse.json({ ok: true, status: "discarded" })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to discard migration"
    const status = message.includes("Forbidden") ? 403 : message.includes("not found") ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

