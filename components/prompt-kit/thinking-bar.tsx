"use client"

import React, { useMemo } from "react"
import { cn } from "@/lib/utils"
import { Loader2, Check, Sparkles } from "lucide-react"
import { TextShimmer } from "@/components/prompt-kit/text-shimmer"

type StepStatus = "pending" | "active" | "completed"

type ThinkingStep = {
  id: string
  title: string
  status: StepStatus
}

export interface ThinkingBarProps {
  text: string
  steps: string[]
  isGenerating?: boolean
  currentFile?: string | null
  className?: string
}

function statusStyles(status: StepStatus) {
  if (status === "completed") {
    return {
      dot: "border-emerald-300 bg-emerald-50 text-emerald-700",
      card: "border-zinc-200 bg-white",
      title: "text-zinc-900",
    }
  }
  if (status === "active") {
    return {
      dot: "border-zinc-300 bg-zinc-100 text-zinc-800",
      card: "border-zinc-300 bg-zinc-50",
      title: "text-zinc-900",
    }
  }
  return {
    dot: "border-zinc-200 bg-white text-zinc-400",
    card: "border-zinc-200 bg-white/80",
    title: "text-zinc-500",
  }
}

export function ThinkingBar({
  text,
  steps,
  isGenerating = false,
  currentFile,
  className,
}: ThinkingBarProps) {
  const timelineSteps = useMemo<ThinkingStep[]>(() => {
    const normalized = steps.length > 0 ? steps : [text || "Preparing update"]
    const activeIndex = isGenerating ? Math.max(normalized.length - 1, 0) : -1

    return normalized.map((title, index) => {
      const status: StepStatus =
        activeIndex === -1 ? "completed" : index < activeIndex ? "completed" : index === activeIndex ? "active" : "pending"
      return { id: String(index), title, status }
    })
  }, [steps, text, isGenerating])

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("rounded-2xl border border-zinc-200 bg-[#fcfcfa] p-4", className)}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white">
            {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-700" /> : <Sparkles className="h-3.5 w-3.5 text-zinc-700" />}
          </div>
          {isGenerating ? (
            <TextShimmer className="text-sm font-medium text-zinc-900">{text || "Making updates"}</TextShimmer>
          ) : (
            <p className="text-sm font-medium text-zinc-900">{text || "Making updates"}</p>
          )}
        </div>
        {currentFile ? <p className="truncate text-xs text-zinc-500">{currentFile}</p> : null}
      </div>

      <div className="space-y-2">
        {timelineSteps.map((step) => {
          const styles = statusStyles(step.status)
          return (
            <div key={step.id} className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5", styles.card)}>
              <div className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", styles.dot)}>
                {step.status === "completed" ? <Check className="h-3 w-3" /> : step.status === "active" ? <div className="h-2 w-2 rounded-full bg-zinc-700" /> : <div className="h-1.5 w-1.5 rounded-full bg-zinc-300" />}
              </div>
              <p className={cn("text-sm", styles.title)}>{step.title}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
