import { NextResponse } from "next/server"
import type { Message } from "@/app/project/[id]/types"
import { adminDb } from "@/lib/firebase-admin"
import {
  analyzeSupabaseProvisioningNeed,
  generateSupabaseIntegrationUpdates,
  mergeProjectFiles,
} from "@/lib/integrations/supabase/provision"
import { generatePostgresSchema } from "@/lib/integrations/supabase/schema"
import { assertProjectCanEdit } from "@/lib/project-access"
import { requireUserUid } from "@/lib/server-auth"
import { getSupabaseConnection, supabaseManagementFetch } from "@/lib/supabase-management"
import { encryptEnvVars } from "@/lib/encrypt-env"

export const runtime = "nodejs"

type ProjectRecord = {
  name?: string
  prompt?: string
  workspaceId?: string
  files?: Array<{ path: string; content: string }>
  messages?: Message[]
  generatedSchemaSql?: string
  generatedSchemaTables?: string[]
  supabaseUrl?: string
  supabaseAnonKey?: string
  supabaseProjectRef?: string
  supabaseProjectName?: string
  generationMeta?: Record<string, unknown>
}

type SupabaseProject = {
  id: string
  name: string
  ref: string
  organization_id: string
}

interface AutoSetupResponse {
  status:
    | "success"
    | "oauth_required"
    | "no_projects"
    | "project_selection_needed"
    | "provisioning_failed"
    | "analyzing"
  message: string
  data?: {
    projects?: SupabaseProject[]
    schema?: string
    tables?: string[]
    filesUpdated?: number
  }
}

/**
 * Ensures support files exist in the project
 */
function ensureSupportFiles(params: { files: Array<{ path: string; content: string }>; schemaSql: string }) {
  const next = new Map(params.files.map((file) => [file.path, file]))

  if (!next.has(".env.example")) {
    next.set(".env.example", {
      path: ".env.example",
      content: ["VITE_SUPABASE_URL=", "VITE_SUPABASE_ANON_KEY="].join("\n"),
    })
  }

  if (params.schemaSql.trim()) {
    next.set("supabase/migrations/001_initial.sql", {
      path: "supabase/migrations/001_initial.sql",
      content: params.schemaSql.trim(),
    })
  }

  return Array.from(next.values())
}

/**
 * Orchestrates the complete Supabase auto-setup flow:
 * 1. Checks OAuth connection
 * 2. Lists user's Supabase projects
 * 3. Handles project selection/creation
 * 4. Auto-provisions backend (schema + client integration)
 *
 * POST /api/integrations/supabase/auto-setup
 * Body: {
 *   projectId: string
 *   supabaseProjectId?: string (optional, if user pre-selected)
 *   forceSetup?: boolean (skip "not needed" detection)
 * }
 */
