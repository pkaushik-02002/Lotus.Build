import { NextResponse } from "next/server"
import { adminDb, adminAuth } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type WorkspaceRole = "owner" | "builder"

function serializeDoc(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
      out[k] = (v as { toDate: () => Date }).toDate().toISOString()
    } else {
      out[k] = v
    }
  }
  return out
}

export async function GET(req: Request) {
  try {
    const uid = await requireUserUid(req)

    const membershipSnap = await adminDb
      .collection("workspace_members")
      .where("userId", "==", uid)
      .get()

    const workspaceIds = membershipSnap.docs
      .map((d) => (d.data() as any)?.workspaceId)
      .filter((v): v is string => typeof v === "string" && v.length > 0)

    const workspaces = await Promise.all(
      workspaceIds.map(async (wid) => {
        const wsSnap = await adminDb.collection("workspaces").doc(wid).get()
        if (!wsSnap.exists) return null
        return serializeDoc({ id: wsSnap.id, ...(wsSnap.data() as any) })
      })
    )

    return NextResponse.json({ workspaces: workspaces.filter(Boolean) })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Request failed"
    return NextResponse.json({ error: message }, { status: message.includes("Authorization") ? 401 : 500 })
  }
}

export async function POST(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const body = await req.json().catch(() => ({}))

    const name = typeof body?.name === "string" ? body.name.trim() : ""
    if (!name) {
      return NextResponse.json({ error: "Missing workspace name" }, { status: 400 })
    }

    const wsRef = adminDb.collection("workspaces").doc()

    await wsRef.set({
      name,
      ownerId: uid,
      createdAt: new Date(),
      plan: "free",
      tokensUsed: 0,
    })

    const memberDocId = `${wsRef.id}_${uid}`
    await adminDb.collection("workspace_members").doc(memberDocId).set({
      workspaceId: wsRef.id,
      userId: uid,
      role: "owner" satisfies WorkspaceRole,
      createdAt: new Date(),
    })

    return NextResponse.json({ workspaceId: wsRef.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Request failed"
    return NextResponse.json({ error: message }, { status: message.includes("Authorization") ? 401 : 500 })
  }
}
