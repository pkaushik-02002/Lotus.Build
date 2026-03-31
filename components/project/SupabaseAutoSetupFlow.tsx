"use client"

import { useState, useEffect } from "react"
import { Loader2, Database, CheckCircle2, AlertCircle, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useSupabaseAutoSetup, type SupabaseProject } from "@/hooks/use-supabase-auto-setup"

type Props = {
  open: boolean
  projectId: string
  onClose: () => void
  onSetupComplete?: () => void
  onStatusChange?: (status: "pending" | "in-progress" | "complete" | "failed") => void
}

type SetupPhase = "checking" | "oauth" | "projects" | "selecting" | "provisioning" | "success" | "error"

export function SupabaseAutoSetupFlow({ open, projectId, onClose, onSetupComplete, onStatusChange }: Props) {
  const [phase, setPhase] = useState<SetupPhase>("checking")
  const [selectedProject, setSelectedProject] = useState<SupabaseProject | null>(null)
  const [manualError, setManualError] = useState<string>("")

  const setup = useSupabaseAutoSetup({
    projectId,
    onOAuthRequired: () => {
      onStatusChange?.("in-progress")
      setPhase("oauth")
    },
    onProjectSelectionNeeded: (projects) => {
      onStatusChange?.("in-progress")
      setPhase("projects")
      if (projects.length === 1) {
        // Auto-select if only one project
        setSelectedProject(projects[0])
        handleProjectSelected(projects[0])
      }
    },
    onNoProjects: () => {
      onStatusChange?.("in-progress")
      setPhase("projects")
    },
    onSuccess: () => {
      onStatusChange?.("complete")
      setPhase("success")
      setTimeout(() => {
        onSetupComplete?.()
        onClose()
      }, 2000)
    },
    onError: (error) => {
      onStatusChange?.("failed")
      setManualError(error)
      setPhase("error")
    },
  })

  // Start setup on open
  useEffect(() => {
    if (open && phase === "checking") {
      onStatusChange?.("in-progress")
      setup.triggerSetup()
    }
  }, [open, phase, setup, onStatusChange])

  const handleOAuthCallback = async () => {
    // After user completes OAuth, continue setup
    setPhase("selecting")
    await setup.continueSetup()
  }

  const handleProjectSelected = async (project: SupabaseProject) => {
    setSelectedProject(project)
    setPhase("provisioning")
    await setup.selectProject(project.ref)
  }

  const handleRetry = () => {
    setManualError("")
    setPhase("checking")
    setup.reset()
    setup.triggerSetup()
  }

  // OAuth Phase
  if (phase === "oauth") {
    return (
      <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
        <DialogContent className="border-zinc-200 bg-white text-zinc-900 sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-center">
              <div className="rounded-full bg-blue-50 p-3">
                <Database className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <DialogTitle className="text-center text-xl">Connect Supabase Account</DialogTitle>
            <DialogDescription className="text-center">
              We need to access your Supabase account to set up the database for your website.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-sm text-blue-900">
                You'll be redirected to Supabase to authorize access. After approval, you'll return here to continue.
              </p>
            </div>

            <Button
              onClick={handleOAuthCallback}
              className="w-full bg-blue-600 text-white hover:bg-blue-700"
            >
              Authorize with Supabase
            </Button>

            <Button type="button" variant="outline" onClick={onClose} className="w-full border-zinc-300">
              Skip
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Project Selection Phase
  if (phase === "projects") {
    const hasProjects = setup.selectedProjects.length > 0

    return (
      <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
        <DialogContent className="border-zinc-200 bg-white text-zinc-900 sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-center">
              <div className="rounded-full bg-blue-50 p-3">
                <Database className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <DialogTitle className="text-center text-xl">
              {hasProjects ? "Select Supabase Project" : "Create Supabase Project"}
            </DialogTitle>
            <DialogDescription className="text-center">
              {hasProjects
                ? "Choose an existing project or create a new one to connect your website."
                : "You don't have any Supabase projects yet. Create one to continue."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {hasProjects && (
              <>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Available Projects</p>
                  {setup.selectedProjects.map((project) => (
                    <button
                      key={project.ref}
                      onClick={() => handleProjectSelected(project)}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left transition hover:border-blue-400 hover:bg-blue-50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-zinc-900">{project.name}</p>
                          <p className="text-xs text-zinc-500">{project.ref}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-zinc-400" />
                      </div>
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-zinc-200" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-zinc-500">Or</span>
                  </div>
                </div>
              </>
            )}

            <Button variant="outline" className="w-full border-zinc-300">
              Create New Project
            </Button>

            <Button type="button" variant="ghost" onClick={onClose} className="w-full text-zinc-600">
              Skip
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Provisioning Phase
  if (phase === "provisioning" || phase === "selecting") {
    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="border-zinc-200 bg-white text-zinc-900 sm:max-w-md" hideClose>
          <DialogHeader>
            <div className="flex items-center justify-center">
              <div className="rounded-full bg-blue-50 p-3">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            </div>
            <DialogTitle className="text-center text-xl">Setting Up Your Backend</DialogTitle>
            <DialogDescription className="text-center">
              {selectedProject
                ? `Connecting to ${selectedProject.name} and generating database schema...`
                : "Analyzing your app and preparing the database..."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <ProvisioningSteps />

            <div className="rounded-lg bg-zinc-50 px-4 py-3">
              <p className="text-xs text-zinc-600">This may take a minute. Don't close this window.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Success Phase
  if (phase === "success") {
    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="border-zinc-200 bg-white text-zinc-900 sm:max-w-md" hideClose>
          <DialogHeader>
            <div className="flex items-center justify-center">
              <div className="rounded-full bg-green-50 p-3">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <DialogTitle className="text-center text-xl">Backend Connected!</DialogTitle>
            <DialogDescription className="text-center">
              Your website now has a fully-functional Supabase database integrated.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg bg-green-50 px-4 py-3">
              <ul className="space-y-2 text-sm text-green-900">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>Database schema generated and applied</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>Supabase client integration added to code</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>Authentication and data operations ready</span>
                </li>
              </ul>
            </div>

            <Button onClick={onClose} className="w-full bg-green-600 text-white hover:bg-green-700">
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Error Phase
  if (phase === "error") {
    return (
      <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
        <DialogContent className="border-zinc-200 bg-white text-zinc-900 sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-center">
              <div className="rounded-full bg-red-50 p-3">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
            </div>
            <DialogTitle className="text-center text-xl">Setup Failed</DialogTitle>
            <DialogDescription className="text-center">
              We encountered an error while setting up your backend.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {manualError && (
              <div className="rounded-lg bg-red-50 px-4 py-3">
                <p className="text-sm text-red-900">{manualError}</p>
              </div>
            )}

            <div className="space-y-2">
              <Button onClick={handleRetry} className="w-full bg-blue-600 text-white hover:bg-blue-700">
                Try Again
              </Button>
              <Button type="button" variant="outline" onClick={onClose} className="w-full border-zinc-300">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Checking Phase (default)
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="border-zinc-200 bg-white text-zinc-900 sm:max-w-md" hideClose>
        <DialogHeader>
          <div className="flex items-center justify-center">
            <div className="rounded-full bg-blue-50 p-3">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">Checking Setup Requirements</DialogTitle>
          <DialogDescription className="text-center">
            Analyzing your website and determining backend needs...
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Sub-component showing provisioning progress steps
 */
function ProvisioningSteps() {
  const [currentStep, setCurrentStep] = useState(0)

  const steps = [
    { name: "Analyzing", icon: "📊" },
    { name: "Generating Schema", icon: "🗄️" },
    { name: "Pushing to Database", icon: "📤" },
    { name: "Generating Client Code", icon: "💻" },
    { name: "Encrypting Credentials", icon: "🔐" },
  ]

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % steps.length)
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-2">
      {steps.map((step, idx) => (
        <div
          key={idx}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 transition ${
            idx === currentStep
              ? "bg-blue-50"
              : idx < currentStep
                ? "bg-green-50"
                : "bg-zinc-50"
          }`}
        >
          <span className="text-lg">{step.icon}</span>
          <span
            className={`text-sm font-medium ${
              idx === currentStep
                ? "text-blue-900"
                : idx < currentStep
                  ? "text-green-900"
                  : "text-zinc-500"
            }`}
          >
            {step.name}
          </span>
          {idx < currentStep && <CheckCircle2 className="ml-auto h-4 w-4 text-green-600" />}
          {idx === currentStep && <Loader2 className="ml-auto h-4 w-4 animate-spin text-blue-600" />}
        </div>
      ))}
    </div>
  )
}
