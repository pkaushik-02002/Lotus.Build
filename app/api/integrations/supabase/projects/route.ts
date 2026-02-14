import { NextResponse } from "next/server"
import { requireUserUid } from "@/lib/server-auth"
import { supabaseManagementFetch } from "@/lib/supabase-management"

export const runtime = "nodejs"

type SupabaseOrg = { id: string; slug?: string; name?: string }
type SupabaseProject = { id: string; name: string; region?: string; organization_id?: string; status?: string }

export async function GET(req: Request) {
  try {
    const uid = await requireUserUid(req)
    let organizations: SupabaseOrg[] = []
    try {
      organizations = await supabaseManagementFetch<SupabaseOrg[]>(uid, "/v1/organizations")
    } catch {
      organizations = []
    }
    let orgIds = organizations.map((o) => o.id).filter(Boolean)
    const allProjects: Array<{ id: string; name: string; ref: string; region: string; organizationId?: string; status?: string }> = []
    const projectErrors: Array<{ organizationId: string; error: string }> = []

    if (orgIds.length === 0) {
      // Fallback: some tokens can list projects but not organizations.
      const projects = await supabaseManagementFetch<SupabaseProject[]>(uid, "/v1/projects")
      const derivedOrgIds = new Set<string>()
      for (const p of projects) {
        allProjects.push({
          id: p.id,
          name: p.name,
          ref: p.id,
          region: p.region || "unknown",
          organizationId: p.organization_id,
          status: p.status,
        })
        if (p.organization_id) derivedOrgIds.add(p.organization_id)
      }
      organizations = Array.from(derivedOrgIds).map((id) => ({ id, name: id }))
      orgIds = organizations.map((o) => o.id)
    } else {
      for (const orgId of orgIds) {
        try {
          const projects = await supabaseManagementFetch<SupabaseProject[]>(
            uid,
            `/v1/projects?organization_id=${encodeURIComponent(orgId)}`
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
        } catch (err: unknown) {
          projectErrors.push({
            organizationId: orgId,
            error: err instanceof Error ? err.message : "Failed to list projects for organization",
          })
        }
      }
    }

    return NextResponse.json({ connected: true, projects: allProjects, organizations, projectErrors })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list projects"
    const status = message.includes("not connected") ? 404 : 500
    return NextResponse.json({ error: message, connected: false }, { status })
  }
}
