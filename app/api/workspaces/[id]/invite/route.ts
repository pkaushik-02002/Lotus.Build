import { NextResponse } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type WorkspaceRole = "owner" | "builder"

async function requireWorkspaceMember(workspaceId: string, uid: string) {
  const memberDocId = `${workspaceId}_${uid}`
  const snap = await adminDb.collection("workspace_members").doc(memberDocId).get()
  if (!snap.exists) {
    throw new Error("Not a workspace member")
  }
  return snap.data() as { role?: WorkspaceRole }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const uid = await requireUserUid(req)
    const { id: workspaceId } = await params

    if (!workspaceId) {
      return NextResponse.json({ error: "Missing workspace id" }, { status: 400 })
    }

    const me = await requireWorkspaceMember(workspaceId, uid)
    if (me?.role !== "owner") {
      return NextResponse.json({ error: "Only workspace owner can invite" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
    const userId = typeof body?.userId === "string" ? body.userId.trim() : ""
    const role: WorkspaceRole = body?.role === "owner" ? "owner" : "builder"

    if (!email && !userId) {
      return NextResponse.json({ error: "Missing email or userId" }, { status: 400 })
    }

    let invitedUid: string
    if (userId) {
      // Verify userId exists
      await adminAuth.getUser(userId)
      invitedUid = userId
    } else {
      const invitedUser = await adminAuth.getUserByEmail(email)
      invitedUid = invitedUser.uid
    }

    const invitedMemberDocId = `${workspaceId}_${invitedUid}`
    await adminDb.collection("workspace_members").doc(invitedMemberDocId).set(
      {
        workspaceId,
        userId: invitedUid,
        role,
        invitedBy: uid,
        createdAt: new Date(),
      },
      { merge: true }
    )

    return NextResponse.json({ ok: true, invitedUid })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Request failed"
    const status = message.includes("Authorization") ? 401 : message.includes("Not a workspace member") ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
