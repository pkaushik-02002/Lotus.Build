import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { getGitHubToken, requireUserUid } from "@/lib/server-auth"
import { getInstallationToken, getUserInstallationRepos, getUserInstallations } from "@/lib/integrations/github-app"

export const runtime = "nodejs"

const GITHUB_API = "https://api.github.com"

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
    let preferredRepoFullName = ""
    try {
      const body = await req.json()
      projectId = String(body?.projectId ?? "")
      preferredRepoFullName = String(body?.repoFullName ?? "").trim()
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

    const installations = await getUserInstallations(token)
    if (!installations.length) {
      return NextResponse.json(
        { error: "No GitHub App installations found. Install BuilderStudio-6 on a repository first." },
        { status: 400 }
      )
    }

    let repoFullName = preferredRepoFullName || projectData?.githubRepoFullName || ""
    let installationId = 0

    for (const installation of installations) {
      const iid = Number(installation.id)
      if (!iid) continue
      const repos = await getUserInstallationRepos(token, iid)
      const found = repos.find((r) => String(r.full_name) === repoFullName)
      if (found) {
        installationId = iid
        break
      }
      if (!repoFullName && repos[0]?.full_name) {
        repoFullName = String(repos[0].full_name)
        installationId = iid
        break
      }
    }

    if (!repoFullName || !installationId) {
      return NextResponse.json(
        { error: "Select a GitHub repository first. No accessible repository was found for this installation." },
        { status: 400 }
      )
    }

    const [owner, repoName] = repoFullName.split("/")
    if (!owner || !repoName) {
      return NextResponse.json({ error: "Invalid repository selected." }, { status: 400 })
    }

    const installationToken = await getInstallationToken(installationId)

    for (const file of files) {
      const path = file.path
      const content = Buffer.from(file.content, "utf8").toString("base64")
      const encodedPath = encodeURIComponent(path)

      let sha: string | undefined
      const getRes = await githubRequest(installationToken, "GET", `/repos/${owner}/${repoName}/contents/${encodedPath}`)
      if (getRes.ok) {
        const getJson = await getRes.json()
        sha = getJson?.sha
      }

      const putRes = await githubRequest(installationToken, "PUT", `/repos/${owner}/${repoName}/contents/${encodedPath}`, {
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
        githubInstallationId: installationId,
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
