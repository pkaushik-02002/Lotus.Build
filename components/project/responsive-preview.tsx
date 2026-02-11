"use client"

import React, { useState, useRef } from "react"
import { Monitor, Tablet, Smartphone } from "lucide-react"
import { cn } from "@/lib/utils"
import { PreviewWithVisualEdit, type PreviewWithVisualEditProps } from "./preview-with-visual-edit"

export type DeviceType = "desktop" | "tablet" | "phone"

export interface DeviceConfig {
  name: string
  width: number
  height: number
  icon: React.ComponentType<{ className?: string }>
  label: string
  maxWidth?: number // Maximum width for responsive scaling
}

const deviceConfigs: Record<DeviceType, DeviceConfig> = {
  desktop: {
    name: "desktop",
    width: 1920,
    height: 1080,
    icon: Monitor,
    label: "Desktop"
  },
  tablet: {
    name: "tablet",
    width: 768,
    height: 1024,
    maxWidth: 1024, // Allow tablets to be wider but not too wide
    icon: Tablet,
    label: "Tablet"
  },
  phone: {
    name: "phone",
    width: 375,
    height: 812,
    maxWidth: 480, // Allow phones to be wider but not too wide
    icon: Smartphone,
    label: "Phone"
  }
}

export interface ResponsivePreviewProps extends Omit<PreviewWithVisualEditProps, "className"> {
  className?: string
  selectedDevice?: DeviceType
  onDeviceChange?: (device: DeviceType) => void
}

export function ResponsivePreview({
  className,
  selectedDevice = "desktop",
  onDeviceChange,
  ...previewProps
}: ResponsivePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const currentConfig = deviceConfigs[selectedDevice]

  // Desktop mode: just show normal full-screen preview
  if (selectedDevice === "desktop") {
    return (
      <div className={cn("flex-1 min-h-0", className)}>
        <PreviewWithVisualEdit
          {...previewProps}
          className="w-full h-full"
          iframeKey={`${previewProps.iframeKey}-desktop`}
        />
      </div>
    )
  }

  // Phone/Tablet mode: show device frame with proper sizing
  return (
    <div 
      ref={containerRef}
      className={cn("flex-1 flex items-start justify-center p-6 pt-8 overflow-auto bg-zinc-950/50", className)}
    >
      <div
        className="bg-white rounded-lg shadow-xl border border-zinc-800 overflow-hidden transition-all duration-300"
        style={{
          width: Math.min(currentConfig.width, currentConfig.maxWidth || currentConfig.width),
          height: currentConfig.height,
          maxWidth: "90vw", // Don't exceed 90% of viewport width
          maxHeight: "75vh", // Reduced to ensure top is visible
          aspectRatio: `${currentConfig.width} / ${currentConfig.height}`,
          marginTop: "0" // Ensure no negative margin at top
        }}
      >
        <PreviewWithVisualEdit
          {...previewProps}
          className="w-full h-full"
          iframeKey={`${previewProps.iframeKey}-${selectedDevice}`}
        />
      </div>
    </div>
  )
}
