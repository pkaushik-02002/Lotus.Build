/**
 * Hook for orchestrating Supabase auto-setup flow
 * Handles: OAuth check → Project listing → Project selection → Auto-provisioning
 */

import { useCallback, useState } from "react"
import { useAuth } from "@/contexts/auth-context"

export type SupabaseProject = {
  id: string
  name: string
  ref: string
  organization_id: string
}

export type SetupState =
  | "idle"
  | "checking_oauth"
  | "loading_projects"
  | "awaiting_project_selection"
  | "provisioning"
  | "success"
  | "error"

export interface UseSupabaseAutoSetupOptions {
  projectId: string
  onOAuthRequired?: () => void
  onProjectSelectionNeeded?: (projects: SupabaseProject[]) => void
  onNoProjects?: () => void
  onSuccess?: (result: SetupResult) => void
  onError?: (error: string) => void
}

export interface SetupResult {
  schema?: string
  filesUpdated?: number
  reason?: string
}

/**
 * Hook for managing Supabase auto-setup flow
 *
 * Usage:
 * const setup = useSupabaseAutoSetup({
 *   projectId: "project123",
 *   onOAuthRequired: () => { showOAuthModal() },
 *   onProjectSelectionNeeded: (projects) => { showProjectPicker(projects) },
 *   onSuccess: () => { showSuccessMessage() }
 * })
 *
 * // Start setup
 * setup.triggerSetup()
 *
 * // After OAuth, continue with setup
 * setup.continueSetup()
 *
 * // User selects a project
 * setup.selectProject("project-ref-123")
 *
 * // Or create new project first, then continue
 * setup.continueSetup({ supabaseProjectId: "new-project-ref" })
 */
export function useSupabaseAutoSetup(options: UseSupabaseAutoSetupOptions) {
  const { getAuthHeader } = useAuth()
  const [state, setState] = useState<SetupState>("idle")
  const [selectedProjects, setSelectedProjects] = useState<SupabaseProject[]>([])
  const [error, setError] = useState<string>("")
  const [result, setResult] = useState<SetupResult>()

  const callOrchestratorEndpoint = useCallback(
    async (body: Record<string, unknown>) => {
      try {
        const authHeader = await getAuthHeader()
        const res = await fetch("/api/integrations/supabase/auto-setup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeader,
          },
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}))
          throw new Error(errorData?.message || `Setup failed (${res.status})`)
        }

        return res.json()
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : "Unknown error")
      }
    },
    [getAuthHeader]
  )

  /**
   * Start the auto-setup flow
   */
  const triggerSetup = useCallback(async () => {
    setState("checking_oauth")
    setError("")

    try {
      const response = await callOrchestratorEndpoint({
        projectId: options.projectId,
      })

      switch (response.status) {
        case "success":
          // Already complete
          setResult(response.data)
          setState("success")
          options.onSuccess?.(response.data)
          break

        case "oauth_required":
          setState("idle")
          setError("Supabase OAuth connection required")
          options.onOAuthRequired?.()
          break

        case "no_projects":
          setState("idle")
          setError("No Supabase projects found")
          options.onNoProjects?.()
          break

        case "project_selection_needed":
          setSelectedProjects(response.data?.projects ?? [])
          setState("awaiting_project_selection")
          options.onProjectSelectionNeeded?.(response.data?.projects ?? [])
          break

        case "provisioning_failed":
          setState("error")
          setError(response.message)
          options.onError?.(response.message)
          break

        default:
          setState("error")
          setError("Unknown response status")
          options.onError?.("Unknown response status")
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error"
      setState("error")
      setError(errorMsg)
      options.onError?.(errorMsg)
    }
  }, [options, callOrchestratorEndpoint])

  /**
   * Continue setup after OAuth or project creation
   * If supabaseProjectId not provided, will request project selection
   */
  const continueSetup = useCallback(
    async (params?: { supabaseProjectId?: string; forceSetup?: boolean }) => {
      setState("provisioning")
      setError("")

      try {
        const response = await callOrchestratorEndpoint({
          projectId: options.projectId,
          supabaseProjectId: params?.supabaseProjectId,
          forceSetup: params?.forceSetup,
        })

        switch (response.status) {
          case "success":
            setResult(response.data)
            setState("success")
            options.onSuccess?.(response.data)
            break

          case "project_selection_needed":
            setSelectedProjects(response.data?.projects ?? [])
            setState("awaiting_project_selection")
            options.onProjectSelectionNeeded?.(response.data?.projects ?? [])
            break

          case "no_projects":
            setState("idle")
            setError("No Supabase projects found")
            options.onNoProjects?.()
            break

          case "provisioning_failed":
            setState("error")
            setError(response.message)
            options.onError?.(response.message)
            break

          default:
            setState("error")
            setError("Unknown response status")
            options.onError?.("Unknown response status")
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error"
        setState("error")
        setError(errorMsg)
        options.onError?.(errorMsg)
      }
    },
    [options, callOrchestratorEndpoint]
  )

  /**
   * User selects a project from the list
   * Immediately continues setup with selected project
   */
  const selectProject = useCallback(
    async (projectRef: string) => {
      await continueSetup({ supabaseProjectId: projectRef })
    },
    [continueSetup]
  )

  /**
   * Reset the setup flow
   */
  const reset = useCallback(() => {
    setState("idle")
    setError("")
    setSelectedProjects([])
    setResult(undefined)
  }, [])

  return {
    // State
    state,
    error,
    selectedProjects,
    result,

    // Actions
    triggerSetup,
    continueSetup,
    selectProject,
    reset,

    // Utilities
    isLoading: state === "checking_oauth" || state === "provisioning",
    isAwaitingInput: state === "awaiting_project_selection",
    isComplete: state === "success",
  }
}
