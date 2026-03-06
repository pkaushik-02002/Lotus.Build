import { NextResponse } from "next/server"
import { getGitHubToken, requireUserUid } from "@/lib/server-auth"
import { getUserInstallationRepos, getUserInstallations } from "@/lib/integrations/github-app"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const token = await getGitHubToken(uid)
    if (!token) return NextResponse.json({ connected: false, repos: [] })

    const installations = await getUserInstallations(token)
    const dedup = new Map<string, { id: number; fullName: string; installationId: number; owner: string; name: string; private: boolean }>()

    for (const installation of installations) {
      const installationId = Number(installation.id)
      if (!installationId) continue
      const repos = await getUserInstallationRepos(token, installationId)
      for (const repo of repos) {
        const fullName = String(repo.full_name || "")
        if (!fullName || dedup.has(fullName)) continue
        const [owner = "", name = ""] = fullName.split("/")
        dedup.set(fullName, {
          id: Number(repo.id),
          fullName,
          installationId,
          owner,
          name,
          private: !!repo.private,
        })
      }
    }

    return NextResponse.json({
      connected: true,
      repos: Array.from(dedup.values()).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load GitHub repositories"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

