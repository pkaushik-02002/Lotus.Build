"use client"

import { cn } from "@/lib/utils"

type ToolResult = {
  title: string
  url?: string
  snippet?: string
}

type ToolPart = {
  type: string
  state: "input-streaming" | "input-available" | "output-available" | "output-error"
  input?: Record<string, unknown>
  output?: {
    results?: ToolResult[]
    [key: string]: unknown
  }
}

export function Tool({ className, toolPart }: { className?: string; toolPart: ToolPart }) {
  const stateLabel =
    toolPart.state === "output-available"
      ? "Complete"
      : toolPart.state === "output-error"
        ? "Failed"
        : "Running"

  const stateClass =
    toolPart.state === "output-available"
      ? "bg-emerald-100 text-emerald-700"
      : toolPart.state === "output-error"
        ? "bg-red-100 text-red-700"
        : "bg-zinc-200 text-zinc-700"

  return (
    <div className={cn("w-full rounded-xl border border-zinc-200 bg-white p-3", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tool</p>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", stateClass)}>{stateLabel}</span>
      </div>
      <p className="text-sm font-medium text-zinc-800">{toolPart.type.replaceAll("_", " ")}</p>
      {toolPart.input && (
        <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-50 p-2 text-[11px] text-zinc-600">{JSON.stringify(toolPart.input, null, 2)}</pre>
      )}
      {toolPart.output?.results && toolPart.output.results.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {toolPart.output.results.slice(0, 3).map((result, idx) => (
            <div key={`${result.title}-${idx}`} className="rounded-lg border border-zinc-100 bg-zinc-50 p-2">
              {result.url ? (
                <a href={result.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-zinc-800 underline-offset-2 hover:underline">
                  {result.title}
                </a>
              ) : (
                <p className="text-xs font-medium text-zinc-800">{result.title}</p>
              )}
              {result.snippet && <p className="mt-0.5 text-xs text-zinc-600">{result.snippet}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
