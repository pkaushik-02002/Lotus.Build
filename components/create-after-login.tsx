"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { collection, addDoc, serverTimestamp } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/contexts/auth-context"
import { promptSuggestsSupabaseBackend } from "@/lib/project-blueprint";
const PENDING_CREATE_KEY = "lotus-build_pending_create"

export function CreateAfterLogin() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading, getOptionalAuthHeader } = useAuth()
  const handledRef = useRef(false)

  useEffect(() => {
    if (loading || !user || pathname !== "/") return
    const raw = sessionStorage.getItem(PENDING_CREATE_KEY)
    if (!raw || handledRef.current) return

    let data: {
      prompt: string
      model: string
      creationMode?: "build" | "agent"
    }
    try {
      data = JSON.parse(raw)
    } catch {
      sessionStorage.removeItem(PENDING_CREATE_KEY)
      return
    }
    if (!data.prompt?.trim()) {
      sessionStorage.removeItem(PENDING_CREATE_KEY)
      return
    }

    handledRef.current = true
    sessionStorage.removeItem(PENDING_CREATE_KEY)

    const createPendingResource = async () => {
      if (data.creationMode === "agent") {
        const authHeader = await getOptionalAuthHeader()
        const response = await fetch("/api/computer/sessions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeader,
          },
          body: JSON.stringify({
            prompt: data.prompt.trim(),
            model: data.model || "GPT-4-1 Mini",
          }),
        })
        const payload = (await response.json().catch(() => ({}))) as { id?: string; error?: string }
        if (!response.ok || !payload.id) {
          throw new Error(payload.error || "Could not create computer session")
        }
        router.replace(`/computer/${payload.id}`)
        return
      }

      const projectData: Record<string, unknown> = {
        prompt: data.prompt.trim(),
        model: data.model || "GPT-4-1 Mini",
        status: "pending",
        creationMode: "build",
        suggestsBackend: promptSuggestsSupabaseBackend(data.prompt.trim()),
        createdAt: serverTimestamp(),
        messages: [],
        ownerId: user.uid,
        visibility: "private",
      }

      const docRef = await addDoc(collection(db, "projects"), projectData)
      router.replace(`/project/${docRef.id}`)
    }

    createPendingResource().catch((err) => {
      console.error("CreateAfterLogin: failed to create pending resource", err)
      handledRef.current = false
    })
  }, [pathname, user, loading, router, getOptionalAuthHeader])

  return null
}
