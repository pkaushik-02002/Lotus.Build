"use client"

import Link from "next/link"
import { motion } from "framer-motion"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { cn } from "@/lib/utils"

export function PlanCard({ className }: { className?: string }) {
  const { userData, remainingTokens } = useAuth()

  const limit = Math.max(0, Number(userData?.tokensLimit ?? 0))
  const used = Math.max(0, limit - Math.max(0, remainingTokens))
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const isLow = percent > 85
  const isCritical = percent > 95

  return (
    <div 
      className={cn(
        "relative bg-zinc-950 border border-zinc-800/50 rounded-2xl overflow-hidden",
        className
      )}
    >
      {/* Top edge highlight */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-zinc-700/50 to-transparent" />
      
      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-zinc-600/50 to-transparent" />
      <div className="absolute top-0 left-0 w-px h-8 bg-gradient-to-b from-zinc-600/50 to-transparent" />
      <div className="absolute top-0 right-0 w-8 h-px bg-gradient-to-l from-zinc-600/50 to-transparent" />
      <div className="absolute top-0 right-0 w-px h-8 bg-gradient-to-b from-zinc-600/50 to-transparent" />

      <div className="p-5 space-y-5">
        {/* Header - Plan Badge + Remaining */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "relative flex items-center justify-center w-8 h-8 rounded-lg border",
              isCritical 
                ? "bg-red-950/30 border-red-900/50 text-red-400"
                : isLow
                  ? "bg-orange-950/30 border-orange-900/50 text-orange-400"
                  : "bg-amber-950/30 border-amber-900/50 text-amber-400"
            )}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {isLow && (
                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-40" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
                </span>
              )}
            </div>
            <div>
              <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Current Plan
              </div>
              <div className="text-sm font-semibold text-zinc-200">
                {userData?.planName ?? "Free"}
              </div>
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Available
            </div>
            <div className={cn(
              "text-lg font-bold tabular-nums leading-none mt-0.5",
              isCritical ? "text-red-400" : isLow ? "text-orange-400" : "text-zinc-200"
            )}>
              {Math.max(0, remainingTokens).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Progress Section */}
        <div className="space-y-3">
          {/* Segmented progress bar */}
          <div className="flex gap-1 h-2">
            {Array.from({ length: 20 }).map((_, i) => {
              const segmentThreshold = (i + 1) * 5
              const isActive = percent >= segmentThreshold
              const isCurrent = percent > (i * 5) && percent < segmentThreshold
              
              return (
                <motion.div
                  key={i}
                  initial={false}
                  animate={{
                    backgroundColor: isActive 
                      ? isCritical ? "#f87171" : isLow ? "#fb923c" : "#f59e0b"
                      : "#27272a",
                    scaleY: isCurrent ? 1.2 : 1,
                  }}
                  transition={{ duration: 0.3, delay: i * 0.02 }}
                  className={cn(
                    "flex-1 rounded-sm origin-center",
                    isActive && !isCritical && !isLow && "shadow-[0_0_8px_rgba(245,158,11,0.4)]"
                  )}
                />
              )
            })}
          </div>

          {/* Usage stats */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-zinc-500">
              <span className="tabular-nums">{used.toLocaleString()}</span>
              <span className="text-zinc-700">/</span>
              <span className="tabular-nums">{limit.toLocaleString()}</span>
              <span className="text-zinc-600">tokens</span>
            </div>
            <div className={cn(
              "font-semibold tabular-nums",
              isCritical ? "text-red-400" : isLow ? "text-orange-400" : "text-amber-500"
            )}>
              {percent}% used
            </div>
          </div>
        </div>

        {/* Modern Upgrade Button */}
        <Link 
          href="/pricing"
          className="group relative flex items-center justify-center w-full h-11 overflow-hidden rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors duration-300"
        >
          {/* Animated background gradient */}
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/10 to-orange-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out" />
          
          {/* Border glow on hover */}
          <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 blur-sm" />
            <div className="absolute inset-[1px] rounded-xl bg-zinc-900" />
          </div>

          {/* Content */}
          <span className="relative flex items-center gap-2 text-sm font-medium text-zinc-300 group-hover:text-zinc-100 transition-colors">
            Upgrade Plan
            <svg 
              className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </span>

          {/* Shine effect */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent" />
          </div>
        </Link>
      </div>

      {/* Bottom edge */}
      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-zinc-800/50 to-transparent" />
    </div>
  )
}