import { NextResponse } from "next/server"
import { z } from "zod"
import { adminDb } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"
import { assertProjectCanEdit } from "@/lib/project-access"
import type { ComputerTimelineEvent } from "@/lib/computer-agent/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const createSessionSchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  prompt: z.string().trim().min(1).max(12000),
  model: z.string().trim().max(120).optional(),
})

type ComputerSessionStatus = "idle" | "planning" | "running" | "error" | "complete"

const SESSION_STATUSES = new Set<ComputerSessionStatus>([
  "idle",
  "planning",
  "running",
  "complete",
  "error",
])

function serializeSession(id: string, data: Record<string, unknown>) {
  return {
    id,
    prompt: typeof data.prompt === "string" ? data.prompt : undefined,
    status: typeof data.status === "string" && SESSION_STATUSES.has(data.status as ComputerSessionStatus)
      ? (data.status as ComputerSessionStatus)
      : "idle",
    timeline: Array.isArray(data.timeline) ? (data.timeline as ComputerTimelineEvent[]) : [],
    previewUrl: typeof data.previewUrl === "string" ? data.previewUrl : null,
    projectId: typeof data.projectId === "string" ? data.projectId : undefined,
  }
}

export async function GET(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")?.trim()
    if (!id) {
      return NextResponse.json({ error: "Missing session id" }, { status: 400 })
    }

    const snap = await adminDb.collection("computerSessions").doc(id).get()
    if (!snap.exists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    const data = snap.data() as Record<string, unknown>
    if (data.ownerId !== uid) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    return NextResponse.json(serializeSession(snap.id, data))
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed"
    const status = message.includes("Authorization") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const body = await req.json().catch(() => null)
    const parsed = createSessionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    if (parsed.data.projectId) {
      await assertProjectCanEdit(parsed.data.projectId, uid)
    }

    const now = new Date()
    const sessionRef = adminDb.collection("computerSessions").doc()
    const createdEvent: ComputerTimelineEvent = {
      id: `user-${sessionRef.id}`,
      title: "Session created",
      description: "The computer session was created.",
      status: "complete",
      kind: "user",
      createdAt: now.toISOString(),
      completedAt: now.toISOString(),
      index: 0,
    }

    const payload = {
      ownerId: uid,
      ...(parsed.data.projectId ? { projectId: parsed.data.projectId } : {}),
      prompt: parsed.data.prompt,
      ...(parsed.data.model ? { model: parsed.data.model } : {}),
      status: "idle",
      timeline: [createdEvent],
      createdAt: now,
      updatedAt: now,
    }

    await sessionRef.set(payload)
    return NextResponse.json({ id: sessionRef.id }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed"
    const status = message.includes("Authorization") ? 401 : message.includes("Forbidden") ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
