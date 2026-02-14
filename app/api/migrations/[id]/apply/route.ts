import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { assertProjectCanEdit } from "@/lib/project-access"
import { requireUserUid } from "@/lib/server-auth"
import { supabaseManagementFetch } from "@/lib/supabase-management"

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
    const migration = migrationSnap.data() as {
      builderProjectId: string
      sql: string
      status: "pending" | "applied" | "discarded" | "failed"
      createdAt?: { toDate?: () => Date } | Date
    }

    await assertProjectCanEdit(migration.builderProjectId, uid)
    if (migration.status === "applied") {
      return NextResponse.json({ ok: true, alreadyApplied: true })
    }
    if (migration.status === "discarded") {
      return NextResponse.json({ error: "Cannot apply a discarded migration" }, { status: 400 })
    }

    const pendingBeforeSnap = await adminDb
      .collection("migrations")
      .where("builderProjectId", "==", migration.builderProjectId)
      .where("status", "==", "pending")
      .orderBy("createdAt", "asc")
      .get()

    const pendingBefore = pendingBeforeSnap.docs
      .map((d) => d.id)
      .filter((migrationId) => migrationId !== id)
    if (pendingBefore.length > 0) {
      return NextResponse.json(
        {
          error: "There are older pending migrations. Apply them first.",
          blockingMigrationIds: pendingBefore,
        },
        { status: 409 }
      )
    }

    const linkSnap = await adminDb.collection("supabaseLinks").doc(migration.builderProjectId).get()
    if (!linkSnap.exists) {
      return NextResponse.json(
        { error: "No linked Supabase project found. Connect and link Supabase first." },
        { status: 400 }
      )
    }
    const link = linkSnap.data() as { supabaseProjectRef?: string }
    if (!link.supabaseProjectRef) {
      return NextResponse.json(
        { error: "Linked Supabase project ref is missing. Re-link Supabase project." },
        { status: 400 }
      )
    }

    try {
      await supabaseManagementFetch(uid, `/v1/projects/${encodeURIComponent(link.supabaseProjectRef)}/database/query`, {
        method: "POST",
        body: JSON.stringify({
          query: migration.sql,
        }),
      })
      await migrationSnap.ref.set(
        { status: "applied", errorMessage: null, updatedAt: new Date() },
        { merge: true }
      )
      return NextResponse.json({ ok: true, status: "applied" })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to apply SQL"
      await migrationSnap.ref.set(
        { status: "failed", errorMessage: message, updatedAt: new Date() },
        { merge: true }
      )
      return NextResponse.json({ error: message, status: "failed" }, { status: 500 })
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to apply migration"
    const status = message.includes("Forbidden") ? 403 : message.includes("not found") ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

