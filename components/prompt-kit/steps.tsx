"use client"

import * as React from "react"
import { ChevronDown, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

interface StepsProps {
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
}

export function Steps({ children, defaultOpen = false, className }: StepsProps) {
  const [open, setOpen] = React.useState(defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("w-full", className)}>
      {children}
    </Collapsible>
  )
}

interface StepsTriggerProps {
  children: React.ReactNode
  className?: string
}

export function StepsTrigger({ children, className }: StepsTriggerProps) {
  return (
    <CollapsibleTrigger
      className={cn(
        "group flex w-full items-center justify-between rounded-lg border border-zinc-800/70 bg-zinc-900/70 px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-800/70",
        className
      )}
    >
      <span className="font-medium">{children}</span>
      <ChevronDown className="h-4 w-4 text-zinc-500 transition-transform duration-200 group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
  )
}

interface StepsContentProps {
  children: React.ReactNode
  className?: string
}

export function StepsContent({ children, className }: StepsContentProps) {
  return (
    <CollapsibleContent>
      <div className={cn("mt-2 rounded-lg border border-zinc-800/60 bg-zinc-950/60 p-3", className)}>{children}</div>
    </CollapsibleContent>
  )
}

interface StepsItemProps {
  children: React.ReactNode
  className?: string
}

export function StepsItem({ children, className }: StepsItemProps) {
  return (
    <div className={cn("flex items-start gap-2 text-xs text-zinc-400", className)}>
      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" />
      <span>{children}</span>
    </div>
  )
}

