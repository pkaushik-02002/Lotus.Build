"use client"

import React from "react"

import { cn } from "@/lib/utils"

interface TextShimmerProps {
  children: React.ReactNode
  className?: string
  duration?: number
}

export function TextShimmer({
  children,
  className,
  duration = 2,
}: TextShimmerProps) {
  return (
    <span
      className={cn(
        "inline-flex animate-shimmer bg-[length:250%_100%] bg-clip-text text-transparent",
        "bg-gradient-to-r from-zinc-500 via-zinc-950 to-zinc-500",
        className
      )}
      style={{
        animationDuration: `${duration}s`,
      }}
    >
      {children}
    </span>
  )
}
