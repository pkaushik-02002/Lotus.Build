"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

import {
  Brain,
  Code,
  FileSearch,
  Sparkles,
  Check,
  Loader2,
  Terminal,
  FileCode,
  Search,
  Wrench,
  ChevronDown,
  ChevronRight,
  Zap,
  AlertCircle,
  Clock,
  BookOpen,
  Play,
  StopCircle,
  File,
  FileText,
  FilePlus,
  Trash2,
  Copy,
  Edit3,
  FolderOpen,
} from "lucide-react"

type StepStatus = "pending" | "running" | "completed" | "error"
type StepType = "thinking" | "tool_call" | "code" | "search" | "result" | "reasoning" | "file_operation"
type FileOperationType = "create" | "read" | "write" | "delete" | "modify" | "move"


export interface ToolCall {
  id: string
  name: string
  status: StepStatus
  input?: Record<string, any>
  output?: Record<string, any>
  error?: string
}

export interface FileOperation {
  id: string
  type: FileOperationType
  filePath: string
  status: StepStatus
  content?: string
  contentPreview?: string
  size?: number
  linesCount?: number
  error?: string
  success?: boolean
}

export interface TimelineStep {
  id: string
  type: StepType
  title: string
  description?: string
  content?: string
  status: StepStatus
  duration?: string
  toolName?: string
  expanded?: boolean
  toolCalls?: ToolCall[]
  fileOperations?: FileOperation[]
}


export interface AgentTimelineProps {
  steps: TimelineStep[]
  isStreaming?: boolean
  onStepToggle?: (stepId: string) => void
}


// Helper function to parse reasoning text into individual steps
export function parseReasoningSteps(reasoningText: string): TimelineStep[] {
  const lines = reasoningText.split("\n").filter(line => line.trim())
  const steps: TimelineStep[] = []
  
  lines.forEach((line, index) => {
    // Match lines starting with numbers (1. 2. 3. etc)
    const match = line.match(/^\s*(\d+)\.\s*(.+)/)
    if (match) {
      const stepNumber = match[1]
      const stepText = match[2].trim()
      
      steps.push({
        id: `reasoning-step-${stepNumber}`,
        type: "reasoning",
        title: stepText,
        status: "completed",
        duration: "0.5s",
        expanded: false,
      })
    }
  })
  
  return steps.length > 0 ? steps : []
}

// Helper shimmer component (uses site color tokens)
function ShimmerLine({ width = "w-full" }: { width?: string }) {
  const style: React.CSSProperties = {
    backgroundImage: 'linear-gradient(90deg, var(--color-muted), var(--color-primary), var(--color-muted))',
    backgroundSize: '200% 100%',
    animationDuration: '1.6s',
  }
  return <div className={cn("h-2 rounded animate-shimmer", width)} style={style} />
}

function ShimmerBlock() {
  return (
    <div className="space-y-2">
      <ShimmerLine width="w-3/4" />
      <ShimmerLine width="w-full" />
      <ShimmerLine width="w-1/2" />
    </div>
  )
}

// Enhanced status indicator with better animations
function StatusIndicator({ status, type }: { status: StepStatus; type: StepType }) {
  if (status === "pending") {
    return (
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        className="size-8 rounded-full bg-muted/50 flex items-center justify-center border border-border"
      >
        <div className="size-2 rounded-full bg-muted-foreground/30" />
      </motion.div>
    )
  }

  if (status === "running") {
    return (
      <motion.div
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        className="size-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/50 relative"
      >
        <div className="absolute inset-0 rounded-full animate-pulse bg-primary/10" />
        <Loader2 className="size-4 text-primary animate-spin relative z-10" />
      </motion.div>
    )
  }

  if (status === "error") {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="size-8 rounded-full bg-destructive/20 flex items-center justify-center border border-destructive/50"
      >
        <AlertCircle className="size-4 text-destructive" />
      </motion.div>
    )
  }

  const icons: Record<StepType, any> = {
    thinking: Brain,
    tool_call: Wrench,
    code: FileCode,
    search: Search,
    result: Sparkles,
    reasoning: BookOpen,
    file_operation: undefined
  }

  const Icon = icons[type] || Wrench

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className="size-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/50"
    >
      <Check className="size-4 text-primary" />
    </motion.div>
  )
}

