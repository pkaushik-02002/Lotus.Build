import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { getGitHubToken, requireUserUid } from "@/lib/server-auth"

export const runtime = "nodejs"

const GITHUB_API = "https://api.github.com"

function slugifyRepoName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || "app"
}

async function getProject(projectId: string) {
  const snap = await adminDb.collection("projects").doc(projectId).get()
  if (!snap.exists) return null
  const data = snap.data() as {
    name?: string
    files?: { path: string; content: string }[]
    githubRepoFullName?: string
  }
  const files = Array.isArray(data?.files) ? data.files : null
  return { data, files }
}

async function githubRequest(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; json: () => Promise<any>; text: () => Promise<string> }> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return res
}

export async function POST(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const token = await getGitHubToken(uid)
    if (!token) {
      return NextResponse.json({ error: "GitHub not connected. Connect your account in Settings." }, { status: 400 })
    }

    let projectId: string
    try {
      const body = await req.json()
      projectId = String(body?.projectId ?? "")
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 })
    }

    const project = await getProject(projectId)
    if (!project || !project.files || project.files.length === 0) {
      return NextResponse.json({ error: "Project not found or has no files" }, { status: 404 })
    }

    const { data: projectData, files } = project
    let owner: string | undefined
    let repoName: string
    let repoFullName: string

    if (projectData?.githubRepoFullName) {
      const [o, r] = projectData.githubRepoFullName.split("/")
      if (!o || !r) {
        return NextResponse.json({ error: "Invalid stored GitHub repo" }, { status: 400 })
      }
      owner = o
      repoName = r
      repoFullName = projectData.githubRepoFullName
    } else {
      const name = (projectData?.name || "").trim() || "Untitled Project"
      repoName = slugifyRepoName(name) || `builderstudio-${projectId.slice(0, 8)}`

      const createRepo = async (candidate: string) =>
        githubRequest(token, "POST", "/user/repos", {
          name: candidate,
          description: `Built with Builder Studio: ${name.slice(0, 200)}`,
          private: false,
          auto_init: false,
        })

      let createRes = await createRepo(repoName)
      let createJson: { owner?: { login?: string }; full_name?: string; message?: string } = await createRes
        .json()
        .catch(() => ({}))

      if (!createRes.ok) {
        const msg = createJson?.message || (await createRes.text().catch(() => ""))
        if (createRes.status === 422) {
          repoName = `builderstudio-${projectId.slice(0, 8)}`
          createRes = await createRepo(repoName)
          createJson = await createRes.json().catch(() => ({}))
        }
        if (!createRes.ok) {
          return NextResponse.json({ error: msg || "Failed to create repository" }, { status: 400 })
        }
      }

      owner = createJson?.owner?.login
      repoFullName = createJson?.full_name || ""
      if (!owner || !repoFullName) {
        const meRes = await githubRequest(token, "GET", "/user")
        const meJson = await meRes.json().catch(() => ({}))
        owner = owner || meJson?.login
        repoFullName = repoFullName || (owner ? `${owner}/${repoName}` : "")
      }
      if (!owner || !repoFullName) {
        return NextResponse.json({ error: "Failed to resolve repository owner after creation." }, { status: 500 })
      }
    }

    for (const file of files) {
      const path = file.path
      const content = Buffer.from(file.content, "utf8").toString("base64")
      const encodedPath = encodeURIComponent(path)

      let sha: string | undefined
      const getRes = await githubRequest(token, "GET", `/repos/${owner}/${repoName}/contents/${encodedPath}`)
      if (getRes.ok) {
        const getJson = await getRes.json()
        sha = getJson?.sha
      }

      const putRes = await githubRequest(token, "PUT", `/repos/${owner}/${repoName}/contents/${encodedPath}`, {
        message: `Sync from BuildKit: ${path}`,
        content,
        ...(sha ? { sha } : {}),
      })

      if (!putRes.ok) {
        const errText = await putRes.text()
        return NextResponse.json(
          { error: `Failed to sync file ${path}: ${putRes.status} ${errText}` },
          { status: 500 }
        )
      }
    }

    const repoUrl = `https://github.com/${repoFullName}`
    const syncedAt = new Date()

    await adminDb.collection("projects").doc(projectId).set(
      {
        githubRepoUrl: repoUrl,
        githubRepoFullName: repoFullName,
        githubSyncedAt: syncedAt,
      },
      { merge: true }
    )

    return NextResponse.json({
      repoUrl,
      repoFullName,
      syncedAt: syncedAt.toISOString(),
      filesCount: files.length,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sync failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
