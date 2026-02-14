"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { doc, onSnapshot } from "firebase/firestore"
import { ArrowLeft, Loader2 } from "lucide-react"
import { db } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { WebsiteSettingsPanel } from "@/components/project/website-settings-panel"
import type { Project } from "../types"

function WebsiteSettingsPageContent() {
  const params = useParams()
  const projectId = params?.id as string
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projectId) return
    const ref = doc(db, "projects", projectId)
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as any
        setProject({ ...(data as Project), id: snap.id })
      } else {
        setProject(null)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [projectId])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f2] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#f5f5f2] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Link href={`/project/${projectId}`}>
          <Button variant="outline" className="mb-5 border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Builder
          </Button>
        </Link>

        <section className="rounded-3xl border border-zinc-200 bg-white p-5 sm:p-7">
          <h1 className="text-2xl font-semibold text-zinc-900">Website Settings</h1>
          <p className="mt-1 text-sm text-zinc-500">Manage settings for this website.</p>
        </section>

        <div className="mt-6">
          <WebsiteSettingsPanel
            projectId={projectId}
            initialSettings={project?.websiteSettings}
            projectName={project?.name || project?.prompt?.split(" ").slice(0, 3).join(" ") || "Untitled Project"}
            projectFiles={project?.files}
            databaseIntegration={{
              provider: "supabase",
              connected: !!project?.supabaseProjectRef,
              projectRef: project?.supabaseProjectRef,
              projectUrl: project?.supabaseUrl,
            }}
            githubIntegration={{
              repoFullName: project?.githubRepoFullName,
            }}
          />
        </div>
      </div>
    </main>
  )
}

export default function WebsiteSettingsPage() {
  return (
    <ProtectedRoute requiredTokens={0}>
      <WebsiteSettingsPageContent />
    </ProtectedRoute>
  )
}
