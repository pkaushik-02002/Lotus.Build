"use client"

import * as React from "react"
import { Check, Loader2, Terminal, X } from "lucide-react"
import { TextShimmer } from "@/components/prompt-kit/text-shimmer"
import { cn } from "@/lib/utils"

export type BashToolApproval = {
  pending?: boolean
  onSkip?: () => void
  onRun?: () => void
  skipLabel?: string
  runLabel?: string
}

export type BashToolProps = {
  state?: "idle" | "running"
  command: string
  output?: string
  approval?: BashToolApproval
  className?: string
}

function extractCommandSummary(command: string) {
  return command
    .split("|")
    .map((part) => part.trim().split(/\s+/)[0] || "")
    .filter(Boolean)
    .slice(0, 4)
    .join(", ")
}

function LoadingDots() {
  return (
    <span className="inline-flex" aria-hidden="true">
      <span className="animate-pulse">.</span>
      <span className="animate-pulse [animation-delay:150ms]">.</span>
      <span className="animate-pulse [animation-delay:300ms]">.</span>
    </span>
  )
}

function ApprovalFooter({ isRunning, approval }: { isRunning: boolean; approval: BashToolApproval }) {
  const [decision, setDecision] = React.useState<"approved" | "rejected" | null>(null)
  const status = decision === "approved"
    ? { label: "Waiting", dots: true }
    : decision === "rejected"
      ? { label: "Canceled", dots: false }
      : isRunning
        ? { label: "Starting", dots: true }
        : null

  return (
    <div className="flex items-center justify-between border-t border-[#e0dbd1] bg-[#f3f1ec] py-1.5 pl-3 pr-2">
      {status ? (
        <span className="text-xs text-zinc-500">
          {status.label}
          {status.dots && <LoadingDots />}
        </span>
      ) : (
        <span aria-hidden="true" />
      )}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => {
            if (decision) return
            setDecision("rejected")
            approval.onSkip?.()
          }}
          disabled={Boolean(decision)}
          className="inline-flex h-6 items-center gap-1 rounded-[4px] px-1.5 text-xs text-zinc-500 transition-colors hover:bg-white hover:text-zinc-900 disabled:opacity-60"
        >
          <X className="h-3 w-3" />
          {decision === "rejected" ? "Skipped" : approval.skipLabel ?? "Skip"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (decision) return
            setDecision("approved")
            approval.onRun?.()
          }}
          disabled={Boolean(decision)}
          className="inline-flex h-6 items-center gap-1 rounded-[4px] bg-zinc-950 px-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60"
        >
          <Check className="h-3 w-3" />
          {decision === "approved" ? "Approved" : approval.runLabel ?? "Run"}
        </button>
      </div>
    </div>
  )
}

export const BashTool = React.memo(function BashTool({
  state = "idle",
  command,
  output,
  approval,
  className,
}: BashToolProps) {
  const isRunning = state === "running"
  const summary = extractCommandSummary(command)

  return (
    <div className={cn("overflow-hidden rounded-[10px] border border-[#e0dbd1] bg-[#f3f1ec] shadow-sm", className)}>
      <div className="flex h-8 items-center justify-between gap-3 pl-2.5 pr-2">
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          <Terminal className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          {isRunning ? (
            <TextShimmer className="truncate bg-gradient-to-r from-zinc-500 via-zinc-950 to-zinc-500 text-xs font-medium">
              Running command: {summary}
            </TextShimmer>
          ) : (
            <span className="truncate text-xs text-zinc-500">Ran command: {summary}</span>
          )}
        </div>
        {isRunning && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-500" />}
      </div>

      <div className="border-t border-[#e0dbd1] bg-white px-2.5 py-1.5 font-mono text-[12px] leading-4">
        <div className="break-all">
          <span className="select-none text-amber-600">$ </span>
          <span className="text-zinc-900">{command}</span>
        </div>
        {!isRunning && output && (
          <div className="mt-1 max-h-24 overflow-hidden whitespace-pre-line text-zinc-500">
            {output}
          </div>
        )}
      </div>

      {approval && <ApprovalFooter isRunning={isRunning} approval={approval} />}
    </div>
  )
})
