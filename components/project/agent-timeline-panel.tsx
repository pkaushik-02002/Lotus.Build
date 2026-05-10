"use client"

import { Check, X, ChevronRight } from "lucide-react"

import { TextShimmer } from "@/components/prompt-kit/text-shimmer"
import { cn } from "@/lib/utils"

export type AgentTimelineItem = {
  key: string
  title: string
  description: string
  detail: string
  accent: string
  status: "complete" | "active" | "pending"
}

function getAgentTimelineSummary(steps: AgentTimelineItem[]) {
  const total = steps.length
  const activeStep = steps.find((step) => step.status === "active") ?? null
  const completedCount = steps.filter((step) => step.status === "complete").length
  const currentCount = activeStep ? completedCount + 1 : completedCount
  const progress = total > 0 ? Math.min(currentCount / total, 1) : 0
  return { total, activeStep, completedCount, currentCount, progress }
}

/* ── Live pulse dot ── */
function LiveDot() {
  return (
    <div className="relative flex h-1.5 w-1.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-zinc-900 opacity-20" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-zinc-900" />
    </div>
  )
}

/* ── Inline file icon ── */
function FilesIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1.5" y="1.5" width="3.5" height="4" rx="0.8" />
      <rect x="7" y="5.5" width="3.5" height="4" rx="0.8" />
      <rect x="7" y="1.5" width="3.5" height="3" rx="0.8" />
    </svg>
  )
}

/* ── Grid icon for timeline header ── */
function GridIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="1" width="4.5" height="4.5" rx="1.2" />
      <rect x="8.5" y="1" width="4.5" height="4.5" rx="1.2" />
      <rect x="1" y="8.5" width="4.5" height="4.5" rx="1.2" />
      <rect x="8.5" y="8.5" width="4.5" height="4.5" rx="1.2" />
    </svg>
  )
}

/* ─────────────────────────────────────────────
   Header panel
 ───────────────────────────────────────────── */
function AgentRunHeader({
  steps,
  generatedFileCount,
  currentGeneratingFile,
}: {
  steps: AgentTimelineItem[]
  generatedFileCount: number
  currentGeneratingFile: string | null
}) {
  const { activeStep, currentCount, total, progress } = getAgentTimelineSummary(steps)
  const pct = Math.round(progress * 100)

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e0dbd1] bg-white shadow-sm">
      {/* Top row */}
      <div className="flex items-center justify-between px-4 pt-3.5">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5">
          <LiveDot />
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">
            Live run
          </span>
        </div>

        <div className="inline-flex items-center gap-1.5 text-zinc-400">
          <FilesIcon />
          <span className="text-[10px] font-semibold text-zinc-400">
            {generatedFileCount} files
          </span>
        </div>
      </div>

      {/* Current step name + mono detail */}
      <div className="px-4 pt-3">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
          Currently
        </p>

        {activeStep ? (
          <TextShimmer 
            className="bg-gradient-to-r from-zinc-400 via-zinc-950 to-zinc-400 text-[15px] font-semibold leading-snug tracking-tight"
            duration={3.2}
          >
            {activeStep.title}
          </TextShimmer>
        ) : (
          <p className="text-[15px] font-semibold leading-snug tracking-tight text-zinc-950">
            Wrapping up
          </p>
        )}

        {(currentGeneratingFile ?? activeStep?.detail) && (
          <p className="mt-1 truncate font-mono text-[10px] text-zinc-400">
            {currentGeneratingFile ?? activeStep?.detail}
          </p>
        )}
      </div>

      {/* Progress */}
      <div className="mt-3 border-t border-[#f3f0e9] px-4 py-3 bg-[#faf9f6]/50">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
            Progress
          </span>
          <span className="font-mono text-[10px] font-semibold tabular-nums text-zinc-500">
            {currentCount} / {total}
          </span>
        </div>

        <div className="h-[2px] w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-zinc-900 transition-all duration-1000 ease-in-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   Individual step row
 ───────────────────────────────────────────── */
function TimelineStep({
  step,
  isLast,
}: {
  step: AgentTimelineItem
  isLast: boolean
}) {
  const isComplete = step.status === "complete"
  const isActive = step.status === "active"
  const isPending = step.status === "pending"

  return (
    <div className="relative flex items-start gap-2.5 py-2.5">
      {/* Marker */}
      <div className="flex h-5 w-4 shrink-0 items-center justify-center">
        {isComplete ? (
          <svg className="h-3 w-3" viewBox="0 0 11 11" fill="none" stroke="#71717a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2,5.5 4.5,8 9,3" />
          </svg>
        ) : isActive ? (
          <LiveDot />
        ) : (
          <div className="h-1 w-1 rounded-full bg-zinc-300" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-x-2">
          {isActive ? (
            <TextShimmer 
              className="bg-gradient-to-r from-zinc-400 via-zinc-950 to-zinc-400 text-[14px] font-medium" 
              duration={3.2}
            >
              {step.title}
            </TextShimmer>
          ) : (
            <span className={cn("text-[14px] leading-relaxed", isComplete ? "text-zinc-800" : "text-zinc-400")}>
              {step.title}
            </span>
          )}
          {isComplete && (
            <span className="text-[11px] font-medium text-zinc-300">Done</span>
          )}
        </div>

        {step.description && (
          <p className={cn("text-[11.5px] leading-relaxed", isComplete ? "text-zinc-500" : "text-zinc-300")}>
            {step.description}
          </p>
        )}

        {step.detail && isActive && (
          <p className="mt-0.5 font-mono text-[10px] text-zinc-400 truncate">
            {step.detail}
          </p>
        )}
      </div>
    </div>
  )
}

function AgentTimelineRail({ steps }: { steps: AgentTimelineItem[] }) {
  const completedCount = steps.filter((s) => s.status === "complete").length

  return (
    <div className="mt-4">
      {/* Panel header */}
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="flex items-center gap-1.5 text-zinc-400">
          <GridIcon />
          <span className="text-[10px] font-bold uppercase tracking-[0.14em]">Steps</span>
        </div>
        <span className="text-[10px] font-semibold tabular-nums text-zinc-400">
          {completedCount} / {steps.length}
        </span>
      </div>

      {/* Steps */}
      <div className="divide-y divide-[#f3f0e9]/50">
        {steps.map((step, idx) => (
          <TimelineStep
            key={step.key}
            step={step}
            isLast={idx === steps.length - 1}
          />
        ))}
      </div>
    </div>
  )
}

export function AgentTimelinePanel({
  steps,
  generatedFileCount,
  currentGeneratingFile,
}: {
  steps: AgentTimelineItem[]
  generatedFileCount: number
  currentGeneratingFile: string | null
}) {
  return (
    <div className="flex flex-col gap-2.5 px-4 py-4">
      <AgentRunHeader
        steps={steps}
        generatedFileCount={generatedFileCount}
        currentGeneratingFile={currentGeneratingFile}
      />
      <AgentTimelineRail steps={steps} />
    </div>
  )
}

