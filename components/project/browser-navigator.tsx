"use client"

import React, { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, RotateCcw, Zap, Monitor, Tablet, Smartphone } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type DeviceType = "desktop" | "tablet" | "phone"

export interface DeviceConfig {
  name: string
  width: number
  height: number
  icon: React.ComponentType<{ className?: string }>
  label: string
}

const deviceConfigs: Record<DeviceType, DeviceConfig> = {
  desktop: {
    name: "desktop",
    width: 1920,
    height: 1080,
    icon: Monitor,
    label: "Desktop",
  },
  tablet: {
    name: "tablet",
    width: 768,
    height: 1024,
    icon: Tablet,
    label: "Tablet",
  },
  phone: {
    name: "phone",
    width: 375,
    height: 812,
    icon: Smartphone,
    label: "Phone",
  },
}

export interface BrowserNavigatorProps {
  currentPath?: string
  onNavigate?: (path: string) => void
  onRefresh?: () => void
  onBack?: () => void
  onForward?: () => void
  isLoading?: boolean
  className?: string
  selectedDevice?: DeviceType
  onDeviceChange?: (device: DeviceType) => void
}

export function BrowserNavigator({
  currentPath = "/",
  onNavigate,
  onRefresh,
  onBack,
  onForward,
  isLoading = false,
  className,
  selectedDevice = "desktop",
  onDeviceChange,
}: BrowserNavigatorProps) {
  const [urlInput, setUrlInput] = useState(currentPath)
  const [isEditing, setIsEditing] = useState(false)
  const [navigationHistory, setNavigationHistory] = useState<string[]>([currentPath])
  const [historyIndex, setHistoryIndex] = useState(0)

  useEffect(() => {
    setUrlInput(currentPath)
  }, [currentPath])

  const handleNavigate = (path: string) => {
    const normalizedPath = path.startsWith("/") ? path : "/" + path
    const newHistory = navigationHistory.slice(0, historyIndex + 1)
    if (newHistory[newHistory.length - 1] !== normalizedPath) {
      newHistory.push(normalizedPath)
      setNavigationHistory(newHistory)
      setHistoryIndex(newHistory.length - 1)
    }
    setUrlInput(normalizedPath)
    setIsEditing(false)
    onNavigate?.(normalizedPath)
  }

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleNavigate(urlInput || "/")
  }

  const handleBack = () => {
    if (historyIndex <= 0) return
    const newIndex = historyIndex - 1
    setHistoryIndex(newIndex)
    const path = navigationHistory[newIndex]
    setUrlInput(path)
    onBack?.()
    onNavigate?.(path)
  }

  const handleForward = () => {
    if (historyIndex >= navigationHistory.length - 1) return
    const newIndex = historyIndex + 1
    setHistoryIndex(newIndex)
    const path = navigationHistory[newIndex]
    setUrlInput(path)
    onForward?.()
    onNavigate?.(path)
  }

  const pathParts = urlInput.split("/").filter(Boolean)
  const currentDeviceConfig = deviceConfigs[selectedDevice]
  const CurrentDeviceIcon = currentDeviceConfig.icon

  return (
    <div
      className={cn(
        "border-b border-zinc-800/80 bg-gradient-to-b from-zinc-950 to-zinc-900 text-xs text-zinc-300",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              "h-8 w-8 p-0 rounded-md transition-all duration-200",
              historyIndex > 0 ? "text-zinc-300 hover:bg-zinc-800/60" : "text-zinc-600 cursor-not-allowed opacity-50"
            )}
            onClick={handleBack}
            disabled={historyIndex === 0}
            title="Back"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              "h-8 w-8 p-0 rounded-md transition-all duration-200",
              historyIndex < navigationHistory.length - 1
                ? "text-zinc-300 hover:bg-zinc-800/60"
                : "text-zinc-600 cursor-not-allowed opacity-50"
            )}
            onClick={handleForward}
            disabled={historyIndex === navigationHistory.length - 1}
            title="Forward"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              "h-8 w-8 p-0 rounded-md transition-all duration-200",
              isLoading ? "text-primary animate-spin" : "text-zinc-300 hover:bg-zinc-800/60"
            )}
            onClick={onRefresh}
            disabled={isLoading}
            title="Refresh"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={handleUrlSubmit} className="flex-1 min-w-0 flex items-center">
          <div
            className={cn(
              "flex-1 flex items-center gap-2 px-3 h-8 rounded-lg",
              "bg-zinc-800/50 border border-zinc-700/50",
              "hover:bg-zinc-800 hover:border-zinc-600/70 transition-all",
              isEditing && "bg-zinc-800 border-primary/50 ring-1 ring-primary/20"
            )}
            onClick={() => setIsEditing(true)}
          >
            <div className="flex items-center gap-1 text-zinc-500 shrink-0">
              <div className="w-2 h-2 rounded-full bg-primary/50" />
              <span className="text-[10px] font-semibold">site</span>
            </div>

            {isEditing ? (
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onBlur={() => {
                  if (!urlInput.trim()) setUrlInput(currentPath)
                  setIsEditing(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setUrlInput(currentPath)
                    setIsEditing(false)
                  }
                }}
                autoFocus
                className="flex-1 min-w-0 bg-transparent outline-none text-zinc-200 text-xs placeholder:text-zinc-500"
                placeholder="Enter path..."
              />
            ) : (
              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                <span className="text-zinc-400 text-[11px]">/</span>
                <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-hidden">
                  {pathParts.length > 0 ? (
                    pathParts.map((part, idx) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && <span className="text-zinc-600 shrink-0">/</span>}
                        <span
                          className={cn(
                            "text-xs px-1.5 py-0.5 rounded transition-all cursor-pointer shrink-0",
                            idx === pathParts.length - 1
                              ? "bg-primary/15 text-primary font-medium"
                              : "text-zinc-300 hover:bg-zinc-700/50"
                          )}
                          onClick={() => {
                            const newPath = "/" + pathParts.slice(0, idx + 1).join("/")
                            handleNavigate(newPath)
                          }}
                        >
                          {part}
                        </span>
                      </React.Fragment>
                    ))
                  ) : (
                    <span className="text-zinc-500 text-xs">home</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </form>

        <div className="flex items-center gap-1 shrink-0">
          {isLoading && (
            <div className="flex items-center gap-1 text-primary">
              <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px]">Loading</span>
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-zinc-800/60 transition-all text-zinc-400 hover:text-zinc-200"
                title="Select device preview"
              >
                <CurrentDeviceIcon className="w-3.5 h-3.5" />
                <span className="text-[10px] hidden sm:inline">{currentDeviceConfig.label}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="bg-zinc-900 border-zinc-800 text-zinc-100 min-w-[120px]"
              sideOffset={4}
            >
              {(Object.keys(deviceConfigs) as DeviceType[]).map((device) => {
                const config = deviceConfigs[device]
                const Icon = config.icon
                const isActive = selectedDevice === device

                return (
                  <DropdownMenuItem
                    key={device}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer",
                      isActive ? "bg-primary/20 text-primary" : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                    )}
                    onClick={() => onDeviceChange?.(device)}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <div className="flex-1">
                      <div>{config.label}</div>
                      <div className="text-[10px] text-zinc-500">
                        {config.width} x {config.height}
                      </div>
                    </div>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            className="p-1.5 rounded-md hover:bg-zinc-800/60 transition-all text-zinc-400 hover:text-zinc-200"
            onClick={() => handleNavigate("/")}
            title="Home"
          >
            <Zap className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
