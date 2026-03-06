import { supabaseManagementFetch } from "@/lib/supabase-management"

export type ManagedSupabaseProject = {
  id: string
  name: string
  region?: string
  organizationId?: string
  status?: string
}

type SupabaseProjectApi = {
  id: string
  name: string
  region?: string
  organization_id?: string
  status?: string
}

export async function listSupabaseProjects(uid: string): Promise<ManagedSupabaseProject[]> {
  const projects = await supabaseManagementFetch<SupabaseProjectApi[]>(uid, "/v1/projects")
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    region: p.region,
    organizationId: p.organization_id,
    status: p.status,
  }))
}

