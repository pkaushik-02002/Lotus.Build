import { NextResponse } from "next/server"
import { requireUserUid } from "@/lib/server-auth"
import { getSupabaseConnection, supabaseManagementFetch } from "@/lib/supabase-management"

export const runtime = "nodejs"

type SupabaseOrg = { id: string; slug?: string; name?: string }
type SupabaseProject = { id: string; name: string; region?: string; organization_id?: string; status?: string }

export async function GET(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const connection = await getSupabaseConnection(uid)
    if (!connection?.accessToken) {
      return NextResponse.json(
        {
          connected: false,
          reason: "oauth_missing",
          error: "Supabase OAuth token not found for this Builder account. Reconnect Supabase.",
          projects: [],
          organizations: [],
        },
        { status: 200 }
      )
    }

    let organizations: SupabaseOrg[] = []
    try {
      organizations = await supabaseManagementFetch<SupabaseOrg[]>(uid, "/v1/organizations")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to list organizations"
      if (msg.toLowerCase().includes("401") || msg.toLowerCase().includes("unauthorized")) {
        return NextResponse.json(
          {
            connected: false,
            reason: "oauth_invalid",
            error: "Supabase OAuth token is invalid or expired. Reconnect Supabase.",
            projects: [],
            organizations: [],
          },
          { status: 200 }
        )
      }
      organizations = []
    }

    const allProjects: Array<{ id: string; name: string; ref: string; region: string; organizationId?: string; status?: string }> = []
    if (organizations.length === 0) {
      const projects = await supabaseManagementFetch<SupabaseProject[]>(uid, "/v1/projects")
      const orgSet = new Set<string>()
      for (const p of projects) {
        allProjects.push({
          id: p.id,
          name: p.name,
          ref: p.id,
          region: p.region || "unknown",
          organizationId: p.organization_id,
          status: p.status,
        })
        if (p.organization_id) orgSet.add(p.organization_id)
      }
      organizations = Array.from(orgSet).map((id) => ({ id, name: id }))
    } else {
      for (const org of organizations) {
        const projects = await supabaseManagementFetch<SupabaseProject[]>(
          uid,
          `/v1/projects?organization_id=${encodeURIComponent(org.id)}`
        )
        for (const p of projects) {
          allProjects.push({
            id: p.id,
            name: p.name,
            ref: p.id,
            region: p.region || "unknown",
            organizationId: p.organization_id,
            status: p.status,
          })
        }
      }
    }

    return NextResponse.json({ connected: true, projects: allProjects, organizations })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list projects"
    if (message.includes("not connected")) {
      return NextResponse.json(
        {
          connected: false,
          reason: "oauth_missing",
          error: "Supabase OAuth token not found for this Builder account. Reconnect Supabase.",
          projects: [],
          organizations: [],
        },
        { status: 200 }
      )
    }
    const status = message.includes("Missing Authorization") ? 401 : 500
    return NextResponse.json({ error: message, connected: false }, { status })
  }
}
