import { NextResponse } from "next/server"
import { requireUserUid } from "@/lib/server-auth"
import { assertProjectCanEdit } from "@/lib/project-access"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")
    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 })
    }
    const { snap } = await assertProjectCanEdit(projectId, uid)
    const data = snap.data() as { envVarNames?: string[] }
    const names = Array.isArray(data?.envVarNames) ? data.envVarNames : []
    return NextResponse.json({ envVarNames: names })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unauthorized"
    return NextResponse.json({ error: message }, { status: 401 })
  }
}
