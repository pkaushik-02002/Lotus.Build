"use client"

import React, { useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { TextShimmer } from "@/components/prompt-kit/text-shimmer"
import {
  Terminal,
  CheckCircle2,
  Cpu,
  FileCode,
  Zap,
  Search,
  ChevronRight,
} from "lucide-react"

type StepStatus = "pending" | "active" | "completed"

interface TimelineStep {
  id: string
  title: string
  description: string
  icon: React.ElementType
  status: StepStatus
  logs: string[]
  codeSnippet?: string
}

export interface ThinkingBarProps {
  text: string
  steps: string[]
  isGenerating?: boolean
  currentFile?: string | null
  className?: string
}

const ICONS = [Search, Cpu, FileCode, Zap]

const STEP_DESCRIPTIONS = [
  "Scanning project context and dependencies.",
  "Interpreting your request into an execution plan.",
  "Synthesizing and refining code changes.",
  "Writing updates and validating output.",
]

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="mt-4 rounded-md bg-neutral-900 border border-neutral-800 p-4 font-mono text-xs overflow-x-auto">
      <pre className="text-neutral-400">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function TypewriterText({ text, isActive }: { text: string; isActive: boolean }) {
  const [displayed, setDisplayed] = useState("")

  useEffect(() => {
    if (!isActive) {
      setDisplayed(text)
      return
    }
    setDisplayed("")
    let i = 0
    const interval = setInterval(() => {
      setDisplayed(text.substring(0, i + 1))
      i++
      if (i === text.length) clearInterval(interval)
    }, 20)
    return () => clearInterval(interval)
  }, [text, isActive])

  return <span>{displayed}</span>
}

export function ThinkingBar({
  text,
  steps,
  isGenerating = false,
  currentFile,
  className,
}: ThinkingBarProps) {
  const timelineSteps = useMemo<TimelineStep[]>(() => {
    const normalized = steps.length > 0 ? steps : [text || "Processing request"]
    const activeIndex = isGenerating ? Math.max(normalized.length - 1, 0) : -1

    return normalized.map((title, index) => {
      const status: StepStatus =
        activeIndex === -1 ? "completed" : index < activeIndex ? "completed" : index === activeIndex ? "active" : "pending"

      const logs = [
        `Step ${index + 1}/${normalized.length}: ${title}`,
        index === activeIndex ? (text || "Processing context...") : "Completed",
        currentFile && index === activeIndex ? `Working file: ${currentFile}` : "No file activity yet",
      ]

      const snippet =
        currentFile && index === activeIndex
          ? `// ${currentFile}\n// Applying live updates from agent run\n// Status: ${text || "Processing"}`
          : undefined

      return {
        id: String(index + 1),
        title,
        description: STEP_DESCRIPTIONS[index] || "Executing agent workflow step.",
        icon: ICONS[index % ICONS.length],
        status,
        logs,
        codeSnippet: snippet,
      }
    })
  }, [steps, text, currentFile, isGenerating])

  const [activeStepId, setActiveStepId] = useState<string>("")

  useEffect(() => {
    if (timelineSteps.length === 0) {
      setActiveStepId("")
      return
    }
    const active = timelineSteps.find((step) => step.status === "active")
    setActiveStepId(active?.id || timelineSteps[timelineSteps.length - 1].id)
  }, [timelineSteps])

  const toggleStep = (id: string) => {
    setActiveStepId((prev) => (prev === id ? "" : id))
  }

  const getStatusColor = (status: StepStatus) => {
    switch (status) {
      case "completed":
        return "text-white border-white bg-white"
      case "active":
        return "text-white border-white bg-black animate-pulse"
      default:
        return "text-neutral-600 border-neutral-800 bg-black"
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("w-full bg-black text-neutral-300 font-mono selection:bg-white selection:text-black", className)}
    >
      <div className="w-full space-y-8">
        <div className="space-y-4 border-b border-neutral-800 pb-6">
          <div className="flex items-center gap-3 text-white">
            <Terminal className="w-5 h-5" />
            <h1 className="text-xl font-bold tracking-tight">Agent Execution Log</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn("h-2 w-2 rounded-full", isGenerating ? "bg-green-500 animate-pulse" : "bg-neutral-500")} />
            <span className="text-sm text-neutral-400">{isGenerating ? "System Online" : "Idle"}</span>
            <span className="text-neutral-700 mx-2">|</span>
            <div className="relative overflow-hidden">
              <span className="text-sm font-medium text-white shimmer-text">{text || "Processing Context..."}</span>
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="absolute left-[19px] top-4 bottom-4 w-px bg-neutral-800" />

          <div className="space-y-8">
            {timelineSteps.map((step) => {
              const isActive = activeStepId === step.id
              const Icon = step.icon
              const isCompleted = step.status === "completed"

              return (
                <div key={step.id} className="relative pl-12 group">
                  <div
                    className={cn(
                      "absolute left-0 top-1 w-10 h-10 rounded-full border-2 flex items-center justify-center z-10 transition-all duration-300",
                      getStatusColor(step.status),
                      isActive && "ring-4 ring-neutral-900 ring-offset-2 ring-offset-black"
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-5 h-5 text-black" />
                    ) : step.status === "active" ? (
                      <TextShimmer className="text-[10px] font-semibold uppercase tracking-wider text-white">
                        Live
                      </TextShimmer>
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>

                  <div
                    onClick={() => toggleStep(step.id)}
                    className={cn(
                      "cursor-pointer border rounded-lg p-5 transition-all duration-300 ease-out",
                      isActive ? "bg-neutral-900/50 border-white/20" : "bg-black border-neutral-800 hover:border-neutral-600"
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className={cn("text-lg font-semibold mb-1 flex items-center gap-2", isActive || isCompleted ? "text-white" : "text-neutral-500")}>
                          <TextShimmer className={cn("text-lg font-semibold", isActive || isCompleted ? "text-white" : "text-neutral-500")}>
                            {step.title}
                          </TextShimmer>
                          {step.status === "active" && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white text-black uppercase tracking-wider">
                              Live
                            </span>
                          )}
                        </h3>
                        <p className="text-sm text-neutral-400 leading-relaxed">{step.description}</p>
                      </div>
                      <ChevronRight className={cn("w-5 h-5 text-neutral-600 transition-transform duration-300", isActive && "rotate-90 text-white")} />
                    </div>

                    <div className={cn("grid transition-all duration-300 ease-in-out", isActive ? "grid-rows-[1fr] opacity-100 mt-4" : "grid-rows-[0fr] opacity-0 mt-0")}>
                      <div className="overflow-hidden space-y-4">
                        <div className="h-px bg-neutral-800 w-full" />
                        <div className="space-y-2">
                          <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Console Output</p>
                          <div className="bg-black rounded border border-neutral-800 p-3 font-mono text-xs space-y-1.5">
                            {step.logs.map((log, i) => (
                              <div key={i} className="flex gap-2 text-neutral-400">
                                <span className="text-neutral-700 select-none">{">"}</span>
                                <TypewriterText text={log} isActive={isActive && step.status === "active"} />
                              </div>
                            ))}
                          </div>
                        </div>

                        {step.codeSnippet && (
                          <div>
                            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Generated Context</p>
                            <CodeBlock code={step.codeSnippet} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <style jsx global>{`
        .shimmer-text {
          background: linear-gradient(to right, #ffffff 20%, #888888 40%, #888888 60%, #ffffff 80%);
          background-size: 200% auto;
          color: #000;
          background-clip: text;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shine 3s linear infinite;
        }

        @keyframes shine {
          to {
            background-position: 200% center;
          }
        }
      `}</style>
    </div>
  )
}
