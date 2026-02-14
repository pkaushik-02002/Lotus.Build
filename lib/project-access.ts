import { adminDb } from "@/lib/firebase-admin"

type ProjectAuthData = {
  ownerId?: string
  editorIds?: string[]
}

export async function assertProjectCanEdit(projectId: string, uid: string) {
  const snap = await adminDb.collection("projects").doc(projectId).get()
  if (!snap.exists) {
    throw new Error("Project not found")
  }
  const data = snap.data() as ProjectAuthData
  const isOwner = !data.ownerId || data.ownerId === uid
  const isEditor = Array.isArray(data.editorIds) && data.editorIds.includes(uid)
  if (!isOwner && !isEditor) {
    throw new Error("Forbidden: you do not have edit access to this project")
  }
  return { snap, data }
}