export async function POST(req: Request): Promise<NextResponse<AutoSetupResponse>> {
  try {
    const uid = await requireUserUid(req)
    const body = await req.json().catch(() => ({}))

    const projectId = (body?.projectId ?? "").toString().trim()
    if (!projectId) {
      return NextResponse.json(
        { status: "provisioning_failed" as const, message: "Missing projectId" },
        { status: 400 }
      )
    }

    await assertProjectCanEdit(projectId, uid)

    const projectRef = adminDb.collection("projects").doc(projectId)
    const projectSnap = await projectRef.get()
    if (!projectSnap.exists) {
      return NextResponse.json(
        { status: "provisioning_failed" as const, message: "Project not found" },
        { status: 404 }
      )
    }

    const project = projectSnap.data() as ProjectRecord
    const prompt = (project?.prompt ?? "").toString().trim()
    if (!prompt) {
      return NextResponse.json(
        { status: "provisioning_failed" as const, message: "Project prompt is missing" },
        { status: 400 }
      )
    }

    // === STEP 1: Check OAuth connection ===
    const connection = await getSupabaseConnection(uid)
    if (!connection) {
      return NextResponse.json(
        {
          status: "oauth_required" as const,
          message: "Supabase OAuth connection required. Please authorize first.",
        },
        { status: 401 }
      )
    }

    // === STEP 2: List user's Supabase projects ===
    let projects: SupabaseProject[] = []
    try {
      const projectsRes = await supabaseManagementFetch(uid, "/v1/projects")
      if (projectsRes.ok) {
        const data = (await projectsRes.json()) as { data?: SupabaseProject[] }
        projects = Array.isArray(data?.data) ? data.data : []
      }
    } catch (error) {
      console.error("Failed to fetch Supabase projects:", error)
      // Don't fail, just continue with empty projects
    }

    // === STEP 3a: Check if user provided a project ID ===
    let selectedProjectId = (body?.supabaseProjectId ?? "").toString().trim()

    // === STEP 3b: If no project provided and no projects exist, request creation ===
    if (!selectedProjectId && projects.length === 0) {
      return NextResponse.json({
        status: "no_projects" as const,
        message: "No Supabase projects found. Create one to continue.",
        data: { projects: [] },
      })
    }

    // === STEP 3c: If no project provided but projects exist, request selection ===
    if (!selectedProjectId && projects.length > 0) {
      return NextResponse.json({
        status: "project_selection_needed" as const,
        message: "Select a Supabase project to set up backend.",
        data: { projects },
      })
    }

    // === STEP 3d: Verify selected project exists ===
    const selectedProject = projects.find((p) => p.id === selectedProjectId || p.ref === selectedProjectId)
    if (!selectedProject) {
      return NextResponse.json(
        {
          status: "provisioning_failed" as const,
          message: "Selected Supabase project not found.",
        },
        { status: 400 }
      )
    }

    const projectRefId = selectedProject.ref
    const projectName = selectedProject.name

    // === STEP 4: Get project details (URL, anon key) ===
    let supabaseUrl = ""
    let supabaseAnonKey = ""

    try {
      const projectDetailsRes = await supabaseManagementFetch(
        uid,
        `/v1/projects/${encodeURIComponent(projectRefId)}`
      )
      if (projectDetailsRes.ok) {
        const details = (await projectDetailsRes.json()) as {
          project?: {
            id?: string
            name?: string
            api_keys?: Array<{ name?: string; api_key?: string }>
          }
        }
        const projectData = details.project
        if (projectData?.api_keys) {
          const anonKeyObj = projectData.api_keys.find((k) => k.name?.includes("anon"))
          supabaseAnonKey = anonKeyObj?.api_key ?? ""
        }
        // Construct URL from project ref
        supabaseUrl = `https://${projectRefId}.supabase.co`
      }
    } catch (error) {
      console.error("Failed to fetch project details:", error)
      return NextResponse.json(
        {
          status: "provisioning_failed" as const,
          message: "Failed to fetch Supabase project details.",
        },
        { status: 500 }
      )
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        {
          status: "provisioning_failed" as const,
          message: "Could not retrieve Supabase credentials.",
        },
        { status: 500 }
      )
    }

    // === STEP 5: Analyze if provisioning is needed ===
    const forceSetup = body?.forceSetup === true
    const files = Array.isArray(project?.files) ? project.files : []
    const messages = Array.isArray(project?.messages) ? project.messages : []
    const generationMeta = project?.generationMeta

    let companyContext = ""
    const workspaceId = (project?.workspaceId ?? "").toString().trim()
    if (workspaceId) {
      const wsSnap = await adminDb.collection("workspaces").doc(workspaceId).get()
      if (wsSnap.exists) {
        const ws = wsSnap.data() as { aiContextPrompt?: string }
        companyContext = (ws?.aiContextPrompt ?? "").toString().trim()
      }
    }

    const plan = await analyzeSupabaseProvisioningNeed({
      prompt,
      projectName: (project?.name ?? "").toString().trim(),
      messages,
      files,
      generationMeta,
    })

    // If provisioning not needed and not forced, return early
    if (!plan.shouldProvision && !forceSetup) {
      await projectRef.set(
        {
          supabaseProjectRef: projectRefId,
          supabaseProjectName: projectName,
          supabaseUrl,
          supabaseAnonKey,
          supabaseProvisioningStatus: "not-needed",
          supabaseProvisioningReason: plan.reason,
          supabaseProvisionedAt: new Date(),
        },
        { merge: true }
      )

      return NextResponse.json({
        status: "success" as const,
        message: `Project linked but provisioning not needed: ${plan.reason}`,
        data: { filesUpdated: 0 },
      })
    }

    // === STEP 6: Generate PostgreSQL schema (if needed) ===
    const schemaSql =
      typeof project?.generatedSchemaSql === "string" && project.generatedSchemaSql.trim()
        ? project.generatedSchemaSql.trim()
        : plan.needsSchema
          ? (
              await generatePostgresSchema({
                appPrompt: prompt,
                projectName: (project?.name ?? "").toString().trim(),
                companyContext,
                existingFiles: files,
                conversationMessages: messages.map((message) => `${message.role}: ${message.content}`),
                setupReason: plan.reason,
              })
            ).sql
          : ""

    // === STEP 7: Push schema to Supabase ===
    if (schemaSql) {
      try {
        await supabaseManagementFetch(uid, `/v1/projects/${encodeURIComponent(projectRefId)}/database/query`, {
          method: "POST",
          body: JSON.stringify({ query: schemaSql }),
        })
      } catch (error) {
        console.error("Failed to push schema to Supabase:", error)
        return NextResponse.json(
          {
            status: "provisioning_failed" as const,
            message: "Failed to apply database schema.",
          },
          { status: 500 }
        )
      }
    }

    // === STEP 8: Generate client integration (if needed) ===
    let nextFiles = files
    if (plan.needsClientIntegration) {
      try {
        const updates = await generateSupabaseIntegrationUpdates({
          prompt,
          projectName: (project?.name ?? "").toString().trim(),
          messages,
          files,
          schemaSql,
          supabaseUrl,
          anonKeyPresent: Boolean(supabaseAnonKey),
          setupReason: plan.reason,
        })

        if (updates.length > 0) {
          nextFiles = mergeProjectFiles(files, updates)
        }
      } catch (error) {
        console.error("Failed to generate client integration:", error)
        // Don't fail hard, just skip client integration
      }
    }

    // === STEP 9: Ensure support files ===
    nextFiles = ensureSupportFiles({ files: nextFiles, schemaSql })

    // === STEP 10: Encrypt and store env vars ===
    const { encrypted } = encryptEnvVars(
      JSON.stringify({
        VITE_SUPABASE_URL: supabaseUrl,
        VITE_SUPABASE_ANON_KEY: supabaseAnonKey,
      })
    )

    // === STEP 11: Link project and store credentials ===
    await adminDb.collection("supabaseLinks").doc(projectId).set(
      {
        projectId,
        supabaseProjectRef: projectRefId,
        supabaseProjectName: projectName,
        supabaseUrl,
        supabaseAnonKey,
        oauthTokenId: uid,
        linkedAt: new Date(),
      },
      { merge: true }
    )

    // === STEP 12: Update project with provisioning results ===
    await projectRef.set(
      {
        files: nextFiles,
        generatedSchemaSql: schemaSql || project?.generatedSchemaSql || "",
        generatedSchemaTables: Array.isArray(project?.generatedSchemaTables) ? project.generatedSchemaTables : [],
        schemaPushedAt: schemaSql ? new Date() : null,
        schemaPushStatus: schemaSql ? "success" : "skipped",
        envVarsEncrypted: encrypted,
        envVarNames: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"],
        envVarsUpdatedAt: new Date(),
        supabaseProjectRef: projectRefId,
        supabaseProjectName: projectName,
        supabaseUrl,
        supabaseAnonKey,
        supabaseProvisioningStatus: "success",
        supabaseProvisioningReason: plan.reason,
        supabaseProvisionedAt: new Date(),
      },
      { merge: true }
    )

    return NextResponse.json({
      status: "success" as const,
      message: "Supabase backend successfully set up and connected.",
      data: {
        schema: schemaSql ? "Schema generated and applied" : "No schema needed",
        tables: [],
        filesUpdated: nextFiles.length,
      },
    })
  } catch (error) {
    console.error("Auto-setup error:", error)
    const message = error instanceof Error ? error.message : "Unknown error occurred"
    return NextResponse.json(
      {
        status: "provisioning_failed" as const,
        message: `Setup failed: ${message}`,
      },
      { status: 500 }
    )
  }
}