// Tool call display component
function ToolCallItem({ tool, isLast }: { tool: ToolCall; isLast: boolean }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="relative ml-8 mb-3"
    >
      {!isLast && (
        <div className="absolute left-3 top-8 bottom-0 w-px bg-border/50" />
      )}

      <motion.div
        className={cn(
          "relative pl-6 p-3 rounded-lg border transition-all duration-200",
          "hover:bg-secondary/50"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="absolute left-0 top-3">
          <div className="size-6 rounded-full bg-background flex items-center justify-center border border-border">
            {tool.status === "running" && (
              <Loader2 className="size-3 text-primary animate-spin" />
            )}
            {tool.status === "completed" && (
              <Check className="size-3 text-primary" />
            )}
            {tool.status === "error" && (
              <AlertCircle className="size-3 text-destructive" />
            )}
            {tool.status === "pending" && (
              <div className="size-1.5 rounded-full bg-muted-foreground/30" />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {tool.name}
            </span>
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full",
              tool.status === "completed" && "bg-primary/10 text-primary",
              tool.status === "running" && "bg-primary/10 text-primary",
              tool.status === "error" && "bg-destructive/10 text-destructive",
              tool.status === "pending" && "bg-muted text-muted-foreground"
            )}>
              {tool.status}
            </span>
          </div>
          {(tool.input || tool.output || tool.error) && (
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                expanded && "rotate-180"
              )}
            />
          )}
        </div>

        <AnimatePresence>
          {expanded && (tool.input || tool.output || tool.error) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-3 pt-3 border-t border-border/50 space-y-2"
            >
              {tool.input && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-1">Input:</div>
                  <div className="text-xs bg-muted/30 rounded p-2 font-mono text-foreground/70 max-h-40 overflow-y-auto">
                    {JSON.stringify(tool.input, null, 2)}
                  </div>
                </div>
              )}
              {tool.output && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-1">Output:</div>
                  <div className="text-xs bg-muted/30 rounded p-2 font-mono text-foreground/70 max-h-40 overflow-y-auto">
                    {JSON.stringify(tool.output, null, 2)}
                  </div>
                </div>
              )}
              {tool.error && (
                <div>
                  <div className="text-xs font-semibold text-destructive mb-1">Error:</div>
                  <div className="text-xs bg-destructive/10 rounded p-2 font-mono text-destructive/80">
                    {tool.error}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}

// File operation display component
function FileOperationItem({ file }: { file: FileOperation }) {
  const [expanded, setExpanded] = useState(true)

  const getFileIcon = (type: FileOperationType) => {
    switch (type) {
      case "create":
        return <FilePlus className="size-4 text-foreground" />
      case "read":
        return <FileText className="size-4 text-foreground" />
      case "write":
        return <Edit3 className="size-4 text-foreground" />
      case "delete":
        return <Trash2 className="size-4 text-destructive" />
      case "modify":
        return <Edit3 className="size-4 text-foreground" />
      case "move":
        return <Copy className="size-4 text-foreground" />
      default:
        return <File className="size-4 text-foreground" />
    }
  }

  const getFileColor = (type: FileOperationType) => {
    switch (type) {
      case "create":
        return "bg-primary/10 border-primary/30"
      case "read":
        return "bg-muted/10 border-border"
      case "write":
        return "bg-muted/10 border-border"
      case "delete":
        return "bg-destructive/10 border-destructive/30"
      case "modify":
        return "bg-muted/10 border-border"
      case "move":
        return "bg-muted/10 border-border"
      default:
        return "bg-muted/10 border-border"
    }
  }

  // Extract file extension
  const fileExt = file.filePath.split(".").pop() || "txt"

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="relative ml-8 mb-3"
    >
      <motion.div
        className={cn(
          "relative pl-6 p-3 rounded-lg border transition-all duration-200 cursor-pointer hover:bg-secondary/30",
          getFileColor(file.type)
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="absolute left-0 top-3">
          <div className="size-6 rounded-full bg-background flex items-center justify-center border border-border">
            {getFileIcon(file.type)}
          </div>
        </div>

        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground capitalize">
                {file.type} file
              </span>
              {file.status && (
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full",
                  file.status === "completed" && "bg-primary/10 text-primary",
                  file.status === "running" && "bg-primary/10 text-primary",
                  file.status === "error" && "bg-destructive/10 text-destructive",
                  file.status === "pending" && "bg-muted text-muted-foreground"
                )}>
                  {file.status}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1 font-mono break-all">
              {file.filePath}
            </div>
            {file.size && (
              <div className="text-xs text-muted-foreground mt-1">
                Size: {(file.size / 1024).toFixed(2)} KB • Lines: {file.linesCount || "N/A"}
              </div>
            )}
          </div>
          {(file.content || file.contentPreview) && (
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform shrink-0 ml-2 mt-1",
                expanded && "rotate-180"
              )}
            />
          )}
        </div>

        {file.error && (
          <div className="mt-2 text-xs text-destructive bg-destructive/10 rounded p-2">
            {file.error}
          </div>
        )}

        <AnimatePresence>
          {expanded && (file.content || file.contentPreview) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-3 pt-3 border-t border-border/50"
            >
              <div className="flex items-center gap-2 mb-2">
                <FileCode className="size-3 text-muted-foreground" />
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  {fileExt}
                </span>
              </div>
              <pre className="text-xs bg-muted/30 rounded p-3 font-mono text-foreground/70 max-h-96 overflow-y-auto whitespace-pre-wrap break-words">
                {file.content || file.contentPreview}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}



// Main timeline step component with modern design
function TimelineStepItem({
  step,
  isLast,
  onToggle,
}: {
  step: TimelineStep
  isLast: boolean
  onToggle: () => void
}) {
  const isExpandable = step.content || step.type === "code" || step.type === "tool_call"
  const isRunning = step.status === "running"

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative flex gap-4"
    >
      {/* Timeline connecting line */}
      {!isLast && (
        <motion.div
          layoutId={`timeline-line-${step.id}`}
          className={cn(
            "absolute left-4 top-10 bottom-0 w-0.5 -translate-x-1/2",
            isRunning
              ? "bg-gradient-to-b from-primary via-primary/50 to-border"
              : "bg-border/50"
          )}
        />
      )}

      {/* Status indicator circle */}
      <div className="relative z-10 shrink-0 pt-1">
        <StatusIndicator status={step.status} type={step.type} />
      </div>

      {/* Content section */}
      <div className="flex-1 pb-6">
        <motion.div
          onClick={isExpandable ? onToggle : undefined}
          className={cn(
            "relative rounded-lg border transition-all duration-300 p-3",
            isExpandable && "cursor-pointer hover:border-primary/50 hover:bg-secondary/30",
            isRunning && "border-primary/50 bg-primary/5",
            step.status === "completed" && "border-primary/20 bg-primary/5",
            step.status === "error" && "border-destructive/20 bg-destructive/5",
            step.status === "pending" && "border-border/50 bg-secondary/20"
          )}
          whileHover={isExpandable ? { scale: 1.01 } : {}}
        >
          {/* Step header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                {isExpandable && (
                  <motion.div
                    animate={{ rotate: step.expanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </motion.div>
                )}
                <h3 className={cn(
                  "text-sm font-semibold transition-colors",
                  isRunning && "text-primary animate-pulse",
                  step.status === "completed" && "text-foreground",
                  step.status === "error" && "text-destructive",
                  step.status === "pending" && "text-muted-foreground"
                )}>
                  {step.title}
                </h3>
              </div>

              {/* Description */}
              {step.description && (
                <p className={cn(
                  "text-xs text-muted-foreground mt-2",
                  isRunning && "text-primary",
                  isExpandable && "ml-6"
                )}>
                  {step.description}
                </p>
              )}
            </div>

            {/* Duration badge */}
            {step.duration && step.status === "completed" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-1 text-xs text-muted-foreground shrink-0"
              >
                <Clock className="size-3" />
                {step.duration}
              </motion.div>
            )}
          </div>

          {/* Expanded content section */}
          <AnimatePresence>
            {step.expanded && step.status !== "pending" && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="mt-3 pt-3 border-t border-border/50 space-y-3"
              >
                {/* Loading state */}
                {isRunning && (
                  <div className="space-y-2">
                    <ShimmerBlock />
                  </div>
                )}

                {/* Content display */}
                {step.content && !isRunning && (
                  <div className="bg-secondary/30 rounded-lg border border-border/50 overflow-hidden">
                    {/* Code/tool header */}
                    {(step.type === "code" || step.type === "tool_call") && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border/50">
                        {step.type === "code" ? (
                          <FileCode className="size-3 text-muted-foreground" />
                        ) : (
                          <Terminal className="size-3 text-muted-foreground" />
                        )}
                        <span className="text-xs text-muted-foreground font-mono">
                          {step.toolName || "output"}
                        </span>
                      </div>
                    )}
                    <pre className="p-3 text-xs font-mono text-foreground/70 overflow-x-auto whitespace-pre-wrap max-h-72 overflow-y-auto bg-gradient-to-b from-transparent to-muted/20">
                      {step.content}
                    </pre>
                  </div>
                )}

                {/* Tool calls section */}
                {step.toolCalls && step.toolCalls.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <Zap className="size-3" />
                      Tool Calls
                    </div>
                    <div className="space-y-1">
                      {step.toolCalls.map((tool, idx) => (
                        <ToolCallItem
                          key={tool.id}
                          tool={tool}
                          isLast={idx === step.toolCalls!.length - 1}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* File operations section */}
                {step.fileOperations && step.fileOperations.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <FolderOpen className="size-3" />
                      Files
                    </div>
                    <div className="space-y-1">
                      {step.fileOperations.map((file) => (
                        <FileOperationItem
                          key={file.id}
                          file={file}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.div>
  )
}


// Main timeline export component
export function AgentTimeline({ steps, isStreaming = false, onStepToggle }: AgentTimelineProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(
    new Set(steps.filter(s => s.status === "running").map(s => s.id))
  )

  const handleToggle = (stepId: string) => {
    const newExpanded = new Set(expandedSteps)
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId)
    } else {
      newExpanded.add(stepId)
    }
    setExpandedSteps(newExpanded)
    onStepToggle?.(stepId)
  }

  return (
    <div className="w-full space-y-2">
      <div className="relative">
        {/* Timeline visualization */}
        {steps.map((step, index) => (
          <TimelineStepItem
            key={step.id}
            step={{
              ...step,
              expanded: expandedSteps.has(step.id),
            }}
            isLast={index === steps.length - 1}
            onToggle={() => handleToggle(step.id)}
          />
        ))}
      </div>

      {/* Streaming indicator */}
      <AnimatePresence>
        {isStreaming && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-3 mt-4 ml-12 text-xs text-muted-foreground"
          >
            <div className="flex gap-1.5">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: 0 }}
                className="size-1.5 rounded-full bg-primary"
              />
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: 0.1 }}
                className="size-1.5 rounded-full bg-primary"
              />
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: 0.2 }}
                className="size-1.5 rounded-full bg-primary"
              />
            </div>
            <span>Processing...</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}


// Modern demo component with tool calls
export function AgentTimelineDemo() {
  const [steps, setSteps] = useState<TimelineStep[]>([
    {
      id: "1",
      type: "thinking",
      title: "Analyzing Requirements",
      description: "Understanding the user's request and breaking down tasks",
      status: "completed",
      duration: "0.8s",
      expanded: false,
    },
    {
      id: "2",
      type: "reasoning",
      title: "Planning Implementation Strategy",
      description: "Determining the best approach and components needed",
      status: "completed",
      duration: "1.2s",
      content: `Strategy:
1. Search for existing components in the codebase
2. Review component patterns and structure
3. Identify reusable elements
4. Plan file organization
5. Generate implementation code`,
      expanded: false,
    },
    {
      id: "3",
      type: "tool_call",
      title: "Searching Codebase",
      description: "Looking for related components and utilities",
      status: "completed",
      duration: "0.9s",
      toolCalls: [
        {
          id: "tc-1",
          name: "search_files",
          status: "completed",
          input: {
            pattern: "components/ui/*.tsx",
            includeHidden: false,
          },
          output: {
            count: 24,
            files: ["button.tsx", "card.tsx", "dialog.tsx"],
          },
        },
        {
          id: "tc-2",
          name: "read_file",
          status: "completed",
          input: {
            path: "components/ui/button.tsx",
            lines: "1-50",
          },
          output: {
            content: "Button component with variants...",
            lineCount: 150,
          },
        },
      ],
      expanded: false,
    },
    {
      id: "4",
      type: "code",
      title: "Generating Component Code",
      description: "Creating the new Timeline component",
      status: "completed",
      duration: "2.1s",
      toolName: "components/timeline.tsx",
      content: `export function Timeline({ steps }: TimelineProps) {
  return (
    <div className="w-full space-y-4">
      {steps.map((step) => (
        <TimelineItem key={step.id} step={step} />
      ))}
    </div>
  )
}`,
      expanded: false,
    },
    {
      id: "5",
      type: "file_operation",
      title: "Creating Files",
      description: "Writing component files to disk",
      status: "running",
      fileOperations: [
        {
          id: "f-1",
          type: "create",
          filePath: "components/timeline.tsx",
          status: "completed",
          size: 1250,
          linesCount: 45,
          content: `"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

export interface TimelineStep {
  id: string
  title: string
  status: "pending" | "running" | "completed"
}

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="w-full space-y-4">
      {steps.map((step) => (
        <TimelineStep key={step.id} step={step} />
      ))}
    </div>
  )
}`,
        },
        {
          id: "f-2",
          type: "create",
          filePath: "components/timeline-step.tsx",
          status: "running",
          size: 2100,
          linesCount: 68,
          contentPreview: `"use client"

import { motion } from "framer-motion"
import { Check, Loader2 } from "lucide-react"

export function TimelineStep({ step }) {
  return (
    <div className="flex gap-4">
      <div className="flex-1">
        {/* Step content */}
      </div>
    </div>
  )
}`,
        },
        {
          id: "f-3",
          type: "create",
          filePath: "components/index.ts",
          status: "pending",
          contentPreview: `export { Timeline } from "./timeline"
export { TimelineStep } from "./timeline-step"
export type { TimelineStep as TimelineStepType } from "./timeline"`,
        },
      ],
      expanded: true,
    },
    {
      id: "6",
      type: "tool_call",
      title: "Verifying Installation",
      description: "Checking file integrity and imports",
      status: "pending",
      toolCalls: [
        {
          id: "tc-4",
          name: "verify_files",
          status: "pending",
          input: {
            paths: ["components/timeline.tsx", "components/timeline-step.tsx"],
          },
        },
      ],
      expanded: false,
    },
    {
      id: "6",
      type: "result",
      title: "Finalizing",
      description: "Verifying and preparing output",
      status: "pending",
      expanded: false,
    },
  ])

  const [isStreaming, setIsStreaming] = useState(true)

  // Simulate progress
  useEffect(() => {
    const timer = setInterval(() => {
      setSteps((prev) => {
        const updated = [...prev]
        const runningIndex = updated.findIndex((s) => s.status === "running")

        if (runningIndex !== -1) {
          // Simulate completion
          const duration = ["0.3s", "1.5s", "2.1s", "1.8s", "0.5s"][runningIndex] || "1.0s"
          updated[runningIndex] = {
            ...updated[runningIndex],
            status: "completed",
            duration,
          }

          // Start next step if available
          if (runningIndex + 1 < updated.length) {
            updated[runningIndex + 1] = {
              ...updated[runningIndex + 1],
              status: "running",
            }
          }
        }
        return updated
      })
    }, 3500)

    return () => clearInterval(timer)
  }, [])

  // Check if all completed
  useEffect(() => {
    const allCompleted = steps.every((s) => s.status === "completed" || s.status === "pending")
    if (allCompleted && steps.some((s) => s.status === "completed")) {
      setIsStreaming(false)
    }
  }, [steps])

  return (
    <div className="w-full max-w-2xl">
      <AgentTimeline
        steps={steps}
        isStreaming={isStreaming}
        onStepToggle={(stepId) => {
          setSteps((prev) =>
            prev.map((step) =>
              step.id === stepId ? { ...step, expanded: !step.expanded } : step
            )
          )
        }}
      />
    </div>
  )
}

// Smart reasoning display - automatically parses and displays reasoning as individual timeline steps
export function SmartReasoningDisplay({
  reasoningText,
  isStreaming = false,
  onStepToggle,
}: {
  reasoningText: string
  isStreaming?: boolean
  onStepToggle?: (stepId: string) => void
}) {
  const steps = parseReasoningSteps(reasoningText)
  
  if (steps.length === 0) {
    return null
  }

  return (
    <AgentTimeline
      steps={steps}
      isStreaming={isStreaming}
      onStepToggle={onStepToggle}
    />
  )
}

// Original Reasoning Components for backward compatibility
import * as React from "react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

export interface ReasoningProps {
  children: React.ReactNode
  isStreaming?: boolean
  className?: string
}

export function Reasoning({ children, isStreaming, className }: ReasoningProps) {
  const [open, setOpen] = React.useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("w-full", className)}>
      {children}
    </Collapsible>
  )
}

export interface ReasoningTriggerProps {
  children: React.ReactNode
  className?: string
}

export function ReasoningTrigger({ children, className }: ReasoningTriggerProps) {
  return (
    <CollapsibleTrigger
      className={cn(
        "group flex items-center gap-2 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors",
        className
      )}
    >
      <ChevronDown className="w-4 h-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
      {children}
    </CollapsibleTrigger>
  )
}

export interface ReasoningContentProps {
  children: React.ReactNode
  className?: string
}

export function ReasoningContent({ children, className }: ReasoningContentProps) {
  return (
    <CollapsibleContent>
      <div
        className={cn(
          "mt-2 overflow-hidden text-xs sm:text-sm text-muted-foreground whitespace-pre-wrap",
          className
        )}
      >
        {children}
      </div>
    </CollapsibleContent>
  )
}
