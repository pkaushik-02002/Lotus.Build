"use client"

import React, { createContext, useContext } from "react"
import { cn } from "@/lib/utils"

type PromptInputContextValue = {
  value: string
  onValueChange: (value: string) => void
  isLoading?: boolean
  onSubmit?: () => void
}

const PromptInputContext = createContext<PromptInputContextValue | null>(null)

function usePromptInputContext() {
  const context = useContext(PromptInputContext)
  if (!context) {
    throw new Error("PromptInput components must be used inside <PromptInput>")
  }
  return context
}

interface PromptInputProps {
  value: string
  onValueChange: (value: string) => void
  isLoading?: boolean
  onSubmit?: () => void
  className?: string
  children: React.ReactNode
}

export function PromptInput({
  value,
  onValueChange,
  isLoading,
  onSubmit,
  className,
  children,
}: PromptInputProps) {
  return (
    <PromptInputContext.Provider value={{ value, onValueChange, isLoading, onSubmit }}>
      <div
        className={cn(
          "rounded-xl border border-zinc-700/70 bg-zinc-900/80 p-2 shadow-[0_16px_32px_-20px_rgba(0,0,0,0.95)]",
          className
        )}
      >
        {children}
      </div>
    </PromptInputContext.Provider>
  )
}

interface PromptInputTextareaProps extends Omit<React.ComponentProps<"textarea">, "value" | "onChange"> {}

export function PromptInputTextarea({ className, onKeyDown, ...props }: PromptInputTextareaProps) {
  const { value, onValueChange, isLoading, onSubmit } = usePromptInputContext()

  return (
    <textarea
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      onKeyDown={(e) => {
        onKeyDown?.(e)
        if (e.defaultPrevented) return
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          if (!isLoading) onSubmit?.()
        }
      }}
      className={cn(
        "min-h-[44px] w-full resize-none rounded-lg border border-zinc-800/70 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600",
        className
      )}
      {...props}
    />
  )
}

export function PromptInputActions({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-2 flex items-center gap-2", className)} {...props} />
}

interface PromptInputActionProps extends React.ComponentProps<"div"> {
  tooltip?: string
}

export function PromptInputAction({ className, tooltip, ...props }: PromptInputActionProps) {
  return <div className={cn("inline-flex", className)} title={tooltip} {...props} />
}

