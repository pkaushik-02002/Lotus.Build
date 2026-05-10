"use client"

import * as React from "react"
import { Check, FileCode2, X } from "lucide-react"
import { TextShimmer } from "@/components/prompt-kit/text-shimmer"
import { cn } from "@/lib/utils"

type DiffOp = { type: "context" | "remove" | "add"; text: string }
type ApprovalDecision = "approved" | "rejected" | null

function lineDiff(oldText: string, newText: string): DiffOp[] {
  const a = oldText.split("\n")
  const b = newText.split("\n")
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      ops.push({ type: "context", text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "remove", text: a[i] })
      i++
    } else {
      ops.push({ type: "add", text: b[j] })
      j++
    }
  }
  while (i < m) ops.push({ type: "remove", text: a[i++] })
  while (j < n) ops.push({ type: "add", text: b[j++] })
  return ops
}

function countDiffStats(ops: DiffOp[]) {
  return ops.reduce(
    (stats, op) => {
      if (op.type === "add") stats.added++
      if (op.type === "remove") stats.removed++
      return stats
    },
    { added: 0, removed: 0 }
  )
}

function getFileName(path?: string) {
  return path?.split("/").pop() || undefined
}

function ApprovalFooter({
  isPending,
  approveLabel = "Approve",
  rejectLabel = "Reject",
  onApprove,
  onReject,
}: {
  isPending: boolean
  approveLabel?: string
  rejectLabel?: string
  onApprove?: () => void
  onReject?: () => void
}) {
  const [decision, setDecision] = React.useState<ApprovalDecision>(null)
  const status = decision === "approved" ? (isPending ? "Starting" : "Approved") : decision === "rejected" ? "Canceled" : isPending ? "Waiting" : ""

  return (
    <div className="flex items-center justify-between gap-2 border-t border-[#e0dbd1] bg-[#f7f5f1] px-2.5 py-2">
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
        {status}
        {decision === "approved" && isPending && (
          <span className="inline-flex gap-0.5">
            <span className="animate-pulse">.</span>
            <span className="animate-pulse [animation-delay:150ms]">.</span>
            <span className="animate-pulse [animation-delay:300ms]">.</span>
          </span>
        )}
      </span>
      {decision === null && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setDecision("rejected")
              onReject?.()
            }}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-[#e0dbd1] bg-white px-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-[#f3f1ec]"
          >
            <X className="h-3 w-3" />
            {rejectLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              setDecision("approved")
              onApprove?.()
            }}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-zinc-950 px-2 text-xs font-medium text-white transition-colors hover:bg-zinc-800"
          >
            <Check className="h-3 w-3" />
            {approveLabel}
          </button>
        </div>
      )}
    </div>
  )
}

export type EditToolApproval = {
  approveLabel?: string
  rejectLabel?: string
  onApprove?: () => void
  onReject?: () => void
}

export type EditToolProps = {
  state?: "completed" | "pending" | "waiting"
  variant?: "edit" | "write"
  filePath?: string
  oldContent?: string
  newContent?: string
  approval?: EditToolApproval
  className?: string
}

export const EditTool = React.memo(function EditTool({
  state = "completed",
  variant = "edit",
  filePath,
  oldContent,
  newContent,
  approval,
  className,
}: EditToolProps) {
  const isPending = state === "pending"
  const isWaiting = state === "waiting"
  const isWrite = variant === "write"
  const fileName = getFileName(filePath)

  const diffOps = React.useMemo<DiffOp[] | null>(() => {
    if (isWaiting) return null
    if (isWrite && newContent) return newContent.split("\n").map((text) => ({ type: "add", text }))
    if (oldContent !== undefined && newContent !== undefined) return lineDiff(oldContent, newContent)
    return null
  }, [isWaiting, isWrite, oldContent, newContent])

  const stats = React.useMemo(() => (diffOps ? countDiffStats(diffOps) : null), [diffOps])
  const headerLabel = isWaiting
    ? "Generating..."
    : isPending
      ? `${isWrite ? "Creating" : "Editing"}${fileName ? ` ${fileName}` : ""}`
      : `${isWrite ? "Created" : "Edited"}${fileName ? ` ${fileName}` : ""}`

  return (
    <div className={cn("w-full overflow-hidden rounded-[10px] border border-[#e0dbd1] bg-[#f7f5f1] shadow-sm", className)}>
      <div
        className={cn(
          "flex h-8 items-center justify-between gap-3 bg-[#f3f1ec] px-2.5",
          ((diffOps && diffOps.length > 0) || approval) && "border-b border-[#e0dbd1]"
        )}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <FileCode2 className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          {isPending || isWaiting ? (
            <TextShimmer className="truncate bg-gradient-to-r from-zinc-500 via-zinc-950 to-zinc-500 text-xs font-medium">
              {headerLabel}
            </TextShimmer>
          ) : (
            <span className="truncate text-xs text-zinc-500">{headerLabel}</span>
          )}
        </div>
        {stats && !isPending && !isWaiting && (stats.added > 0 || stats.removed > 0) && (
          <span className="inline-flex shrink-0 gap-2 font-mono text-[11px]">
            {stats.added > 0 && <span className="text-emerald-600">+{stats.added}</span>}
            {stats.removed > 0 && <span className="text-red-500">-{stats.removed}</span>}
          </span>
        )}
      </div>

      {diffOps && diffOps.length > 0 && (
        <div className="max-h-80 overflow-auto bg-white font-mono text-[12px] leading-[1.55] [scrollbar-width:thin]">
          {diffOps.map((op, i) => (
            <div
              key={i}
              className={cn(
                "flex min-w-max items-start",
                op.type === "add" && "bg-emerald-50 text-emerald-900",
                op.type === "remove" && "bg-red-50 text-red-900",
                op.type === "context" && "text-zinc-600"
              )}
            >
              <span
                className={cn(
                  "w-5 shrink-0 select-none text-center",
                  op.type === "add" && "text-emerald-600",
                  op.type === "remove" && "text-red-500",
                  op.type === "context" && "text-zinc-300"
                )}
              >
                {op.type === "add" ? "+" : op.type === "remove" ? "-" : " "}
              </span>
              <span className="min-w-0 flex-1 whitespace-pre pr-3">{op.text || " "}</span>
            </div>
          ))}
        </div>
      )}

      {approval && (
        <ApprovalFooter
          isPending={isPending}
          approveLabel={approval.approveLabel}
          rejectLabel={approval.rejectLabel}
          onApprove={approval.onApprove}
          onReject={approval.onReject}
        />
      )}
    </div>
  )
})
