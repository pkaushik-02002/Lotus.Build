"use client"

import Link from "next/link"
import { motion } from "framer-motion"
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
        "relative overflow-hidden rounded-2xl border border-zinc-200 bg-[#f8f8f5]",
        className
      )}
    >
      <div className="p-5 space-y-5">
        {/* Header - Plan Badge + Remaining */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "relative flex items-center justify-center w-8 h-8 rounded-lg border",
              isCritical 
                ? "bg-red-50 border-red-200 text-red-500"
                : isLow
                  ? "bg-amber-50 border-amber-200 text-amber-600"
                  : "bg-zinc-100 border-zinc-200 text-zinc-700"
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
              <div className="text-sm font-semibold text-zinc-900">
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
              isCritical ? "text-red-500" : isLow ? "text-amber-600" : "text-zinc-900"
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
                      ? isCritical ? "#ef4444" : isLow ? "#f59e0b" : "#27272a"
                      : "#e4e4e7",
                    scaleY: isCurrent ? 1.2 : 1,
                  }}
                  transition={{ duration: 0.3, delay: i * 0.02 }}
                  className="flex-1 rounded-sm origin-center"
                />
              )
            })}
          </div>

          {/* Usage stats */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-zinc-500">
              <span className="tabular-nums">{used.toLocaleString()}</span>
              <span className="text-zinc-400">/</span>
              <span className="tabular-nums">{limit.toLocaleString()}</span>
              <span className="text-zinc-500">tokens</span>
            </div>
            <div className={cn(
              "font-semibold tabular-nums",
              isCritical ? "text-red-500" : isLow ? "text-amber-600" : "text-zinc-700"
            )}>
              {percent}% used
            </div>
          </div>
        </div>

        {/* Upgrade Button */}
        <Link 
          href="/pricing"
          className="group inline-flex h-11 w-full items-center justify-center rounded-xl border border-zinc-300 bg-white text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
        >
          <span className="flex items-center gap-2">
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
        </Link>
      </div>
    </div>
  )
}
